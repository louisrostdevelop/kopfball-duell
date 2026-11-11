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

// Shop quer: auf jedem Reiter steht die Karte ganz im Bild, mit Knopf (das Angebot daneben darf sie nicht nach unten drücken)
for (const [w, h] of [[568, 320], [640, 360], [780, 360], [844, 390]]) {
  test(`Shop quer ${w}x${h}: Karten mit Knopf ganz sichtbar, Name im Angebot nicht gekürzt`, async t => {
    const { page, errors } = await openPage(env, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true }, { save: { coins: 640 } });
    await page.evaluate(() => document.querySelector("#navShop").click()); await page.waitForTimeout(250);
    for (const tab of ["chars", "balls", "arenas", "shoes", "cos"]) {
      await page.evaluate(x => document.querySelector(`#shopTabs [data-tab="${x}"]`).click(), tab); await page.waitForTimeout(200);
      const m = await page.evaluate(() => { const it = document.querySelector("#shopGrid .sitem:not(.sinfo)"), b = it.querySelector(".btn"), r = it.getBoundingClientRect(); return { card: Math.round(r.bottom), btn: Math.round(b.getBoundingClientRect().bottom), cut: it.scrollHeight - it.clientHeight, vh: innerHeight }; });
      await t.test(tab, () => {
        assert.ok(m.cut <= 2, `Karte abgeschnitten: ${m.cut}px`);
        assert.ok(m.btn <= m.card && m.card <= m.vh, `Knopf ${m.btn}, Karte ${m.card}, Bild ${m.vh}`);
      });
    }
    const name = await page.evaluate(() => { const b = document.querySelector(".dealcard .dtxt b"); return b ? { sw: b.scrollWidth, cw: b.clientWidth } : null; });
    if (name) assert.ok(name.sw <= name.cw + 1, `Name im Angebot gekürzt: ${name.sw} > ${name.cw}`);
    assert.deepEqual(errors, []);
  });
}

// Shop hochkant: alle Reiter ganz im Bild (notfalls zweizeilig)
for (const [w, h] of [[360, 780], [390, 844]]) {
  test(`Shop hochkant ${w}x${h}: alle Reiter sichtbar`, async () => {
    const { page, errors } = await openPage(env, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true }, { save: { coins: 640 } });
    await page.evaluate(() => document.querySelector("#navShop").click()); await page.waitForTimeout(250);
    const tabs = await page.evaluate(() => [...document.querySelectorAll("#shopTabs button")].filter(b => !b.hidden).map(b => { const r = b.getBoundingClientRect(); return { tab: b.dataset.tab, l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) }; }));
    assert.equal(tabs.length, 5);
    for (const x of tabs) assert.ok(x.l >= 0 && x.r <= w && x.w >= 40, `Reiter ${x.tab}: ${x.l}–${x.r} von ${w}`);
    const sw = await page.evaluate(() => { const s = document.getElementById("shopTabs"); return s.scrollWidth - s.clientWidth; });
    assert.ok(sw <= 1, `Reiter scrollen: ${sw}px`);
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
