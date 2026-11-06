// Karriere im Browser: Liga-Übersicht, Spiel gewinnen, Sterne, nächstes Spiel frei, nächste Liga erst nach allen fünf
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });

const finish = async (page, s) => { await page.evaluate(sc => { const st = window.__kd.st; st.s = sc; st.t = 0.2; st.rules.win = 0; }, s); await page.waitForTimeout(3300); };

for (const [name, view] of [["Desktop", VIEW.desktop], ["Handy quer", VIEW.phone]]) test(`Karriere (${name})`, async () => {
  const { page, errors } = await openPage(env, view);
  await click(page, "#modeCard"); await click(page, "#modeGrid [data-mode=career]"); await click(page, "#btnPlay", 400);
  assert.equal(await page.evaluate(() => window.__kd.screen), "career");
  assert.equal(await page.locator("#careerGrid .cstage").count(), 5);
  assert.equal(await page.locator("#careerGrid .cstage:not(.locked)").count(), 1, "nur das erste Spiel offen");
  assert.equal(await page.locator("#careerTabs button svg").count(), 3, "drei Ligen gesperrt");
  assert.match(await page.textContent("#btnCareerGo"), /Nächstes Spiel: Yuki/);
  // passt auf den Bildschirm
  const box = await page.locator("#btnCareerGo").boundingBox(), vh = view.viewport.height;
  assert.ok(box && box.y + box.height <= vh, `Anpfiff sichtbar (${box && box.y + box.height} > ${vh})`);

  // Spiel 1 knapp gewinnen: 1 Stern, Spiel 2 offen
  await click(page, "#btnCareerGo", 3400);
  assert.equal(await page.evaluate(() => window.__kd.mode), "career");
  await finish(page, [2, 1]);
  assert.match(await page.textContent("#endTitle"), /Sieg/);
  await click(page, "#btnEndAgain", 500);
  assert.equal(await page.evaluate(() => window.__kd.screen), "career");
  assert.equal(await page.locator("#careerGrid .cstage:nth-child(1) .stars svg.on").count(), 1);
  assert.equal(await page.locator("#careerGrid .cstage:not(.locked)").count(), 2);
  assert.match(await page.textContent("#careerStars"), /^1\/60$/);

  // Spiel 1 nochmal, zu null: 3 Sterne. Verlieren nimmt nichts weg
  await click(page, "#careerGrid .cstage:nth-child(1)"); await click(page, "#btnCareerGo", 3400);
  await finish(page, [3, 0]); await click(page, "#btnEndAgain", 500);
  await click(page, "#careerGrid .cstage:nth-child(1)"); await click(page, "#btnCareerGo", 3400);
  await finish(page, [0, 2]); await click(page, "#btnEndAgain", 500);
  assert.equal(await page.locator("#careerGrid .cstage:nth-child(1) .stars svg.on").count(), 3);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("kopfball-duell-save-v2")).career), { "district.0": 3 });

  // Aufgeben im Spiel führt zurück in die Karriere
  await click(page, "#btnCareerGo", 3400); await page.keyboard.press("Escape"); await click(page, "#btnQuit", 500);
  assert.equal(await page.evaluate(() => window.__kd.screen), "career");

  // Liga durch: nächste Liga offen
  await page.evaluate(() => { window.__kd.career = null; });
  await page.evaluate(async () => { const p = await import("/js/app/profile.js"); for (let i = 1; i < 5; i++) p.S.career["district." + i] = 1; });
  await click(page, "#careerTabs button:nth-child(2)");
  assert.equal(await page.locator("#careerTabs button svg").count(), 2);
  assert.equal(await page.locator("#careerGrid .cstage:not(.locked)").count(), 1);
  await click(page, "#scr-career [data-back]");
  assert.equal(await page.evaluate(() => window.__kd.screen), "home");
  assert.deepEqual(errors, []);
});
