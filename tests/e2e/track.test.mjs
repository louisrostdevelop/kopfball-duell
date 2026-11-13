// Nutzungsstatistik der Spiele (game.events: match_start / match_end): echtes Spiel gegen den Computer mit Server.
// Regulär abgepfiffen = done:true, Revanche bucht nichts doppelt, Neustart und Menü mitten im Spiel = done:false,
// Abpfiff und sofort weg (in den 900 ms bis zur Wertung) zählt trotzdem als zu Ende gespielt, Hintergrund und
// Drehen am Handy starten kein Spiel neu, ein neuer Spieler landet nicht von selbst in einem Spiel.
// Gegen tools/dev-backend.mjs mit lokaler Postgres-Datenbank; ohne Postgres übersprungen.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readdirSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, openPage, click, VIEW, closeAll } from "./lib.mjs";

const hasPg = existsSync("/usr/lib/postgresql") && readdirSync("/usr/lib/postgresql").length > 0;
const DB_SCRIPT = new URL("../../supabase/local/start-db.sh", import.meta.url).pathname;
const SESSION = "kopfball-duell-session-dev";
let env, be, dir, q;

before(async () => {
  if (!hasPg) return;
  dir = mkdtempSync(join(tmpdir(), "kd-e2e-track-")); chmodSync(dir, 0o777);
  const dbUrl = execFileSync("bash", [DB_SCRIPT, dir, "55445"], { encoding: "utf8" }).trim().split("\n").pop();
  const { startDevBackend } = await import("../../tools/dev-backend.mjs");
  be = await startDevBackend({ dbUrl, port: 0 });
  env = await start();
  q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
});
afterEach(t => closeAll(env, t));
after(async () => {
  if (!hasPg) return;
  await env.close(); await be.close();
  execFileSync("bash", [DB_SCRIPT, "stop", dir]); rmSync(dir, { recursive: true, force: true });
});

const db = async (sql, args = []) => (await be.pool.query(sql, args)).rows;
const until = async (fn, ms = 6000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await new Promise(r => { setTimeout(r, 150); }); } };

/** Spiel-Ereignisse des Spielers gezählt: { start, done, quit } (Meldungen laufen parallel, Reihenfolge zählt nicht) */
async function counts(id) {
  const r = await db("select kind, data from game.events where player_id = $1 and kind in ('match_start', 'match_end')", [id]);
  const n = { start: 0, done: 0, quit: 0 };
  for (const e of r) { if (e.data.mode !== "cpu") n.other = (n.other || 0) + 1; else if (e.kind === "match_start") n.start++; else if (e.data.done === true) n.done++; else n.quit++; }
  return n;
}
/** wartet, bis genau want gemeldet ist, und prüft dann kurz nach, dass nichts mehr nachkommt */
async function expectCounts(id, want, msg) {
  await until(async () => JSON.stringify(await counts(id)) === JSON.stringify(want));
  await new Promise(r => { setTimeout(r, 600); });
  assert.deepEqual(await counts(id), want, msg);
}

async function login(page) {
  const sess = await until(() => page.evaluate(k => JSON.parse(localStorage.getItem(k) || "null"), SESSION));
  const id = sess.user.id;
  // Statistik geht erst mit Sitzung und erreichbarem Server raus: auf den Tagesbesuch warten
  assert.ok(await until(async () => (await db("select 1 from game.events where player_id = $1 and kind = 'visit'", [id])).length), "Tagesbesuch");
  return id;
}
const playing = page => page.waitForFunction(() => window.__kd.st && window.__kd.st.ph === "play" && window.__kd.screen === null, null, { timeout: 8000 });
async function kickoff(page) { await click(page, "#btnPlay", 200); await click(page, "#btnKickoff", 100); await playing(page); }
// fast abgelaufen, eigene Führung (kein Golden Goal; das Tor auch in der Statistik, sonst hält der Server den Sieg für unplausibel)
const nearEnd = page => page.evaluate(() => { const A = window.__kd; A.t0 = Date.now() - 60000; A.st.s = [1, 0]; A.st.stats[0].goals = 1; A.st.t = 0.3; });
/** Abpfiff abwarten und im selben Frame Pause und dann btn drücken (noch vor der Wertung nach 900 ms) */
const atWhistle = (page, btn) => page.evaluate(b => new Promise(res => {
  const A = window.__kd; A.t0 = Date.now() - 60000; A.st.s = [1, 0]; A.st.stats[0].goals = 1; A.st.t = 0.2;
  const tick = () => { if (A.st.ph !== "end") { requestAnimationFrame(tick); return; } document.getElementById("btnPause").click(); document.getElementById(b).click(); res(); };
  tick();
}), btn);

test("Statistik der Spiele gegen den Computer: Abpfiff, Revanche, Neustart, Menü, Hintergrund", { skip: !hasPg && "kein Postgres" }, async () => {
  const { page, errors } = await openPage(env, VIEW.desktop, { query: q });
  const id = await login(page);
  await page.waitForTimeout(500); if (await page.locator("#modal").isVisible()) await click(page, "#modalOk");
  await expectCounts(id, { start: 0, done: 0, quit: 0 }, "Startseite (Demo im Hintergrund) meldet kein Spiel");

  // a) regulär bis zum Abpfiff, Ergebnis-Bildschirm
  await kickoff(page);
  await expectCounts(id, { start: 1, done: 0, quit: 0 }, "a) Anpfiff");
  await nearEnd(page);
  await page.waitForFunction(() => window.__kd.screen === "end");
  await expectCounts(id, { start: 1, done: 1, quit: 0 }, "a) Abpfiff: done:true");

  // b) Revanche vom Ergebnis-Bildschirm: neues Spiel, kein Abbruch fürs fertige
  await click(page, "#btnEndAgain", 100); await playing(page);
  await expectCounts(id, { start: 2, done: 1, quit: 0 }, "b) Revanche");

  // c) Pause -> Neu starten mitten im Spiel: altes abgebrochen, neues begonnen
  await click(page, "#btnPause"); await click(page, "#btnRestart", 100); await playing(page);
  await expectCounts(id, { start: 3, done: 1, quit: 1 }, "c) Neustart");

  // f) App in den Hintergrund und zurück: pausiert, startet nichts neu, meldet nichts
  const st0 = await page.evaluateHandle(() => window.__kd.st);
  await page.evaluate(() => {
    const set = (h, v) => { Object.defineProperty(document, "hidden", { configurable: true, get: () => h }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v }); };
    set(true, "hidden"); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    set(false, "visible"); window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })); document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => window.__kd.screen), "pause", "f) Hintergrund pausiert");
  await click(page, "#btnResume");
  assert.ok(await page.evaluate(s => window.__kd.st === s && window.__kd.mode === "cpu", st0), "f) dasselbe Spiel läuft weiter");
  await expectCounts(id, { start: 3, done: 1, quit: 1 }, "f) Hintergrund meldet nichts");

  // d) Pause -> Menü mitten im Spiel: abgebrochen
  await click(page, "#btnPause"); await click(page, "#btnQuit", 100);
  assert.equal(await page.evaluate(() => window.__kd.mode), "demo");
  await expectCounts(id, { start: 3, done: 1, quit: 2 }, "d) Menü mitten im Spiel");

  // e) Abpfiff und sofort ins Menü (vor der Wertung): zu Ende gespielt, nicht abgebrochen; kein Ergebnis-Bildschirm danach
  await kickoff(page);
  const coins = await page.evaluate(async () => (await import("/js/app/profile.js")).S.coins);
  await atWhistle(page, "btnQuit");
  await expectCounts(id, { start: 4, done: 2, quit: 2 }, "e) Abpfiff, sofort Menü: done:true");
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.__kd.screen), "home", "e) bleibt im Menü");
  assert.equal(await page.evaluate(async () => (await import("/js/app/profile.js")).S.coins), coins, "e) Belohnung wie bisher: verlassen vor der Wertung bucht nichts");

  // e2) Abpfiff und sofort Neu starten: altes zu Ende gespielt, neues begonnen
  await kickoff(page);
  await atWhistle(page, "btnRestart"); await playing(page);
  await expectCounts(id, { start: 6, done: 3, quit: 2 }, "e2) Abpfiff, sofort Neustart");
  await page.waitForTimeout(700);
  assert.equal(await page.evaluate(() => window.__kd.screen), null, "e2) kein Ergebnis-Bildschirm mitten im neuen Spiel");
  await click(page, "#btnPause"); await click(page, "#btnQuit", 100);
  await expectCounts(id, { start: 6, done: 3, quit: 3 }, "e2) dann Menü");
  assert.deepEqual(errors, [], "ohne Konsolenfehler");
});

test("Handy: Hochformat, Drehen, neuer Spieler mit Anleitung", { skip: !hasPg && "kein Postgres" }, async () => {
  // ganz neuer Spieler: ohne vorbereiteten Spielstand (Anleitung noch nicht gesehen)
  const { page, errors } = await openPage(env, VIEW.portrait, { query: q, init: [() => sessionStorage.setItem("seeded", "1")] });
  const id = await login(page);
  assert.equal(await page.evaluate(async () => (await import("/js/app/profile.js")).S.tutorial), false, "Anleitung noch offen");
  await page.waitForTimeout(1500);
  assert.equal(await page.evaluate(() => window.__kd.mode), "demo", "neuer Spieler landet nicht von selbst im Spiel");
  await expectCounts(id, { start: 0, done: 0, quit: 0 }, "Erster Start meldet kein Spiel");

  // Anpfiff im Hochformat: Hinweis „Handy drehen“, Spiel steht, nichts wird neu gestartet
  await click(page, "#btnPlay", 200); await click(page, "#btnKickoff", 1500);
  assert.ok(await page.locator("#rotate").isVisible(), "Hinweis zum Drehen");
  await expectCounts(id, { start: 1, done: 0, quit: 0 }, "Anpfiff im Hochformat");
  // Vollbild (beim Anpfiff am Handy) verlassen: sonst lässt sich das Fenster nicht drehen
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await page.waitForTimeout(200);
  for (const [w, h] of [[844, 390], [390, 844], [844, 390]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.evaluate(() => { window.dispatchEvent(new Event("orientationchange")); window.dispatchEvent(new Event("resize")); });
    await page.waitForTimeout(500);
  }
  await playing(page);
  await expectCounts(id, { start: 1, done: 0, quit: 0 }, "Drehen startet nichts neu");
  await nearEnd(page);
  await page.waitForFunction(() => window.__kd.screen === "end");
  await expectCounts(id, { start: 1, done: 1, quit: 0 }, "Abpfiff am Handy: done:true");
  assert.deepEqual(errors, [], "ohne Konsolenfehler");
});
