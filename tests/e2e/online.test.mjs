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
  // Host trägt Schuhe und eine Torexplosion
  await A.evaluate(async () => { const p = await import("/js/app/profile.js"); p.S.cos = ["shoes:2", "goalfx:3", "emoji:5"]; p.S.equip = { shoes: "shoes:2", goalfx: "goalfx:3", title: null, frame: null, emotes: ["emoji:5", null, null, null] }; });
  await A.click("#modeCard"); await A.waitForTimeout(200); await A.click("#modeGrid [data-mode=online]"); await A.waitForTimeout(200); await A.click("#btnPlay"); await A.waitForTimeout(200);
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
  await t.test("Kosmetik: Gast sieht Schuhe und Torexplosion des Hosts, Emotes kommen an (höchstens eins in 3 s)", async () => {
    assert.deepEqual(await B.evaluate(() => [window.__kd.cfg.cos[0].shoes, window.__kd.cfg.cos[0].goalfx]), ["shoes:2", "goalfx:3"]);
    // (🔥 wäre auch der Torjubel, deshalb GG als zweites Emote)
    await B.evaluate(async () => { const g = await import("/js/app/game.js"); g.sendEmote("😂"); g.sendEmote("GG"); });
    let seen = "";
    for (let i = 0; i < 15 && seen !== "😂"; i++) { await A.waitForTimeout(100); seen = await A.evaluate(() => window.__kd.st.p[1].emo); }
    assert.equal(seen, "😂");
    await A.waitForTimeout(400);
    assert.notEqual(await A.evaluate(() => window.__kd.st.p[1].emo), "GG", "zweites Emote innerhalb von 3 s verworfen");
    await A.evaluate(async () => { (await import("/js/app/game.js")).sendEmote("emoji:5"); });
    await B.waitForTimeout(400);
    assert.equal(await B.evaluate(() => window.__kd.st.p[0].emo), "emoji:5", "Host-Emote beim Gast");
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

// Schlechtes Netz (90 ms, starke Schwankung, 6 % Verlust): Zustände kommen weiter an, kein Druck des Gasts geht
// verloren (Eingaben mehrfach + Zähler), Ereignisse und Statistik kommen zuverlässig, Puffer wächst mit dem Netz.
test("Online bei schlechtem Netz", async () => {
  const bad = { lat: 90, jit: 45, loss: 0.06 };
  const a = await openPage(env, VIEW, { init: [MOCK, { content: `window.__mockNet = ${JSON.stringify(bad)};` }] });
  const A = a.page;
  await A.click("#modeCard"); await A.waitForTimeout(200); await A.click("#modeGrid [data-mode=online]"); await A.waitForTimeout(200); await A.click("#btnPlay"); await A.waitForTimeout(200);
  await A.click("#btnHost"); await A.waitForTimeout(500);
  const code = (await A.textContent("#lobbyCode")).trim();
  const B = await a.ctx.newPage(); const bErr = []; B.on("pageerror", e => bErr.push("Gast: " + e.message));
  await B.goto(env.url + "/index.html?join=" + code); await B.waitForTimeout(3000);
  if (await B.locator("#modalOk").isVisible()) await B.click("#modalOk");
  await A.click("#btnLobbyStart"); await A.waitForTimeout(3800);
  await B.bringToFront();
  // 6 kurze Sprünge des Gasts: alle kommen beim Host an
  await A.evaluate(() => { window.__j = 0; const st = window.__kd.st, push = st.ev.push.bind(st.ev); st.ev.push = e => { if (e.t === "jump" && e.i === 1 && !e.dbl) window.__j++; return push(e); }; });
  for (let n = 0; n < 6; n++) { await B.keyboard.down("ArrowUp"); await B.waitForTimeout(50); await B.keyboard.up("ArrowUp"); await B.waitForTimeout(700); }
  await A.waitForTimeout(600);
  const j = await A.evaluate(() => window.__j);
  assert.ok(j >= 6, `Sprünge angekommen: ${j} von 6`);
  // Tor beim Host: Gast hat den Stand und die Statistik
  await A.evaluate(() => { const st = window.__kd.st; st.b.x = 1500; st.b.y = 560; st.b.vx = 900; st.b.vy = 0; });
  await A.waitForTimeout(2500);
  const [sa, sb] = await Promise.all([A, B].map(p => p.evaluate(() => ({ s: window.__kd.st.s.join(":"), goals: window.__kd.st.stats[0].goals }))));
  assert.notEqual(sa.s, "0:0", "Tor gefallen"); assert.equal(sb.s, sa.s, "Spielstand gleich"); assert.equal(sb.goals, sa.goals, "Statistik gleich");
  const g = await B.evaluate(() => ({ seq: window.__kd.lastSeq, delay: window.__kd.clock.delay() }));
  assert.ok(g.seq > 150, "Zustände kommen an: " + g.seq);
  assert.ok(g.delay > 90, "Puffer an schlechtes Netz angepasst: " + g.delay.toFixed(0) + " ms");
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...bErr], []);
});

// Gast friert ein (Tab im Hintergrund, Absturz), ohne dass die Verbindung schließt: festgehaltene Taste wirkt nicht
// weiter, nach 4 s ein Hinweis, nach 15 s zurück in die Lobby (Review 06.11.2026)
test("Online: Gast friert ein", async () => {
  const a = await openPage(env, VIEW, { init: [MOCK] });
  const A = a.page;
  await A.click("#modeCard"); await A.waitForTimeout(200); await A.click("#modeGrid [data-mode=online]"); await A.waitForTimeout(200); await A.click("#btnPlay"); await A.waitForTimeout(200);
  await A.click("#btnHost"); await A.waitForTimeout(500);
  const code = (await A.textContent("#lobbyCode")).trim();
  const B = await a.ctx.newPage();
  await B.goto(env.url + "/index.html?join=" + code); await B.waitForTimeout(2500);
  if (await B.locator("#modalOk").isVisible()) await B.click("#modalOk");
  await A.click("#btnLobbyStart"); await A.waitForTimeout(3600);
  await B.bringToFront(); await B.keyboard.down("ArrowRight"); await B.waitForTimeout(300);
  await B.evaluate(() => { window.requestAnimationFrame = () => 0; });   // Gast-Schleife steht, Verbindung bleibt offen
  await A.bringToFront(); await A.waitForTimeout(900);
  const vx = await A.evaluate(() => window.__kd.st.p[1].vx);
  assert.ok(Math.abs(vx) < 5, "Gast läuft nicht mit festgehaltener Taste weiter: vx " + vx);
  await A.waitForTimeout(4000);
  assert.match(await A.textContent("#toasts"), /hakt/);
  await A.waitForTimeout(11000);
  assert.deepEqual(await A.evaluate(() => [window.__kd.screen, window.__kd.mode]), ["lobby", "demo"]);
  assert.deepEqual(a.errors.filter(e => !e.includes("TUNNEL")), []);
});
