import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
const S = process.env.S ?? "/tmp", BASE = "http://localhost:3000";
const ok = (c, m) => { if (!c) { console.log("FALLA - " + m); process.exitCode = 1; } else console.log("ok - " + m); };
const last = async () => (await fetch("http://127.0.0.1:54321/__last")).json();

const browser = await chromium.launch({ args: ["--font-render-hinting=none"] });
async function login(page, email) {
  await page.goto(BASE + "/login");
  await page.getByLabel("Correo").fill(email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
}

// Movil
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto(BASE + "/bandeja");
ok(page.url().endsWith("/login"), "ruta protegida redirige a /login");
await page.screenshot({ path: S + "/login-mobile.png", fullPage: true });

await login(page, "alguien@gmail.com");
await page.locator("#email-error").waitFor();
ok((await page.locator("#email-error").textContent()).includes("no tiene acceso"), "correo no autorizado muestra error");
await page.screenshot({ path: S + "/login-error-mobile.png", fullPage: true });

await login(page, "Freelance@Estudio-Externo.com");
await page.getByText("Revisa tu correo").waitFor();
ok((await last()).email === "freelance@estudio-externo.com", "correo externo en allowlist recibe enlace (normalizado a minusculas)");

await login(page, "pm.ana@smartworks.es");
await page.getByText("Revisa tu correo").waitFor();
ok(true, "correo @smartworks.es recibe enlace");
await page.screenshot({ path: S + "/login-sent-mobile.png", fullPage: true });

const { th } = await last();
await page.goto(`${BASE}/auth/confirm?token_hash=${th}&type=email&next=/`);
await page.waitForURL("**/pedidos");
ok(page.url().endsWith("/pedidos"), "solicitante entra y va a /pedidos");
ok(await page.getByText("PRODUCCIÓN TÉCNICA").isVisible(), "cabecera visible con sesion");
ok(await page.getByRole("link", { name: "Mis pedidos" }).isVisible(), "nav de solicitante");
ok((await page.getByRole("link", { name: "Bandeja" }).count()) === 0, "solicitante no ve Bandeja");
await page.screenshot({ path: S + "/home-mobile.png" });

await page.goto(BASE + "/login");
ok(page.url().endsWith("/pedidos"), "con sesion, /login redirige al inicio");

await page.goto(`${BASE}/auth/confirm?token_hash=${th}&type=email&next=/`);
ok(page.url().includes("/login?error=enlace") || page.url().endsWith("/pedidos"), "enlace reutilizado no crea otra sesion (o mantiene la actual)");

await page.getByRole("button", { name: "Salir" }).click();
await page.waitForURL("**/login");
ok(page.url().endsWith("/login"), "salir cierra sesion");
await page.goto(BASE + "/pedidos");
ok(page.url().endsWith("/login"), "tras salir, rutas protegidas piden login");

await page.goto(`${BASE}/auth/confirm?token_hash=${th}&type=email`);
await page.waitForURL("**/login?error=enlace");
ok(await page.getByText("ya caducó").isVisible(), "enlace usado muestra error");
await page.screenshot({ path: S + "/login-expired-mobile.png", fullPage: true });

// Contraseña
await page.goto(BASE + "/login");
await page.getByRole("tab", { name: "Contraseña" }).click();
await page.getByLabel("Correo").fill("tecnica@smartworks.es");
await page.getByLabel("Contraseña").fill("mala");
await page.getByRole("button", { name: "Entrar" }).click();
await page.locator("#email-error").waitFor();
ok((await page.locator("#email-error").textContent()).includes("incorrectos"), "contraseña incorrecta muestra error");
await page.screenshot({ path: S + "/login-password-mobile.png", fullPage: true });
await page.getByLabel("Contraseña").fill("@Asasas87!");
await page.getByRole("button", { name: "Entrar" }).click();
await page.waitForURL("**/bandeja");
ok(page.url().endsWith("/bandeja"), "login con contraseña entra (Tecnica a /bandeja)");
await page.getByRole("button", { name: "Salir" }).click();
await page.waitForURL("**/login");

// Plantilla por defecto de Supabase (PKCE ?code=), mismo navegador
await login(page, "pm.ana@smartworks.es");
await page.getByText("Revisa tu correo").waitFor();
const l = await last();
ok((l.redirect || "").endsWith("/auth/confirm"), "emailRedirectTo apunta a /auth/confirm");
await page.goto(`${BASE}/auth/confirm?code=${l.code}`);
await page.waitForURL("**/pedidos");
ok(page.url().endsWith("/pedidos"), "enlace por defecto de Supabase (code PKCE) entra");
await page.getByRole("button", { name: "Salir" }).click();
await page.waitForURL("**/login");

// Escritorio, Tecnica, open redirect
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const p2 = await ctx2.newPage();
await p2.goto(BASE + "/login");
await p2.screenshot({ path: S + "/login-desktop.png" });
await login(p2, "tecnica@smartworks.es");
await p2.getByText("Revisa tu correo").waitFor();
const t2 = (await last()).th;
await p2.goto(`${BASE}/auth/confirm?token_hash=${t2}&type=email&next=//evil.example.com`);
ok(new URL(p2.url()).host === "localhost:3000", "next externo no redirige fuera (open redirect)");
ok(p2.url().endsWith("/bandeja"), "Tecnica va a /bandeja");
ok(await p2.getByRole("link", { name: "Catálogo" }).isVisible(), "nav de Tecnica");
await p2.screenshot({ path: S + "/home-desktop.png" });

await browser.close();
