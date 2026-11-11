// Server-Adapter (js/adapters/server/supabase.js): Gegnersuche mit Version, auch gegen einen Server ohne client_version
import { test } from "node:test";
import assert from "node:assert/strict";
import { supabaseServer } from "../../js/adapters/server/supabase.js";
import { ServerError } from "../../js/adapters/server/supabase-rest.js";

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };
// Ersatz für den REST-Client: merkt sich die Aufrufe, antwortet über fn(args)
const fake = fn => { const calls = []; return { calls, rpc: async (name, args) => { calls.push({ name, args }); return fn(args); } }; };

test("queueJoin schickt die Version mit", async () => {
  const c = fake(() => ({ queued: true }));
  assert.deepEqual(await supabaseServer(c, mem()).queueJoin("casual", "head:kalle", null, 12), { queued: true });
  assert.deepEqual(c.calls, [{ name: "queue_join", args: { queue_mode: "casual", head: "head:kalle", cos: null, client_version: 12 } }]);
});

test("queueJoin: alter Server kennt client_version nicht (404) -> einmal ohne Version", async () => {
  const c = fake(a => { if ("client_version" in a) throw new ServerError("Could not find the function api.queue_join", 404, "PGRST202"); return { queued: true }; });
  assert.deepEqual(await supabaseServer(c, mem()).queueJoin("ranked", "head:kalle", { frame: "x" }, 12), { queued: true });
  assert.equal(c.calls.length, 2);
  assert.deepEqual(c.calls[1].args, { queue_mode: "ranked", head: "head:kalle", cos: { frame: "x" } });
});

test("queueJoin: andere Fehler nicht wiederholen", async () => {
  const c = fake(() => { throw new ServerError("level_required", 400, "2"); });
  await assert.rejects(supabaseServer(c, mem()).queueJoin("casual", "head:kalle", null, 12), e => e.code === "level_required");
  assert.equal(c.calls.length, 1);
});

test("queueJoin ohne Version: kein client_version im Aufruf", async () => {
  const c = fake(() => ({ queued: true }));
  await supabaseServer(c, mem()).queueJoin("casual", "head:kalle");
  assert.deepEqual(c.calls[0].args, { queue_mode: "casual", head: "head:kalle", cos: null });
});

// Spielmeldungen: Störungen beim Token-Erneuern (429, 401 vom Gateway, 400 mit unbekanntem Code) sind kein endgültiges
// Nein des Servers. Die Meldung bleibt in der Warteschlange und geht später raus.
test("Warteschlange bleibt bei Fehlern beim Erneuern und bei 429 erhalten", async () => {
  const { createClient } = await import("../../js/adapters/server/supabase-rest.js");
  const res = (status, body) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
  for (const [name, r] of [["429", res(429, { error_code: "over_request_rate_limit" })], ["401 Gateway", res(401, { message: "Invalid API key" })], ["400 unbekannt", res(400, { error_code: "validation_failed" })]]) {
    const st = mem();
    st.setItem("kopfball-duell-session", JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) - 10, user: { id: "gast", is_anonymous: true } }));
    const client = createClient({ url: "https://x.test", anonKey: "k", storage: st, fetch: async () => r });
    const srv = supabaseServer(client, st);
    await assert.rejects(srv.reportMatch({ mode: "cpu" }));
    assert.equal(srv.pending(), 1, name + ": Meldung wartet");
    const out = await srv.flush();
    assert.deepEqual([out.rejected, out.left], [0, 1], name + ": nicht verworfen");
  }
  // 429 direkt vom Server (Rate-Limit der Funktion): ebenfalls kein Nein
  const st = mem(), srv = supabaseServer(fake(() => { throw new ServerError("over_request_rate_limit", 429); }), st);
  await assert.rejects(srv.reportMatch({ mode: "cpu" }));
  assert.equal(srv.pending(), 1);
});

// Gast anlegen scheitert (Captcha, anonyme Anmeldung aus, 403) oder trotz frischem Token nochmal 401: das ist nicht die
// Antwort der Spielmeldung. Sie bleibt liegen; flush hört beim ersten solchen Fehler auf (kein Captcha pro Spiel).
test("Warteschlange bleibt, wenn der Weg zur Sitzung scheitert; flush holt nur ein Captcha", async () => {
  const { createClient } = await import("../../js/adapters/server/supabase-rest.js");
  const res = (status, body) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
  for (const [status, body, code] of [[400, { code: 400, error_code: "captcha_failed", msg: "captcha protection" }, "captcha_failed"],
    [422, { code: 422, error_code: "anonymous_provider_disabled" }, "offline"], [403, { message: "forbidden" }, "offline"]]) {
    const st = mem(); let caps = 0;
    const client = createClient({ url: "https://x.test", anonKey: "k", storage: st, fetch: async () => res(status, body), captcha: async () => { caps++; return "tok"; } });
    const srv = supabaseServer(client, st);
    await assert.rejects(srv.reportMatch({ mode: "cpu", n: 1 }), e => e.code === code && e.status === 0);
    await assert.rejects(srv.reportMatch({ mode: "cpu", n: 2 }));
    assert.equal(srv.pending(), 2, status + ": beide warten");
    caps = 0;
    const out = await srv.flush();
    assert.deepEqual([out.sent, out.rejected, out.left, caps], [0, 0, 2, 1], status + ": aufgehört, ein Captcha");
  }
  // zweites 401 nach dem Erneuern
  const st = mem();
  st.setItem("kopfball-duell-session", JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "gast", is_anonymous: true } }));
  const fetch = async u => (u.includes("/auth/v1/token") ? res(200, { access_token: "a2", refresh_token: "r2", expires_in: 3600, user: { id: "gast", is_anonymous: true } }) : res(401, { message: "Invalid API key" }));
  const srv = supabaseServer(createClient({ url: "https://x.test", anonKey: "k", storage: st, fetch }), st);
  await assert.rejects(srv.reportMatch({ mode: "cpu" }), e => e.status === 0);
  assert.equal(srv.pending(), 1, "zweites 401: Meldung wartet");
});

test("Anfrage-Nummern: beim Absenden vergeben, am Ergebnis und an seinem Stand vermerkt", async () => {
  const { REQ } = await import("../../js/adapters/server/supabase.js");
  let release; const hold = new Promise(r => { release = r; });
  const c = { rpc: async name => { if (name === "claim_daily") await hold; return name === "me" ? { coins: 2 } : { state: { coins: 1 } }; } };
  const srv = supabaseServer(c, mem());
  const daily = srv.claimDaily();   // früher abgeschickt, kommt später an
  const me = await srv.state();
  release(); const d = await daily;
  assert.ok(d.state[REQ].n < me[REQ].n, "Tagesbonus hat die kleinere Nummer");
  assert.equal(me[REQ].read, true); assert.equal(d.state[REQ].read, false);
});
