// Arenen: Freischalten im Shop (Level, neue Arenen ohne Server sofort kaufbar), jede Arena mit jedem Layout spielbar
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

test("Shop: alte Arenen ab Level frei, neue für Münzen", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop, { save: { coins: 3000, level: 6 } });
  await click(page, "#navShop", 400); await click(page, '#shopTabs [data-tab="arenas"]', 300);
  const txt = await page.textContent("#shopGrid");
  assert.match(txt, /ab Level 10/, "Eishalle gesperrt");
  assert.match(txt, /ab Level 15/, "Mond gesperrt");
  assert.match(txt, /2500/, "neue Arena mit Preis");
  const owns = id => page.evaluate(async a => (await import("/js/app/profile.js")).owns("arenas", a), id);
  assert.equal(await owns("neon"), true, "Neon ab Level 5 frei");
  assert.equal(await owns("eis"), false);
  assert.equal(await page.evaluate(async () => (await import("/js/app/profile.js")).buy("arenas", "eis", 0)), false, "Level-Arena nicht kaufbar");
  assert.equal(await page.evaluate(async () => (await import("/js/app/profile.js")).buy("arenas", "vulkan", 2500)), true, "Vulkan gekauft");
  assert.deepEqual(errors, []);
});

for (const [name, view] of [["Desktop", VIEW.desktop], ["Handy quer", VIEW.phone]]) test(`alle Arenen mit allen Layouts laufen (${name})`, async () => {
  const { page, errors } = await openPage(env, view);
  const combos = await page.evaluate(async () => { const C = await import("/js/content/config.js"), L = await import("/js/content/layouts.js"); return C.ARENAS.flatMap(a => ["off", 0, 1, 2].filter(i => i === "off" || L.layoutsFor(a.id)[i]).map(i => [a.id, i])); });
  assert.equal(combos.length, 9 * 4);
  for (const [arena, obs] of combos) {
    await page.evaluate(async ([a, o]) => {
      const g = await import("/js/app/game.js");
      g.beginMatch({ mode: "quick", chars: ["kalle", "yuki"], arena: a, dur: 90, rules: { obs: o }, golden: false, diff: 1, names: ["A", "B"], labels: [null, null], ball: "klassik" });
      const K = window.__kd; K.st.ph = "play"; K.st.pt = 0; K.st.el = 2.9;   // gleich los, Geysire kurz vor dem Ausbruch
    }, [arena, obs]);
    await page.waitForTimeout(350);
    await page.evaluate(async () => (await import("/js/app/game.js")).quitToMenu());
  }
  assert.deepEqual(errors, []);
});

test("Arenen-Auswahl vor dem Spiel: Level- und Saison-Arenen ohne Preis", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop, { save: { coins: 3000, level: 6 } });
  const lock = await page.evaluate(async () => {
    const { ARENAS } = await import("/js/content/config.js");
    (await import("/js/ui/screens/setup.js")).renderArenas();
    const tiles = [...document.querySelectorAll("#arenaList .atile")];
    return Object.fromEntries(ARENAS.map((a, i) => [a.id, (tiles[i].querySelector(".lock") || { textContent: "" }).textContent.trim()]));
  });
  assert.equal(lock.neon, "", "Neon ab Level 5 frei");
  assert.match(lock.eis, /10/);
  assert.match(lock.mond, /15/);
  assert.equal(lock.vulkan, "2500", "ohne Server: neue Arena gleich kaufbar");
  assert.ok(!Object.values(lock).includes("0"), "nirgends Preis 0: " + JSON.stringify(lock));
  assert.deepEqual(errors, []);
});
