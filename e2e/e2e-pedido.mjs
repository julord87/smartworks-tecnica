import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import pg from "pg";
const S = process.env.S ?? "/tmp", BASE = "http://localhost:3000";
const db = new pg.Pool({ host: "/var/tmp/pgtest", port: 5499, user: "postgres", database: "t" });
const q = async (sql, p) => (await db.query(sql, p)).rows;
const ok = (c, m) => { if (!c) { console.log("FALLA - " + m); process.exitCode = 1; } else console.log("ok - " + m); };

const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
async function loginPw(page, email) {
  await page.goto(BASE + "/login");
  await page.getByRole("tab", { name: "Contraseña" }).click();
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("test1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(pedidos|bandeja)$/);
  await page.waitForLoadState("load");
  await page.waitForTimeout(500);
}
const card = (page, name) => page.locator("div.border", { has: page.getByText(name, { exact: true }) }).first();

// ---- Marcos: proyecto nuevo + No se que necesito
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await loginPw(page, "pm.marcos@smartworks.es");
await page.goto(BASE + "/pedidos/nuevo");
await page.screenshot({ path: S + "/nuevo-mobile-top.png" });

await page.getByRole("button", { name: "Enviar pedido" }).click();
await page.getByText("Revisa el pedido:").waitFor();
ok(await page.getByText("Marca al menos una tarea.").isVisible(), "sin tareas muestra error");

await page.getByRole("radio", { name: "Proyecto nuevo" }).click();
await page.locator("#np-name").fill("Congreso Delta 2027");
await page.locator("#np-client").fill("Asociación Delta");
await page.locator("#np-venue").fill("Auditorio Mar");
await card(page, "No sé qué necesito").getByRole("checkbox").check();
await page.getByRole("button", { name: "Enviar pedido" }).click();
ok(await page.getByText("hay que adjuntar al menos un archivo").first().isVisible(), "No sé qué necesito sin adjuntos bloquea");

// Plazo corto
await card(page, "Visita técnica al venue").getByRole("checkbox").check();
const due = card(page, "Visita técnica al venue").getByLabel("Fecha límite");
const d = new Date(); d.setDate(d.getDate() + 2);
await due.fill(d.toISOString().slice(0, 10));
ok(await card(page, "Visita técnica al venue").getByText("al menos 7 días").isVisible(), "aviso de plazo mínimo");
await card(page, "Visita técnica al venue").getByLabel("Notas para esta tarea").fill("Ver acometida eléctrica");

await page.locator("#files").setInputFiles([
  { name: "Briefing Delta (versión 2).pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") },
  { name: "render escenario.jpg", mimeType: "image/jpeg", buffer: Buffer.from("jpg") },
]);
ok((await page.getByLabel("Tipo de Briefing Delta (versión 2).pdf").inputValue()) === "briefing", "tipo de adjunto sugerido: briefing");
ok((await page.getByLabel("Tipo de render escenario.jpg").inputValue()) === "render", "tipo de adjunto sugerido: render");
await page.locator("#comment").fill("Congreso de 600 personas, 2 días.");
await page.screenshot({ path: S + "/nuevo-mobile-full.png", fullPage: true });
await page.getByRole("button", { name: "Enviar pedido" }).click();
await page.getByText("Pedido enviado").waitFor({ timeout: 15000 });
await page.screenshot({ path: S + "/nuevo-mobile-done.png", fullPage: true });

const [proj] = await q("select * from public.projects where name = 'Congreso Delta 2027'");
ok(proj && proj.pm_id && proj.venue === "Auditorio Mar", "proyecto nuevo creado");
const [req] = await q("select * from public.requests where project_id = $1", [proj.id]);
ok(req.comment.includes("600 personas"), "pedido con comentario");
const tasks = await q("select t.*, tt.name from public.tasks t join public.task_types tt on tt.id = t.task_type_id where request_id = $1", [req.id]);
ok(tasks.length === 2 && tasks.every((t) => t.status === "recibida"), "2 tareas en estado recibida");
ok(tasks.find((t) => t.name.startsWith("Visita")).notes === "Ver acometida eléctrica", "notas por tarea guardadas");
const atts = await q("select * from public.attachments where request_id = $1 order by file_name", [req.id]);
ok(atts.length === 2 && atts[0].kind === "briefing" && atts[0].file_name === "Briefing Delta (versión 2).pdf", "adjuntos registrados con tipo y nombre original");
ok(atts.every((a) => a.storage_path.startsWith(`${proj.id}/requests/${req.id}/`)), "ruta de Storage por proyecto/pedido");
ok(/Briefing-Delta-version-2\.pdf$/.test(atts[0].storage_path), "nombre de archivo saneado en Storage");
const objs = await q("select name, owner from storage.objects where name = any($1)", [atts.map((a) => a.storage_path)]);
ok(objs.length === 2, "archivos subidos a Storage (RLS de storage real)");

// ---- Ana: pedido sobre proyecto existente de otro, con adjunto
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const p2 = await ctx2.newPage();
await loginPw(p2, "pm.ana@smartworks.es");
await p2.goto(BASE + "/pedidos/nuevo");
await p2.locator("#project").selectOption("10000000-0000-0000-0000-000000000002");
await card(p2, "Specs de contenidos por superficie").getByRole("checkbox").check();
await p2.locator("#files").setInputFiles([{ name: "plano-rigging.dwg", mimeType: "application/octet-stream", buffer: Buffer.from("dwg") }]);
await p2.screenshot({ path: S + "/nuevo-desktop.png", fullPage: true });
await p2.getByRole("button", { name: "Enviar pedido" }).click();
await p2.getByText("Pedido enviado").waitFor({ timeout: 15000 });
const r2 = await q("select r.id from public.requests r join public.profiles p on p.id = r.requested_by where p.email = 'pm.ana@smartworks.es' and r.project_id = '10000000-0000-0000-0000-000000000002'");
ok(r2.length === 1, "pedido sobre proyecto ajeno creado");
const a2 = await q("select kind from public.attachments where request_id = $1", [r2[0].id]);
ok(a2.length === 1 && a2[0].kind === "plano", "adjunto en proyecto ajeno subido (pasa a ser miembro)");
ok(!(await p2.getByRole("alert").filter({ hasText: "No se pudieron" }).count()), "sin errores de subida");

// ---- Cuenta: cambio de contraseña
await p2.goto(BASE + "/cuenta");
await p2.getByLabel("Nueva contraseña").fill("abcdefgh");
await p2.getByLabel("Repetir contraseña").fill("abcdefgX");
await p2.getByRole("button", { name: "Cambiar contraseña" }).click();
await p2.getByText("no coinciden").waitFor();
ok(true, "contraseñas distintas muestran error");
// React 19 vacia el formulario tras cada envio: se rellenan ambos campos
await p2.getByLabel("Nueva contraseña").fill("abcdefgh");
await p2.getByLabel("Repetir contraseña").fill("abcdefgh");
await p2.getByRole("button", { name: "Cambiar contraseña" }).click();
await p2.getByText("Contraseña cambiada.").waitFor();
ok(true, "cambio de contraseña OK");
await p2.screenshot({ path: S + "/cuenta-desktop.png" });

await browser.close(); await db.end();
