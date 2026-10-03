import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import pg from "pg";
const S = process.env.S ?? "/tmp", BASE = "http://localhost:3000";
const db = new pg.Pool({ host: "/var/tmp/pgtest", port: 5499, user: "postgres", database: "t" });
const q = async (sql, p) => (await db.query(sql, p)).rows;
const ok = (c, m) => { if (!c) { console.log("FALLA - " + m); process.exitCode = 1; } else console.log("ok - " + m); };
const T = (n) => `30000000-0000-0000-0000-00000000000${n}`;
const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
async function as(email, vp = { width: 1280, height: 900 }) {
  const page = await (await browser.newContext({ viewport: vp, deviceScaleFactor: 1 })).newPage();
  await page.goto(BASE + "/login");
  await page.getByRole("tab", { name: "Contraseña" }).click();
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("test1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(pedidos|bandeja)$/); await page.waitForLoadState("load"); await page.waitForTimeout(300);
  return page;
}
const status = async (n) => (await q("select status, status_note, assignee_id, due_date::text from public.tasks where id = $1", [T(n)]))[0];

// ---------------- Tecnica
const lau = await as("tecnica@smartworks.es");
await lau.goto(BASE + "/tareas/" + T(2));
ok(await lau.getByText("Técnica necesita").isVisible() && await lau.getByText("Falta plano de rigging del venue.").first().isVisible(), "tarea en falta info muestra qué falta");
ok(await lau.getByText("Historial").isVisible() && await lau.getByText("Tarea creada.").isVisible(), "historial visible");

await lau.goto(BASE + "/tareas/" + T(4));
await lau.screenshot({ path: S + "/tarea-tecnica.png", fullPage: true });
await lau.getByRole("radio", { name: "Falta información" }).click();
await lau.getByRole("button", { name: "Pasar a falta información" }).click();
await lau.getByText("Escribe qué información falta.").waitFor();
ok(true, "falta información sin texto: error");
await lau.getByLabel("¿Qué información falta?").fill("Agenda definitiva del show");
await lau.getByRole("button", { name: "Pasar a falta información" }).click();
await lau.getByText("Estado actualizado.").waitFor();
let s4 = await status(4);
ok(s4.status === "falta_informacion" && s4.status_note === "Agenda definitiva del show", "cambio de estado guardado con nota");
ok((await q("select count(*)::int n from public.notifications where task_id = $1 and kind = 'falta_informacion'", [T(4)]))[0].n >= 1, "cambio de estado encola correo");
await lau.reload();
ok(await lau.getByText("Agenda definitiva del show").first().isVisible(), "historial muestra el cambio con su nota");

await lau.locator("#assignee").selectOption({ label: "Diego Rigging" });
await lau.getByText("Responsable actualizado.").waitFor();
ok((await status(4)).assignee_id === "00000000-0000-0000-0000-0000000000a2", "responsable asignado");
const nd = new Date(); nd.setDate(nd.getDate() + 20); const nds = nd.toISOString().slice(0, 10);
await lau.locator("#due").fill(nds); await lau.locator("#due").blur();
await lau.getByText("Fecha actualizada.").waitFor();
ok((await status(4)).due_date === nds, "fecha límite cambiada");

// Entregable archivo sin marcar
await lau.locator("#d-file").setInputFiles({ name: "Escaleta show v1.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
await lau.getByLabel("Marcar la tarea como entregada (avisa al solicitante)").uncheck();
await lau.getByRole("button", { name: "Guardar entregable" }).click();
await lau.getByText("Entregable v1 guardado.").waitFor();
const d4 = await q("select * from public.deliverables where task_id = $1", [T(4)]);
ok(d4.length === 1 && d4[0].storage_path.includes("/tasks/" + T(4) + "/entregables/") && (await status(4)).status === "falta_informacion", "entregable de archivo subido sin cambiar estado");
ok((await q("select count(*)::int n from storage.objects where name = $1", [d4[0].storage_path]))[0].n === 1, "archivo en Storage");
await lau.reload();
const href = await lau.getByRole("link", { name: "Escaleta show v1.pdf" }).getAttribute("href");
const resp = await lau.request.get(BASE + href, { maxRedirects: 0 });
ok(resp.status() === 307 && resp.headers()["location"].includes("/storage/v1/object/sign/archivos/"), "descarga por URL firmada");

// Entregable enlace + entregada en tarea 1
await lau.goto(BASE + "/tareas/" + T(1));
await lau.getByRole("radio", { name: "Enlace" }).click();
await lau.locator("#d-url").fill("https://ejemplo.test/propuesta");
await lau.locator("#d-name").fill("Propuesta técnica v1");
await lau.getByRole("button", { name: "Guardar entregable" }).click();
await lau.getByText("Entregable v1 guardado.").waitFor();
ok((await status(1)).status === "entregada", "entregable con 'marcar entregada' cierra la tarea");
ok(!(await lau.getByText("Agregar tareas a este pedido").count()), "sin panel de tareas nuevas en pedido normal");

// No se que necesito: agregar tareas
await lau.goto(BASE + "/tareas/" + T(5));
await lau.getByRole("button", { name: "Añadir tarea" }).click();
await lau.getByRole("button", { name: "Añadir tarea" }).click();
await lau.getByRole("combobox", { name: "Tarea", exact: true }).nth(1).selectOption({ label: "Toma de medidas" });
await lau.getByRole("button", { name: "Agregar 2 tareas" }).click();
await lau.getByText("Tareas agregadas al pedido.").waitFor();
ok((await q("select count(*)::int n from public.tasks where request_id = '20000000-0000-0000-0000-000000000003'"))[0].n === 3, "Técnica agrega tareas al pedido 'No sé qué necesito'");
await lau.reload();
ok(await lau.getByText("Otras tareas del pedido").isVisible(), "tareas hermanas listadas");

// ---------------- Solicitante
const ana = await as("pm.ana@smartworks.es", { width: 390, height: 844 });
await ana.goto(BASE + "/tareas/" + T(2));
ok(await ana.getByRole("heading", { name: "Responder a Técnica" }).isVisible(), "solicitante ve 'Responder a Técnica'");
ok(!(await ana.getByRole("heading", { name: "Cambiar estado" }).count()), "solicitante no puede cambiar estado");
await ana.locator("#comment").fill("Adjunto el plano de rigging");
await ana.locator("#reply-files").setInputFiles({ name: "plano rigging.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF") });
await ana.getByRole("button", { name: "Enviar" }).click();
await ana.getByText("Enviado.").waitFor({ timeout: 15000 });
ok((await q("select count(*)::int n from public.task_events where task_id = $1 and kind = 'comentario' and body = 'Adjunto el plano de rigging'", [T(2)]))[0].n === 1, "comentario guardado");
ok((await q("select kind from public.attachments where task_id = $1", [T(2)]))[0]?.kind === "plano", "adjunto de la tarea con tipo sugerido");
const resp2 = await q("select recipient, reason from public.notifications where task_id = $1 and kind = 'respuesta'", [T(2)]);
ok(resp2.length >= 1 && resp2.every((r) => r.recipient === "rigging@smartworks.es" && r.reason === "responsable"), "respuesta avisa al responsable");
await ana.screenshot({ path: S + "/tarea-solicitante.png", fullPage: true });

await ana.goto(BASE + "/tareas/" + T(3));
await ana.locator("#comment").fill("hola");
await ana.getByRole("button", { name: "Enviar" }).click();
await ana.getByText("Solo pueden comentar quienes participan en el proyecto.").waitFor();
ok(true, "no miembro no puede comentar");

// Proyecto
await ana.goto(BASE + "/proyectos/10000000-0000-0000-0000-000000000001");
ok(await ana.getByRole("heading", { name: "Convención Anual Aurora" }).isVisible(), "página de proyecto");
await ana.getByRole("button", { name: "Editar datos" }).click();
await ana.locator("#pf-supplier").fill("AV Levante");
await ana.getByRole("button", { name: "Guardar" }).click();
await ana.getByText("AV Levante").waitFor();
ok((await q("select supplier from public.projects where id = '10000000-0000-0000-0000-000000000001'"))[0].supplier === "AV Levante", "PM edita el proyecto");
await ana.screenshot({ path: S + "/proyecto-mobile.png", fullPage: true });
await ana.getByRole("link", { name: "Pedir algo para este proyecto" }).click();
await ana.waitForURL(/proyecto=/);
ok((await ana.locator("#project").inputValue()) === "10000000-0000-0000-0000-000000000001", "nuevo pedido con el proyecto preseleccionado");

const mar = await as("pm.marcos@smartworks.es");
await mar.goto(BASE + "/proyectos/10000000-0000-0000-0000-000000000001");
ok(!(await mar.getByRole("button", { name: "Editar datos" }).count()), "otro PM no puede editar");
await mar.goto(BASE + "/tareas/12345678-1234-1234-1234-123456789012");
ok(await mar.getByText("Página no encontrada").isVisible(), "tarea inexistente: 404");

await browser.close(); await db.end();
