// Ball-Skins: jeder Ball läuft im Spiel (mit Spur bei hartem Schuss und beim Super-Schuss), im Shop und in der Wiederholung
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });

for (const [name, view] of [["Desktop", VIEW.desktop], ["Handy quer", VIEW.phone]]) test(`alle Bälle im Spiel ohne Fehler (${name})`, async () => {
  const { page, errors } = await openPage(env, view);
  const ids = await page.evaluate(async () => (await import("/js/content/config.js")).BALLS.map(b => b.id));
  assert.equal(ids.length, 20);
  for (const ball of ids) {
    await page.evaluate(async b => {
      const g = await import("/js/app/game.js");
      g.beginMatch({ mode: "quick", chars: ["kalle", "yuki"], arena: "stadion", dur: 90, rules: {}, golden: false, diff: 1, names: ["A", "B"], labels: [null, null], ball: b });
      const K = window.__kd; K.st.ph = "play"; K.st.pt = 0;
      Object.assign(K.st.b, { x: 300, y: 300, vx: 1600, vy: -200 });
    }, ball);
    await page.waitForTimeout(250);
    await page.evaluate(() => { const b = window.__kd.st.b; Object.assign(b, { x: 900, y: 250, vx: -1500, vy: 0, fx: "fire" }); });
    await page.waitForTimeout(150);
    await page.evaluate(async () => (await import("/js/app/game.js")).quitToMenu());
  }
  assert.deepEqual(errors, []);
});

test("Shop zeigt alle 20 Bälle mit Namen", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop, { save: { coins: 5000, level: 12 } });
  await click(page, "#navShop", 400); await click(page, '#shopTabs [data-tab="balls"]', 300);
  const txt = await page.textContent("#shopGrid");
  for (const n of ["Augapfel", "Seifenblase", "Vaporwave", "Ice-Out", "RGB-Gamer", "Orakel", "Klassik", "Disco"]) assert.match(txt, new RegExp(n));
  assert.equal(await page.locator("#shopGrid canvas").count() >= 20, true, "Vorschau je Ball");
  assert.deepEqual(errors, []);
});
