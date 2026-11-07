// Online-Spiel nach einem App-Neustart fortsetzen (Seite geschlossen und neu geöffnet): Gast, Host, Lobby,
// bewusst verlassen, „Verlassen“ in der Warte-Leiste. PeerJS ist durch einen lokalen Ersatz ersetzt.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { start, openPage } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });

const VIEW = { viewport: { width: 1100, height: 620 } };
const MOCK = { path: fileURLToPath(new URL("./mockpeer.js", import.meta.url)) };
const kd = (p, f) => p.evaluate(f);

async function lobby() {
  const a = await openPage(env, VIEW, { init: [MOCK] });
  const A = a.page;
  await A.click("#modeCard"); await A.waitForTimeout(200); await A.click("#modeGrid [data-mode=online]"); await A.waitForTimeout(200); await A.click("#btnPlay"); await A.waitForTimeout(200);
  await A.click("#btnHost"); await A.waitForTimeout(500);
  const code = (await A.textContent("#lobbyCode")).trim();
  const B = await a.ctx.newPage(); const bErr = []; B.on("pageerror", e => bErr.push("Gast: " + e.message));
  await B.goto(env.url + "/index.html?join=" + code); await B.waitForTimeout(2500);
  if (await B.locator("#modalOk").isVisible()) await B.click("#modalOk");
  return { a, A, B, code, bErr };
}
async function match() {
  const l = await lobby();
  await l.A.click("#btnLobbyStart");
  await l.A.waitForFunction(() => window.__kd.st && window.__kd.st.ph === "play", null, { timeout: 20000 });
  await l.B.waitForFunction(() => window.__kd.mode === "guest" && window.__kd.snaps.length > 0, null, { timeout: 10000 });
  return l;
}
// neue Seite im selben Browser (gleicher Gerätespeicher) = App neu geöffnet
async function reopen(ctx) {
  const P = await ctx.newPage(); const err = []; P.on("pageerror", e => err.push(e.message));
  await P.goto(env.url + "/index.html"); return { P, err };
}

test("Gast schließt die App mitten im Spiel und kommt zurück: gleiches Spiel, gleicher Stand", async () => {
  const { a, A, B } = await match();
  await kd(A, () => { window.__kd.st.s = [2, 1]; });
  await A.waitForTimeout(400);
  await B.close();   // App weg (pagehide sichert die Sitzung)
  const { P: C, err } = await reopen(a.ctx);
  await C.waitForFunction(() => window.__kd.mode === "guest" && window.__kd.st && window.__kd.snaps.length > 0, null, { timeout: 25000 });
  await C.waitForTimeout(500);
  assert.deepEqual(await kd(C, () => window.__kd.st.s), [2, 1], "Stand beim Gast");
  assert.deepEqual(await kd(A, () => [window.__kd.mode, window.__kd.st.ph, window.__kd.netWait]), ["host", "play", null], "Host spielt weiter");
  await C.waitForSelector("#netWaitBox", { state: "hidden", timeout: 3000 });
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...err], []);
});

test("Host schließt die App mitten im Spiel und kommt zurück: Stand und Zeit bleiben", async () => {
  const { a, A, B, bErr } = await match();
  await kd(A, () => { const st = window.__kd.st; st.s = [3, 2]; st.t = 50; });
  await A.waitForTimeout(1300);   // Host sichert den Stand jede Sekunde
  const t0 = await kd(A, () => window.__kd.st.t);
  await A.close();
  const { P: D, err } = await reopen(a.ctx);
  await D.waitForFunction(() => window.__kd.mode === "host" && window.__kd.st && window.__kd.st.s[0] === 3, null, { timeout: 15000 });
  await D.waitForSelector("#netWaitBox", { state: "visible", timeout: 3000 });
  assert.match(await D.textContent("#netWaitTxt"), /Warte auf/);
  // Gast merkt den Abbruch, tritt wieder bei, Spiel läuft weiter
  await D.waitForFunction(() => window.__kd.netWait === null, null, { timeout: 30000 });
  await B.waitForFunction(() => window.__kd.netWait === null && window.__kd.snaps.length > 0, null, { timeout: 10000 });
  assert.deepEqual(await kd(B, () => window.__kd.st.s), [3, 2], "Gast sieht den alten Stand");
  const t1 = await kd(D, () => window.__kd.st.t);
  assert.ok(t1 <= t0 && t1 > t0 - 5, `Spielzeit fortgesetzt: ${t0.toFixed(1)} -> ${t1.toFixed(1)}`);
  assert.deepEqual([...err, ...bErr], []);
});

test("Lobby: Host startet die App neu, derselbe Raum ist wieder offen und der Gast bleibt drin", async () => {
  const { a, A, B, code, bErr } = await lobby();
  assert.equal(await kd(B, () => window.__kd.screen), "lobby");
  await A.waitForTimeout(1200);
  await kd(A, () => window.__mockDrop()); await A.close();   // Verbindung bricht ab wie beim Schließen
  const { P: D, err } = await reopen(a.ctx);
  await D.waitForFunction(c => document.getElementById("lobbyCode").textContent.trim() === c, code, { timeout: 15000 });
  await D.waitForFunction(() => window.__kd.opp && window.__kd.opp.name, null, { timeout: 25000 });
  await B.waitForFunction(() => window.__kd.netWait === null, null, { timeout: 10000 });
  assert.equal(await kd(B, () => window.__kd.screen), "lobby", "Gast ist wieder in der Lobby");
  await B.waitForSelector("#netWaitBox", { state: "hidden", timeout: 3000 });
  assert.deepEqual([...err, ...bErr], []);
});

test("Bewusst verlassen: beim nächsten Start kein Zurückverbinden, die andere Seite wartet nicht", async () => {
  const { a, A, B } = await match();
  await kd(B, async () => (await import("/js/app/game.js")).quitToMenu());
  await A.waitForTimeout(1500);
  assert.deepEqual(await kd(A, () => [window.__kd.screen, window.__kd.netWait]), ["lobby", null], "Host sofort in der Lobby");
  await B.close();
  const { P: C, err } = await reopen(a.ctx);
  await C.waitForTimeout(3000);
  assert.deepEqual(await kd(C, () => [window.__kd.screen, window.__kd.mode, window.__kd.netWait]), ["home", "demo", null]);
  assert.deepEqual(err, []);
});

test("Warte-Leiste: „Verlassen“ beendet das Warten (Host zurück in die Lobby)", async () => {
  const { a, A, B } = await match();
  await kd(B, () => window.__mockDrop()); await B.close();
  await A.waitForSelector("#netWaitBox", { state: "visible", timeout: 12000 });
  await A.click("#netWaitLeave"); await A.waitForTimeout(500);
  assert.deepEqual(await kd(A, () => [window.__kd.screen, window.__kd.netWait]), ["lobby", null]);
  await A.waitForSelector("#netWaitBox", { state: "hidden", timeout: 3000 });
  assert.deepEqual(a.errors.filter(e => !e.includes("TUNNEL")), []);
});

test("Pausemenü offen: Gast startet neu, der Host wartet und das Spiel geht weiter", async () => {
  const { a, A, B } = await match();
  await A.click("#btnPause"); await A.waitForTimeout(300);
  assert.equal(await kd(A, () => window.__kd.screen), "pause");
  await B.close();
  const { P: C, err } = await reopen(a.ctx);
  await C.waitForFunction(() => window.__kd.mode === "guest" && !window.__kd.netWait && window.__kd.snaps.length > 0, null, { timeout: 25000 });
  assert.deepEqual(await kd(A, () => [window.__kd.mode, window.__kd.st.ph]), ["host", "play"], "Host nicht in die Lobby geflogen");
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...err], []);
});

test("Zweiter Tab, während das Spiel im ersten (im Hintergrund) läuft: kein Übernehmen", async () => {
  const { a, A, B } = await match();
  // erster Tab (Gast) geht in den Hintergrund
  await kd(B, () => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await A.waitForTimeout(600);
  const { P: D, err } = await reopen(a.ctx);
  await D.waitForTimeout(3000);
  assert.deepEqual(await kd(D, () => [window.__kd.mode, window.__kd.netWait]), ["demo", null], "neuer Tab startet normal");
  assert.deepEqual(await kd(B, () => [window.__kd.mode, window.__kd.netWait]), ["guest", null], "erster Tab spielt weiter");
  assert.equal(await kd(A, () => window.__kd.netWait), null, "Host merkt nichts");
  assert.deepEqual(err, []);
});

test("Nach dem Abpfiff: Host startet neu und landet in derselben Lobby, nicht im beendeten Spiel", async () => {
  const { a, A, B, code } = await match();
  await kd(A, () => { window.__kd.st.s = [1, 0]; window.__kd.st.t = 0.3; });
  await A.waitForFunction(() => window.__kd.screen === "end", null, { timeout: 15000 });
  await B.waitForFunction(() => window.__kd.screen === "end", null, { timeout: 15000 });
  const games = await kd(A, async () => (await import("/js/app/profile.js")).S.stats.games);
  await A.waitForTimeout(1200);
  await A.close();
  const { P: D, err } = await reopen(a.ctx);
  await D.waitForFunction(c => window.__kd.screen === "lobby" && document.getElementById("lobbyCode").textContent.trim() === c, code, { timeout: 15000 });
  await D.waitForFunction(() => window.__kd.opp && window.__kd.opp.name, null, { timeout: 25000 });
  await B.waitForFunction(() => window.__kd.screen === "lobby" && window.__kd.netWait === null, null, { timeout: 10000 });
  assert.equal(await kd(D, () => window.__kd.mode), "demo", "kein Spiel fortgesetzt");
  assert.equal(await kd(D, async () => (await import("/js/app/profile.js")).S.stats.games), games, "Spiel nicht doppelt gezählt");
  assert.deepEqual(err, []);
});

test("Nach „Verlassen“ bleibt der Raum offen: ein neuer Gast kommt mit demselben Code rein", async () => {
  const { a, A, B, code } = await match();
  await kd(B, () => window.__mockDrop()); await B.close();
  await A.waitForSelector("#netWaitBox", { state: "visible", timeout: 12000 });
  await A.click("#netWaitLeave");
  await A.waitForFunction(() => window.__kd.screen === "lobby", null, { timeout: 3000 });
  await A.waitForTimeout(1500);
  const E = await a.ctx.newPage(); const err = []; E.on("pageerror", e => err.push(e.message));
  await E.goto(env.url + "/index.html?join=" + code.toUpperCase());
  await A.waitForFunction(() => window.__kd.opp && window.__kd.opp.name, null, { timeout: 15000 });
  await E.waitForFunction(() => window.__kd.screen === "lobby" && window.__kd.opp, null, { timeout: 5000 });
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...err], []);
});

test("Einladungslink in einen anderen Raum geht vor dem Zurückverbinden", async () => {
  const { a, B } = await match();
  await B.close();
  const C = await a.ctx.newPage(); const err = []; C.on("pageerror", e => err.push(e.message));
  await C.goto(env.url + "/index.html?join=ZZZZ"); await C.waitForTimeout(2500);
  assert.equal(await C.inputValue("#codeIn"), "ZZZZ");
  assert.equal(await kd(C, () => localStorage.getItem("headstars-net-guest")), null, "alte Sitzung verworfen");
  assert.deepEqual(err, []);
});
