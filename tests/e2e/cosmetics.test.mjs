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
