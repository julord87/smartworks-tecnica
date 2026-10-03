import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import pg from "pg";
const S = process.env.S ?? "/tmp", BASE = "http://localhost:3000";
const db = new pg.Pool({ host: "/var/tmp/pgtest", port: 5499, user: "postgres", database: "t" });
const q = async (sql, p) => (await db.query(sql, p)).rows;
const ok = (c, m) => { if (!c) { console.log("FALLA - " + m); process.exitCode = 1; } else console.log("ok - " + m); };
const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
async function as(email, vp = { width: 390, height: 844 }) {
  const page = await (await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
  await page.goto(BASE + "/login");
  await page.getByRole("tab", { name: "Contraseña" }).click();
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("test1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(pedidos|bandeja)$/); await page.waitForLoadState("load"); await page.waitForTimeout(300);
  return page;
}
const card = (page, name) => page.locator("div.border", { has: page.getByText(name, { exact: true }) }).first();
const pmsOf = async (pid) => (await q("select p.email from public.project_managers m join public.profiles p on p.id = m.profile_id where m.project_id = $1 order by p.email", [pid])).map((r) => r.email);

// Ana crea un proyecto con Marcos como segundo PM
const ana = await as("pm.ana@smartworks.es");
await ana.goto(BASE + "/pedidos/nuevo");
await ana.getByRole("radio", { name: "Proyecto nuevo" }).click();
await ana.locator("#np-name").fill("Foro Omega");
await ana.locator("#np-client").fill("Grupo Omega");
ok(await ana.getByRole("list", { name: "PM del proyecto" }).getByText("Ana PM (yo)").isVisible(), "PM por defecto: quien crea");
await ana.locator("#np-pm").selectOption({ label: "Marcos PM" });
ok(await ana.getByRole("list", { name: "PM del proyecto" }).getByText("Marcos PM").isVisible(), "agrega segundo PM al crear");
await card(ana, "Toma de medidas").getByRole("checkbox").check();
await ana.screenshot({ path: S + "/pms-nuevo-mobile.png", fullPage: true });
await ana.getByRole("button", { name: "Enviar pedido" }).click();
await ana.getByText("Pedido enviado").waitFor({ timeout: 15000 });
const [proj] = await q("select * from public.projects where name = 'Foro Omega'");
ok(JSON.stringify(await pmsOf(proj.id)) === JSON.stringify(["pm.ana@smartworks.es", "pm.marcos@smartworks.es"]), "proyecto creado con 2 PM");

// Marcos lo ve en Mis pedidos y puede editar los PM
const marcos = await as("pm.marcos@smartworks.es");
ok(await marcos.getByText("Foro Omega").first().isVisible(), "segundo PM ve el pedido en Mis pedidos");
await marcos.goto(BASE + "/proyectos/" + proj.id);
ok(await marcos.getByText("Ana PM, Marcos PM").isVisible(), "página de proyecto lista los PM");
await marcos.getByRole("button", { name: "Editar datos" }).click();
await marcos.getByRole("button", { name: "Quitar Ana PM" }).click();
await marcos.getByRole("button", { name: "Guardar" }).click();
await marcos.waitForTimeout(1200);
ok(JSON.stringify(await pmsOf(proj.id)) === JSON.stringify(["pm.marcos@smartworks.es"]), "un PM quita a otro");
ok((await q("select pm_id from public.projects where id = $1", [proj.id]))[0].pm_id === "00000000-0000-0000-0000-0000000000b2", "PM principal pasa al que queda");
await marcos.getByRole("button", { name: "Editar datos" }).click();
ok(!(await marcos.getByRole("button", { name: /^Quitar/ }).count()), "no se puede quitar el último PM");
await marcos.getByRole("button", { name: "Cancelar" }).click();

// Ana (creadora, ya no PM) sigue pudiendo editar y se vuelve a agregar
await ana.goto(BASE + "/proyectos/" + proj.id);
await ana.getByRole("button", { name: "Editar datos" }).click();
await ana.locator("#pf-pm").selectOption({ label: "Ana PM (yo)" });
await ana.getByRole("button", { name: "Guardar" }).click();
await ana.waitForTimeout(1200);
ok((await pmsOf(proj.id)).length === 2, "la creadora edita los PM aunque no sea PM");

// Técnica agrega un PM en un proyecto ajeno
const t = await as("tecnica@smartworks.es", { width: 1280, height: 900 });
await t.goto(BASE + "/proyectos/10000000-0000-0000-0000-000000000002");
await t.getByRole("button", { name: "Editar datos" }).click();
await t.locator("#pf-pm").selectOption({ label: "Ana PM" });
await t.getByRole("button", { name: "Guardar" }).click();
await t.waitForTimeout(1200);
ok((await pmsOf("10000000-0000-0000-0000-000000000002")).includes("pm.ana@smartworks.es"), "Técnica agrega PM a cualquier proyecto");
await t.screenshot({ path: S + "/pms-proyecto-desktop.png", fullPage: true });

// Un solicitante que no es PM ni creador no ve el botón de editar
await ana.goto(BASE + "/proyectos/10000000-0000-0000-0000-000000000003");
const marcos2 = marcos;
await marcos2.goto(BASE + "/proyectos/10000000-0000-0000-0000-000000000003");
ok(!(await marcos2.getByRole("button", { name: "Editar datos" }).count()), "quien no es PM ni creador no edita");
await browser.close(); await db.end();
