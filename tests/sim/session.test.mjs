// Online-Sitzung nach einem App-Neustart: wann zurückverbunden wird und wann nicht
import { test } from "node:test";
import assert from "node:assert/strict";

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
// Web-Sperren steuerbar: null = Browser ohne Sperren (Ersatzregel), sonst Namen, die ein anderer Tab hält
let others = null;
const mine = new Set();
const locks = {
  request: (name, cb) => { mine.add(name); return Promise.resolve(cb({ name })).finally(() => mine.delete(name)); },
  query: async () => ({ held: [...mine, ...others].map(name => ({ name })) }),
};
Object.defineProperty(globalThis, "navigator", { value: { get locks() { return others ? locks : undefined; } }, configurable: true });
const S = await import("../../js/app/session.js");
const { VERSION } = await import("../../js/app/state.js");

const game = (o = {}) => ({ role: "host", phase: "play", code: "abcd", mid: 3, st: {}, cfg: {}, guestCfg: {}, opp: { tok: "x" }, v: VERSION, t: 0, closing: true, ...o });

test("resumable: frisch geschlossen ja, lebender Tab, alte Version, abgelaufen, kaputt nein", () => {
  assert.equal(S.resumable(game(), 5000).ok, true, "Spiel, vor 5 s geschlossen");
  assert.equal(S.resumable(game({ closing: false }), 1000).why, "alive", "anderer Tab frischt noch auf");
  assert.equal(S.resumable(game({ closing: false }), S.ALIVE_MS + 500).ok, true, "Tab hörte ohne pagehide auf (Absturz)");
  assert.equal(S.resumable(game({ v: "alt" }), 1000).why, "version", "neue Spielversion: nicht mischen");
  assert.equal(S.resumable(game(), S.RESUME_GAME_MS + 1).why, "expired", "Spiel: Gegenseite wartet nicht so lange");
  assert.equal(S.resumable(game({ phase: "lobby", st: null }), S.RESUME_GAME_MS + 1).ok, true, "Lobby hält länger");
  assert.equal(S.resumable(game({ phase: "lobby" }), S.RESUME_LOBBY_MS + 1).why, "expired");
  assert.equal(S.resumable(game({ st: null }), 1000).why, "broken", "Host ohne Spielstand kann kein Spiel fortsetzen");
  assert.equal(S.resumable({ role: "guest", phase: "play", code: "abcd", mid: 2, v: VERSION, t: 0, closing: true }, 1000).ok, true, "Gast braucht keinen Stand");
  assert.equal(S.resumable(null, 0).why, "none");
  assert.equal(S.resumable(game({ t: 10000 }), 5000).why, "expired", "Uhr zurückgestellt");
  assert.equal(S.resumable(game(), 5000, { alive: true }).why, "alive", "Web-Sperre: Besitzer-Tab lebt (nur im Hintergrund)");
  assert.equal(S.resumable(game({ closing: false }), 1000, { alive: false }).ok, true, "Web-Sperre frei: Tab ist weg, auch ohne pagehide");
});

test("speichern, schließen, beim Start übernehmen; bewusst verlassen löscht", async () => {
  store.clear();
  S.saveSession("guest", { phase: "play", code: "wxyz", mid: 1, tok: "t1" });
  assert.equal(await S.takeResumable(Date.now() + 500), null, "läuft noch (gleicher Tab)");
  S.markClosing();
  const s = await S.takeResumable(Date.now() + 500);
  assert.equal(s && s.code, "wxyz", "nach dem Schließen fortsetzbar");
  assert.equal(S.sessionRole(), "guest");
  S.clearSession();
  assert.equal(await S.takeResumable(Date.now() + 500), null, "nach bewusstem Verlassen nichts mehr");
});

test("zwei Rollen im selben Browser überschreiben sich nicht, Spiel geht vor Lobby", async () => {
  store.clear();
  S.saveSession("host", { phase: "lobby", code: "aaaa", netCfg: {} }); S.markClosing();
  S.saveSession("guest", { phase: "play", code: "bbbb", mid: 4, tok: "t" }); S.markClosing();
  const s = await S.takeResumable(Date.now() + 500);
  assert.equal(s.role, "guest", "laufendes Spiel zuerst");
  assert.ok(store.has("headstars-net-host"), "Lobby-Sitzung des anderen bleibt");
});

test("abgelaufene Sitzungen werden beim Start aufgeräumt", async () => {
  store.clear();
  S.saveSession("host", { phase: "play", code: "cccc", mid: 2, st: {}, cfg: {}, guestCfg: {}, opp: {} }); S.markClosing();
  assert.equal(await S.takeResumable(Date.now() + S.RESUME_GAME_MS + 1000), null);
  assert.equal(store.has("headstars-net-host"), false);
});

test("Web-Sperre: lebt der Besitzer-Tab noch (z. B. im Hintergrund), wird nicht übernommen", async () => {
  store.clear(); others = new Set();
  // Sitzung eines anderen Tabs, der gerade „versteckt“ wurde
  const KEY = "headstars-net-host";
  store.set(KEY, JSON.stringify(game({ code: "dddd", t: Date.now() })));
  others.add(KEY);
  assert.equal(await S.takeResumable(Date.now() + 500), null, "anderer Tab hält die Sperre, trotz „schließend“");
  assert.ok(store.has(KEY), "Sitzung des lebenden Tabs bleibt");
  others.delete(KEY);
  const s = await S.takeResumable(Date.now() + 500);
  assert.equal(s && s.code, "dddd", "Sperre frei: Tab ist weg, fortsetzen");
  S.clearSession(); others = null;
});
