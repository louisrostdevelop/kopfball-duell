// Ersatz für Supabase in der Entwicklung und in Tests: dieselben Adressen wie Supabase (Gast-Anmeldung, Token,
// Server-Funktionen unter /rest/v1/rpc), aber direkt auf einer lokalen Postgres-Datenbank, ohne Docker.
// Die Spiel-Logik und alle Rechte sind die echten aus supabase/migrations: Aufrufe laufen als Rolle authenticated.
//   node tools/dev-backend.mjs            startet eigene Datenbank (supabase/local/start-db.sh) und Server auf :54321
//   DB_URL=... PORT=... node tools/dev-backend.mjs
// Spiel dann öffnen mit: http://localhost:8765/?backend=http://localhost:54321
// NUR für die Entwicklung: Token sind nicht signiert.
import http from "node:http";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import pg from "pg";

export async function startDevBackend({ dbUrl, port = 54321, log = false } = {}) {
  dbUrl = dbUrl || execFileSync("bash", [new URL("../supabase/local/start-db.sh", import.meta.url).pathname], { encoding: "utf8" }).trim().split("\n").pop();
  const pool = new pg.Pool({ connectionString: dbUrl, max: 8 });
  const refresh = new Map();   // refresh_token -> user id
  const tok = sub => "dev." + Buffer.from(JSON.stringify({ sub, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const subOf = req => {
    const h = req.headers.authorization || "", t = h.replace(/^Bearer /, "");
    if (!t.startsWith("dev.")) return null;
    try { const c = JSON.parse(Buffer.from(t.slice(4), "base64url").toString()); return c.exp > Date.now() / 1000 ? c.sub : "expired"; } catch (_) { return null; }
  };
  const userRow = async id => (await pool.query("select id, email, is_anonymous from auth.users where id = $1", [id])).rows[0];
  const session = async id => { const r = randomUUID(); refresh.set(r, id); return { access_token: tok(id), refresh_token: r, expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user: await userRow(id) }; };

  const server = http.createServer(async (req, res) => {
    const cors = { "Access-Control-Allow-Origin": req.headers.origin || "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, content-profile, accept-profile, x-client-info", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS" };
    const send = (status, body) => { res.writeHead(status, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    let body = ""; for await (const c of req) body += c;
    let data = {}; try { data = body ? JSON.parse(body) : {}; } catch (_) { return send(400, { message: "bad_json" }); }
    const url = new URL(req.url, "http://x"), path = url.pathname;
    if (log) console.log(req.method, path);
    try {
      if (path === "/auth/v1/signup" && req.method === "POST") {
        if (data.email) return send(400, { error_code: "dev_only_anonymous" });
        const { rows } = await pool.query("insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id");
        return send(200, await session(rows[0].id));
      }
      if (path === "/auth/v1/token" && url.searchParams.get("grant_type") === "refresh_token") {
        const id = refresh.get(data.refresh_token); refresh.delete(data.refresh_token);
        if (!id) return send(400, { error_code: "refresh_token_not_found" });
        return send(200, await session(id));
      }
      if (path === "/auth/v1/user" && req.method === "PUT") {
        const id = subOf(req); if (!id || id === "expired") return send(401, { error_code: "bad_jwt" });
        await pool.query("update auth.users set email = coalesce($2, email), is_anonymous = false where id = $1", [id, data.email || null]);
        return send(200, await userRow(id));
      }
      if (path === "/auth/v1/logout") return send(204, null);
      const fn = /^\/rest\/v1\/rpc\/([a-z_]{1,40})$/.exec(path);
      if (fn && req.method === "POST") {
        const sub = subOf(req); if (sub === "expired") return send(401, { code: "PGRST301", message: "JWT expired" });
        const keys = Object.keys(data).filter(k => /^[a-z_]{1,40}$/.test(k));
        const args = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
        const vals = keys.map(k => data[k] !== null && typeof data[k] === "object" ? JSON.stringify(data[k]) : data[k]);
        const c = await pool.connect();
        try {
          await c.query("begin");
          await c.query("select set_config('request.jwt.claim.sub', $1, true)", [sub || ""]);
          await c.query(`set local role ${sub ? "authenticated" : "anon"}`);
          const { rows } = await c.query(`select api.${fn[1]}(${args}) as r`, vals);
          await c.query("commit");
          return send(200, rows[0].r);
        } catch (e) {
          await c.query("rollback").catch(() => {});
          const status = e.code === "P0001" ? 400 : e.code === "42501" ? (sub ? 403 : 401) : e.code === "42883" ? 404 : 500;
          return send(status, { code: e.code, message: e.message, details: e.detail || null, hint: e.hint || null });
        } finally { c.release(); }
      }
      if (path === "/functions/v1/create-checkout") return send(200, { url: "about:blank#checkout-" + (data.product || "") });
      return send(404, { message: "not_found" });
    } catch (e) { return send(500, { message: String(e.message || e) }); }
  });
  await new Promise(r => server.listen(port, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}`, pool, dbUrl, close: async () => { server.close(); await pool.end(); } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const b = await startDevBackend({ dbUrl: process.env.DB_URL, port: Number(process.env.PORT || 54321), log: true });
  console.log(`Dev-Backend läuft: ${b.url}\nSpiel: http://localhost:8765/?backend=${b.url.replace("127.0.0.1", "localhost")}`);
}
