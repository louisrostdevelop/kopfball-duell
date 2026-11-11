// Ton: Musik und Soundeffekte in den Einstellungen aus = wirklich still (auch der Hall), bleibt aus nach Neuladen,
// Spiel, Hintergrund; wieder an = Menü-Musik läuft. Gemessen am Ausgang (Analyser vor dem Lautsprecher).
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, click, VIEW, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

// Hängt einen Analyser an alles, was in den Lautsprecher geht; __peak(ms): lautester Wert in diesem Zeitraum
const tap = () => {
  const orig = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function (dst, ...r) {
    if (dst instanceof AudioDestinationNode && !window.__tap) { const a = this.context.createAnalyser(); a.fftSize = 2048; orig.call(this, a); window.__tap = a; }
    return orig.call(this, dst, ...r);
  };
  window.__peak = ms => new Promise(res => {
    let m = 0; const b = new Float32Array(2048), t0 = performance.now();
    const f = () => { window.__tap.getFloatTimeDomainData(b); for (const v of b) m = Math.max(m, Math.abs(v)); if (performance.now() - t0 < ms) setTimeout(f, 20); else res(m); };
    f();
  });
};
const QUIET = 1e-3, LOUD = 0.05;

test("Musik und Soundeffekte ausschalten", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop, { init: [tap] });
  const peak = () => page.evaluate(() => window.__peak(1200));
  const audio = () => page.evaluate(() => window.__kdAudio());
  const unlock = async () => { await page.mouse.click(5, 5); await page.waitForTimeout(400); };

  await unlock();
  assert.ok(await peak() > LOUD, "Menü-Musik läuft");

  await click(page, "#btnSettings", 300);
  await click(page, "#tglMusic", 1200);
  let a = await audio();
  assert.equal(a.musOn, false); assert.ok(a.music < QUIET && a.musVerb < QUIET, "Musik-Pegel und Musik-Hall aus: " + JSON.stringify(a));
  assert.ok(await peak() < QUIET, "Musik sofort still (auch kein Hall)");

  await click(page, "#tglSfx", 1200);
  a = await audio();
  assert.equal(a.sfx, 0); assert.equal(a.sfxVerb, 0, "Effekt-Hall aus");
  // Klick-Sound bei aus: nichts zu hören, auch nicht der Hall
  await page.evaluate(() => { setTimeout(() => document.querySelector("#setTabs button").click(), 50); });
  assert.ok(await peak() < QUIET, "Soundeffekte aus: still");
  await click(page, "#scr-settings [data-back]", 400);
  assert.ok(await peak() < QUIET, "zurück im Menü: still");

  // Neu laden: bleibt aus
  await page.reload(); await page.waitForSelector("#loading.done", { state: "attached", timeout: 8000 }); await page.waitForTimeout(300);
  await unlock();
  a = await audio();
  assert.equal(a.musOn, false); assert.equal(a.sfxOn, false);
  assert.ok(await peak() < QUIET, "nach Neuladen still");

  // Spiel und zurück ins Menü: bleibt aus
  await click(page, "#btnPlay", 200); await click(page, "#btnKickoff", 1500);
  await page.keyboard.press("Escape"); await page.waitForTimeout(200); await click(page, "#btnQuit", 600);
  assert.equal(await page.evaluate(() => window.__kd.screen), "home");
  assert.ok(await peak() < QUIET, "nach dem Spiel still");

  // Hintergrund und zurück: bleibt aus
  const vis = h => page.evaluate(hid => { Object.defineProperty(document, "hidden", { value: hid, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); }, h);
  await vis(true); await page.waitForTimeout(200); await vis(false); await page.waitForTimeout(300);
  assert.ok(await peak() < QUIET, "nach Hintergrund still");

  // Wieder an: Menü-Musik läuft, Soundeffekte sind zu hören
  await click(page, "#btnSettings", 300);
  await click(page, "#tglMusic", 600);
  assert.ok(await peak() > LOUD, "Musik wieder an: läuft");
  await click(page, "#tglMusic", 1200);
  await click(page, "#tglSfx", 1200);
  a = await audio();
  assert.equal(a.sfx, 1); assert.equal(a.sfxVerb, 1);
  await page.evaluate(() => { setTimeout(() => document.querySelector("#setTabs button").click(), 50); });
  assert.ok(await peak() > QUIET, "Soundeffekte wieder an: Klick zu hören");
  await click(page, "#tglMusic", 300);
  assert.deepEqual(errors, []);
});
