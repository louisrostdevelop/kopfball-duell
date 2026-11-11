// Spiel mit Server: Gast-Konto auf dem Server, Übernahme des lokalen Spielstands, Tagesbonus, Kauf (bestätigt und
// abgelehnt), Spielmeldung. Läuft gegen tools/dev-backend.mjs auf einer lokalen Postgres-Datenbank mit den echten
// Migrationen. Ohne Postgres auf dem Rechner wird der Test übersprungen.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readdirSync, chmodSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { start, openPage, click, VIEW, closeAll } from "./lib.mjs";

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
afterEach(t => closeAll(env, t));
after(async () => {
  if (!hasPg) return;
  await env.close(); await be.close();
  execFileSync("bash", [DB_SCRIPT, "stop", dir]); rmSync(dir, { recursive: true, force: true });
});

const S = page => page.evaluate(async () => { const p = await import("/js/app/profile.js"); return JSON.parse(JSON.stringify(p.S)); });
const db = async (sql, args = []) => (await be.pool.query(sql, args)).rows;
const until = async (fn, ms = 6000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await new Promise(r => { setTimeout(r, 150); }); } };

test("Server-Konto: Import, Tagesbonus, Kauf, Spielmeldung", { skip: !hasPg && "kein Postgres" }, async () => {
  // Lokaler Spielstand von vorher: 2000 Münzen, Retro-Ball gekauft
  const { page, errors } = await openPage(env, VIEW.desktop, { save: { coins: 2000, balls: ["klassik", "retro"] }, query: `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev` });
  const sess = await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null")));
  assert.ok(sess && sess.user && sess.user.is_anonymous, "Gast-Konto auf dem Server angelegt");
  const id = sess.user.id;

  // Import (Budget 2000): Retro 500, dazu 1500 der lokal erspielten Münzen; plus 150 Start. Danach Tagesbonus 35 (Serie 1)
  const w = await until(async () => { const r = await db("select coins from game.wallets where player_id = $1", [id]); return r[0] && Number(r[0].coins) === 1685 && r[0]; });
  assert.ok(w, "Import + Tagesbonus auf dem Server: " + JSON.stringify(await db("select reason, delta from game.ledger where player_id = $1", [id])));
  assert.equal((await db("select count(*)::int n from game.inventory where player_id = $1 and item_id = 'ball:retro'", [id]))[0].n, 1, "Retro übernommen");
  await until(async () => (await S(page)).coins === 1685);
  assert.equal((await S(page)).coins, 1685, "Anzeige = Server");
  await page.waitForTimeout(700); if (await page.locator("#modal").isVisible()) await click(page, "#modalOk");

  // Kauf: lokal sofort, Server bestätigt
  await page.evaluate(async () => (await import("/js/app/profile.js")).buy("chars", "rocco", 1600));
  await until(async () => (await db("select 1 from game.inventory where player_id = $1 and item_id = 'head:rocco'", [id])).length);
  await until(async () => (await S(page)).coins === 85);
  assert.equal((await S(page)).coins, 85, "Kauf gebucht");

  // Geschummelt: lokal Münzen erhöht, mehr gekauft als bezahlbar -> Server lehnt ab, wird zurückgedreht
  // (Legendäres sperrt schon das Level: lokal gar nicht kaufbar)
  assert.equal(await page.evaluate(async () => { const p = await import("/js/app/profile.js"); p.S.coins = 99999; return p.buy("chars", "kaiser", 6000); }), false, "Level-Sperre");
  await page.evaluate(async () => { const p = await import("/js/app/profile.js"); p.buy("chars", "flummi", 2000); p.buy("chars", "nala", 1800); });
  // beide abgelehnt: warten, bis die Anzeige dem Server entspricht (zwei Ablehnungen kommen nacheinander an)
  const real = Number((await db("select coins from game.wallets where player_id = $1", [id]))[0].coins);
  await until(async () => { const x = await S(page); return x.coins === real && !(x.chars.includes("flummi") && x.chars.includes("nala")); });
  const s = await S(page);
  assert.equal(s.coins, real, "Münzen wieder wie auf dem Server");
  const owned = (await db("select item_id from game.inventory where player_id = $1", [id])).map(r => r.item_id.replace("head:", ""));
  assert.deepEqual([...s.chars].sort(), owned.filter(x => !x.includes(":")).sort(), "Besitz wie auf dem Server");
  assert.ok(real >= 0 && real <= 85, "Server hat nur bezahlbare Käufe gebucht");

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
  const id = (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null"))))?.user?.id;
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
  const id = (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null"))))?.user?.id;
  await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'daily'", [id])).length);
  // Tagesbonus auch im Client angekommen (sonst kreuzt seine Antwort den Abruf unten)
  const dbCoins = async () => Number((await db("select coins from game.wallets where player_id = $1", [id]))[0].coins);
  await until(async () => (await S(page)).coins === await dbCoins());
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

  // Echtgeld zum Start aus (PAYMENTS): kein Juwelen-Tab, keine Euro-Preise, die Juwelen-Anzeige führt zu den Köpfen
  await click(page, "#homeGems", 400);
  assert.equal(await page.locator('#shopTabs [data-tab="gems"]').isVisible(), false, "kein Juwelen-Tab");
  assert.equal(await page.locator('#shopTabs [data-tab="chars"].on').count(), 1, "Köpfe offen");
  assert.ok(await page.locator("#shopGrid .btn.pink").count() > 0, "Köpfe für Juwelen kaufbar");
  assert.doesNotMatch(await page.textContent("#scr-shop"), /€/, "keine Euro-Preise");
  assert.deepEqual(await page.evaluate(async () => (await (await import("/js/app/services.js")).server.shop())), [], "Server: keine Produkte");
  await click(page, "#scr-shop [data-back]");

  // Pass: drei Stufen erreicht, Gratis abholen, Premium mit Juwelen
  await click(page, "#navTasks", 300);
  assert.equal(await page.textContent("#passBadge"), "3");
  await click(page, "#btnPass", 400);
  await click(page, ".ptier:nth-child(1) .pt-cell.free .btn.yellow", 600);
  assert.equal((await db("select claimed_free from game.pass_progress where player_id = $1", [id]))[0].claimed_free, "1");
  assert.equal(await page.locator(".pt-premium .btn.green").count(), 0, "Premium nicht für Euro");
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
  const id = (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null"))))?.user?.id;
  await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'daily'", [id])).length);
  await page.waitForTimeout(700); if (await page.locator("#modal").isVisible()) await click(page, "#modalOk");
  const pending = () => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-pending") || "[]").length);
  // erst nach dem Anstoß-Countdown (auf einem langsamen Rechner dauert er länger als 3 s), sonst läuft die Zeit nicht
  const win = async () => { await page.waitForFunction(() => window.__kd.st && window.__kd.st.ph === "play", null, { timeout: 15000 }); await page.evaluate(() => { const K = window.__kd; K.t0 = Date.now() - 60000; const st = K.st; st.s = [2, 0]; st.stats[0].goals = 2; st.t = 0.2; st.rules.win = 0; }); };

  // Offline: Karriere Spiel 1 gewinnen, Meldung bleibt liegen, Sterne lokal sichtbar
  await ctx.setOffline(true);
  await click(page, "#modeCard"); await click(page, "#modeGrid [data-mode=career]"); await click(page, "#btnPlay", 400);
  await click(page, "#btnCareerGo", 400); await win();
  await until(async () => (await pending()) === 1, 8000);
  assert.equal(await pending(), 1, "Meldung wartet");
  await click(page, "#btnEndAgain", 500);
  assert.equal(await page.locator("#careerGrid .cstage:nth-child(1) .stars svg.on").count(), 3, "lokal 3 Sterne");
  // Kaufen ohne Verbindung: gesperrt, nichts abgebucht
  await page.evaluate(async () => { (await import("/js/app/profile.js")).S.coins = 5000; });   // genug Geld: gesperrt nur wegen der Verbindung
  const coins = (await S(page)).coins;
  const bought = await page.evaluate(async () => (await import("/js/app/profile.js")).buy("balls", "beach", 500));
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
  await click(page, "#btnCareerGo", 400); await win();
  assert.ok(await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'career_league'", [id])).length, 8000), "Liga-Bonus gebucht");
  assert.ok(await until(async () => /Kreisliga geschafft: \+200/.test(await page.textContent("#toasts")) || null, 4000), "Bonus angezeigt");
  assert.deepEqual(errors.filter(e => !/status of 400|Failed to load resource|ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(e)), []);
});

test("Kisten mit Server: Level-Up vergibt, Server würfelt, Inhalt kommt ins Profil", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const { page, errors } = await openPage(env, VIEW.desktop, { query: q });
  const id = (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null"))))?.user?.id;
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

// Konto ohne Passwort: Gast sichert mit dem Code aus der Mail, ein zweites Gerät meldet sich mit Code an (Test-Code 123456)
test("Schuhe mit Server: immer kaufbar (Münzen und Juwelen), gleich getragen; Wochenangebot ohne Schuhe", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const { page, errors } = await openPage(env, VIEW.desktop, { query: q });
  const id = (await until(() => page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null"))))?.user?.id;
  await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'daily'", [id])).length);
  await page.waitForTimeout(700); if (await page.locator("#modal").isVisible()) await click(page, "#modalOk");
  await db("select game.book($1, 'coins', 1000, 'test'), game.book($1, 'gems', 200, 'test')", [id]);
  await db("update game.players set level = 5 where id = $1", [id]);
  await page.evaluate(async () => { const a = await import("/js/app/account.js"); const s = await import("/js/app/services.js"); a.applyState(await s.server.state()); });
  assert.ok(!(await page.evaluate(async () => (await import("/js/app/account.js")).cosOfferNow())).some(x => x.startsWith("shoes:")), "Angebot vom Server ohne Schuhe");
  await page.evaluate(async () => { (await import("/js/ui/nav.js")).showScreen("shop", true); (await import("/js/ui/screens/shop.js")).setShopTab("shoes"); });
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#shopGrid .sitem.shoe").count(), 10);
  // während der Anfrage sind beide Kaufknöpfe der Karte gesperrt
  const locked = await page.evaluate(() => { const card = document.querySelector('#shopGrid [data-id="shoes:4"]'); card.querySelector(".btn.yellow").click(); return [...card.querySelectorAll(".buy2 button")].map(b => b.disabled); });
  assert.deepEqual(locked, [true, true], "beide Knöpfe gesperrt");
  await page.waitForTimeout(900);
  await click(page, '#shopGrid [data-id="shoes:7"] .buy2 .btn.pink', 900);
  const s = await S(page);
  assert.ok(s.cos.includes("shoes:4") && s.cos.includes("shoes:7"), "beide im Profil");
  assert.equal(s.equip.shoes, "shoes:7", "zuletzt gekaufter getragen");
  assert.equal((await db("select count(*)::int n from game.inventory where player_id = $1 and item_id in ('shoes:4', 'shoes:7')", [id]))[0].n, 2, "auf dem Server");
  assert.equal((await db("select gems::int g from game.wallets where player_id = $1", [id]))[0].g, s.gems, "Juwelen wie auf dem Server");
  assert.match(await page.textContent('#shopGrid [data-id="shoes:7"]'), /Getragen/);
  // Wochenangebot hat sich geändert (Client hat noch das alte): Server lehnt ab, Client holt das neue und zeichnet neu
  const off = (await db("select game.cos_offer() o"))[0].o;
  const old = (await db("select id from game.items where kind = 'emoji' and active and rarity = 'selten' and not (id = any(game.cos_offer())) limit 1"))[0].id;
  await page.evaluate(async x => { (await import("/js/app/account.js")).applyState({ offer: [x] }); (await import("/js/ui/screens/shop.js")).setShopTab("cos"); }, old);
  await page.waitForTimeout(200);
  await click(page, `#shopGrid [data-id="${old}"] .buy2 .btn.yellow`, 1200);
  assert.match(await page.textContent("#toasts"), /Wochenangebot hat sich gerade geändert/);
  assert.deepEqual(await page.evaluate(async () => (await import("/js/app/account.js")).cosOfferNow()), off, "neues Angebot vom Server");
  assert.equal(await page.locator(`#shopGrid [data-id="${old}"]`).count(), 0, "Shop neu gezeichnet");
  assert.deepEqual(errors.filter(e => !/status of 400/.test(e)), []);
});

test("Konto: sichern und auf anderem Gerät anmelden, beides mit Code", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const a = await openPage(env, VIEW.desktop, { query: q });
  const A = a.page;
  const sess = await until(() => A.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null")));
  const id = sess.user.id;
  // Start-Dialoge (Tagesbonus) direkt schließen: unter Volllast meldete Playwright den Knopf zeitweise als verdeckt,
  // um den Dialog geht es hier nicht
  const settle = async p => { await p.waitForTimeout(600); for (let k = 0; k < 3 && await p.locator("#modalOk").isVisible(); k++) { await p.evaluate(() => document.getElementById("modalOk").click()); await p.waitForTimeout(300); } };
  await settle(A);
  await click(A, "#btnProfile", 400);
  await A.fill("#accMail", "spieler@example.org"); await click(A, "#accLink", 600);
  assert.ok(await A.locator("#accCode").isVisible(), "Code-Feld nach dem Schicken");
  assert.equal(await A.locator("#accAppHint").count(), 0, "App-Hinweis nur in der installierten App");
  await A.fill("#accCode", "000000"); await click(A, "#accConfirm", 500);
  assert.match(await A.textContent("#accMsg"), /abgelaufen|expired/, "falscher Code abgelehnt");
  assert.equal((await db("select is_anonymous from auth.users where id = $1", [id]))[0].is_anonymous, true, "noch Gast");
  await A.fill("#accCode", "123456"); await click(A, "#accConfirm", 800);
  assert.deepEqual((await db("select email, is_anonymous from auth.users where id = $1", [id]))[0], { email: "spieler@example.org", is_anonymous: false }, "Konto gesichert, gleiche ID");
  assert.match(await A.textContent("#accBody"), /spieler@example\.org/);

  // Zweites Gerät: unbekannte Adresse wird abgelehnt, dann mit Code anmelden
  const b = await openPage(env, VIEW.desktop, { query: q });
  const B = b.page;
  await until(() => B.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null")));
  await settle(B);
  await click(B, "#btnProfile", 400); await click(B, "#accToLogin", 300);
  await B.fill("#accMail", "niemand@example.org"); await click(B, "#accSend", 500);
  assert.match(await B.textContent("#accMsg"), /kein Konto|no account/);
  await B.fill("#accMail", "Spieler@example.org"); await click(B, "#accSend", 500);
  await B.fill("#accCode", "123456");
  await Promise.all([B.waitForNavigation({ timeout: 8000 }), B.click("#accLogin")]);
  const s2 = await until(() => B.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null")));
  assert.equal(s2.user.id, id, "zweites Gerät hat dasselbe Konto");
  // Link aus der Mail danach noch angeklickt (Code war schneller, Merker weg): gleiches Konto, nichts zu tun, kein Dialog
  const jwt = "x." + Buffer.from(JSON.stringify({ sub: id })).toString("base64url") + ".y";
  await A.goto(env.url + "/index.html" + q + "#access_token=" + jwt + "&refresh_token=r&expires_in=3600&type=email_change");
  await A.reload();   // goto allein springt nur innerhalb der Seite (gleiche Adresse bis auf #), kein Neustart
  await A.waitForSelector("#loading.done", { state: "attached", timeout: 8000 });
  assert.ok(await until(async () => /schon mit diesem Konto/.test(await A.textContent("#toasts")) || null, 4000), "Hinweis: schon angemeldet");
  assert.equal(await A.locator("#modalCard.foreignlink").count(), 0, "kein Dialog");
  assert.deepEqual([...a.errors, ...b.errors].filter(e => !/40[03]|422|otp/.test(e)), []);
});

// Link aus der Mail in einem Browser ohne angeforderte Mail (z. B. angefordert in der installierten App, geöffnet in
// Safari): abgelehnt, Dialog bleibt stehen (Tagesbonus wartet dahinter), Sitzung bleibt. In der App: Hinweis beim Code.
test("Konto: fremder Link aus der Mail, Hinweis in der installierten App", { skip: !hasPg && "kein Postgres" }, async () => {
  const q = `?backend=${be.url.replace("127.0.0.1", "localhost")}&key=dev`;
  const settle = async p => { await p.waitForTimeout(600); for (let k = 0; k < 3 && await p.locator("#modalOk").isVisible(); k++) { await p.evaluate(() => document.getElementById("modalOk").click()); await p.waitForTimeout(300); } };
  const a = await openPage(env, VIEW.desktop, { query: q + "#access_token=fremd&refresh_token=fremd&expires_in=3600&type=magiclink" });
  const A = a.page;
  await A.locator("#modalCard.foreignlink").waitFor({ state: "visible", timeout: 6000 });
  assert.match(await A.textContent("#modalCard"), /anderen Browser.*verbraucht.*App.*neue Mail.*nur den Code.*Link nicht an/s);
  const sess = await until(() => A.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null")));
  assert.notEqual(sess.access_token, "fremd", "Sitzung nicht aus dem Link");
  assert.equal(await A.evaluate(() => location.hash), "", "Adresse aufgeräumt");
  // Tagesbonus kommt vom Server, überschreibt den Hinweis aber nicht: wartet dahinter
  await until(async () => (await db("select 1 from game.ledger where player_id = $1 and reason = 'daily'", [sess.user.id])).length);
  await A.waitForTimeout(1200);
  assert.equal(await A.locator("#modalCard.foreignlink").count(), 1, "Hinweis bleibt stehen");
  await A.click("#modalOk");
  assert.ok(await until(() => A.evaluate(() => !document.getElementById("modal").hidden && !!document.querySelector("#modalCard .streak")), 3000), "danach der Tagesbonus");
  // sticky-Dialog über einem sichtbaren normalen: der normale kommt danach wieder
  await A.evaluate(async () => (await import("/js/ui/modals.js")).foreignLinkModal());
  assert.equal(await A.locator("#modalCard.foreignlink").count(), 1);
  await A.click("#modalOk");
  assert.ok(await until(() => A.evaluate(() => !document.getElementById("modal").hidden && !!document.querySelector("#modalCard .streak")), 2000), "Tagesbonus wieder da");
  await A.click("#modalOk");
  // abgelaufener oder schon benutzter Link (GoTrue: error_code=otp_expired): übersetzt, als Dialog; unbekannter Fehler
  // (auch ein Code wie „constructor“, der kein eigener Schlüssel ist) mit dem Text von Supabase
  await A.goto(env.url + "/index.html" + q + "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
  await A.reload();
  await A.locator("#modalCard.linkerror").waitFor({ state: "visible", timeout: 6000 });
  assert.match(await A.textContent("#modalCard"), /abgelaufen oder wurde schon benutzt/, "Link abgelaufen, übersetzt");
  assert.doesNotMatch(await A.textContent("#modalCard"), /invalid/);
  await A.goto(env.url + "/index.html" + q + "#error=server_error&error_code=constructor&error_description=Database+error+<b>x</b>");
  await A.reload();
  await A.locator("#modalCard.linkerror").waitFor({ state: "visible", timeout: 6000 });
  assert.match(await A.textContent("#modalCard"), /nicht geklappt: Database error <b>x<\/b>/, "Rohtext, als Text eingesetzt");

  // Installierte App (display-mode standalone): beim Code steht, dass der Link woanders aufgeht und der Code hierher gehört
  const b = await openPage(env, VIEW.desktop, { query: q, init: [() => { Object.defineProperty(Navigator.prototype, "standalone", { get: () => true }); }] });
  const B = b.page;
  await until(() => B.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev") || "null")));
  await settle(B);
  await click(B, "#btnProfile", 400);
  assert.match(await B.textContent("#accAppHint"), /Link.*nicht an.*nur den Code hier in der App/, "schon beim Anfordern");
  await B.fill("#accMail", "app@example.org"); await click(B, "#accLink", 600);
  assert.ok(await B.locator("#accCode").isVisible(), "Code-Feld direkt da");
  assert.match(await B.textContent("#accAppHint"), /Link.*nicht an.*nur den Code hier in der App/);
  // Link doch in einem anderen Browser geöffnet, Adresse dort schon bestätigt: Konto beim nächsten Öffnen hier gesichert
  const bid = (await B.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-session-dev")))).user.id;
  await db("update auth.users set email = 'app@example.org', is_anonymous = false where id = $1", [bid]);
  await click(B, "#scr-profile [data-back]", 300); await click(B, "#btnProfile", 400);
  assert.ok(await until(async () => (await B.locator("#accOut").count()) === 1 || null, 5000), "als gesichert angezeigt");
  assert.match(await B.textContent("#accBody"), /app@example\.org/);
  assert.ok(await until(async () => (await S(B)).guest === false || null, 5000), "Stand vom Server: kein Gast mehr (Ranked frei)");
  assert.equal(await B.evaluate(() => localStorage.getItem("kopfball-duell-mail")), null, "Mail-Merker weg");
  assert.deepEqual([...a.errors, ...b.errors].filter(e => !/40[03]|422/.test(e)), []);
});
