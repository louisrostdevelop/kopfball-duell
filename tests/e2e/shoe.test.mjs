// Schuh im echten Browser: an, Schuss trifft und fliegt, schnelles Grätsche/Sprung-Wechseln lässt
// den Schuh nie vom Kopf weg, Handy-Tipp schießt, keine Fehler
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, quickMatch, logEvents, takeEvents, VIEW, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

const tap = async (page, key, ms = 60) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };
const holdBall = page => page.evaluate(() => { window.__hold = setInterval(() => { const s = window.__kd.st; s.b.x = 1300; s.b.y = 150; s.b.vx = 0; s.b.vy = 0; s.p[1].x = 1400; }, 10); });
const releaseBall = page => page.evaluate(() => clearInterval(window.__hold));

test("Schuh: Schuss, Grätsche/Sprung-Wechsel, Schuh bleibt am Kopf", async t => {
  const { page, errors } = await openPage(env, VIEW.desktop);
  await quickMatch(page); await logEvents(page);
  await holdBall(page);

  await t.test("Leertaste = Schwung", async () => { await tap(page, "Space", 80); assert.deepEqual(await takeEvents(page, /^(swing|slide)0$/), ["swing0"]); });
  await page.waitForTimeout(400);

  await t.test("schnell abwechselnd Grätsche und Sprung: Schuh hängt immer am Kopf", async () => {
    await page.evaluate(async () => {
      const { shoeGeo } = await import("/js/core/sim/shoe.js"), { pr } = await import("/js/core/sim/base.js"), { SHOE } = await import("/js/core/sim/tuning.js");
      window.__shoeMax = 0;
      window.__shoeT = setInterval(() => { const p = window.__kd.st.p[0], g = shoeGeo(p); window.__shoeMax = Math.max(window.__shoeMax, Math.hypot(g.x - p.x, g.y - p.y) / (SHOE.ring * pr(p))); }, 4);
    });
    for (let n = 0; n < 24; n++) await tap(page, n % 2 ? "KeyW" : "KeyS", 12 + (n * 7) % 30);
    await page.waitForTimeout(700);
    const ev = await takeEvents(page, /^(slide|jump)0$/, 0);
    const max = await page.evaluate(() => { clearInterval(window.__shoeT); return window.__shoeMax; });
    assert.ok(ev.includes("slide0") && ev.includes("jump0"), "beides ausgelöst: " + ev.join());
    assert.ok(max <= 1.05, "Schuh nie weiter als sein Kreis vom Kopf: " + max.toFixed(3));
    const p = await page.evaluate(() => { const q = window.__kd.st.p[0]; return { s: q.lgS, bl: q.lgBl, sl: q.slide }; });
    assert.deepEqual(p, { s: 0, bl: 0, sl: 0 }, "danach wieder Ruhe");
  });
  await releaseBall(page);

  await t.test("Ball vor dem Schuh: Schuss fliegt kräftig", async () => {
    await page.evaluate(async () => {
      const { pr } = await import("/js/core/sim/base.js"), st = window.__kd.st, p = st.p[0], r = pr(p);
      Object.assign(p, { x: 600, vx: 0, vy: 0, dir: 1 }); Object.assign(st.p[1], { x: 1500, vx: 0 });
      Object.assign(st.b, { x: 600 + r * 1.55, y: p.y + r * 0.2, vx: 0, vy: 0 });
      window.__ballMax = 0; window.__ballT = setInterval(() => { const b = window.__kd.st.b; window.__ballMax = Math.max(window.__ballMax, Math.hypot(b.vx, b.vy)); }, 4);
    });
    await tap(page, "Space", 70); await page.waitForTimeout(350);
    const v = await page.evaluate(() => { clearInterval(window.__ballT); return window.__ballMax; });
    const { SHOE } = await import("../../js/core/sim/tuning.js");
    assert.ok(v >= SHOE.minShot * 0.95, "Ballgeschwindigkeit " + Math.round(v));
  });
  assert.deepEqual(errors, []);
});

test("Schuh am Handy: Tipp rechts = Schwung", async () => {
  const { page, errors } = await openPage(env, VIEW.phone);
  await quickMatch(page); await logEvents(page); await holdBall(page);
  const tz = await page.locator(".tzone").boundingBox(), x = tz.x + tz.width * 0.3, y = tz.y + tz.height * 0.3;
  await page.evaluate(([px, py]) => { const zone = document.querySelector(".tzone"); for (const type of ["pointerdown", "pointerup"]) zone.dispatchEvent(new PointerEvent(type, { pointerId: 9, clientX: px, clientY: py, bubbles: true, pointerType: "touch" })); }, [x, y]);
  assert.deepEqual(await takeEvents(page, /^(swing|slide)0$/), ["swing0"]);
  assert.deepEqual(errors, []);
});
