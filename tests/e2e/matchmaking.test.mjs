// Gegnersuche über den Server: zwei Spieler suchen Ranked, werden gepaart, verbinden sich (PeerJS-Ersatz),
// spielen, melden beide dasselbe Ergebnis, der Server wertet (Elo). Dazu: Ranked ohne Konto gesperrt.
// Läuft gegen tools/dev-backend.mjs auf lokalem Postgres; ohne Postgres übersprungen.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readdirSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, openPage } from "./lib.mjs";

const hasPg = existsSync("/usr/lib/postgresql") && readdirSync("/usr/lib/postgresql").length > 0;
const DB_SCRIPT = new URL("../../supabase/local/start-db.sh", import.meta.url).pathname;
const MOCK = { path: fileURLToPath(new URL("./mockpeer.js", import.meta.url)) };
const VIEW = { viewport: { width: 1100, height: 620 } };
let env, be, dir;

before(async () => {
  if (!hasPg) return;
  dir = mkdtempSync(join(tmpdir(), "kd-mm-")); chmodSync(dir, 0o777);
  const dbUrl = execFileSync("bash", [DB_SCRIPT, dir, "55443"], { encoding: "utf8" }).trim().split("\n").pop();
  const { startDevBackend } = await import("../../tools/dev-backend.mjs");
  be = await startDevBackend({ dbUrl, port: 0 });
  env = await start();
});
after(async () => {
  if (!hasPg) return;
  await env.close(); await be.close();
  execFileSync("bash", [DB_SCRIPT, "stop", dir]); rmSync(dir, { recursive: true, force: true });
});

const db = async (sql, args = []) => (await be.pool.query(sql, args)).rows;
const until = async (fn, ms = 8000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await new Promise(r => { setTimeout(r, 150); }); } };
const userId = page => until(() => page.evaluate(k => { const s = JSON.parse(localStorage.getItem(k) || "null"); return s && s.user && s.user.id; }, page.__key));
async function closeModal(p) { for (let i = 0; i < 3; i++) { await p.waitForTimeout(400); if (await p.locator("#modalOk").isVisible()) await p.click("#modalOk"); } }
// Server-Stand neu holen (nach Änderungen direkt in der Datenbank)
const resync = p => p.evaluate(async () => { const a = await import("/js/app/account.js"); const s = await import("/js/app/services.js"); a.applyState(await s.server.state()); });

test("Ranked: suchen, gepaart, spielen, gewertet", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const a = await openPage(env, VIEW, { init: [MOCK], query: q });
  const A = a.page; A.__key = "kopfball-duell-session";
  const ida = await userId(A);   // vor dem zweiten Tab lesen: dessen Start-Skript leert den gemeinsamen Speicher
  const B = await a.ctx.newPage(); B.__key = "kopfball-duell-session-b";
  const errs = [...a.errors]; B.on("pageerror", e => errs.push("B: " + e.message));
  await B.goto(env.url + "/index.html" + q + "&as=b"); await B.waitForSelector("#loading.done", { state: "attached" });
  const idb = await userId(B);
  assert.ok(ida && idb && ida !== idb, "zwei verschiedene Konten");
  await closeModal(A); await closeModal(B);

  // Gast: Ranked gesperrt
  await A.evaluate(async () => (await import("/js/ui/screens/online.js")).openOnline());
  await until(() => A.evaluate(() => !document.getElementById("mmPanel").hidden));
  assert.match(await A.textContent("#btnRanked em"), /Level 5|Konto nötig/);

  // Beide: Konto (verknüpft) und Level 6
  await db("update auth.users set is_anonymous = false, email = id::text || '@test' where id in ($1, $2)", [ida, idb]);
  await db("update game.players set level = 6 where id in ($1, $2)", [ida, idb]);
  await db("insert into game.ratings (player_id, season_id, mmr, games, wins) select x, 1, 1000, 10, 5 from unnest(array[$1, $2]::uuid[]) x", [ida, idb]);   // schon eingestuft
  for (const p of [A, B]) { await resync(p); await p.evaluate(async () => (await import("/js/ui/screens/online.js")).openOnline()); await p.waitForTimeout(200); }
  assert.match(await A.textContent("#btnRanked em"), /Bronze · 1000/);

  await A.click("#btnRanked"); await A.waitForTimeout(300);
  assert.equal(await A.evaluate(() => window.__kd.screen), "search");
  await B.bringToFront(); await B.click("#btnRanked");
  // gepaart und verbunden: beide im Spiel
  const playing = await until(async () => (await Promise.all([A, B].map(p => p.evaluate(() => ["host", "guest"].includes(window.__kd.mode) && window.__kd.screen === null)))).every(Boolean), 20000);
  assert.ok(playing, "beide im Spiel: " + JSON.stringify(await Promise.all([A, B].map(p => p.evaluate(() => [window.__kd.mode, window.__kd.screen, window.__kd.mm && window.__kd.mm.state])))));
  const m = (await db("select id, p1, p2, mode, status from game.matches"))[0];
  assert.equal(m.mode, "ranked");
  const host = m.p1 === ida ? A : B, guest = host === A ? B : A;
  assert.equal(await host.evaluate(() => window.__kd.mode), "host");

  // Host gewinnt 2:0, Abpfiff. Der Server wertet nur Spiele, die wirklich so lange liefen: Start zurückdatieren
  await db("update game.matches set created_at = now() - interval '2 minutes' where id = $1", [m.id]);
  await host.bringToFront();
  await host.evaluate(() => { const K = window.__kd; K.t0 = Date.now() - 60000; K.st.s = [2, 0]; K.st.t = 0.5; });
  await guest.evaluate(() => { window.__kd.t0 = Date.now() - 60000; });
  const settled = await until(async () => (await db("select status, result from game.matches where id = $1", [m.id]))[0].status === "settled", 20000);
  assert.ok(settled, "gewertet: " + JSON.stringify(await db("select status, report1, report2 from game.matches where id = $1", [m.id])));
  const r = await db("select player_id, mmr from game.ratings where season_id = 1 order by mmr desc");
  assert.deepEqual(r.map(x => x.player_id), [m.p1, m.p2], "Sieger vorne");
  assert.equal(r[0].mmr + r[1].mmr, 2000, "Elo: was einer gewinnt, verliert der andere");
  assert.match(await until(async () => { const t = await host.textContent("#endNote"); return /Wertung \+/.test(t) && t; }), /Wertung \+16/);

  // Nächster Gegner: wieder in der Suche
  await host.click("#btnEndAgain"); await host.waitForTimeout(500);
  assert.equal(await host.evaluate(() => window.__kd.screen), "search");
  await host.click("#srCancel"); await host.waitForTimeout(500);
  assert.equal((await db("select count(*)::int n from game.match_queue where player_id = $1", [m.p1]))[0].n, 0, "aus der Warteschlange raus");
  assert.deepEqual(errs.filter(e => !/status of 400/.test(e)), []);
});

test("Name, Freunde und Bestenliste", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const a = await openPage(env, VIEW, { query: q });
  const A = a.page; A.__key = "kopfball-duell-session";
  const ida = await userId(A);
  const B = await a.ctx.newPage(); B.__key = "kopfball-duell-session-c";
  await B.goto(env.url + "/index.html" + q + "&as=c"); await B.waitForSelector("#loading.done", { state: "attached" });
  const idb = await userId(B);
  await closeModal(A); await closeModal(B);
  // Namen über die Einstellungen (landen auf dem Server)
  for (const [p, n] of [[A, "Louis"], [B, "Kumpel"]]) {
    await p.bringToFront(); await p.click("#btnSettings"); await p.fill("#setName", n); await p.press("#setName", "Tab"); await p.waitForTimeout(600);
    await p.click("#scr-settings [data-back]");
  }
  assert.deepEqual((await db("select name from game.players where id in ($1, $2) order by name", [ida, idb])).map(r => r.name), ["Kumpel", "Louis"]);
  // Freundschaft: A fragt an, B nimmt an
  await A.bringToFront(); await A.evaluate(async () => (await import("/js/ui/screens/online.js")).openOnline()); await A.waitForTimeout(300);
  await A.fill("#frName", "kumpel"); await A.click("#frAdd"); await A.waitForTimeout(600);
  assert.match(await A.textContent("#frMsg"), /Anfrage an kumpel/);
  await B.bringToFront(); await B.evaluate(async () => (await import("/js/ui/screens/online.js")).openOnline()); await B.waitForTimeout(500);
  await B.click("#frList .fr-row.incoming .btn.green"); await B.waitForTimeout(600);
  assert.match(await B.textContent("#frList"), /Louis/);
  await A.evaluate(async () => (await import("/js/ui/screens/friends.js")).friendsPanel()); await A.waitForTimeout(400);
  assert.match(await A.textContent("#frList"), /Kumpel.*online/s);
  // Bestenliste Endlos: Rekord melden (Server prüft gegen die Siegesserie, die er selbst gezählt hat)
  await db("update game.progress set endless_best = 7 where player_id = $1", [ida]);
  await A.evaluate(async () => (await import("/js/app/account.js")).submitEndless(7)); await A.waitForTimeout(500);
  await A.evaluate(async () => (await import("/js/app/account.js")).submitEndless(99)); await A.waitForTimeout(500);
  assert.equal((await db("select score from game.scores where player_id = $1 and board = 'endless' and period = 'all'", [ida]))[0].score, 7, "zu hoher Rekord abgelehnt");
  await A.evaluate(async () => (await import("/js/ui/nav.js")).showScreen("board")); await A.waitForTimeout(800);
  assert.match(await A.textContent("#boardList"), /Louis\s*7 Siege/);
  assert.match(await A.textContent("#boardMe"), /Dein Platz\s*1/);
  await A.click("#boardTabs [data-board=ranked]"); await A.waitForTimeout(600);
  assert.match(await A.textContent("#boardMe"), /Noch kein Ranked-Spiel/);
  assert.deepEqual(a.errors.filter(e => !/status of 400/.test(e)), []);
});
