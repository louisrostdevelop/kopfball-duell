// Kisten im Browser (ohne Server): Level-Up bringt eine Kiste, Öffnen zeigt den Inhalt, Garantien, Chancen
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });
const revealed = page => page.locator("#coDone").waitFor({ state: "visible", timeout: 6000 });
const S = page => page.evaluate(async () => JSON.parse(JSON.stringify((await import("/js/app/profile.js")).S)));

for (const [name, view] of [["Desktop", VIEW.desktop], ["Handy quer", VIEW.phone]]) test(`Kisten (${name})`, async () => {
  // knapp vor Level 2: ein Spiel reicht für den Aufstieg
  const { page, errors } = await openPage(env, view, { save: { xp: 110 } });
  await click(page, "#modeCard"); await click(page, "#modeGrid [data-mode=quick]"); await click(page, "#btnPlay", 300);
  if (await page.locator("#btnKickoff").isVisible()) await click(page, "#btnKickoff", 3400);
  await page.evaluate(() => { const K = window.__kd; K.st.s = [2, 0]; K.st.stats[0].goals = 2; K.st.t = 0.2; });
  await page.waitForTimeout(5200);
  assert.match(await page.textContent("#modalCard"), /Level 2/);
  assert.match(await page.textContent("#modalCard"), /Bronze-Kiste erhalten/);
  assert.equal((await S(page)).chests.length, 1);

  // Level-2-Kiste direkt aus dem Dialog öffnen (über dem Endbildschirm): sicher ein neuer seltener Kopf
  const coins0 = (await S(page)).coins;
  await click(page, "#modalOk", 100); await revealed(page);
  assert.equal(await page.evaluate(() => window.__kd.screen), "end", "Endbildschirm bleibt");
  assert.ok(await page.locator("#chestOpen").isVisible());
  const cards = await page.locator("#coCards .cocard").count();
  assert.ok(cards >= 2, "Münzen + Kopf");
  const s = await S(page);
  assert.equal(s.chests.length, 0); assert.ok(s.coins > coins0); assert.equal(s.chars.length, 4, "neuer Kopf");
  await click(page, "#coDone", 300);
  await click(page, "#btnEndMenu", 500); await click(page, "#navChests", 400);
  assert.equal(await page.locator(".chesttile.empty").count(), 4);

  // Mehrere Kisten nacheinander, Garantie Episch bei der 10.
  await page.evaluate(async () => { const p = await import("/js/app/profile.js"); p.S.pity = { epic: 9 }; for (let i = 0; i < 3; i++) p.grantChest("silver", "test", "t" + i); });
  await click(page, "#scr-chests [data-back]"); await click(page, "#navChests", 400);
  assert.match(await page.textContent('.chesttile[data-tier="silver"]'), /×3/);
  await click(page, '.chesttile[data-tier="silver"]', 100); await revealed(page);
  assert.match(await page.textContent("#coCards"), /Episch|Legendär/, "10. Kiste mindestens Episch");
  await click(page, "#coNext", 300); await revealed(page); await click(page, "#coNext", 300); await revealed(page);
  assert.ok(await page.locator("#coNext").isHidden());
  await click(page, "#coDone", 300);
  // Chancen-Tabelle
  await click(page, "#btnChestOdds", 300);
  assert.match(await page.textContent("#modalCard"), /Legendäre Kiste/);
  await click(page, "#modalOk");
  // Badge auf dem Startbildschirm
  await page.evaluate(async () => { (await import("/js/app/profile.js")).grantChest("gold", "test", "g1"); });
  await click(page, "#scr-chests [data-back]", 300);
  assert.equal(await page.textContent("#chestBadge"), "1");
  assert.deepEqual(errors, []);
});
