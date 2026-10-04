// Mini Supabase para pruebas: Auth (otp, verify, password, user, logout), PostgREST basico y Storage.
// Las consultas corren en el Postgres local con rol authenticated y auth.uid() = usuario: RLS real.
import http from "node:http";
import pg from "pg";

// Como PostgREST: date como "YYYY-MM-DD" y timestamptz como texto ISO
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1184, (v) => new Date(v).toISOString());
const pool = new pg.Pool({ host: "/var/tmp/pgtest", port: 5499, user: "postgres", database: "t" });
// Arrays de enums (p. ej. contact_kind[]) como arrays JSON, igual que PostgREST
for (const { typarray } of (await pool.query("select typarray from pg_type where typtype = 'e'")).rows)
  pg.types.setTypeParser(typarray, (v) => v.slice(1, -1).split(",").filter(Boolean));
const PASSWORD = "test1234";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const tokens = {};
export const sent = [];
const emails = [];

async function asUser(uid, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    if (uid) {
      await c.query("set local role authenticated");
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [uid]);
    } else {
      await c.query("set local role anon");
    }
    const r = await fn(c);
    await c.query("commit");
    return r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
const admin = (sql, params) => pool.query(sql, params);

function jwt(uid, email) {
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: uid, email, role: "authenticated", aud: "authenticated", exp: now + 3600, iat: now, session_id: "s" })}.sig`;
}
function uidFrom(bearer) {
  try {
    const p = JSON.parse(Buffer.from(bearer.split(".")[1], "base64url").toString());
    return p.role === "authenticated" ? p.sub : null;
  } catch {
    return null;
  }
}
const userObj = (u) => ({ id: u.id, aud: "authenticated", role: "authenticated", email: u.email, app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() });
const session = (u) => ({ access_token: jwt(u.id, u.email), token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: "rt" + u.id, user: userObj(u) });
const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS" };
const send = (res, code, body) => { res.writeHead(code, { "content-type": "application/json", ...CORS }); res.end(body === undefined ? "" : JSON.stringify(body)); };
const pgErr = (res, e) => send(res, e.code === "42501" ? 403 : 400, { code: e.code, message: e.message, details: e.detail ?? null, hint: null });
const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error("bad ident " + s); return `"${s}"`; };

function buildSelect(table, params) {
  const cols = (params.get("select") || "*").split(",").map((c) => (c === "*" ? "*" : ident(c.trim()))).join(", ");
  const where = [], vals = [];
  for (const [k, v] of params) {
    if (["select", "order", "limit", "offset"].includes(k)) continue;
    if (k === "or") {
      const parts = v.replace(/^\(|\)$/g, "").split(",").map((c) => {
        const [col, op, ...val] = c.split(".");
        if (op !== "eq") throw new Error("or: solo eq");
        vals.push(val.join(".")); return `${ident(col)}::text = $${vals.length}`;
      });
      where.push("(" + parts.join(" or ") + ")"); continue;
    }
    const [op, ...rest] = v.split("."); const val = rest.join(".");
    if (op === "eq") { vals.push(val); where.push(`${ident(k)} = $${vals.length}`); }
    else if (op === "neq") { vals.push(val); where.push(`${ident(k)} <> $${vals.length}`); }
    else if (op === "gte") { vals.push(val); where.push(`${ident(k)} >= $${vals.length}`); }
    else if (op === "lte") { vals.push(val); where.push(`${ident(k)} <= $${vals.length}`); }
    else if (op === "is") where.push(`${ident(k)} is ${val === "null" ? "null" : val === "true" ? "true" : "false"}`);
    else if (op === "in") { const items = val.replace(/^\(|\)$/g, "").split(","); vals.push(items); where.push(`${ident(k)}::text = any($${vals.length})`); }
    else throw new Error("op no soportado " + op);
  }
  let sql = `select ${cols} from public.${ident(table)}`;
  if (where.length) sql += " where " + where.join(" and ");
  const order = params.get("order");
  if (order) sql += " order by " + order.split(",").map((o) => { const [c, dir, nulls] = o.split("."); return `${ident(c)} ${dir === "desc" ? "desc" : "asc"}${nulls ? " " + nulls.replace("nulls", "nulls ") : ""}`; }).join(", ");
  if (params.get("limit")) sql += " limit " + Number(params.get("limit"));
  return { sql, vals };
}

http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  const url = new URL(req.url, "http://x");
  const path = url.pathname;
  const bearer = (req.headers.authorization || "").replace("Bearer ", "");
  const uid = uidFrom(bearer);
  const json = () => (raw.length ? JSON.parse(raw.toString()) : {});
  console.log(req.method, path + url.search, uid ? "as " + uid.slice(-4) : "");

  if (req.method === "OPTIONS") { res.writeHead(204, CORS); return res.end(); }
  try {
    // ---------------- Auth
    if (path === "/auth/v1/otp") {
      const body = json(); const email = body.email.toLowerCase();
      let u = (await admin("select id, email from auth.users where email = $1", [email])).rows[0];
      if (!u) {
        try { u = (await admin("insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id, email", [email])).rows[0]; }
        catch { return send(res, 500, { code: 500, error_code: "unexpected_failure", msg: "Database error saving new user" }); }
      }
      const th = "th_" + Math.random().toString(36).slice(2); tokens[th] = u;
      sent.push({ email, th }); return send(res, 200, {});
    }
    if (path === "/__last") return send(res, 200, sent.at(-1) ?? null);
    if (path === "/auth/v1/verify") {
      const u = tokens[json().token_hash]; if (!u) return send(res, 403, { code: 403, error_code: "otp_expired", msg: "expired" });
      delete tokens[json().token_hash]; return send(res, 200, session(u));
    }
    if (path === "/auth/v1/token" && url.searchParams.get("grant_type") === "password") {
      const body = json();
      const u = (await admin("select id, email from auth.users where email = $1", [String(body.email).toLowerCase()])).rows[0];
      if (!u || body.password !== PASSWORD) return send(res, 400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials" });
      return send(res, 200, session(u));
    }
    if (path === "/auth/v1/user" && req.method === "GET") {
      if (!uid) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const u = (await admin("select id, email from auth.users where id = $1", [uid])).rows[0];
      return send(res, 200, userObj(u));
    }
    if (path === "/auth/v1/user" && req.method === "PUT") {
      if (!uid) return send(res, 401, { code: 401, error_code: "bad_jwt", msg: "invalid JWT" });
      const body = json();
      if (body.password && body.password.length < 6) return send(res, 422, { code: 422, error_code: "weak_password", msg: "Password should be at least 6 characters." });
      const u = (await admin("select id, email from auth.users where id = $1", [uid])).rows[0];
      sent.push({ email: u.email, passwordChanged: true });
      return send(res, 200, userObj(u));
    }
    if (path === "/auth/v1/logout") return send(res, 204);

    // ---------------- Resend
    if (path === "/emails/batch" && req.method === "POST") {
      if (req.headers.authorization !== "Bearer re_test") return send(res, 401, { message: "bad key" });
      const list = json(); emails.push(...list.map((m) => ({ ...m, idem: req.headers["idempotency-key"] })));
      return send(res, 200, { data: list.map((_, i) => ({ id: "em_" + emails.length + "_" + i })) });
    }
    if (path === "/__emails") return send(res, 200, emails);

    // ---------------- Storage: URL firmada (respeta RLS de lectura)
    const sign = path.match(/^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/);
    if (sign && req.method === "POST") {
      const name = decodeURIComponent(sign[2]);
      const r = await asUser(uid, (c) => c.query("select 1 from storage.objects where bucket_id = $1 and name = $2", [sign[1], name]));
      if (!r.rows.length) return send(res, 400, { statusCode: "404", error: "not_found", message: "Object not found" });
      return send(res, 200, { signedURL: `/storage/v1/object/sign/${sign[1]}/${encodeURIComponent(name)}?token=prueba` });
    }
    if (sign && req.method === "GET") { res.writeHead(200, { "content-type": "application/octet-stream", ...CORS }); return res.end("contenido de prueba"); }

    // ---------------- Storage
    const st = path.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
    if (st && req.method === "POST") {
      const name = decodeURIComponent(st[2]);
      const r = await asUser(uid, (c) => c.query("insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3) returning id", [st[1], name, uid]));
      return send(res, 200, { Key: `${st[1]}/${name}`, Id: r.rows[0].id });
    }

    // ---------------- PostgREST
    const rpc = path.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
    if (rpc) {
      const body = json(); const keys = Object.keys(body);
      const args = keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(", ");
      const types = Object.fromEntries((await admin(
        "select unnest(proargnames) as n, unnest(proargtypes::regtype[])::text as t from pg_proc where proname = $1 and pronamespace = 'public'::regnamespace",
        [rpc[1]])).rows.map((r) => [r.n, r.t]));
      const vals = keys.map((k) =>
        body[k] !== null && typeof body[k] === "object" && !(Array.isArray(body[k]) && types[k]?.endsWith("[]"))
          ? JSON.stringify(body[k])
          : body[k]);
      const r = await asUser(uid, (c) => c.query(`select public.${ident(rpc[1])}(${args}) as r`, vals));
      return send(res, 200, r.rows[0].r);
    }
    const tbl = path.match(/^\/rest\/v1\/([a-z_]+)$/);
    if (tbl && req.method === "GET") {
      const { sql, vals } = buildSelect(tbl[1], url.searchParams);
      const r = await asUser(uid, (c) => c.query(sql, vals));
      if ((req.headers.accept || "").includes("vnd.pgrst.object")) {
        if (r.rows.length !== 1) return send(res, 406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: null, hint: null });
        return send(res, 200, r.rows[0]);
      }
      return send(res, 200, r.rows);
    }
    if (tbl && req.method === "POST") {
      const body = json(); const rows = Array.isArray(body) ? body : [body];
      const out = await asUser(uid, async (c) => {
        const all = [];
        for (const row of rows) {
          const keys = Object.keys(row);
          const r = await c.query(`insert into public.${ident(tbl[1])} (${keys.map(ident).join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning *`, keys.map((k) => row[k]));
          all.push(...r.rows);
        }
        return all;
      });
      return send(res, 201, (req.headers.prefer || "").includes("return=representation") ? out : undefined);
    }
    if (tbl && req.method === "PATCH") {
      const body = json(); const keys = Object.keys(body);
      const { sql: sel, vals } = buildSelect(tbl[1], new URLSearchParams([...url.searchParams].filter(([k]) => k !== "select")));
      const where = sel.includes(" where ") ? sel.slice(sel.indexOf(" where ")) : "";
      const off = vals.length;
      const sql = `update public.${ident(tbl[1])} set ${keys.map((k, i) => `${ident(k)} = $${off + i + 1}`).join(", ")}${where.replace(/\$(\d+)/g, (_, n) => "$" + n)} returning *`;
      const r = await asUser(uid, (c) => c.query(sql, [...vals, ...keys.map((k) => body[k])]));
      return send(res, 200, (req.headers.prefer || "").includes("return=representation") ? r.rows : undefined);
    }
    if (tbl && req.method === "DELETE") {
      const { sql: sel, vals } = buildSelect(tbl[1], new URLSearchParams([...url.searchParams].filter(([k]) => k !== "select")));
      const where = sel.includes(" where ") ? sel.slice(sel.indexOf(" where ")) : "";
      const r = await asUser(uid, (c) => c.query(`delete from public.${ident(tbl[1])}${where} returning *`, vals));
      return send(res, 200, (req.headers.prefer || "").includes("return=representation") ? r.rows : undefined);
    }
    send(res, 404, { msg: "not mocked " + path });
  } catch (e) {
    console.log("ERR", e.message);
    pgErr(res, e);
  }
}).listen(54321, () => console.log("mock-pg on 54321"));
