import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import pg from "pg";
const S = process.env.S ?? "/tmp", BASE = "http://localhost:3000", MOCK = "http://127.0.0.1:54321";
const db = new pg.Pool({ host: "/var/tmp/pgtest", port: 5499, user: "postgres", database: "t" });
const q = async (sql, p) => (await db.query(sql, p)).rows;
const ok = (c, m) => { if (!c) { console.log("FALLA - " + m); process.exitCode = 1; } else console.log("ok - " + m); };
const cron = (path, secret = "secreto-de-prueba") => fetch(BASE + path, { method: "POST", headers: { authorization: `Bearer ${secret}` } });
const emails = async () => (await fetch(MOCK + "/__emails")).json();
const age = () => q("update public.notifications set created_at = created_at - interval '5 minutes' where sent_at is null");

await q("insert into public.app_config (key, value) values ('cron_secret', 'secreto-de-prueba') on conflict do nothing");
await q("update public.notifications set sent_at = now()"); // lo que genero el seed no cuenta

ok((await cron("/api/cron/notificaciones", "malo")).status === 401, "endpoint rechaza secreto incorrecto");

const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })).newPage();
await page.goto(BASE + "/login");
await page.getByRole("tab", { name: "Contraseña" }).click();
await page.getByLabel("Correo").fill("pm.marcos@smartworks.es");
await page.getByLabel("Contraseña").fill("test1234");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL(/\/pedidos$/); await page.waitForLoadState("load"); await page.waitForTimeout(400);
await page.goto(BASE + "/pedidos/nuevo");
await page.getByRole("radio", { name: "Proyecto nuevo" }).click();
await page.locator("#np-name").fill("Gala Horizonte");
await page.locator("#np-client").fill("Fundación Horizonte");
await page.locator("#np-supplier").fill("Audiovisuales Norte");
await page.locator("div.border", { has: page.getByText("Escaletas (show, show call, ensayos, rundown de montaje técnico)", { exact: true }) }).first().getByRole("checkbox").check();
await page.locator("#watcher").fill("cliente@gmail.com");
await page.getByRole("button", { name: "Añadir", exact: true }).click();
await page.locator("#watcher").fill("Pm.Ana@smartworks.es");
await page.locator("#watcher").press("Enter");
ok(await page.getByText("pm.ana@smartworks.es").isVisible(), "copia agregada (normalizada)");
await page.getByRole("button", { name: "Quitar cliente@gmail.com" }).click();
await page.locator("#watcher").fill("rigging@smartworks.es"); // escrito sin pulsar Añadir
await page.locator("#sec-avisos").scrollIntoViewIfNeeded();
await page.screenshot({ path: S + "/avisos-mobile.png", fullPage: true });
await page.getByRole("button", { name: "Enviar pedido" }).click();
await page.getByText("Pedido enviado").waitFor({ timeout: 15000 });

const [proj] = await q("select * from public.projects where name = 'Gala Horizonte'");
ok(proj.supplier === "Audiovisuales Norte", "proveedor guardado en el proyecto");
const [req] = await q("select * from public.requests where project_id = $1", [proj.id]);
const w = (await q("select email from public.request_watchers where request_id = $1 order by email", [req.id])).map((r) => r.email);
ok(JSON.stringify(w) === JSON.stringify(["pm.ana@smartworks.es", "rigging@smartworks.es"]), "copias guardadas, incluida la escrita sin pulsar Añadir");

// Copia externa rechazada por la base
await page.goto(BASE + "/pedidos/nuevo");
await page.locator("#project").selectOption(proj.id);
await page.locator("div.border", { has: page.getByText("Comparar y recomendar proveedor", { exact: true }) }).first().getByRole("checkbox").check();
await page.locator("#watcher").fill("cliente@gmail.com");
await page.getByRole("button", { name: "Enviar pedido" }).click();
await page.getByText("Solo se pueden poner en copia correos internos: cliente@gmail.com").waitFor();
ok(true, "copia externa rechazada con mensaje claro");

// Envio del pedido nuevo
let r = await (await cron("/api/cron/notificaciones")).json();
ok(r.sent === 0, "no envia antes de 2 minutos sin novedades");
await age();
r = await (await cron("/api/cron/notificaciones")).json();
let mails = await emails();
ok(r.sent === 2 && mails.length === 2, "pedido nuevo: un correo a cada persona de Técnica");
ok(mails.every((m) => m.subject === "Nuevo pedido: Gala Horizonte (1 tarea)"), "asunto concreto del pedido nuevo");
ok(mails.every((m) => m.html.includes("Audiovisuales Norte") && m.text.includes("Proveedor: Audiovisuales Norte")), "correo incluye proveedor");
ok(!mails.some((m) => m.to[0] === "pm.marcos@smartworks.es"), "quien pide no recibe su propio pedido nuevo");
await page.setContent(mails[0].html); await page.screenshot({ path: S + "/mail-pedido-nuevo.png", fullPage: true });

// Falta informacion + entregada agrupadas en un correo
await q(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  update public.tasks set status = 'falta_informacion', status_note = E'Agenda definitiva del show\\ny horarios del venue' where request_id = '${req.id}';
  commit;`);
await age();
await cron("/api/cron/notificaciones");
mails = (await emails()).slice(2);
const to = mails.map((m) => m.to[0]).sort();
ok(JSON.stringify(to) === JSON.stringify(["pm.ana@smartworks.es", "pm.marcos@smartworks.es", "rigging@smartworks.es"]), "falta información: solicitante (y PM) más copias");
const marcos = mails.find((m) => m.to[0] === "pm.marcos@smartworks.es");
ok(marcos.subject.startsWith("Falta información: Escaletas"), "asunto: falta información + tarea");
ok(marcos.html.includes("Agenda definitiva del show<br>y horarios del venue") && marcos.html.includes("Responder en la tarea"), "el correo dice qué falta y lleva enlace");
ok(marcos.html.includes("hiciste este pedido") && mails.find((m) => m.to[0] === "pm.ana@smartworks.es").html.includes("en copia"), "cada uno ve por qué lo recibe");
await page.setContent(marcos.html); await page.screenshot({ path: S + "/mail-falta-info.png", fullPage: true });

await q(`begin; set local role authenticated; select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
  update public.tasks set status = 'en_curso' where request_id = '${req.id}';
  insert into public.deliverables (task_id, url, file_name, note, uploaded_by) select id, 'https://ejemplo.test/escaleta', 'Escaleta show v1', 'Revisar tiempos de cambio', '00000000-0000-0000-0000-0000000000a1' from public.tasks where request_id = '${req.id}';
  update public.tasks set status = 'entregada' where request_id = '${req.id}';
  commit;`);
await age();
await cron("/api/cron/notificaciones");
mails = (await emails()).slice(5);
ok(mails.length === 3 && mails.every((m) => m.subject.startsWith("Entregada: Escaletas")), "en curso no avisa; entregada sí (3 destinatarios)");
ok(mails[0].html.includes("Escaleta show v1 (v1) ya está disponible"), "entregada nombra el entregable y su versión");

// Resumen diario
await q("update public.tasks set due_date = current_date - 1 where id = '30000000-0000-0000-0000-000000000001'");
r = await (await cron("/api/cron/resumen")).json();
ok(r.skipped === "fuera de horario" || r.sent, "resumen respeta horario de Madrid");
r = await (await cron("/api/cron/resumen?forzar=1")).json();
const digest = (await emails()).slice(8);
ok(r.sent === 2 && digest.length === 2 && /Técnica .*: 1 vencida/.test(digest[0].subject), "resumen: un correo por persona de Técnica, asunto con conteos");
await page.setContent(digest[0].html); await page.screenshot({ path: S + "/mail-resumen.png", fullPage: true });

await browser.close(); await db.end();
