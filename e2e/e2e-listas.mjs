import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const S = process.env.S ?? "/tmp", BASE = "http://localhost:3000";
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

// Ana: 2 pedidos propios (Aurora y Faro)
const ana = await as("pm.ana@smartworks.es");
ok(await ana.getByRole("heading", { name: "Mis pedidos" }).isVisible(), "Mis pedidos carga");
const sections = ana.locator("section[aria-label^='Pedido de']");
ok(await sections.count() === 2, "Ana ve sus 2 pedidos");
ok((await sections.first().getAttribute("aria-label")).includes("Convención Anual Aurora"), "primero el pedido que espera información");
ok(await ana.getByText("1 tarea espera información tuya").isVisible(), "aviso de tareas esperando respuesta");
ok(await ana.getByText("Técnica necesita:").first().isVisible() && await ana.getByText("Falta plano de rigging del venue.").isVisible(), "muestra qué falta");
ok(await ana.getByText("Falta información", { exact: true }).first().isVisible(), "badge de estado");
ok(!(await ana.getByText("Lanzamiento Modelo Zeta").count()), "no ve pedidos ajenos en Mis pedidos");
await ana.screenshot({ path: S + "/mis-pedidos-mobile.png", fullPage: true });
await ana.goto(BASE + "/bandeja"); await ana.waitForURL(/\/pedidos$/);
ok(true, "solicitante no entra a la bandeja");

// Marcos: 1 pedido
const marcos = await as("pm.marcos@smartworks.es");
ok(await marcos.locator("section[aria-label^='Pedido de']").count() === 1, "Marcos ve 1 pedido");

// Tecnica
const laura = await as("tecnica@smartworks.es", { width: 1280, height: 900 });
ok(laura.url().endsWith("/bandeja"), "Técnica entra a la bandeja");
const rows = laura.locator("main ul > li");
ok(await rows.count() === 4, "bandeja: 4 tareas abiertas (sin la entregada)");
const first = await rows.first().textContent();
ok(first.includes("Specs") === false && /Visita|Overlay|No sé|Desarrollar|Escaletas/.test(first), "orden por urgencia (fecha más cercana primero)");
ok((await laura.locator("a[href='/bandeja?estado=falta_informacion'] span").first().textContent()) === "1", "contador esperando info = 1");
await laura.screenshot({ path: S + "/bandeja-desktop.png", fullPage: true });
await laura.locator("#f-estado").selectOption("falta_informacion");
await laura.waitForURL(/estado=falta_informacion/);
await laura.waitForTimeout(500);
ok(await rows.count() === 1 && (await rows.first().textContent()).includes("Overlay"), "filtro por estado");
await laura.locator("#f-estado").selectOption("todas");
await laura.waitForURL(/estado=todas/); await laura.waitForTimeout(500);
ok(await rows.count() === 5, "filtro todas incluye entregadas");
await laura.locator("#f-proyecto").selectOption({ index: 1 });
await laura.waitForTimeout(800);
const n = await rows.count();
ok(n >= 1 && n < 5, "filtro por proyecto");
await laura.getByRole("link", { name: "Quitar filtros" }).click();
await laura.waitForURL(/\/bandeja$/); await laura.waitForTimeout(500);
ok(await rows.count() === 4, "quitar filtros vuelve a abiertas");
await laura.goto(BASE + "/bandeja?responsable=sin"); 
ok(await rows.count() === 2, "sin responsable");
const m = await as("tecnica@smartworks.es");
await m.screenshot({ path: S + "/bandeja-mobile.png", fullPage: true });
await browser.close();
