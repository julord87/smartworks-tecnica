import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const S = process.env.S ?? "/tmp", BASE = "http://localhost:3000";
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
const settle = (p) => p.waitForTimeout(1200);

// Cómo trabajamos (solicitante)
const ana = await as("pm.ana@smartworks.es");
await ana.goto(BASE + "/como-trabajamos");
ok(await ana.getByRole("heading", { name: "Cómo trabajamos" }).isVisible(), "cómo trabajamos carga");
ok(await ana.locator(".prose-sw h2").count() >= 3, "texto markdown renderizado");
ok(await ana.locator("table").last().locator("tbody tr").count() >= 10, "tabla de plazos desde el catálogo");
await ana.screenshot({ path: S + "/como-trabajamos-mobile.png", fullPage: true });
await ana.goto(BASE + "/catalogo"); await ana.waitForURL((u) => !u.pathname.startsWith("/catalogo"));
ok(true, "solicitante no entra al catálogo");

// Catálogo (Técnica)
const t = await as("tecnica@smartworks.es", { width: 1280, height: 900 });
await t.goto(BASE + "/catalogo");
ok(await t.getByRole("heading", { name: "Catálogo" }).isVisible(), "catálogo carga");
ok(await t.locator("#s-tipos ~ div li").count() === 13, "13 tipos de tarea");

// editar un tipo
await t.getByRole("button", { name: /^Editar Overlay/ }).click();
await t.locator("input[id$='-min']").fill("4");
await t.getByRole("button", { name: "Guardar" }).click(); await settle(t);
ok(await t.getByText("Plazo mínimo: 4 días").count() >= 1 || (await t.locator("li", { hasText: "Overlay" }).first().textContent()).includes("4 días"), "editar plazo mínimo");

// agregar tipo
await t.getByRole("button", { name: "Agregar tipo de tarea" }).click();
await t.locator("#tt-nuevo-name").fill("Prueba de sonido");
await t.locator("#tt-nuevo-needs").fill("Rider técnico");
await t.locator("#tt-nuevo-delivers").fill("Informe");
await t.getByRole("button", { name: "Guardar" }).click(); await settle(t);
ok(await t.getByText("Prueba de sonido").isVisible(), "agregar tipo");
// duplicado
await t.getByRole("button", { name: "Agregar tipo de tarea" }).click();
await t.locator("#tt-nuevo-name").fill("Prueba de sonido");
await t.getByRole("button", { name: "Guardar" }).click(); await settle(t);
ok(await t.getByText("Ya existe un tipo con ese nombre.").isVisible(), "nombre duplicado: error");
await t.getByRole("button", { name: "Cancelar" }).click();

// desactivar
await t.getByRole("button", { name: "Editar Prueba de sonido" }).click();
await t.getByLabel("Activo (se puede pedir)").uncheck();
await t.getByRole("button", { name: "Guardar" }).click(); await settle(t);
ok((await t.locator("li", { hasText: "Prueba de sonido" }).first().textContent()).includes("Inactivo"), "desactivar tipo");
await t.goto(BASE + "/pedidos/nuevo");
ok(!(await t.getByText("Prueba de sonido").count()), "inactivo no aparece en nuevo pedido");
await t.goto(BASE + "/catalogo");

// correos
await t.locator("#ae-email").fill("Externo@Proveedor.com");
await t.locator("#ae-role").selectOption("tecnica");
await t.locator("#ae-note").fill("Proveedor de pruebas");
await t.getByRole("button", { name: "Agregar", exact: true }).click(); await settle(t);
ok(await t.getByText("externo@proveedor.com").isVisible(), "agregar correo (normalizado)");
ok((await t.locator("li", { hasText: "externo@proveedor.com" }).textContent()).includes("Técnica"), "rol pre-asignado visible");
await t.locator("#ae-email").fill("externo@proveedor.com");
await t.getByRole("button", { name: "Agregar", exact: true }).click(); await settle(t);
ok(await t.getByText("Ese correo ya está en la lista.").isVisible(), "correo duplicado: error");
await t.locator("#ae-email").fill("");
await t.getByRole("button", { name: "Quitar externo@proveedor.com" }).click(); await settle(t);
ok(!(await t.getByText("externo@proveedor.com").count()), "quitar correo");

// roles
ok(!(await t.getByLabel("Rol de tecnica@smartworks.es").count()), "no puede cambiar su propio rol");
await t.getByLabel("Rol de pm.marcos@smartworks.es").selectOption("tecnica"); await settle(t);
await t.reload();
ok((await t.getByLabel("Rol de pm.marcos@smartworks.es").inputValue()) === "tecnica", "cambiar rol a Técnica");
await t.screenshot({ path: S + "/catalogo-desktop.png", fullPage: true });
const marcos = await as("pm.marcos@smartworks.es");
ok(marcos.url().endsWith("/bandeja"), "nuevo Técnica entra a la bandeja");
await t.getByLabel("Rol de pm.marcos@smartworks.es").selectOption("solicitante"); await settle(t);
await t.reload();
ok((await t.getByLabel("Rol de pm.marcos@smartworks.es").inputValue()) === "solicitante", "volver a solicitante");
const m = await as("tecnica@smartworks.es");
await m.goto(BASE + "/catalogo");
await m.screenshot({ path: S + "/catalogo-mobile.png", fullPage: true });
await browser.close();
