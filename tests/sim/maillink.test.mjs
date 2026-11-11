// Link aus der Mail (#access_token=...): nur übernommen, wenn dieser Browser eine Mail angefordert hat (Schutz gegen
// Login-CSRF). Sonst "foreign", die Sitzung bleibt unverändert (Hinweis-Dialog in main.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "../../js/adapters/server/supabase-rest.js";

const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); }, m }; };
const HASH = "#access_token=neu&refresh_token=r2&expires_in=3600&type=magiclink";
const OLD = { access_token: "alt", refresh_token: "r1", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "gast", is_anonymous: true } };
function setup() {
  const storage = memStorage(), calls = [];
  storage.setItem("kopfball-duell-session", JSON.stringify(OLD));
  const fetch = async (u, o) => {
    calls.push([o.method, u.replace("https://x.test", "")]);
    const body = u.endsWith("/auth/v1/user") && o.method === "GET" ? { id: "konto", email: "a@b.de" } : u.includes("/auth/v1/otp") ? {} : null;
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { storage, calls, client: createClient({ url: "https://x.test", anonKey: "k", storage, fetch }) };
}

test("fremder Link (keine Mail aus diesem Browser): abgelehnt, Sitzung bleibt", async () => {
  const { client, calls, storage } = setup();
  assert.equal(await client.takeRedirect(HASH), "foreign");
  assert.equal(client.user().id, "gast");
  assert.equal(JSON.parse(storage.getItem("kopfball-duell-session")).access_token, "alt");
  assert.deepEqual(calls, [], "Token aus dem Link nicht einmal benutzt");
});

test("Merker abgelaufen (älter als 24 h): ebenfalls fremd", async () => {
  const { client, storage } = setup();
  storage.setItem("kopfball-duell-mail", String(Date.now() - 25 * 3600 * 1000));
  assert.equal(await client.takeRedirect(HASH), "foreign");
});

test("Mail aus diesem Browser angefordert: Link übernommen, Merker weg (zweiter Aufruf wieder fremd)", async () => {
  const { client, storage } = setup();
  await client.sendLoginCode("a@b.de", "https://x.test/");
  assert.ok(storage.getItem("kopfball-duell-mail"));
  assert.equal(await client.takeRedirect(HASH), "ok");
  assert.equal(client.user().id, "konto");
  assert.equal(storage.getItem("kopfball-duell-mail"), null);
  assert.equal(await client.takeRedirect(HASH), "foreign");
});

test("ohne Merker, aber schon mit genau diesem Konto angemeldet: \"own\" (kein Hinweis nötig), Sitzung bleibt", async () => {
  const { client, storage, calls } = setup();
  const jwt = sub => "h." + Buffer.from(JSON.stringify({ sub })).toString("base64url") + ".s";
  storage.setItem("kopfball-duell-session", JSON.stringify({ ...OLD, user: { id: "konto", email: "a@b.de", is_anonymous: false } }));
  const c2 = createClient({ url: "https://x.test", anonKey: "k", storage, fetch: async () => { calls.push(1); return { ok: true, status: 200, text: async () => "{}" }; } });
  assert.equal(await c2.takeRedirect(`#access_token=${jwt("konto")}&refresh_token=r`), "own");
  assert.equal(await c2.takeRedirect(`#access_token=${jwt("anderes")}&refresh_token=r`), "foreign", "fremdes Konto");
  assert.equal(await c2.takeRedirect("#access_token=kaputt&refresh_token=r"), "foreign", "Token nicht lesbar");
  assert.equal(await client.takeRedirect(`#access_token=${jwt("gast")}&refresh_token=r`), "foreign", "Gast: Hinweis bleibt");
  assert.equal(c2.user().id, "konto"); assert.deepEqual(calls, []);
});

// Kleiner GoTrue-Ersatz für Sitzungs-Tests: Refresh-Tokens gelten nur einmal (wie echt, sonst 400 „Already Used“),
// Antworten lassen sich anhalten (hold), um Überschneidungen nachzustellen
function fakeAuth({ anon = true } = {}) {
  const valid = new Set(["r1"]), calls = [];
  let n = 1, hold = null;
  const user = () => ({ id: "gast", email: anon ? undefined : "a@b.de", is_anonymous: anon, new_email: anon ? "a@b.de" : null });
  const res = (status, body) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });
  const fetch = async (u, o) => {
    const path = u.replace("https://x.test", ""), body = o.body ? JSON.parse(o.body) : {};
    calls.push(o.method + " " + path.replace(/\?.*/, ""));
    if (hold) await hold;
    if (path.startsWith("/auth/v1/token")) {
      if (!valid.delete(body.refresh_token)) return res(400, { error_code: "refresh_token_already_used" });
      const rt = "r" + ++n; valid.add(rt);
      return res(200, { access_token: "a" + n, refresh_token: rt, expires_in: 3600, user: user() });
    }
    if (path === "/auth/v1/user" && o.method === "GET") return res(200, user());
    if (path === "/auth/v1/verify") { const rt = "r" + ++n; valid.add(rt); return res(200, { access_token: "v" + n, refresh_token: rt, expires_in: 3600, user: { ...user(), email: "a@b.de", is_anonymous: false } }); }
    return res(200, {});
  };
  return { fetch, calls, setAnon: v => { anon = v; }, hold: p => { hold = p; } };
}
const sess = (o = {}) => JSON.stringify({ access_token: "a1", refresh_token: "r1", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "gast", is_anonymous: true, new_email: "a@b.de" }, ...o });
const expired = () => Math.floor(Date.now() / 1000) - 10;
const mk = (storage, fa) => createClient({ url: "https://x.test", anonKey: "k", storage, fetch: fa.fetch });

test("reload: fragt nur nach (rotiert nichts), erneuert erst, wenn das Konto fest ist; gedrosselt, nur mit Mail-Merker", async () => {
  const storage = memStorage(), fa = fakeAuth();
  storage.setItem("kopfball-duell-session", sess());
  const c = mk(storage, fa);
  assert.equal((await c.reload()).is_anonymous, true);
  assert.deepEqual(fa.calls, [], "ohne Mail-Merker keine Nachfrage");
  storage.setItem("kopfball-duell-mail", String(Date.now()));
  await c.reload();
  assert.deepEqual(fa.calls, ["GET /auth/v1/user"], "noch Gast: nur nachgefragt");
  assert.equal(JSON.parse(storage.getItem("kopfball-duell-session")).refresh_token, "r1", "Refresh-Token unverändert");
  fa.setAnon(false);
  await c.reload();
  assert.deepEqual(fa.calls, ["GET /auth/v1/user"], "höchstens einmal pro Minute");
  const c2 = mk(storage, fa);   // neuer Start
  const u = await c2.reload();
  assert.deepEqual(fa.calls, ["GET /auth/v1/user", "GET /auth/v1/user", "POST /auth/v1/token"], "jetzt fest: einmal erneuert");
  assert.equal(u.is_anonymous, false); assert.equal(c2.user().email, "a@b.de");
  assert.equal(storage.getItem("kopfball-duell-mail"), null, "Mail-Merker weg");
  await mk(storage, fa).reload();
  assert.equal(fa.calls.length, 3, "Konto: nichts mehr nachzufragen");
});

test("zwei Tabs mit gemeinsamem Speicher: der zweite übernimmt das neue Token statt mit dem alten zu erneuern", async () => {
  const storage = memStorage(), fa = fakeAuth();
  storage.setItem("kopfball-duell-session", sess({ expires_at: expired() }));
  const A = mk(storage, fa), B = mk(storage, fa);
  await A.ensureSession();
  assert.equal(A.user().id, "gast");
  const sB = await B.ensureSession();
  assert.equal(sB.refresh_token, "r2", "B hat A's Sitzung übernommen");
  assert.deepEqual(fa.calls, ["POST /auth/v1/token"], "nur einmal erneuert, kein „Already Used“");
  assert.equal(B.user().id, "gast", "kein neuer Gast");
});

test("zwei Tabs gleichzeitig: wer „Already Used“ bekommt, übernimmt die Sitzung des anderen statt sich abzumelden", async () => {
  const storage = memStorage(), fa = fakeAuth();
  storage.setItem("kopfball-duell-session", sess({ expires_at: expired() }));
  const A = mk(storage, fa), B = mk(storage, fa);
  let go; fa.hold(new Promise(r => { go = r; }));
  const pa = A.ensureSession(), pb = B.ensureSession();   // beide schicken r1
  await new Promise(r => { setTimeout(r, 0); });
  go(); fa.hold(null);
  const [sa, sb] = await Promise.all([pa, pb]);
  assert.equal(sa.refresh_token, sb.refresh_token, "beide auf derselben Sitzung");
  assert.ok(!fa.calls.includes("POST /auth/v1/signup"), "kein neuer Gast");
  assert.ok(storage.getItem("kopfball-duell-session"), "Sitzung im Speicher");
});

test("Refresh kommt spät an, inzwischen Code eingegeben: die neuere Sitzung bleibt", async () => {
  const storage = memStorage(), fa = fakeAuth();
  storage.setItem("kopfball-duell-session", sess({ expires_at: expired() }));
  const c = mk(storage, fa);
  let go; fa.hold(new Promise(r => { go = r; }));
  const p = c.ensureSession();
  await new Promise(r => { setTimeout(r, 0); });
  fa.hold(null);
  await c.verifyCode("email_change", "a@b.de", "123456");
  const rt = JSON.parse(storage.getItem("kopfball-duell-session")).refresh_token;
  go(); await p;
  assert.equal(c.user().is_anonymous, false, "Konto aus dem Code");
  assert.equal(JSON.parse(storage.getItem("kopfball-duell-session")).refresh_token, rt, "nicht vom späten Refresh überschrieben");
});

test("Fehler im Link und leere Adresse", async () => {
  const { client } = setup();
  assert.deepEqual(await client.takeRedirect("#error=access_denied&error_description=Email+link+is+invalid"), { error: "access_denied", text: "Email link is invalid" });
  assert.deepEqual(await client.takeRedirect("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"), { error: "otp_expired", text: "Email link is invalid or has expired" });
  assert.equal(await client.takeRedirect(""), null);
});

// Sitzung nie durch Server-Störungen verlieren: neuer Gast nur, wenn das Token sicher ungültig ist
const res = (status, body) => ({ ok: status < 300, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });
function store(init) {
  const st = memStorage(); if (init) st.setItem("kopfball-duell-session", JSON.stringify(init));
  return st;
}
const GAST = () => ({ access_token: "a0", refresh_token: "r0", expires_at: expired(), user: { id: "gast", is_anonymous: true } });
const stUser = st => JSON.parse(st.getItem("kopfball-duell-session") || "null")?.user?.id;
function mkc(st, onRefresh, more = {}) {
  const calls = [];
  const fetch = async (u, o) => {
    const path = u.replace("https://x.test", "").replace(/\?.*/, ""); calls.push(path);
    if (path === "/auth/v1/token") return onRefresh(JSON.parse(o.body));
    if (path === "/auth/v1/signup") return more.signup ? more.signup() : res(200, { access_token: "nA", refresh_token: "nR", expires_in: 3600, user: { id: "NEU", is_anonymous: true } });
    if (path.startsWith("/rest/")) return more.rpc ? more.rpc(o) : res(200, { ok: 1 });
    return res(200, {});
  };
  return { c: createClient({ url: "https://x.test", anonKey: "k", storage: st, fetch }), calls };
}

for (const [name, r] of [["503 HTML", () => res(503, "<html>Service Unavailable</html>")], ["429", () => res(429, { error_code: "over_request_rate_limit" })],
  ["500", () => res(500, { msg: "Internal" })], ["401 vom Gateway (anon-Key)", () => res(401, { message: "Invalid API key" })],
  ["400 unbekannt", () => res(400, { error_code: "validation_failed" })], ["200 ohne Sitzung", () => res(200, "<html>proxy</html>")],
  ["200 unvollständig", () => res(200, { access_token: "x" })], ["offline", () => { throw new TypeError("Failed to fetch"); }]]) {
  test(`Refresh ${name}: Fehler wie offline, Sitzung bleibt, kein neuer Gast`, async () => {
    const st = store(GAST()), { c, calls } = mkc(st, r);
    await assert.rejects(c.ensureSession());
    assert.equal(c.user().id, "gast"); assert.equal(stUser(st), "gast");
    assert.equal(JSON.parse(st.getItem("kopfball-duell-session")).refresh_token, "r0");
    assert.ok(!calls.includes("/auth/v1/signup"));
  });
}

test("Refresh-Token sicher ungültig (400 mit bekanntem Code): verworfen, neuer Gast", async () => {
  for (const code of ["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "invalid_grant"]) {
    const st = store(GAST()), { c } = mkc(st, () => res(400, code === "invalid_grant" ? { error: code, error_description: "Invalid Refresh Token" } : { code: 400, error_code: code, msg: "x" }));
    assert.equal((await c.ensureSession()).user.id, "NEU", code); assert.equal(stUser(st), "NEU");
  }
});

test("rpc: 401, Erneuern scheitert am Server -> Fehler, kein neuer Gast; 401, Erneuern klappt -> wiederholt", async () => {
  const fresh = { ...GAST(), expires_at: Math.floor(Date.now() / 1000) + 3600 };
  let st = store(fresh), x = mkc(st, () => res(502, "<html>Bad Gateway</html>"), { rpc: () => res(401, { message: "JWT expired" }) });
  await assert.rejects(x.c.rpc("state"));
  assert.equal(stUser(st), "gast"); assert.ok(!x.calls.includes("/auth/v1/signup"));
  let n = 0;
  st = store(fresh); x = mkc(st, () => res(200, { access_token: "a1", refresh_token: "r1", expires_in: 3600, user: fresh.user }), { rpc: () => (n++ ? res(200, { ok: 2 }) : res(401, { message: "JWT expired" })) });
  assert.deepEqual(await x.c.rpc("state"), { ok: 2 });
  assert.equal(stUser(st), "gast");
});

test("Ablauf nach der eigenen Uhr: expires_in zählt, nicht expires_at des Servers (Geräteuhr falsch)", async () => {
  const st = store(GAST()), { c, calls } = mkc(st, () => res(200, { access_token: "a1", refresh_token: "r1", expires_in: 3600, expires_at: 1000, user: GAST().user }));
  await c.ensureSession(); await c.ensureSession();
  assert.equal(calls.filter(p => p === "/auth/v1/token").length, 1, "nicht gleich wieder erneuert");
  assert.ok(JSON.parse(st.getItem("kopfball-duell-session")).expires_at > Date.now() / 1000 + 3000);
});

test("anderes Konto im Speicher (anderer Tab angemeldet): nichts schreiben oder löschen, Tab soll neu laden", async () => {
  const st = store(GAST()); let changed = 0;
  const { c, calls } = mkc(st, () => res(200, { access_token: "a1", refresh_token: "r1", expires_in: 3600, user: GAST().user }));
  c.onSessionChanged(() => { changed++; });
  st.setItem("kopfball-duell-session", JSON.stringify({ access_token: "u", refresh_token: "rU", expires_at: expired() + 4000, user: { id: "konto", is_anonymous: false } }));
  await assert.rejects(c.ensureSession(), e => e.code === "session_changed");
  assert.equal(stUser(st), "konto", "Konto des anderen Tabs bleibt"); assert.equal(changed, 1);
  await c.signOut();
  assert.equal(stUser(st), "konto", "auch Abmelden löscht es nicht");
  assert.deepEqual(calls.filter(p => p === "/auth/v1/token" || p === "/auth/v1/signup"), []);
});

test("anderer Tab hat sich abgemeldet (Speicher leer): kein neuer Gast über dessen Kopf, Tab soll neu laden", async () => {
  const st = store({ ...GAST(), user: { id: "konto", is_anonymous: false } }); let changed = 0;
  const { c, calls } = mkc(st, () => res(400, { error_code: "refresh_token_not_found" }));
  c.onSessionChanged(() => { changed++; });
  st.removeItem("kopfball-duell-session");
  await assert.rejects(c.ensureSession(), e => e.code === "session_changed");
  assert.equal(st.getItem("kopfball-duell-session"), null); assert.equal(changed, 1);
  assert.ok(!calls.includes("/auth/v1/signup"));
  // danach legt der andere Tab einen neuen Gast an: auch den nicht überschreiben
  st.setItem("kopfball-duell-session", JSON.stringify({ access_token: "g", refresh_token: "rG2", expires_at: expired() + 4000, user: { id: "G2", is_anonymous: true } }));
  await assert.rejects(c.ensureSession());
  assert.equal(stUser(st), "G2");
});

test("verworfen wird nur, wenn noch das gesendete Token im Speicher steht", async () => {
  const st = store(GAST()); let go;
  const { c } = mkc(st, () => new Promise(r => { go = () => r(res(400, { error_code: "refresh_token_already_used" })); }));
  const p = c.ensureSession();
  await new Promise(r => { setTimeout(r, 0); });
  st.setItem("kopfball-duell-session", JSON.stringify({ access_token: "a9", refresh_token: "r9", expires_at: Math.floor(Date.now() / 1000) + 3600, user: GAST().user }));
  go();
  assert.equal((await p).refresh_token, "r9", "Sitzung des anderen Tabs übernommen");
  assert.equal(JSON.parse(st.getItem("kopfball-duell-session")).refresh_token, "r9");
});

test("zwei Erststarts gleichzeitig: beide landen beim selben Gast", async () => {
  const st = store(null); let k = 0;
  const signup = () => { k++; return res(200, { access_token: "n" + k, refresh_token: "nR" + k, expires_in: 3600, user: { id: "G" + k, is_anonymous: true } }); };
  const A = mkc(st, null, { signup }).c, B = mkc(st, null, { signup }).c;
  const [a, b] = await Promise.all([A.ensureSession(), B.ensureSession()]);
  assert.equal(b.user.id, a.user.id, "beide auf demselben Gast");
  assert.equal(stUser(st), a.user.id);
});

test("Speicher voll: einmal warnen, danach erst erneuern, wenn das Token wirklich abgelaufen ist", async () => {
  const st = store(GAST()); let warn = 0;
  const { c, calls } = mkc(st, () => res(200, { access_token: "a1", refresh_token: "r1", expires_in: 30, user: GAST().user }));
  c.onUnsaved(() => { warn++; });
  st.setItem = () => { throw new Error("QuotaExceededError"); };
  await c.ensureSession();
  assert.equal(warn, 1);
  await c.ensureSession();   // noch 30 s gültig: normal (60 s Vorlauf) würde schon erneuert
  assert.equal(calls.filter(p => p === "/auth/v1/token").length, 1, "nicht vorzeitig rotiert");
  assert.equal(c.user().id, "gast");
});

test("Speicher fast voll: Platz der alten (verbrauchten) Sitzung nutzen, neue gespeichert, keine Warnung", async () => {
  const st = store(GAST()); let warn = 0;
  const { c } = mkc(st, () => res(200, { access_token: "a1", refresh_token: "r1", expires_in: 3600, user: GAST().user }));
  c.onUnsaved(() => { warn++; });
  const set = st.setItem;
  st.setItem = (k, v) => { if (st.m.has(k)) throw new Error("QuotaExceededError"); set(k, v); };   // passt nur, wenn die alte weg ist
  await c.ensureSession();
  assert.equal(JSON.parse(st.getItem("kopfball-duell-session")).refresh_token, "r1");
  assert.equal(warn, 0);
});

test("Speicher voll, volle Sitzung passt nicht: verkleinerte (Tokens, Kern des Nutzers); passt auch die nicht: leer statt verbrauchtem Token", async () => {
  const big = { ...GAST(), user: { id: "gast", is_anonymous: true, identities: ["x".repeat(500)], app_metadata: { provider: "anonymous" } } };
  const user = { ...big.user };
  for (const limit of [400, 100]) {
    const st = store(big); let warn = 0;
    const { c } = mkc(st, () => res(200, { access_token: "a1", refresh_token: "r1", expires_in: 3600, user }));
    c.onUnsaved(() => { warn++; });
    const set = st.setItem;
    st.setItem = (k, v) => { if (v.length > limit) throw new Error("QuotaExceededError"); set(k, v); };
    await c.ensureSession();
    const saved = JSON.parse(st.getItem("kopfball-duell-session") || "null");
    if (limit === 400) {
      assert.deepEqual([saved.refresh_token, saved.user.id, saved.user.identities, warn], ["r1", "gast", undefined, 0], "verkleinert gespeichert");
    } else {
      assert.equal(saved, null, "das verbrauchte r0 steht nicht mehr da");
      assert.deepEqual([warn, c.user().id], [1, "gast"], "dieser Tab spielt weiter, Warnung");
    }
  }
});

test("Code anfordern (Anmelden) schickt das Captcha-Token mit; Captcha scheitert -> captcha_failed, kein Merker", async () => {
  const bodies = [], st = memStorage();
  const fetch = async (u, o) => { bodies.push([u.replace("https://x.test", "").replace(/\?.*/, ""), JSON.parse(o.body)]); return res(200, {}); };
  const c = createClient({ url: "https://x.test", anonKey: "k", storage: st, fetch, captcha: async () => "tok" });
  await c.sendLoginCode("a@b.de", "https://x.test/");
  assert.deepEqual(bodies[0], ["/auth/v1/otp", { email: "a@b.de", create_user: false, gotrue_meta_security: { captcha_token: "tok" } }]);
  const c2 = createClient({ url: "https://x.test", anonKey: "k", storage: st, fetch, captcha: async () => { throw new Error("captcha_timeout"); } });
  st.removeItem("kopfball-duell-mail");
  await assert.rejects(c2.sendLoginCode("a@b.de"), e => e.code === "captcha_failed");
  assert.equal(st.getItem("kopfball-duell-mail"), null);
  assert.equal(bodies.length, 1, "ohne Token nicht abgeschickt");
});

test("Erststart: Gast des anderen Kontexts schon während der Anmeldung übernommen -> der bleibt", async () => {
  const st = store(null); let go;
  const { c } = mkc(st, null, { signup: () => new Promise(r => { go = () => r(res(200, { access_token: "n1", refresh_token: "nR1", expires_in: 3600, user: { id: "MEINER", is_anonymous: true } })); }) });
  const p = c.ensureSession();
  await new Promise(r => { setTimeout(r, 0); });
  st.setItem("kopfball-duell-session", JSON.stringify({ access_token: "o", refresh_token: "oR", expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: "ANDERER", is_anonymous: true } }));
  await c.reload();   // irgendein Abgleich mit dem Speicher (wie das storage-Event) übernimmt ihn schon jetzt
  go();
  assert.equal((await p).user.id, "ANDERER");
  assert.equal(stUser(st), "ANDERER", "nicht überschrieben");
});

test("Anmelden mit Code schreibt auch, wenn ein anderer Tab das Konto geändert hat (Seite lädt danach neu)", async () => {
  const st = store({ ...GAST(), expires_at: Math.floor(Date.now() / 1000) + 3600 });
  const fetch = async () => res(200, { access_token: "k1", refresh_token: "kR", expires_in: 3600, user: { id: "konto", email: "a@b.de", is_anonymous: false } });
  const c = createClient({ url: "https://x.test", anonKey: "k", storage: st, fetch });
  st.removeItem("kopfball-duell-session");   // anderer Tab hat sich abgemeldet
  await assert.rejects(c.ensureSession(), e => e.code === "session_changed");
  assert.equal((await c.verifyCode("email", "a@b.de", "123456")).id, "konto");
  assert.equal(stUser(st), "konto");
  // Sichern (email_change) dagegen nicht über den Kopf des anderen Tabs
  const st2 = store({ ...GAST(), expires_at: Math.floor(Date.now() / 1000) + 3600 });
  const c2 = createClient({ url: "https://x.test", anonKey: "k", storage: st2, fetch });
  st2.setItem("kopfball-duell-session", JSON.stringify({ ...GAST(), refresh_token: "x", user: { id: "fremd", is_anonymous: true } }));
  await assert.rejects(c2.verifyCode("email_change", "a@b.de", "123456"), e => e.code === "session_changed");
  assert.equal(stUser(st2), "fremd");
});

test("Sichern auf Knopfdruck ohne Sitzung: Gast-Anmeldung darf das Captcha-Kästchen zeigen (keine Pause)", async () => {
  const st = memStorage(), seen = [];
  const fetch = async u => (u.includes("/signup") ? res(200, { access_token: "n", refresh_token: "nR", expires_in: 3600, user: { id: "G", is_anonymous: true } }) : res(200, { id: "G", is_anonymous: true, new_email: "a@b.de" }));
  const c = createClient({ url: "https://x.test", anonKey: "k", storage: st, fetch, captcha: async o => { seen.push(o); return "tok"; } });
  await c.linkEmail("a@b.de");
  assert.deepEqual(seen, [{ user: true }]);
});
