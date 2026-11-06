// Spiel mit Server: Gast-Konto auf dem Server, Übernahme des lokalen Spielstands, Tagesbonus, Kauf (bestätigt und
// abgelehnt), Spielmeldung. Läuft gegen tools/dev-backend.mjs auf einer lokalen Postgres-Datenbank mit den echten
// Migrationen. Ohne Postgres auf dem Rechner wird der Test übersprungen.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readdirSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, openPage, click, VIEW } from "./lib.mjs";

const hasPg = existsSync("/usr/lib/postgresql") && readdirSync("/usr/lib/postgresql").length > 0;
const DB_SCRIPT = new URL("../../supabase/local/start-db.sh", import.meta.url).pathname;
let env, be, dir;

before(async () => {
  if (!hasPg) return;
  dir = mkdtempSync(join(tmpdir(), "kd-e2e-")); chmodSync(dir, 0o777);
  const dbUrl = execFileSync("bash", [DB_SCRIPT, dir, "55441"], { encoding: "utf8" }).trim().split("\n").pop();
  const { startDevBackend } = await import("../../tools/dev-backend.mjs");
  be = await startDevBackend({ dbUrl, port: 0 });
  env = await start();
});
after(async () => {
  if (!hasPg) return;
  await env.close(); await be.close();
  execFileSync("bash", [DB_SCRIPT, "stop", dir]); rmSync(dir, { recursive: true, force: true });
});

const S = page => page.evaluate(async () => { const p = await import("/js/app/profile.js"); return JSON.parse(JSON.stringify(p.S)); });
const db = async (sql, args = []) => (await be.pool.query(sql, args)).rows;
const until = async (fn, ms = 6000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await new Promise(r => { setTimeout(r, 150); }); } };

test("Server-Konto: Import, Tagesbonus, Kauf, Spielmeldung", { skip: !hasPg && "kein Postgres" }, async () => {
  // Lokaler Spielstand von vorher: 1200 Münzen, Tank gekauft
  const { page, errors } = await openPage(env, VIEW.desktop, { save: { coins: 1200, chars: ["kalle", "yuki", "bolt", "tank"] }, query: `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev` });
  const sess = await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session") || "null")));
  assert.ok(sess && sess.user && sess.user.is_anonymous, "Gast-Konto auf dem Server angelegt");
  const id = sess.user.id;

  // Import: 150 Start + 1050 lokal erspielt; Tank übernommen. Danach Tagesbonus 70 (Serie 1)
  const w = await until(async () => { const r = await db("select coins from game.wallets where player_id = $1", [id]); return r[0] && Number(r[0].coins) === 1270 && r[0]; });
  assert.ok(w, "Import + Tagesbonus auf dem Server: " + JSON.stringify(await db("select reason, delta from game.ledger where player_id = $1", [id])));
  assert.equal((await db("select count(*)::int n from game.inventory where player_id = $1 and item_id = 'head:tank'", [id]))[0].n, 1, "Tank übernommen");
  await until(async () => (await S(page)).coins === 1270);
  assert.equal((await S(page)).coins, 1270, "Anzeige = Server");
  await page.waitForTimeout(700); if (await page.locator("#modal").isVisible()) await click(page, "#modalOk");

  // Kauf: lokal sofort, Server bestätigt
  await page.evaluate(async () => (await import("/js/app/profile.js")).buy("chars", "rocco", 400));
  await until(async () => (await db("select 1 from game.inventory where player_id = $1 and item_id = 'head:rocco'", [id])).length);
  await until(async () => (await S(page)).coins === 870);
  assert.equal((await S(page)).coins, 870, "Kauf gebucht");

  // Geschummelt: lokal Münzen erhöht, mehr gekauft als bezahlbar -> Server lehnt ab, wird zurückgedreht
  // (Legendäres sperrt schon das Level: lokal gar nicht kaufbar)
  assert.equal(await page.evaluate(async () => { const p = await import("/js/app/profile.js"); p.S.coins = 99999; return p.buy("chars", "kaiser", 1500); }), false, "Level-Sperre");
  await page.evaluate(async () => { const p = await import("/js/app/profile.js"); p.buy("chars", "flummi", 500); p.buy("chars", "nala", 450); });
  await until(async () => { const s = await S(page); return s.coins < 2000 && !(s.chars.includes("flummi") && s.chars.includes("nala")); });
  const s = await S(page);
  const real = Number((await db("select coins from game.wallets where player_id = $1", [id]))[0].coins);
  assert.equal(s.coins, real, "Münzen wieder wie auf dem Server");
  const owned = (await db("select item_id from game.inventory where player_id = $1", [id])).map(r => r.item_id.replace("head:", ""));
  assert.deepEqual([...s.chars].sort(), owned.filter(x => !x.includes(":")).sort(), "Besitz wie auf dem Server");
  assert.ok(real >= 0 && real <= 870, "Server hat nur bezahlbare Käufe gebucht");

  // Spiel gegen den Computer: Server bucht die Belohnung
  const coinsBefore = real;
  await click(page, "#btnPlay", 200); await click(page, "#btnKickoff", 3400);
  await page.evaluate(() => { const A = window.__kd; A.t0 = Date.now() - 60000; A.st.s = [3, 0]; A.st.stats[0].goals = 3; A.st.t = 0.5; });
  await until(() => page.evaluate(() => window.__kd.screen === "end"));
  const m = await until(async () => (await db("select delta from game.ledger where player_id = $1 and reason = 'match_cpu'", [id]))[0]);
  assert.ok(m && m.delta > 0, "Sieg gemeldet und belohnt");
  const wallet = async () => Number((await db("select coins from game.wallets where player_id = $1", [id]))[0].coins);
  assert.ok(await wallet() >= coinsBefore + m.delta, "Belohnung (plus Erfolge) gebucht");
  await until(async () => (await S(page)).coins === await wallet());
  assert.equal((await S(page)).coins, await wallet(), "Anzeige = Server nach dem Spiel");
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-pending") || "[]")), [], "keine Meldung hängt");
  assert.deepEqual(errors.filter(e => !/status of 400/.test(e)), [], "nur die abgelehnten Käufe (400) im Log");
});

test("Server weg: Spiel läuft weiter, Meldung wird nachgeholt", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const { page, ctx, errors } = await openPage(env, VIEW.desktop, { query: q });
  const id = (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session") || "null"))))?.user?.id;
  assert.ok(id);
  await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'daily'", [id])).length);
  await page.waitForTimeout(700); if (await page.locator("#modal").isVisible()) await click(page, "#modalOk");
  await ctx.route(be.url.replace("127.0.0.1", "localhost") + "/rest/**", r => r.abort());   // Netz zum Server weg
  await click(page, "#btnPlay", 200); await click(page, "#btnKickoff", 3400);
  await page.evaluate(() => { const A = window.__kd; A.t0 = Date.now() - 60000; A.st.s = [3, 0]; A.st.stats[0].goals = 3; A.st.t = 0.5; });
  await until(() => page.evaluate(() => window.__kd.screen === "end"));
  const pending = () => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-pending") || "[]").length);
  await until(async () => (await pending()) === 1);
  await page.waitForTimeout(500);   // Sendeversuch ist gescheitert, Meldung bleibt liegen
  assert.equal(await pending(), 1, "Meldung wartet im Browser");
  await ctx.unroute(be.url.replace("127.0.0.1", "localhost") + "/rest/**");
  await page.reload(); await page.waitForSelector("#loading.done", { state: "attached" });
  const m = await until(async () => (await db("select delta from game.ledger where player_id = $1 and reason = 'match_cpu'", [id]))[0]);
  assert.ok(m, "nach dem Neuladen nachgemeldet");
  assert.equal(await until(async () => (await pending()) === 0) && await pending(), 0, "Warteschlange im Browser leer");
  assert.deepEqual(errors.filter(e => !/Failed to load resource|ERR_FAILED/.test(e)), []);
});

test("Saison-Pass abholen, Kopf aufwerten, Casual/Ranked in der Modus-Auswahl", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const { page, errors } = await openPage(env, VIEW.desktop, { query: q });
  const id = (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session") || "null"))))?.user?.id;
  await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'daily'", [id])).length);
  await db("select game.book($1, 'coins', 3000, 't'), game.book($1, 'gems', 600, 't'), game.add_pass_points($1, 130)", [id]);
  await db("update game.heads set xp = 100 where player_id = $1 and head_id = 'head:kalle'", [id]);
  await page.evaluate(async () => { const a = await import("/js/app/account.js"); const s = await import("/js/app/services.js"); a.applyState(await s.server.state()); });
  await page.waitForTimeout(700); if (await page.locator("#modal").isVisible()) await click(page, "#modalOk");

  // Modus-Auswahl: Casual und Ranked da (Ranked als Gast gesperrt)
  await click(page, "#modeCard", 300);
  const names = await page.$$eval("#modeGrid .mcard b", els => els.map(e => e.textContent));
  assert.ok(names.includes("Casual") && names.includes("Ranked"), names.join(","));
  assert.ok(await page.locator("#modeGrid .mcard.locked", { hasText: "Ranked" }).count() === 1, "Ranked gesperrt für Gäste");
  await click(page, "#scr-modes [data-back]");

  // Pass: drei Stufen erreicht, Gratis abholen, Premium mit Juwelen
  await click(page, "#navTasks", 300);
  assert.equal(await page.textContent("#passBadge"), "3");
  await click(page, "#btnPass", 400);
  await click(page, ".ptier:nth-child(1) .pt-cell.free .btn.yellow", 600);
  assert.equal((await db("select claimed_free from game.pass_progress where player_id = $1", [id]))[0].claimed_free, "1");
  await click(page, ".pt-premium .btn.pink", 800);
  assert.ok((await db("select premium from game.pass_progress where player_id = $1", [id]))[0].premium, "Premium gekauft");
  await click(page, ".ptier:nth-child(1) .pt-cell.prem .btn.yellow", 600);
  assert.equal((await db("select claimed_premium from game.pass_progress where player_id = $1", [id]))[0].claimed_premium, "1");

  // Kopf aufwerten: Kalle hat 100 Kopf-XP = genug für Level 2 (kostet 200 Münzen)
  await click(page, "#scr-pass [data-back]"); await click(page, "#scr-tasks [data-back]");
  await click(page, "#navHeads", 400);
  await click(page, "#ciLevel .btn", 800);
  assert.equal((await db("select level from game.heads where player_id = $1 and head_id = 'head:kalle'", [id]))[0].level, 2);
  assert.match(await page.textContent("#ciLevel"), /Level 2/);
  // Spiel mit Level 2: Kopf-Level im Spiel
  await click(page, "#btnSelOk", 300);
  await click(page, "#btnPlay", 300); await click(page, "#btnKickoff", 600);
  assert.deepEqual(await page.evaluate(() => window.__kd.st.lv), [2, 1]);
  assert.deepEqual(errors.filter(e => !/status of 400/.test(e)), []);
});

test("Offline spielen: Meldung wartet, Kaufen gesperrt, beim Wiederverbinden gewertet; Karriere mit Liga-Bonus", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const { page, ctx, errors } = await openPage(env, VIEW.desktop, { query: q });
  const id = (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session") || "null"))))?.user?.id;
  await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'daily'", [id])).length);
  await page.waitForTimeout(700); if (await page.locator("#modal").isVisible()) await click(page, "#modalOk");
  const pending = () => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-pending") || "[]").length);
  const win = () => page.evaluate(() => { const K = window.__kd; K.t0 = Date.now() - 60000; const st = K.st; st.s = [2, 0]; st.stats[0].goals = 2; st.t = 0.2; st.rules.win = 0; });

  // Offline: Karriere Spiel 1 gewinnen, Meldung bleibt liegen, Sterne lokal sichtbar
  await ctx.setOffline(true);
  await click(page, "#modeCard"); await click(page, "#modeGrid [data-mode=career]"); await click(page, "#btnPlay", 400);
  await click(page, "#btnCareerGo", 3400); await win(); await page.waitForTimeout(3300);
  assert.equal(await pending(), 1, "Meldung wartet");
  await click(page, "#btnEndAgain", 500);
  assert.equal(await page.locator("#careerGrid .cstage:nth-child(1) .stars svg.on").count(), 3, "lokal 3 Sterne");
  // Kaufen ohne Verbindung: gesperrt, nichts abgebucht
  const coins = (await S(page)).coins;
  const bought = await page.evaluate(async () => (await import("/js/app/profile.js")).buy("balls", "retro", 100));
  assert.equal(bought, false); assert.equal((await S(page)).coins, coins);
  assert.match(await page.textContent("#toasts"), /Keine Verbindung/);

  // Wieder online: wird nachgeschickt und gewertet, Karriere vom Server
  await ctx.setOffline(false);
  assert.ok(await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'match_career'", [id])).length, 8000), "nachgeschickt");
  assert.equal(await until(async () => await pending() === 0 || null), true);
  assert.equal((await db("select career->>'district.0' s from game.progress where player_id = $1", [id]))[0].s, "3");

  // Liga fast durch (Spiele 2-4 auf dem Server), Spiel 5 gewinnen: Bonus vom Server
  await db(`update game.progress set career = career || '{"district.1":1,"district.2":1,"district.3":1}' where player_id = $1`, [id]);
  await page.evaluate(async () => { const a = await import("/js/app/account.js"); const s = await import("/js/app/services.js"); a.applyState(await s.server.state()); });
  await click(page, "#scr-career [data-back]"); await click(page, "#modeCard"); await click(page, "#modeGrid [data-mode=career]"); await click(page, "#btnPlay", 400);
  assert.match(await page.textContent("#btnCareerGo"), /Kalle/, "Spiel 5 ist dran");
  await click(page, "#btnCareerGo", 3400); await win();
  assert.ok(await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'career_league'", [id])).length, 8000), "Liga-Bonus gebucht");
  assert.ok(await until(async () => /Kreisliga geschafft: \+200/.test(await page.textContent("#toasts")) || null, 4000), "Bonus angezeigt");
  assert.deepEqual(errors.filter(e => !/status of 400|Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)), []);
});

test("Kisten mit Server: Level-Up vergibt, Server würfelt, Inhalt kommt ins Profil", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const { page, errors } = await openPage(env, VIEW.desktop, { query: q });
  const id = (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session") || "null"))))?.user?.id;
  await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'daily'", [id])).length);
  await page.waitForTimeout(700); if (await page.locator("#modal").isVisible()) await click(page, "#modalOk");
  // Level 1 -> 2 auf dem Server: Bronze-Kiste mit sicher einem seltenen Kopf
  await db("select game.add_xp($1, 130)", [id]);
  await page.evaluate(async () => { const a = await import("/js/app/account.js"); const s = await import("/js/app/services.js"); a.applyState(await s.server.state()); });
  assert.equal(await page.textContent("#chestBadge"), "1");
  await click(page, "#navChests", 400);
  await click(page, '.chesttile[data-tier="bronze"]', 100);
  await page.locator("#coDone").waitFor({ state: "visible", timeout: 6000 });
  const res = (await db("select result from game.chests where player_id = $1 and ref = '2'", [id]))[0].result;
  const head = res.items.find(x => x.id.startsWith("head:"));
  assert.ok(head && !head.dup, "Server hat einen Kopf gewürfelt");
  const s = await S(page);
  assert.ok(s.chars.includes(head.id.slice(5)), "Kopf im Profil");
  assert.equal(s.chests.length, 0);
  assert.ok((await db("select 1 from game.inventory where player_id = $1 and item_id = $2", [id, head.id])).length, "auf dem Server");
  assert.deepEqual(errors.filter(e => !/status of 400/.test(e)), []);
});
