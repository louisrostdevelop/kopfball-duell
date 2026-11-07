// Gegnersuche über den Server: zwei Spieler suchen Ranked, werden gepaart, verbinden sich (PeerJS-Ersatz),
// spielen, melden beide dasselbe Ergebnis, der Server wertet (Elo). Dazu: Ranked ohne Konto gesperrt.
// Läuft gegen tools/dev-backend.mjs auf lokalem Postgres; ohne Postgres übersprungen.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readdirSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, openPage, closeAll } from "./lib.mjs";

const hasPg = existsSync("/usr/lib/postgresql") && readdirSync("/usr/lib/postgresql").length > 0;
const DB_SCRIPT = new URL("../../supabase/local/start-db.sh", import.meta.url).pathname;
const MOCK = { path: fileURLToPath(new URL("./mockpeer.js", import.meta.url)) };
// altes Verfahren (Host rechnet, Gast bekommt Zustände); Rollback prüfen rollback.test.mjs und rbresume.test.mjs
const CLASSIC = { content: "window.__netcode = \"classic\";" };
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
afterEach(t => closeAll(env, t));
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

// Spielstand beim Host ändern: klassisch direkt (der Gast bekommt ihn mit dem nächsten Zustand), mit Rollback als
// Korrektur, die beide Seiten übernehmen
const setState = (p, src) => p.evaluate(async code => {
  const f = new Function("st", "K", code);   // eslint-disable-line no-new-func -- Test
  if (window.__kd.rb) (await import("/js/app/rbnet.js")).rbForce(st => f(st, window.__kd)); else f(window.__kd.st, window.__kd);
}, src);
const inGame = () => window.__kd.mode === "guest" && !window.__kd.netWait && (window.__kd.rb ? window.__kd.rb.peer.frame > 20 : window.__kd.snaps.length > 0) && window.__kd.mm && window.__kd.mm.match;

for (const mode of ["rollback", "classic"]) test(`Ranked (${mode}): suchen, gepaart, spielen, gewertet`, { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const a = await openPage(env, VIEW, { init: mode === "classic" ? [CLASSIC, MOCK] : [MOCK], query: q });
  const A = a.page; A.__key = "kopfball-duell-session";
  const ida = await userId(A);
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
  // A besitzt (auf dem Server) Schuhe 4 und trägt sie, dazu eine Torexplosion, die A gar nicht hat: der Server lässt nur Echtes durch
  await db("insert into game.inventory (player_id, item_id, source) values ($1, 'shoes:4', 'test')", [ida]);
  for (const p of [A, B]) { await resync(p); await p.evaluate(async () => (await import("/js/ui/screens/online.js")).openOnline()); await p.waitForTimeout(200); }
  await A.evaluate(async () => { const p = await import("/js/app/profile.js"); p.S.equip.shoes = "shoes:4"; p.S.equip.goalfx = "goalfx:8"; p.S.cos.push("goalfx:8"); });
  assert.match(await A.textContent("#btnRanked em"), /Bronze · 1000/);

  assert.match(await A.textContent("#mmAct"), /aktiv|ruhig|im Spiel|sucht|suchen/, "Aktivität im Online-Menü");
  await A.click("#btnRanked"); await A.waitForTimeout(300);
  assert.equal(await A.evaluate(() => window.__kd.screen), "search");
  // allein in der Suche: Hinweis, dass sonst niemand sucht (Zahl kommt vom Server)
  assert.match(await until(async () => (await A.textContent("#srOpp")) || false), /sucht sonst niemand/);
  await B.bringToFront(); await B.click("#btnRanked");
  // gepaart und verbunden: beide im Spiel
  const playing = await until(async () => (await Promise.all([A, B].map(p => p.evaluate(() => ["host", "guest"].includes(window.__kd.mode) && window.__kd.screen === null)))).every(Boolean), 20000);
  assert.ok(playing, "beide im Spiel: " + JSON.stringify(await Promise.all([A, B].map(p => p.evaluate(() => [window.__kd.mode, window.__kd.screen, window.__kd.mm && window.__kd.mm.state])))));
  const m = (await db("select id, p1, p2, mode, status from game.matches"))[0];
  assert.equal(m.mode, "ranked");
  const host = m.p1 === ida ? A : B;
  let guest = host === A ? B : A;
  assert.equal(await host.evaluate(() => window.__kd.mode), "host");
  // Anpfiff beim Server gemeldet: ab jetzt lässt sich das Spiel nicht mehr per Abbruch ungültig machen
  assert.ok(await until(async () => (await db("select started_at from game.matches where id = $1", [m.id]))[0].started_at), "Anpfiff gemeldet");
  const abort = await guest.evaluate(async id => { try { await (await import("/js/app/services.js")).server.matchAbort(id); return "ok"; } catch (e) { return String(e.message || e); } }, m.id);
  assert.match(abort, /too_late/, "kein Abbruch nach dem Anpfiff");
  // Kosmetik vom Server geprüft: Schuhe ja, Torexplosion (nicht besessen) nein; beide sehen dasselbe
  const ia = m.p1 === ida ? 0 : 1;
  for (const p of [A, B]) assert.deepEqual(await p.evaluate(i => [window.__kd.cfg.cos[i].shoes, window.__kd.cfg.cos[i].goalfx], ia), ["shoes:4", null]);

  // Gast schließt die App mitten im gewerteten Spiel und öffnet sie wieder: zurück im selben Spiel, keine Aufgabe gemeldet
  await setState(host, "st.s = [1, 0];");
  await guest.waitForTimeout(1300);   // Host sichert jede Sekunde
  const gq = q + (guest === B ? "&as=b" : "");
  await guest.close();
  guest = await a.ctx.newPage(); guest.on("pageerror", e => errs.push("Gast neu: " + e.message));
  await guest.goto(env.url + "/index.html" + gq);
  assert.ok(await until(() => guest.evaluate(inGame), 25000), "Gast wieder im Spiel");
  assert.equal(await guest.evaluate(() => !!window.__kd.rb), mode === "rollback", "Verfahren wie beim Anpfiff");
  assert.deepEqual(await guest.evaluate(() => window.__kd.st.s), [1, 0]);
  assert.equal((await db("select status from game.matches where id = $1", [m.id]))[0].status, "open", "nicht als Aufgabe gewertet");

  // Host gewinnt 2:0, Abpfiff. Der Server wertet nur Spiele, die wirklich so lange liefen: Start zurückdatieren
  await db("update game.matches set created_at = now() - interval '2 minutes' where id = $1", [m.id]);
  await host.bringToFront();
  await host.evaluate(() => { window.__kd.t0 = Date.now() - 60000; });
  await setState(host, "st.s = [2, 0]; st.t = 0.5;");
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
    await p.bringToFront(); await p.click("#btnProfile"); await p.click("#pcEdit"); await p.fill("#pcNameIn", n); await p.press("#pcNameIn", "Enter"); await p.waitForTimeout(600);
    await p.click("#scr-profile [data-back]");
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
