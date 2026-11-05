// Online-Spiel mit zwei Tabs (PeerJS durch einen lokalen Ersatz ersetzt): Lobby, Regeln, Hindernisse, Gast-Eingaben, Revanche, Verlassen
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { start, openPage } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
after(async () => { await env.close(); });

const VIEW = { viewport: { width: 1100, height: 620 } };
const MOCK = { path: fileURLToPath(new URL("./mockpeer.js", import.meta.url)) };

test("Online: Lobby bis Revanche", async t => {
  const a = await openPage(env, VIEW, { init: [MOCK] });
  const A = a.page;
  await A.click("#modeCard"); await A.waitForTimeout(200); await A.click("#modeGrid .mcard:nth-child(3)"); await A.waitForTimeout(200); await A.click("#btnPlay"); await A.waitForTimeout(200);
  await A.fill("#nameIn", "Louis"); await A.click("#btnHost"); await A.waitForTimeout(500);
  const code = (await A.textContent("#lobbyCode")).trim();
  assert.match(code, /^[A-Z0-9]{4}$/);

  const B = await a.ctx.newPage(); const bErr = [];
  B.on("pageerror", e => bErr.push("Gast: " + e.message));
  await B.goto(env.url + "/index.html?join=" + code); await B.waitForTimeout(2500);
  if (await B.locator("#modalOk").isVisible()) await B.click("#modalOk");

  await t.test("Gast sieht die Regeln des Hosts", async () => {
    await A.click("#btnLobbyRules"); await A.waitForTimeout(200); await A.click("#rulePresets .preset:nth-child(2)"); await A.waitForTimeout(100); await A.click("#btnRulesDone"); await A.waitForTimeout(400);
    const [ra, rb] = await Promise.all([A, B].map(p => p.evaluate(() => JSON.stringify(window.__kd.netCfg.rules))));
    assert.equal(rb, ra);
  });
  await A.click("#segLobbyArena button:nth-child(2)"); await A.waitForTimeout(150); await A.click("#segLobbyObs button:nth-child(2)"); await A.waitForTimeout(300);
  await A.click("#btnLobbyStart"); await A.waitForTimeout(3500);

  await t.test("beide haben dieselben Hindernisse", async () => {
    const [oa, ob] = await Promise.all([A, B].map(p => p.evaluate(() => window.__kd.st.obs.length)));
    assert.ok(oa > 0); assert.equal(ob, oa);
  });
  await t.test("Grätsche und Bombe des Gasts kommen beim Host an", async () => {
    await B.bringToFront();
    for (let n = 0; n < 8; n++) { const k = ["ArrowLeft", "ArrowRight"][n % 2]; await B.keyboard.down(k); await B.waitForTimeout(100); await B.keyboard.up(k); }
    await B.keyboard.down("ArrowDown"); await B.waitForTimeout(60); await B.keyboard.up("ArrowDown"); await B.waitForTimeout(500);
    await B.keyboard.down("ArrowUp"); await B.waitForTimeout(300); await B.keyboard.down("ArrowDown"); await B.waitForTimeout(60); await B.keyboard.up("ArrowDown"); await B.keyboard.up("ArrowUp"); await B.waitForTimeout(600);
    const s = await A.evaluate(() => window.__kd.st.stats[1]);
    assert.ok(s.slides >= 1, "Grätschen " + s.slides); assert.ok(s.bombs >= 1, "Bomben " + s.bombs);
  });
  await t.test("Gast spiegelt den Spielstand", async () => {
    const sb = await B.evaluate(() => ({ mode: window.__kd.mode, snaps: window.__kd.snaps.length }));
    assert.equal(sb.mode, "guest"); assert.ok(sb.snaps > 0);
  });
  await t.test("Abpfiff und Revanche", async () => {
    await A.evaluate(() => { window.__kd.st.t = 0.5; window.__kd.st.s = [2, 1]; }); await A.waitForTimeout(2500);
    for (const p of [A, B]) if (await p.locator("#modal").isVisible()) await p.click("#modalOk");
    await B.click("#btnEndAgain"); await A.waitForTimeout(400); await A.click("#btnEndAgain"); await A.waitForTimeout(1500);
    assert.deepEqual(await B.evaluate(() => [window.__kd.mode, ["cd", "play"].includes(window.__kd.st.ph)]), ["guest", true]);
  });
  await t.test("Host verlässt: beide zurück", async () => {
    await A.click("#btnPause"); await A.waitForTimeout(200); await A.click("#btnQuit"); await A.waitForTimeout(800);
    for (const p of [A, B]) assert.ok(["lobby", "online", "home"].includes(await p.evaluate(() => window.__kd.screen)));
  });
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...bErr], []);
});
