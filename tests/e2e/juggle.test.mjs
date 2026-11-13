// Kopfball-Jonglieren auf der Startseite und beim Warten in der Gegnersuche: Antippen trifft, Serie zählt,
// die Suche zeigt den jonglierenden Kopf und danach wieder das Profilbild; alles passt aufs Handy.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, VIEW, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

// tippt kurz vor der Landung auf die Zeichenfläche sel, bis die Serie n erreicht; key: Export der Bühne in mod
const juggleN = (page, sel, mod, key, n) => page.evaluate(async ([cs, m, k, want]) => {
  const { contactIn } = await import("/js/ui/juggle.js"), j = (await import(m))[k].j, cv = document.querySelector(cs);
  const tap = () => cv.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  if (j.mode === "auto") tap();
  await new Promise(done => {
    let armed = true; const t0 = performance.now();
    const f = () => {
      if (j.streak >= want || performance.now() - t0 > 20000) return done();
      const tc = contactIn(j);
      if (j.vy > 0 && tc !== null && armed && tc < 0.08) { tap(); armed = false; }
      if (j.vy < 0) armed = true;
      requestAnimationFrame(f);
    };
    f();
  });
  return { streak: j.streak, mode: j.mode };
}, [sel, mod, key, n]);

test("Startseite: Antippen jongliert, Serie zählt", async () => {
  const { page, errors } = await openPage(env, VIEW.portrait);
  const box = await page.locator("#showcase").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.3);
  assert.equal(await page.evaluate(async () => (await import("/js/ui/screens/home.js")).showcase.j.mode), "play", "Antippen übernimmt");
  const r = await juggleN(page, "#showcase", "/js/ui/screens/home.js", "showcase", 4);
  assert.ok(r.streak >= 4, JSON.stringify(r));
  assert.deepEqual(errors, []);
});

test("Gegnersuche: eigener Kopf jongliert beim Warten, passt aufs Handy, danach Profilbild", async () => {
  for (const view of [VIEW.portrait, VIEW.phone]) {
    const { page, errors } = await openPage(env, view);
    await page.evaluate(async () => {
      const { App } = await import("/js/app/state.js"), { searchUI } = await import("/js/ui/screens/search.js"), { showScreen } = await import("/js/ui/nav.js");
      App.mm = { state: "search", mode: "casual", t0: Date.now() }; searchUI(App.mm); showScreen("search");
    });
    await page.waitForTimeout(400);
    const cv = page.locator("#srAv canvas.sr-juggle");
    assert.equal(await cv.count(), 1, "Jonglier-Fläche statt Profilbild");
    const fits = await page.evaluate(() => [...document.querySelectorAll("#scr-search .sr-juggle, #srCancel, .sr-ring")].every(e => { const b = e.getBoundingClientRect(); return b.width > 0 && b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth; }));
    assert.ok(fits, "alles sichtbar bei " + JSON.stringify(view.viewport));
    const r = await juggleN(page, "#srAv canvas", "/js/ui/screens/search.js", "searchStage", 3);
    assert.ok(r.streak >= 3, JSON.stringify(r));
    await page.evaluate(async () => {
      const { App } = await import("/js/app/state.js"), { searchUI } = await import("/js/ui/screens/search.js");
      App.mm = { ...App.mm, state: "connect", opp: { name: "B", level: 1 }, heads: {}, role: "host" }; searchUI(App.mm);
    });
    assert.equal(await page.locator("#srAv canvas.sr-juggle").count(), 0, "gefunden: wieder Profilbild");
    await page.evaluate(async () => { (await import("/js/app/state.js")).App.mm = null; });
    assert.deepEqual(errors, []);
  }
});
