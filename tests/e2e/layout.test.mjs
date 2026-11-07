// Handy quer: alle Hauptmenüs passen ohne Scrollen auf den Bildschirm (wenige Pixel Toleranz)
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

const TOL = 6;
const SCREENS = [
  ["Start", null],
  ["Modi", () => document.querySelector("#modeCard").click()],
  ["Setup", () => { document.querySelector("#scr-modes [data-back]").click(); document.querySelector("#btnPlay").click(); }],
  ["Regeln", () => document.querySelector("#btnRules").click()],
  ["Regeln mehr", () => document.querySelector("#btnRulesMore").click()],
  ["Köpfe", () => { document.querySelector("#scr-rules [data-back]").click(); document.querySelector("#scr-setup [data-back]").click(); document.querySelector("#navHeads").click(); }],
  ["Shop", () => { document.querySelector("#scr-select [data-back]").click(); document.querySelector("#navShop").click(); }],
  ["Aufgaben", () => { document.querySelector("#scr-shop [data-back]").click(); document.querySelector("#navTasks").click(); }],
  ["Einstellungen", () => { document.querySelector("#scr-tasks [data-back]").click(); document.querySelector("#btnSettings").click(); }],
  ["Einstellungen Steuerung", () => document.querySelector('#setTabs [data-tab="controls"]').click()],
  ["Einstellungen Info", () => document.querySelector('#setTabs [data-tab="info"]').click()],
  ["Profil", () => { document.querySelector("#scr-settings [data-back]").click(); document.querySelector("#btnProfile").click(); }],
];

for (const [w, h] of [[640, 360], [667, 375], [780, 360], [844, 390]]) {
  test(`Handy quer ${w}x${h}: kein Scrollen`, async t => {
    const { page, errors } = await openPage(env, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true }, { save: { coins: 640 } });
    for (const [name, go] of SCREENS) {
      if (go) { await page.evaluate(go); await page.waitForTimeout(250); }
      const m = await page.evaluate(() => { const s = [...document.querySelectorAll(".screen")].find(x => !x.hidden); return { sh: s.scrollHeight, ch: s.clientHeight, sw: s.scrollWidth, cw: s.clientWidth }; });
      await t.test(name, () => {
        assert.ok(m.sh - m.ch <= TOL, `${m.sh - m.ch}px zu hoch`);
        assert.ok(m.sw - m.cw <= TOL, `${m.sw - m.cw}px zu breit`);
      });
    }
    assert.deepEqual(errors, []);
  });
}

// Online (Freunde) und Lobby: quer ohne Scrollen, hochkant nicht zu breit (Wischreihen dürfen die Spalte nicht aufblähen)
const MOCK = { path: new URL("./mockpeer.js", import.meta.url).pathname };
for (const [w, h, quer] of [[667, 375, true], [844, 390, true], [375, 667, false], [390, 844, false]]) {
  test(`Online und Lobby ${w}x${h}: passt`, async t => {
    const { page, errors } = await openPage(env, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true }, { init: [MOCK] });
    const size = () => page.evaluate(() => { const s = [...document.querySelectorAll(".screen")].find(x => !x.hidden); return { id: s.id, sh: s.scrollHeight, ch: s.clientHeight, sw: s.scrollWidth, cw: s.clientWidth }; });
    await page.evaluate(async () => (await import("/js/ui/screens/online.js")).openOnline()); await page.waitForTimeout(300);
    const on = await size();
    await page.click("#btnHost"); await page.waitForTimeout(700);
    const lob = await size();
    for (const [name, m] of [["Online", on], ["Lobby", lob]]) await t.test(name, () => {
      assert.ok(m.sw - m.cw <= TOL, `${name} (${m.id}): ${m.sw - m.cw}px zu breit`);
      if (quer) assert.ok(m.sh - m.ch <= TOL, `${name} (${m.id}): ${m.sh - m.ch}px zu hoch`);
    });
    assert.equal(lob.id, "scr-lobby");
    assert.deepEqual(errors.filter(e => !e.includes("TUNNEL")), []);
  });
}
