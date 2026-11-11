// Modus-Wahl mit Kacheln: Reiter, Auswahl, alles ohne Scrollen sichtbar, Szenen gemalt, Shop oben in der Kopfzeile
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, closeAll, click, VIEW } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

const SIZES = {
  "Handy hochkant": VIEW.portrait,
  "kleines Handy hochkant": { ...VIEW.portrait, viewport: { width: 360, height: 640 } },
  "Handy quer": VIEW.phone,
  "iPad hochkant": { viewport: { width: 820, height: 1180 }, hasTouch: true },
  "iPad quer": { viewport: { width: 1180, height: 820 }, hasTouch: true },
  Desktop: VIEW.desktop,
};

// sichtbare Kacheln ganz im Bild? Szene gemalt (nicht leer)?
const check = page => page.evaluate(() => {
  const scr = document.getElementById("scr-modes"), vw = innerWidth, vh = innerHeight;
  const tiles = [...document.querySelectorAll("#modeGrid .mcard")].filter(e => e.offsetParent);
  const out = tiles.filter(e => { const r = e.getBoundingClientRect(); return r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1; }).map(e => e.dataset.mode);
  const blank = tiles.filter(e => { const c = e.querySelector("canvas"); if (!c.width) return true; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4 * 7) if (d[i]) return false; return true; }).map(e => e.dataset.mode);
  return { lay: scr.dataset.lay, n: tiles.length, out, blank, scroll: scr.scrollHeight > scr.clientHeight + 1, wide: document.documentElement.scrollWidth > vw };
});

for (const [name, view] of Object.entries(SIZES)) {
  test(`Modus-Wahl ${name}: alle Kacheln ohne Scrollen, Szenen gemalt`, async () => {
    const { page, errors } = await openPage(env, view);
    await click(page, "#modeCard", 500);
    const a = await check(page);
    assert.deepEqual([a.out, a.blank, a.scroll, a.wide], [[], [], false, false], JSON.stringify(a));
    if (a.lay === "both") assert.equal(a.n, 8, "beide Seiten nebeneinander (ohne Server: Mit Freunden + 7 offline)");
    else {
      await click(page, "#modeTabs [data-tab=on]", 400);
      const b = await check(page);
      assert.deepEqual([b.out, b.blank, b.scroll], [[], [], false], JSON.stringify(b));
      assert.ok(await page.locator("#modeGrid [data-mode=online]").isVisible());
    }
    assert.deepEqual(errors, []);
  });
}

test("Kachel wählen: zurück auf der Startseite mit dem Modus, Reiter bleibt gemerkt", async () => {
  const { page, errors } = await openPage(env, VIEW.portrait);
  await click(page, "#modeCard", 400);
  assert.equal(await page.getAttribute("#modeTabs [data-tab=off]", "aria-selected"), "true", "öffnet beim Reiter des aktuellen Modus");
  await click(page, "#modeTabs [data-tab=on]", 300);
  await click(page, "#modeGrid [data-mode=online]", 400);
  assert.equal(await page.evaluate(() => window.__kd.screen), "home");
  assert.match(await page.textContent("#mcTitle"), /Mit Freunden/);
  assert.match(await page.textContent("#mcSide"), /Online/);
  await click(page, "#modeCard", 400);
  assert.equal(await page.getAttribute("#modeTabs [data-tab=on]", "aria-selected"), "true");
  assert.ok(await page.locator("#modeGrid [data-mode=online].on").isVisible(), "gewählter Modus markiert");
  await click(page, "#scr-modes [data-back]", 300);
  // Shop sitzt oben in der Kopfzeile
  assert.ok(await page.locator("#scr-home .hud-top #navShop").isVisible());
  await click(page, "#navShop", 400);
  assert.equal(await page.evaluate(() => window.__kd.screen), "shop");
  assert.deepEqual(errors, []);
});

test("Kopfzeile der Startseite passt auf schmale Handys (mit Juwelen)", async () => {
  for (const w of [360, 390, 430, 480]) {
    const { page } = await openPage(env, { ...VIEW.portrait, viewport: { width: w, height: 800 } });
    await page.evaluate(() => { document.getElementById("homeGems").hidden = false; });
    const r = await page.evaluate(() => Math.max(...[...document.querySelector("#scr-home .hud-top").children].filter(e => e.offsetParent).map(e => e.getBoundingClientRect().right)));
    assert.ok(r <= w, `${w}px: Kopfzeile endet bei ${r}px`);
  }
});
