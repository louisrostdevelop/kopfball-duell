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
import { start, openPage, closeAll, pickMode } from "./lib.mjs";

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

// Spielstand (und Restzeit) beim Host ändern: als Korrektur, die beide Seiten übernehmen. Die Gegnersuche kennt keine
// Korrektur (das Spiel würde ungültig), deshalb erst auf beiden Seiten die Test-Umgehung; ohne new Function (CSP)
const trust = (...ps) => Promise.all(ps.map(p => p.evaluate(() => { window.__kd.testTrustFix = true; })));
const setState = async (p, g, s, t) => { await trust(p, g); await p.evaluate(async ([s2, t2]) => (await import("/js/app/rbnet.js")).rbForce(st => { st.s = s2; if (t2 !== null) st.t = t2; }), [s, t ?? null]); };
const inGame = () => window.__kd.mode === "guest" && !window.__kd.netWait && window.__kd.rb && window.__kd.rb.peer.frame > 20 && window.__kd.mm && window.__kd.mm.match;

test("Ranked: suchen, gepaart, spielen, gewertet", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const a = await openPage(env, VIEW, { init: [MOCK], query: q });
  const A = a.page; A.__key = "kopfball-duell-session-dev";
  const ida = await userId(A);
  const B = await a.ctx.newPage(); B.__key = "kopfball-duell-session-dev-b";
  const errs = [...a.errors]; B.on("pageerror", e => errs.push("B: " + e.message));
  await B.goto(env.url + "/index.html" + q + "&as=b"); await B.waitForSelector("#loading.done", { state: "attached" });
  const idb = await userId(B);
  assert.ok(ida && idb && ida !== idb, "zwei verschiedene Konten");
  await closeModal(A); await closeModal(B);

  // Gast: Ranked gesperrt
  const rankedCard = p => p.textContent("#modeGrid [data-mode=ranked]");
  const openModes = async p => { await p.evaluate(async () => (await import("/js/ui/nav.js")).showScreen("modes")); await p.waitForTimeout(300); };
  await openModes(A);
  assert.match(await rankedCard(A), /Level 5|Konto nötig/);

  // Beide: Konto (verknüpft) und Level 6
  await db("update auth.users set is_anonymous = false, email = id::text || '@test' where id in ($1, $2)", [ida, idb]);
  await db("update game.players set level = 6 where id in ($1, $2)", [ida, idb]);
  await db("insert into game.ratings (player_id, season_id, mmr, games, wins) select x, 1, 1000, 10, 5 from unnest(array[$1, $2]::uuid[]) x", [ida, idb]);   // schon eingestuft
  // A besitzt (auf dem Server) Schuhe 4 und trägt sie, dazu eine Torexplosion, die A gar nicht hat: der Server lässt nur Echtes durch
  await db("insert into game.inventory (player_id, item_id, source) values ($1, 'shoes:4', 'test')", [ida]);
  for (const p of [A, B]) { await resync(p); await openModes(p); }
  await A.evaluate(async () => { const p = await import("/js/app/profile.js"); p.S.equip.shoes = "shoes:4"; p.S.equip.goalfx = "goalfx:8"; p.S.cos.push("goalfx:8"); });
  assert.match(await rankedCard(A), /Bronze · 1000/);
  assert.match(await until(async () => { const x = await rankedCard(A); return /online|ruhig|im Spiel|sucht|suchen/.test(x) && x; }), /online|ruhig|im Spiel|sucht|suchen/, "Aktivität in der Modus-Wahl");
  // Ranked wählen und spielen: startet direkt die Suche
  await pickMode(A, "ranked"); await A.waitForTimeout(200); await A.click("#btnPlay"); await A.waitForTimeout(300);
  assert.equal(await A.evaluate(() => window.__kd.screen), "search");
  // allein in der Suche: Hinweis, dass sonst niemand sucht (Zahl kommt vom Server)
  assert.match(await until(async () => (await A.textContent("#srOpp")) || false), /sucht sonst niemand/);
  await B.bringToFront(); await pickMode(B, "ranked"); await B.waitForTimeout(200); await B.click("#btnPlay");
  // gepaart und verbunden: beide im Spiel
  const playing = await until(async () => (await Promise.all([A, B].map(p => p.evaluate(() => ["host", "guest"].includes(window.__kd.mode) && window.__kd.screen === null)))).every(Boolean), 20000);
  assert.ok(playing, "beide im Spiel: " + JSON.stringify(await Promise.all([A, B].map(p => p.evaluate(() => [window.__kd.mode, window.__kd.screen, window.__kd.mm && window.__kd.mm.state])))));
  const m = (await db("select id, p1, p2, mode, status from game.matches where p1 in ($1, $2) order by created_at desc limit 1", [ida, idb]))[0];
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
  await setState(host, guest, [1, 0]);
  await guest.waitForTimeout(1300);   // Host sichert jede Sekunde
  const gq = q + (guest === B ? "&as=b" : "");
  await guest.close();
  guest = await a.ctx.newPage(); guest.on("pageerror", e => errs.push("Gast neu: " + e.message));
  await guest.goto(env.url + "/index.html" + gq);
  assert.ok(await until(() => guest.evaluate(inGame), 25000), "Gast wieder im Spiel");
  assert.equal(await guest.evaluate(() => !!window.__kd.rb), true, "mit Rollback");
  assert.deepEqual(await guest.evaluate(() => window.__kd.st.s), [1, 0]);
  assert.equal((await db("select status from game.matches where id = $1", [m.id]))[0].status, "open", "nicht als Aufgabe gewertet");

  // Host gewinnt 2:0, Abpfiff. Der Server wertet nur Spiele, die wirklich so lange liefen: Start zurückdatieren
  await db("update game.matches set created_at = now() - interval '2 minutes' where id = $1", [m.id]);
  await host.bringToFront();
  await host.evaluate(() => { window.__kd.t0 = Date.now() - 60000; });
  await setState(host, guest, [2, 0], 0.5);
  await guest.evaluate(() => { window.__kd.t0 = Date.now() - 60000; });
  const settled = await until(async () => (await db("select status, result from game.matches where id = $1", [m.id]))[0].status === "settled", 20000);
  assert.ok(settled, "gewertet: " + JSON.stringify(await db("select status, report1, report2 from game.matches where id = $1", [m.id])));
  const r = await db("select player_id, mmr from game.ratings where season_id = 1 and player_id in ($1, $2) order by mmr desc", [m.p1, m.p2]);
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

test("Manipulierter Start: Gast lehnt ab, Spiel beim Server ungültig, nichts hängt", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const a = await openPage(env, VIEW, { init: [MOCK], query: q });
  const A = a.page; A.__key = "kopfball-duell-session-dev";
  const ida = await userId(A);
  const B = await a.ctx.newPage(); B.__key = "kopfball-duell-session-dev-d";
  const errs = [...a.errors]; B.on("pageerror", e => errs.push("B: " + e.message));
  await B.goto(env.url + "/index.html" + q + "&as=d"); await B.waitForSelector("#loading.done", { state: "attached" });
  const idb = await userId(B);
  await closeModal(A); await closeModal(B);
  await db("update game.players set level = 6 where id in ($1, $2)", [ida, idb]);
  for (const p of [A, B]) {
    await resync(p);
    // Host (wer es wird, entscheidet der Server) schiebt sich die volle Super-Leiste in den Startzustand
    await p.evaluate(() => { window.__kd.testPatch = st => { st.p[0].meter = 100; st.p[0].full = true; }; });
  }
  for (const p of [A, B]) { await p.bringToFront(); await p.evaluate(async () => (await import("/js/app/matchmaking.js")).findMatch("casual")); }
  const m = await until(async () => (await db("select id, p1, p2, status from game.matches where p1 in ($1, $2) order by created_at desc limit 1", [ida, idb]))[0], 15000);
  assert.ok(m, "gepaart");
  const guest = m.p1 === ida ? B : A;
  // Gast: abgebrochen mit Hinweis, nicht im Spiel; Server: Spiel ungültig (nicht offen bis zur Wartung)
  assert.ok(await until(() => guest.evaluate(() => !window.__kd.mm && window.__kd.screen === "online"), 30000), "Gast bricht ab: " + JSON.stringify(await guest.evaluate(() => [window.__kd.mode, window.__kd.screen, window.__kd.mm && window.__kd.mm.state])));
  assert.match(await guest.textContent("#netNote"), /ungültige Spielbedingungen/);
  assert.equal(await guest.evaluate(() => window.__kd.rb), null, "keine Sitzung beim Gast");
  assert.equal(await until(async () => (await db("select status from game.matches where id = $1", [m.id]))[0].status === "void" && "void"), "void", "Spiel ungültig");
  const row = (await db("select report1, report2, p2_started_at from game.matches where id = $1", [m.id]))[0];
  assert.deepEqual([row.report1, row.report2, row.p2_started_at], [null, null, null], "keine Meldung, Gast nie angepfiffen");
  assert.deepEqual(errs.filter(e => !/status of 400/.test(e)), []);
});

// Zwei frische Konten (as=tag), Casual gepaart, beide im Spiel und beim Server angepfiffen
async function pairUp(tag) {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const a = await openPage(env, VIEW, { init: [MOCK], query: q });
  const A = a.page; A.__key = "kopfball-duell-session-dev-" + tag + "1";
  await A.goto(env.url + "/index.html" + q + "&as=" + tag + "1"); await A.waitForSelector("#loading.done", { state: "attached" });
  const ida = await userId(A);
  const B = await a.ctx.newPage(); B.__key = "kopfball-duell-session-dev-" + tag + "2";
  const errs = [...a.errors]; B.on("pageerror", e => errs.push("B: " + e.message));
  await B.goto(env.url + "/index.html" + q + "&as=" + tag + "2"); await B.waitForSelector("#loading.done", { state: "attached" });
  const idb = await userId(B);
  await closeModal(A); await closeModal(B);
  await db("update game.players set level = 6 where id in ($1, $2)", [ida, idb]);
  for (const p of [A, B]) await resync(p);
  for (const p of [A, B]) { await p.bringToFront(); await p.evaluate(async () => (await import("/js/app/matchmaking.js")).findMatch("casual")); }
  const m = await until(async () => (await db("select id, p1, p2 from game.matches where p1 in ($1, $2) order by created_at desc limit 1", [ida, idb]))[0], 15000);
  assert.ok(m, "gepaart");
  const host = m.p1 === ida ? A : B, guest = host === A ? B : A;
  assert.ok(await until(() => guest.evaluate(() => window.__kd.mode === "guest" && window.__kd.rb && window.__kd.rb.peer.frame > 60), 30000), "im Spiel");
  assert.ok(await until(async () => { const r = (await db("select p1_started_at, p2_started_at from game.matches where id = $1", [m.id]))[0]; return r.p1_started_at && r.p2_started_at; }), "beide angepfiffen");
  return { a, host, guest, m, errs, q };
}
const status = async id => (await db("select status, report1, report2 from game.matches where id = $1", [id]))[0];
const isVoid = id => until(async () => (await status(id)).status === "void", 15000);
// Ungültig durch den Gast (p2): beide melden desync, oder der manipulierte Host schweigt (bye nicht angekommen, Seite
// unter Last zu langsam) und die Wartung lässt die einseitige Meldung verfallen. Nie: Aufgabe oder Wertung
async function guestVoids(id) {
  const r = await until(async () => { const x = await status(id); return (x.status === "void" || (x.report2 && x.report2.desync)) && x; }, 20000);
  assert.ok(r, "Gast meldet desync: " + JSON.stringify(await status(id)));
  if (r.status === "open" && !(await until(async () => (await status(id)).status !== "open", 5000))) {
    await db("update game.matches set report2 = jsonb_set(report2, '{at}', to_jsonb(now() - interval '10 minutes')) where id = $1 and status = 'open' and report1 is null", [id]);
    await db("select game.maintenance()");
  }
  return isVoid(id);
}

test("Gegnersuche: Host gibt per Korrektur einen Stand vor → Spiel nicht synchron, beim Server ungültig", { skip: !hasPg && "kein Postgres" }, async () => {
  const { host, guest, m, errs } = await pairUp("v");
  await host.evaluate(async () => (await import("/js/app/rbnet.js")).rbForce(st => { st.s = [3, 0]; st.t = 0.5; }));
  assert.ok(await until(() => guest.evaluate(() => !window.__kd.mm && window.__kd.mode === "demo")), "Gast verlässt das Spiel");
  assert.match(await guest.textContent("#toasts"), /nicht synchron/);
  assert.ok(await until(() => host.evaluate(() => !window.__kd.mm && window.__kd.mode === "demo")), "Host auch (bye mit Grund)");
  assert.ok(await isVoid(m.id), "ungültig: " + JSON.stringify(await status(m.id)));
  const r = await status(m.id);
  assert.ok(r.report1.desync && r.report2.desync, "beide melden desync: " + JSON.stringify(r));
  assert.deepEqual(errs.filter(e => !/status of 400/.test(e)), []);
});

test("Gegnersuche: Host pfeift mitten im Spiel neu an bzw. schickt einen kaputten Start → ungültig statt Aufgabe", { skip: !hasPg && "kein Postgres" }, async () => {
  for (const [tag, attack] of [["n", "restart"], ["k", "broken"]]) {
    const { host, guest, m } = await pairUp(tag);
    await host.evaluate(async how => {
      if (how === "restart") (await import("/js/app/online.js")).hostStart();   // neue Spiel-Nr., ehrlicher 0:0-Start
      else (await import("/js/app/services.js")).net.send({ t: "start", resume: true, mid: window.__kd.mid, cfg: {} });
    }, attack);
    assert.ok(await until(() => guest.evaluate(() => !window.__kd.mm && window.__kd.mode === "demo")), attack + ": Gast verlässt das Spiel");
    assert.ok(await guestVoids(m.id), attack + ": ungültig, keine Aufgabe: " + JSON.stringify(await status(m.id)));
    assert.equal((await status(m.id)).report2 && (await status(m.id)).report2.forfeit, undefined, "keine Aufgabe gemeldet");
  }
});

test("Gegnersuche: Host trennt und antwortet auf die Wiederaufnahme mit einem eigenen Stand (Ball rast ins Tor) → ungültig", { skip: !hasPg && "kein Postgres" }, async () => {
  // ohne Prüfung fiele so ein Tor nach dem anderen
  const { host, guest, m } = await pairUp("r");
  await host.evaluate(async () => {
    const sv = await import("/js/app/services.js"), peer = await import("/js/adapters/net/peerjs.js"), rb = await import("/js/app/rbnet.js");
    const send = msg => {
      if (msg && msg.t === "start" && msg.resume) {
        const st = rb.netState(rb.rbBestState()); st.b.vx = -1e6; st.b.vy = 0;
        const ep = (Date.now() % 1e9) + 7;
        msg = { ...msg, rb: { ep, st, d: 3, from: msg.rb && msg.rb.from } };
        rb.startRb({ ep, st: rb.netState(st), delay: 3 });
        sv.provide({ net: peer });   // nur einmal
      }
      peer.send(msg);
    };
    sv.provide({ net: { ...peer, send } });
    peer.drop();
  });
  assert.ok(await until(() => guest.evaluate(() => !window.__kd.mm && window.__kd.mode === "demo"), 20000), "Gast verlässt das Spiel");
  assert.ok(await isVoid(m.id), "ungültig: " + JSON.stringify(await status(m.id)));
});

// Stand vorgeben (Testhilfe), durchlaufen lassen, danach prüfen beide wieder wie im echten Spiel
async function score(host, guest, s) {
  await setState(host, guest, s);
  assert.ok(await until(() => guest.evaluate(s2 => window.__kd.st.s.join() === s2.join(), s), 5000), "Stand vorgegeben");
  await guest.waitForTimeout(2500);
  for (const p of [host, guest]) await p.evaluate(() => { window.__kd.testTrustFix = false; });
  await guest.waitForTimeout(1500);
}

test("Gegnersuche: Host trennt und dreht per Wiederaufnahme 2 s zurück (vor ein Tor des Gasts) → ungültig", { skip: !hasPg && "kein Postgres" }, async () => {
  // ein Stand, den der Gast exakt so hat, nur 2 s alt (noch im Ring von 256 Takten)
  const { host, guest, m } = await pairUp("z");
  await score(host, guest, [0, 2]);
  await host.evaluate(async () => {
    const sv = await import("/js/app/services.js"), peer = await import("/js/adapters/net/peerjs.js"), rb = await import("/js/app/rbnet.js");
    const A = window.__kd, oldEp = A.rb.ep, f = A.rb.peer.session.sync - 120;
    const send = msg => {
      if (msg && msg.t === "start" && msg.resume) {
        const st = rb.netState(A.rb.peer.session.stateAt(f)), ep = (Date.now() % 1e9) + 7;
        msg = { ...msg, rb: { ep, st, d: 3, from: { ep: oldEp, f } } };
        rb.startRb({ ep, st: rb.netState(st), delay: 3 });
        sv.provide({ net: peer });
      }
      peer.send(msg);
    };
    sv.provide({ net: { ...peer, send } });
    peer.drop();
  });
  assert.ok(await until(() => guest.evaluate(() => !window.__kd.mm && window.__kd.mode === "demo"), 20000), "Gast verlässt das Spiel");
  assert.ok(await isVoid(m.id), "ungültig: " + JSON.stringify(await status(m.id)));
});

// Tor vorgeben (Testhilfe), dann prüfen beide wieder wie im echten Spiel; liefert den Takt davor
async function goal(host, guest, s) {
  await trust(host, guest);
  const F = await host.evaluate(async s2 => { const f0 = window.__kd.rb.peer.session.sync; (await import("/js/app/rbnet.js")).rbForce(st => { st.s = s2; }); return f0; }, s);
  assert.ok(await until(() => guest.evaluate(s2 => window.__kd.st.s.join() === s2.join(), s), 5000), "Tor angekommen");
  for (const p of [host, guest]) await p.evaluate(() => { window.__kd.testTrustFix = false; });
  return F;
}

test("Gegnersuche: Host trennt nach einem Tor des Gasts und dreht knapp davor zurück → ungültig", { skip: !hasPg && "kein Postgres" }, async () => {
  // innerhalb einer kurzen Rückschau-Grenze, aber vor dem Tor
  const { host, guest, m } = await pairUp("c");
  await guest.waitForTimeout(1500);
  const F = await goal(host, guest, [0, 1]);
  await host.evaluate(async F2 => {
    const sv = await import("/js/app/services.js"), peer = await import("/js/adapters/net/peerjs.js"), rb = await import("/js/app/rbnet.js");
    const A = window.__kd;
    const send = msg => {
      if (msg && msg.t === "start" && msg.resume) {
        const oldEp = A.rb.ep, f = Math.max(F2 - 3, A.rb.peer.session.sync - 40);
        const st = rb.netState(A.rb.peer.session.stateAt(f)), ep = (Date.now() % 1e9) + 7;
        msg = { ...msg, rb: { ep, st, d: 3, from: { ep: oldEp, f } } };
        rb.startRb({ ep, st: rb.netState(st), delay: 3 });
        sv.provide({ net: peer });
      }
      peer.send(msg);
    };
    sv.provide({ net: { ...peer, send } });
    peer.drop();
  }, F);
  assert.ok(await until(() => guest.evaluate(() => !window.__kd.mm && window.__kd.mode === "demo"), 20000), "Gast verlässt das Spiel");
  assert.ok(await guestVoids(m.id), "ungültig: " + JSON.stringify(await status(m.id)));
});

test("Gegnersuche: Gast trennt nach einem Tor des Hosts und verlangt einen Stand knapp davor → ungültig", { skip: !hasPg && "kein Postgres" }, async () => {
  const { host, guest, m } = await pairUp("d");
  await guest.waitForTimeout(1500);
  const F = await goal(host, guest, [1, 0]);
  await guest.evaluate(async F2 => {
    const sv = await import("/js/app/services.js"), peer = await import("/js/adapters/net/peerjs.js"), A = window.__kd;
    const send = msg => {
      if (msg && msg.t === "hello" && msg.resume) {
        msg = { ...msg, at: { ep: A.rb.ep, fs: [Math.max(F2 - 3, A.rb.peer.session.sync - 38)] } }; delete msg.rb;
        sv.provide({ net: peer });
      }
      peer.send(msg);
    };
    sv.provide({ net: { ...peer, send } });
    peer.drop();
  }, F);
  assert.ok(await until(() => host.evaluate(() => !window.__kd.mm && window.__kd.mode === "demo"), 20000), "Host verlässt das Spiel");
  assert.ok(await isVoid(m.id), "ungültig: " + JSON.stringify(await status(m.id)));
  assert.equal((await status(m.id)).report1.desync, "self", "Host hat es selbst erkannt");
});

test("Gegnersuche: Gast verlangt einen alten Stand (ohne Abriss bzw. nach eigenem Abriss) → abgelehnt bzw. ungültig", { skip: !hasPg && "kein Postgres" }, async () => {
  // Anfrage über die laufende Verbindung (mehrfach) bleibt unbeantwortet, das Spiel läuft weiter
  const { host, guest, m } = await pairUp("y");
  await score(host, guest, [2, 0]);
  const ep0 = await host.evaluate(() => window.__kd.rb.ep);
  for (let k = 0; k < 5; k++) {
    await guest.evaluate(async () => {
      const on = await import("/js/app/online.js"), peer = await import("/js/adapters/net/peerjs.js"), A = window.__kd;
      A.mm.ask = { mid: A.mid, at: performance.now() };
      peer.send(on.hello({ resume: A.mid, lv: 1, at: { ep: A.rb.ep, fs: [A.rb.peer.session.sync - 100] } }));
    });
    await guest.waitForTimeout(600);
  }
  await guest.waitForTimeout(1500);
  const h = await host.evaluate(() => ({ mm: !!window.__kd.mm, ep: window.__kd.rb && window.__kd.rb.ep, s: window.__kd.st.s }));
  assert.deepEqual(h, { mm: true, ep: ep0, s: [2, 0] }, "Host: keine neue Sitzung, Stand bleibt");
  assert.ok(await guest.evaluate(() => !!window.__kd.mm && window.__kd.rb.ep), "Gast spielt weiter");
  assert.equal((await status(m.id)).status, "open", "Spiel läuft weiter");
  // nach einem eigenen Abriss (neue Verbindung): ein Stand weit hinter dem endgültigen Takt des Hosts → ungültig
  await guest.evaluate(async () => {
    const sv = await import("/js/app/services.js"), peer = await import("/js/adapters/net/peerjs.js"), A = window.__kd;
    const send = msg => {
      if (msg && msg.t === "hello" && msg.resume) {
        msg = { ...msg, at: { ep: A.rb.ep, fs: [A.rb.peer.session.sync - 100] } }; delete msg.rb;
        sv.provide({ net: peer });
      }
      peer.send(msg);
    };
    sv.provide({ net: { ...peer, send } });
    peer.drop();
  });
  assert.ok(await until(() => host.evaluate(() => !window.__kd.mm && window.__kd.mode === "demo"), 20000), "Host verlässt das Spiel");
  assert.ok(await isVoid(m.id), "ungültig: " + JSON.stringify(await status(m.id)));
  const r = await status(m.id);
  assert.equal(r.report1 && r.report1.desync, "self", "Host (p1) erkennt es selbst: " + JSON.stringify(r));
});

test("Gegnersuche: Gast startet die App neu, der Host setzt mit genau dem gesicherten Stand fort (ehrlich)", { skip: !hasPg && "kein Postgres" }, async () => {
  const { a, guest, m, errs, q } = await pairUp("g");
  await guest.waitForTimeout(2500);   // Gast sichert alle 0,25 s
  const gq = q + "&as=g" + (guest.__key.endsWith("1") ? "1" : "2"), key = guest.__key;
  await guest.close();
  const g2 = await a.ctx.newPage(); g2.__key = key; g2.on("pageerror", e => errs.push("Gast neu: " + e.message));
  await g2.goto(env.url + "/index.html" + gq);
  assert.ok(await until(() => g2.evaluate(inGame), 30000), "Gast wieder im Spiel: " + JSON.stringify(await g2.evaluate(() => [!!window.__kd.mm, window.__kd.mode, window.__kd.screen])));
  await g2.waitForTimeout(1500);
  assert.equal((await status(m.id)).status, "open", "Spiel läuft weiter");
  assert.deepEqual(errs.filter(e => !/status of 400/.test(e)), []);
});

test("Gegnersuche: Host startet die App neu, der Gast prüft den Stand und spielt weiter (ehrlich)", { skip: !hasPg && "kein Postgres" }, async () => {
  const { host, guest, m, errs } = await pairUp("w");
  await setState(host, guest, [1, 1]);
  await guest.waitForTimeout(3000);   // Korrektur auf beiden Seiten durch (danach gleiche Prüfsummen)
  // ab hier prüfen beide wie im echten Spiel
  for (const p of [host, guest]) await p.evaluate(() => { window.__kd.testTrustFix = false; });
  await guest.waitForTimeout(2000);
  const ep0 = await guest.evaluate(() => window.__kd.rb.ep);
  const url = host.url(), ctx = host.context();
  await host.close();
  const h2 = await ctx.newPage(); h2.on("pageerror", e => errs.push("Host neu: " + e.message)); await h2.goto(url);
  const ok = await until(() => guest.evaluate(e => window.__kd.mode === "guest" && !window.__kd.netWait && window.__kd.rb && window.__kd.rb.ep !== e && window.__kd.rb.peer.frame > 30, ep0), 40000);
  assert.ok(ok, "neue Sitzung angenommen: " + JSON.stringify(await guest.evaluate(() => [!!window.__kd.mm, window.__kd.mode, window.__kd.screen])));
  assert.deepEqual(await guest.evaluate(() => window.__kd.st.s), [1, 1], "Stand erhalten");
  assert.equal((await status(m.id)).status, "open", "Spiel läuft weiter");
  assert.deepEqual(errs.filter(e => !/status of 400/.test(e)), []);
});

test("Name, Freunde und Bestenliste", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const a = await openPage(env, VIEW, { query: q });
  const A = a.page; A.__key = "kopfball-duell-session-dev";
  const ida = await userId(A);
  const B = await a.ctx.newPage(); B.__key = "kopfball-duell-session-dev-c";
  await B.goto(env.url + "/index.html" + q + "&as=c"); await B.waitForSelector("#loading.done", { state: "attached" });
  const idb = await userId(B);
  await closeModal(A); await closeModal(B);
  // Namen über die Einstellungen (landen auf dem Server)
  for (const [p, n] of [[A, "Stuermer"], [B, "Kumpel"]]) {
    await p.bringToFront(); await p.click("#btnProfile"); await p.click("#pcEdit"); await p.fill("#pcNameIn", n); await p.press("#pcNameIn", "Enter"); await p.waitForTimeout(600);
    await p.click("#scr-profile [data-back]");
  }
  assert.deepEqual((await db("select name from game.players where id in ($1, $2) order by name", [ida, idb])).map(r => r.name), ["Kumpel", "Stuermer"]);
  // Bestenliste Endlos: Rekord melden (Server prüft gegen die Siegesserie, die er selbst gezählt hat)
  await db("update game.progress set endless_best = 7 where player_id = $1", [ida]);
  await A.evaluate(async () => (await import("/js/app/account.js")).submitEndless(7)); await A.waitForTimeout(500);
  await A.evaluate(async () => (await import("/js/app/account.js")).submitEndless(99)); await A.waitForTimeout(500);
  assert.equal((await db("select score from game.scores where player_id = $1 and board = 'endless' and period = 'all'", [ida]))[0].score, 7, "zu hoher Rekord abgelehnt");
  await A.evaluate(async () => (await import("/js/ui/nav.js")).showScreen("board")); await A.waitForTimeout(800);
  assert.match(await A.textContent("#boardList"), /Stuermer\s*7 Siege/);
  assert.match(await A.textContent("#boardMe"), /Dein Platz\s*1/);
  await A.click("#boardTabs [data-board=ranked]"); await A.waitForTimeout(600);
  assert.match(await A.textContent("#boardMe"), /Noch kein Ranked-Spiel/);
  assert.deepEqual(a.errors.filter(e => !/status of 400/.test(e)), []);
});
