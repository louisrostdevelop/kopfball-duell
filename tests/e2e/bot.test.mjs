// Computer-Gegner im echten Browser: Schnellspiel läuft, der Bot rechnet im Physikschritt und spielt; im Training steht
// er als Torwart vor seinem Tor; keine Fehler
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, quickMatch, click, pickMode, VIEW, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

test("Bot: spielt im Schnellspiel", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop);
  await quickMatch(page, { calm: false });
  const s0 = await page.evaluate(() => { const st = window.__kd.st; return { bot: !!(st.bot && st.bot[1] && !st.bot[0]), x: st.p[1].x }; });
  assert.ok(s0.bot, "Bot im Spielzustand (rechts)");
  await page.waitForTimeout(4000);
  const s1 = await page.evaluate(() => { const st = window.__kd.st; return { x: st.p[1].x, plan: st.bot[1].plan.k, sw: st.bot[1].switches }; });
  // (nach einem Tor steht er wieder am Startplatz, sein Plan ist dann „none“: Planwechsel zählen mit)
  assert.ok(Math.abs(s1.x - s0.x) > 30 || s1.plan !== "none" || s1.sw > 0, "Bot bewegt sich und plant: " + JSON.stringify(s1));
  assert.deepEqual(errors, []);
});

test("Torwart-Training: Bot als Torwart, bleibt vor seinem Tor und wehrt ab", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop);
  await click(page, "#modeCard"); await pickMode(page, "train"); await click(page, "#btnPlay", 300); await click(page, "#btnKickoff", 3400);
  const s0 = await page.evaluate(() => { const st = window.__kd.st; return { mode: window.__kd.mode, keeper: !!(st.bot && st.bot[1] && st.bot[1].keeper), lvl: st.bot && st.bot[1].lvl }; });
  assert.deepEqual(s0, { mode: "train", keeper: true, lvl: 1 }, "Torwart, Stufe Mittel");
  // nach dem Anstoß steht er auf dem Startplatz (etwas weiter vorne) und geht erst zurück (unter Last dauert der Countdown)
  await page.evaluate(async () => { window.__C = await import("/js/content/config.js"); });
  await page.waitForFunction(() => { const C = window.__C, st = window.__kd.st; return st.ph === "play" && C.W - st.p[1].x <= C.W / 4 + 2; }, null, { timeout: 20000 });
  // Ball rollt aus dem Mittelfeld aufs Tor: er geht hin und spielt ihn, kommt aber nicht weit heraus
  await page.evaluate(() => { const st = window.__kd.st, b = st.b; Object.assign(b, { x: window.__kd.st.p[1].x - 600, y: 560, vx: 900, vy: 0, lt: 0 }); });
  let far = 0, touched = false;
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(100);
    const r = await page.evaluate(async () => { const C = await import("/js/content/config.js"), st = window.__kd.st; return { d: C.W - st.p[1].x, z: C.W / 4, lt: st.b.lt, k: st.p[1].knock > 0 || st.p[1].stun > 0 || st.ph !== "play" || st.s[0] + st.s[1] > 0 }; });
    if (!r.k) far = Math.max(far, r.d - r.z);   // (Schubser zählen nicht; nach einem Tor steht er wieder auf dem Startplatz)
    if (r.lt === 1) touched = true;
  }
  assert.ok(touched, "Torwart am Ball");
  assert.ok(far < 30, `bleibt vor dem Tor (${far.toFixed(0)} px über die Grenze)`);
  assert.deepEqual(errors, []);
});
