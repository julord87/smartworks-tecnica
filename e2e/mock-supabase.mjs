// Mock minimo de Supabase Auth + PostgREST para probar el flujo de login de la app.
import http from "node:http";

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const users = {
  "pm.ana@smartworks.es": { id: "00000000-0000-0000-0000-0000000000b1", full_name: "Ana PM", role: "solicitante" },
  "tecnica@smartworks.es": { id: "00000000-0000-0000-0000-0000000000a1", full_name: "Laura Técnica", role: "tecnica" },
};
const allowlist = ["freelance@estudio-externo.com"];
const tokens = {}; // token_hash -> email
const sessions = {}; // access_token -> email
export const sent = [];

function jwt(email) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: users[email].id, email, role: "authenticated", aud: "authenticated", exp: now + 3600, iat: now, session_id: "s1" })}.sig`;
}
function userObj(email) {
  return { id: users[email].id, aud: "authenticated", role: "authenticated", email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
}
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json" }); res.end(body === undefined ? "" : JSON.stringify(body)); };

http.createServer(async (req, res) => {
  let raw = ""; for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  const url = new URL(req.url, "http://x");
  const bearer = (req.headers.authorization || "").replace("Bearer ", "");
  console.log(req.method, url.pathname + url.search);

  if (url.pathname === "/auth/v1/otp" && req.method === "POST") {
    const email = body.email;
    if (!/@smartworks\.es$/.test(email) && !allowlist.includes(email))
      return send(res, 500, { code: 500, error_code: "unexpected_failure", msg: "Database error saving new user" });
    if (!users[email]) users[email] = { id: crypto.randomUUID(), full_name: email.split("@")[0], role: "solicitante" };
    const th = "th_" + Math.random().toString(36).slice(2);
    tokens[th] = email;
    const code = "c" + Math.random().toString(36).slice(2);
    if (body.code_challenge) tokens["code_" + code] = email;
    sent.push({ email, th, code, redirect: url.searchParams.get("redirect_to") });
    return send(res, 200, {});
  }
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
    const email = body.email;
    if (!users[email] || body.password !== "@Asasas87!")
      return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
    const at = jwt(email); sessions[at] = email;
    return send(res, 200, { access_token: at, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "rt_" + at.slice(-6), user: userObj(email) });
  }
  if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
    const email = tokens["code_" + body.auth_code];
    if (!email || !body.code_verifier) return send(res, 403, { code: 403, error_code: "flow_state_not_found", msg: "invalid flow state" });
    delete tokens["code_" + body.auth_code];
    const at = jwt(email); sessions[at] = email;
    return send(res, 200, { access_token: at, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "rt_" + at.slice(-6), user: userObj(email) });
  }
  if (url.pathname === "/__last") return send(res, 200, sent.at(-1) ?? null);
  if (url.pathname === "/auth/v1/verify" && req.method === "POST") {
    const email = tokens[body.token_hash];
    if (!email) return send(res, 403, { code: 403, error_code: "otp_expired", msg: "Email link is invalid or has expired" });
    delete tokens[body.token_hash];
    const at = jwt(email); sessions[at] = email;
    return send(res, 200, { access_token: at, token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "rt_" + at.slice(-6), user: userObj(email) });
  }
  if (url.pathname === "/auth/v1/user") {
    const email = sessions[bearer];
    return email ? send(res, 200, userObj(email)) : send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
  }
  if (url.pathname === "/auth/v1/logout") { delete sessions[bearer]; return send(res, 204); }
  if (url.pathname === "/rest/v1/profiles") {
    const email = sessions[bearer];
    const id = (url.searchParams.get("id") || "").replace("eq.", "");
    const e = Object.keys(users).find((k) => users[k].id === id);
    if (!email || !e) return send(res, 406, { code: "PGRST116", message: "no rows" });
    return send(res, 200, { id, email: e, full_name: users[e].full_name, role: users[e].role });
  }
  send(res, 404, { msg: "not mocked" });
}).listen(54321, () => console.log("mock on 54321"));
