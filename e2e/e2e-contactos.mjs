import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import pg from "pg";
const S = process.env.S ?? "/tmp", BASE = "http://localhost:3000";
const db = new pg.Pool({ host: "/var/tmp/pgtest", port: 5499, user: "postgres", database: "t" });
const q = async (sql, p) => (await db.query(sql, p)).rows;
const ok = (c, m) => { if (!c) { console.log("FALLA - " + m); process.exitCode = 1; } else console.log("ok - " + m); };
const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
async function as(email, vp = { width: 390, height: 844 }) {
  const page = await (await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(BASE + "/login");
  await page.getByRole("tab", { name: "Contraseña" }).click();
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("test1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(pedidos|bandeja)$/); await page.waitForLoadState("load"); await page.waitForTimeout(300);
  return page;
}
async function addContact(page, kind, name, email, phone = "") {
  await page.locator("#pc-kind").selectOption(kind);
  await page.locator("#pc-name").fill(name);
  await page.locator("#pc-email").fill(email);
  await page.locator("#pc-phone").fill(phone);
  await page.getByRole("button", { name: "Agregar contacto" }).click();
  await page.waitForTimeout(1200);
}
const AURORA = "10000000-0000-0000-0000-000000000001", FARO = "10000000-0000-0000-0000-000000000003";

// Ana (PM de Aurora) carga contactos en su proyecto
const ana = await as("pm.ana@smartworks.es");
await ana.goto(BASE + "/proyectos/" + AURORA);
await addContact(ana, "venue", "Comercial Palacio", "eventos@palacio.test", "910 000 000");
await addContact(ana, "cliente", "Marta Aurora", "marta@aurora.test");
ok(await ana.getByRole("link", { name: "eventos@palacio.test" }).isVisible(), "contacto visible con enlace de correo");
ok(await ana.locator('a[href="tel:910000000"]').count() === 1, "teléfono con enlace para llamar");
ok((await q("select count(*)::int n from public.project_contacts where project_id = $1", [AURORA]))[0].n === 2, "contactos guardados");
await ana.screenshot({ path: S + "/contactos-proyecto-mobile.png", fullPage: true });
await ana.getByRole("button", { name: "Quitar Marta Aurora" }).click();
await ana.waitForTimeout(1200);
ok(!(await ana.getByText("Marta Aurora").count()), "PM quita un contacto");

// Marcos no es del proyecto Faro: puede agregar, solo quita lo suyo
await ana.goto(BASE + "/proyectos/" + FARO);
await addContact(ana, "proveedor", "AV Sur", "av@sur.test");
const marcos = await as("pm.marcos@smartworks.es");
await marcos.goto(BASE + "/proyectos/" + FARO);
await addContact(marcos, "venue_tecnico", "Técnico Faro", "", "+34 600 999 888");
ok(await marcos.getByRole("button", { name: "Quitar Técnico Faro" }).count() === 1, "quien carga un contacto lo puede quitar");
ok(!(await marcos.getByRole("button", { name: "Quitar AV Sur" }).count()), "no quita contactos ajenos si no es del proyecto");

// La tarea muestra los contactos del proyecto
const [task] = await q("select t.id from public.tasks t join public.requests r on r.id = t.request_id where r.project_id = $1 limit 1", [AURORA]);
const t = await as("tecnica@smartworks.es", { width: 1280, height: 900 });
await t.goto(BASE + "/tareas/" + task.id);
ok(await t.getByText("Comercial Palacio").isVisible(), "la tarea muestra los contactos del proyecto");

// Catálogo: Técnica define qué contactos exige un tipo de tarea
await t.goto(BASE + "/catalogo");
await t.getByRole("button", { name: /^Editar Escaletas/ }).click();
await t.getByRole("checkbox", { name: "Cliente" }).check();
await t.getByRole("button", { name: "Guardar" }).click();
await t.waitForTimeout(1200);
const [esc] = await q("select required_contacts from public.task_types where name like 'Escaletas%'");
ok(String(esc.required_contacts).includes("cliente"), "catálogo guarda contactos obligatorios");
ok(await t.getByText("Contactos: Cliente").first().isVisible(), "catálogo muestra contactos obligatorios");
await browser.close(); await db.end();
