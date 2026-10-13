import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
import pg from "pg";
import fs from "node:fs";
const S = process.env.S ?? "/tmp", BASE = "http://localhost:3000";
const db = new pg.Pool({ host: "/var/tmp/pgtest", port: 5499, user: "postgres", database: "t" });
const q = async (sql, p) => (await db.query(sql, p)).rows;
const ok = (c, m) => { if (!c) { console.log("FALLA - " + m); process.exitCode = 1; } else console.log("ok - " + m); };
const browser = await chromium.launch({ args: ["--font-render-hinting=none", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
async function as(email, vp) {
  const page = await (await browser.newContext({ viewport: vp, deviceScaleFactor: 2 })).newPage();
  await page.goto(BASE + "/login");
  await page.getByRole("tab", { name: "Contraseña" }).click();
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("test1234");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/(pedidos|bandeja)$/); await page.waitForLoadState("load"); await page.waitForTimeout(300);
  return page;
}

// Catálogo: el tipo nuevo está después de "Desarrollar propuesta técnica"
const types = (await q("select name from public.task_types where active order by position")).map((r) => r.name);
ok(types.at(-1) === "Render 3D de escena", "tipo Render 3D de escena en el catálogo");

// Técnica sube un .glb como entregable
const [task] = await q("select t.id from public.tasks t join public.task_types tt on tt.id = t.task_type_id where tt.name = 'Desarrollar propuesta técnica' limit 1");
const t = await as("tecnica@smartworks.es", { width: 1280, height: 900 });
await t.goto(BASE + "/tareas/" + task.id);
ok(await t.getByText("Un modelo 3D en .glb se ve interactivo en la tarea.").isVisible(), "aviso de .glb en el panel de entregables");
await t.locator("#d-file").setInputFiles({ name: "Escenario keynote.glb", mimeType: "model/gltf-binary", buffer: fs.readFileSync(new URL("./fixtures/escenario-demo.glb", import.meta.url)) });
await t.getByRole("button", { name: "Guardar entregable" }).click();
await t.waitForTimeout(1500);
await t.reload();
const mv = t.locator("model-viewer");
await mv.waitFor({ timeout: 15000 });
ok((await mv.evaluate((e) => e.src)).includes("/api/archivo?path="), "visor 3D con el entregable");
const loaded = await t.waitForFunction(() => document.querySelector("model-viewer")?.loaded === true, null, { timeout: 30000 }).then(() => true, () => false);
ok(loaded, "el modelo carga en el visor");
await t.waitForTimeout(1500);
await t.locator("figure", { has: mv }).screenshot({ path: S + "/render3d-visor.png" });

// El PM lo ve igual
const ana = await as("pm.ana@smartworks.es", { width: 390, height: 844 });
await ana.goto(BASE + "/tareas/" + task.id);
await ana.locator("model-viewer").waitFor({ timeout: 15000 });
ok(true, "el PM ve el visor 3D en la tarea");
await ana.waitForTimeout(2500);
await ana.screenshot({ path: S + "/render3d-mobile.png" });
await browser.close(); await db.end();
