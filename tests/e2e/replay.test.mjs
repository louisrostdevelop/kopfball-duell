// Torjubel und Musik zur Wiederholung: Musik nur während der Wiederholung, Jubel geht darunter; Überspringen, Pause,
// Menü und „Musik aus“ beenden sie; nach der Pause kein Neustart; nie zweimal dasselbe Stück hintereinander.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { start, openPage, VIEW, closeAll } from "./lib.mjs";
import { REPLAY_START } from "../../js/core/sim/match.js";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

const audio = page => page.evaluate(() => window.__kdAudio());
const game = (page, fn, arg) => page.evaluate(async ([f, a]) => (await import("/js/app/game.js"))[f](a), [fn, arg]);
const match = page => page.evaluate(async () => {
  (await import("/js/app/game.js")).beginMatch({ mode: "cpu", chars: ["kalle", "yuki"], arena: "stadion", dur: 90, rules: {}, golden: false, diff: 1, names: ["A", "B"], labels: [null, null] });
  const st = window.__kd.st; st.ph = "play"; st.pt = 0; st.bot = undefined;
});
// Ball direkt ins linke Tor legen und warten, bis die Wiederholung läuft
const goal = async page => {
  await page.waitForFunction(() => window.__kd.st.ph === "play", null, { timeout: 8000 });
  await page.evaluate(() => Object.assign(window.__kd.st.b, { x: 50, y: 600, vx: -300, vy: 0 }));
  await page.waitForFunction(rs => window.__kd.st.ph === "goal" && window.__kd.st.pt < rs - 0.3, REPLAY_START, { timeout: 8000 });
};

test("Wiederholung: Musik, Jubel darunter, Überspringen, Pause, Menü, Musik aus", async () => {
  const { page, errors } = await openPage(env, VIEW.desktop);
  await page.mouse.click(5, 5); await page.waitForTimeout(300);
  await match(page);
  await page.waitForFunction(() => window.__kdAudio().stingFiles === 5, null, { timeout: 8000 });

  await goal(page);
  let a = await audio(page);
  assert.ok(a.sting, "Musik läuft in der Wiederholung");
  assert.ok(a.cheer < 0.6 && a.crowdDuck < 0.6 && a.cheerTone < 8000, "Jubel und Publikum leiser und dunkler: " + JSON.stringify(a));
  const first = a.stingN;
  await page.keyboard.press("Space"); await page.waitForTimeout(150);
  assert.equal((await audio(page)).sting, false, "Überspringen beendet die Musik");
  await page.waitForTimeout(1500);
  a = await audio(page); assert.ok(a.cheer > 0.9 && a.crowdDuck > 0.9 && a.cheerTone > 12000, "Jubel wieder normal: " + JSON.stringify(a));

  await goal(page);
  a = await audio(page); assert.ok(a.sting); assert.notEqual(a.stingN, first, "nicht zweimal dasselbe Stück");
  await game(page, "pause", true); await page.waitForTimeout(150);
  assert.equal((await audio(page)).sting, false, "Pause beendet die Musik");
  await game(page, "pause", false); await page.waitForTimeout(300);
  assert.equal((await audio(page)).sting, false, "nach der Pause kein Neustart");

  await goal(page);
  assert.ok((await audio(page)).sting);
  await game(page, "quitToMenu"); await page.waitForTimeout(150);
  assert.equal((await audio(page)).sting, false, "Menü beendet die Musik");

  await page.evaluate(async () => (await import("/js/adapters/audio/webaudio.js")).setMusic(false));
  await match(page); await goal(page);
  assert.equal((await audio(page)).sting, false, "Musik aus: keine Musik zur Wiederholung");
  assert.deepEqual(errors, []);
});
