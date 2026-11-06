// Ausrüstung (ohne Server): tragen, herstellen, Emote-Plätze, im Spiel sichtbar, Emote-Pause, Stummschalten, Torexplosion
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });
const S = page => page.evaluate(async () => JSON.parse(JSON.stringify((await import("/js/app/profile.js")).S)));

for (const [name, view] of [["Desktop", VIEW.desktop], ["Handy quer", VIEW.phone]]) test(`Ausrüstung (${name})`, async () => {
  const { page, errors } = await openPage(env, view, { save: { shards: 60, cos: ["hat:1", "hat:3", "shoes:2", "goalfx:7", "emoji:3"] } });
  await click(page, "#navChests", 300); await click(page, "#btnLocker", 400);
  assert.equal(await page.locator("#lockerGrid .lcard").count(), 12, "12 Hüte");
  await click(page, '#lockerGrid [data-id="hat:3"]');
  assert.equal((await S(page)).equip.hat, "hat:3");
  // Herstellen: Hut 2 (selten, 50 Splitter)
  await click(page, '#lockerGrid [data-id="hat:2"]', 400);
  let s = await S(page);
  assert.ok(s.cos.includes("hat:2")); assert.equal(s.shards, 10); assert.equal(s.equip.hat, "hat:2", "gleich getragen");
  // zu wenig Splitter
  await click(page, '#lockerGrid [data-id="hat:10"]', 300);
  assert.match(await page.textContent("#toasts"), /Splitter/);
  // Schuhe, Torexplosion, Emote in Platz 2
  await click(page, '#lockerTabs [data-tab="shoes"]'); await click(page, '#lockerGrid [data-id="shoes:2"]');
  await click(page, '#lockerTabs [data-tab="goalfx"]'); await click(page, '#lockerGrid [data-id="goalfx:7"]');
  await click(page, '#lockerTabs [data-tab="emotes"]'); await click(page, "#lockerSlots .eslot:nth-child(2)"); await click(page, '#lockerGrid [data-id="emoji:3"]');
  s = await S(page);
  assert.deepEqual([s.equip.shoes, s.equip.goalfx, s.equip.emotes[1]], ["shoes:2", "goalfx:7", "emoji:3"]);

  // Im Spiel: Kosmetik dabei, Emote-Leiste mit 4 Plätzen + Stumm, höchstens ein Emote in 3 s
  await page.evaluate(async () => { (await import("/js/app/modes.js")).startMode("quick"); });
  if (await page.locator("#btnKickoff").isVisible()) await click(page, "#btnKickoff", 3400);
  assert.deepEqual(await page.evaluate(() => window.__kd.cfg.cos[0].hat), "hat:2");
  assert.equal(await page.locator("#emoteBar button").count(), 5);
  await page.evaluate(async () => { const g = await import("/js/app/game.js"); g.sendEmote("emoji:3"); g.sendEmote("GG"); });
  assert.equal(await page.evaluate(() => window.__kd.st.p[0].emo), "emoji:3");
  await click(page, "#btnEmote"); await click(page, "#emoteBar .mute");
  assert.equal((await S(page)).muteOpp, true);
  // Torexplosion zeichnen (alle Platzhalter-Varianten)
  await page.evaluate(async () => { const r = await import("/js/ui/render/render.js"); for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) r.fx.burst("goal", 600, 300, { fx: "goalfx:" + n }); });
  await page.waitForTimeout(400);
  assert.deepEqual(errors, []);
});

test("Meisterschaft und Kosmetik-Shop (ohne Server)", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop, { save: { coins: 3000, level: 12, heads: { kalle: { level: 1, xp: 0, games: 4, wins: 9, goals: 0, supers: 0, mastery: 0 } } } });
  // Köpfe: Meisterschaft sichtbar, Stufe 1 fehlt ein Spiel
  await click(page, "#navHeads", 400);
  assert.match(await page.textContent("#ciMastery"), /Spiele mit Kalle: 4\/5/);
  await click(page, "#scr-select [data-back]");
  // Ein Sieg mit Kalle: Stufe 1 (5 Spiele) und 2 (10 Siege) auf einmal
  await page.evaluate(async () => { (await import("/js/app/modes.js")).startMode("quick"); });
  if (await page.locator("#btnKickoff").isVisible()) await click(page, "#btnKickoff", 3400);
  await page.evaluate(() => { const K = window.__kd; K.st.s = [2, 0]; K.st.stats[0].goals = 2; K.st.t = 0.2; });
  await page.waitForTimeout(4200);
  const s = await S(page);
  assert.equal(s.heads.kalle.mastery, 2);
  assert.ok(s.cos.includes("title:fan-kalle") && s.cos.includes("frame:m-kalle"));
  // Titel tragen
  await page.evaluate(async () => { (await import("/js/ui/nav.js")).showScreen("locker"); });
  await page.waitForTimeout(300);
  await click(page, '#lockerTabs [data-tab="title"]'); await click(page, '#lockerGrid [data-id="title:fan-kalle"]');
  assert.match(await page.textContent("#lockerTitle"), /Kalle-Fan/);
  // Shop: Kosmetik-Wochenangebot, kaufen mit Münzen
  await page.evaluate(async () => { (await import("/js/ui/nav.js")).showScreen("shop"); (await import("/js/ui/screens/shop.js")).setShopTab("cos"); });
  await page.waitForTimeout(300);
  assert.equal(await page.locator("#shopGrid .sitem").count(), 6);
  const first = await page.getAttribute("#shopGrid .sitem .buy2 .btn.yellow >> xpath=../..", "data-id");
  await click(page, "#shopGrid .sitem .buy2 .btn.yellow", 400);
  assert.ok((await S(page)).cos.includes(first), "gekauft: " + first);
  assert.deepEqual(errors, []);
});

test("Shop: Seltenes erst ab Level (Episch 5, Legendär 10)", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop, { save: { coins: 5000, level: 4 } });
  await click(page, "#navShop", 400);
  const txt = await page.textContent("#shopGrid");
  assert.match(txt, /ab Level 5/); assert.match(txt, /ab Level 10/);
  assert.equal(await page.evaluate(async () => (await import("/js/app/profile.js")).buy("chars", "phantom", 700)), false);
  assert.equal(await page.evaluate(async () => (await import("/js/app/profile.js")).buy("chars", "rocco", 400)), true);
  assert.deepEqual(errors, []);
});
