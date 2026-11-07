// Online mit Rollback-Netcode im Browser (zwei Tabs, PeerJS-Ersatz mit nachgespieltem Netz): beide rechnen dasselbe
// Spiel, Eingaben des Gasts wirken, Tore sind endgültig und auf beiden Seiten gleich, Emotes reisen mit, Spielende
// zeigt bei beiden dasselbe Ergebnis. Das alte Verfahren (?netcode=classic) prüfen online.test.mjs und resume.test.mjs.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { start, openPage, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

const VIEW = { viewport: { width: 1100, height: 620 } };
const MOCK = { path: fileURLToPath(new URL("./mockpeer.js", import.meta.url)) };
const stats = p => p.evaluate(async () => (await import("/js/app/rbnet.js")).rbStats());
// Prüfsumme desselben endgültigen Takts auf beiden Seiten
async function sameAt(A, B) {
  const sa = await stats(A), sb = await stats(B);
  const f = Math.min(sa.sync, sb.sync) - 1;
  const h = p => p.evaluate(async fr => { const R = await import("/js/core/rollback.js"); const st = window.__kd.rb.peer.session.stateAt(fr); return st ? R.hashState(st) : null; }, f);
  return { f, a: await h(A), b: await h(B) };
}

async function pair(net, patch) {
  const a = await openPage(env, VIEW, { init: [MOCK, { content: `window.__mockNet = ${JSON.stringify(net)};` }] });
  const A = a.page;
  await A.click("#modeCard"); await A.waitForTimeout(200); await A.click("#modeGrid [data-mode=online]"); await A.waitForTimeout(200); await A.click("#btnPlay"); await A.waitForTimeout(200);
  await A.fill("#nameIn", "Host"); await A.click("#btnHost"); await A.waitForTimeout(500);
  const code = (await A.textContent("#lobbyCode")).trim();
  const B = await a.ctx.newPage(); const bErr = [];
  B.on("pageerror", e => bErr.push("Gast: " + e.message));
  await B.goto(env.url + "/index.html?join=" + code); await B.waitForTimeout(2500);
  if (await B.locator("#modalOk").isVisible()) await B.click("#modalOk");
  // eslint-disable-next-line no-new-func -- Test: Startzustand im Browser vorgeben
  if (patch) await A.evaluate(src => { window.__kd.testPatch = new Function("st", src); }, patch);
  await A.click("#btnLobbyStart"); await A.waitForTimeout(800);
  return { a, A, B, bErr };
}

test("Rollback: gleiches Spiel, Gast-Eingaben, Emote, Tor endgültig auf beiden Seiten", async () => {
  const { a, A, B, bErr } = await pair({ lat: 60, jit: 25, loss: 0.03 });
  const [ra, rb] = [await stats(A), await stats(B)];
  assert.ok(ra && rb, "beide Seiten im Rollback-Modus");
  assert.equal(ra.ep, rb.ep, "dieselbe Sitzung");
  assert.ok(ra.delay >= 2 && ra.delay <= 6 && ra.delay === rb.delay, "Verzögerung vom Host: " + ra.delay);
  await A.waitForTimeout(3200);   // Anstoß-Countdown

  // Gast springt 5-mal kurz und grätscht: kommt im gemeinsamen Spiel an (endgültige Ereignisse beim Host)
  await B.bringToFront();
  // (jeweils erst springen, wenn er wieder steht: zwei Seiten auf einem Rechenkern laufen langsamer als echt)
  const grounded = () => B.waitForFunction(() => window.__kd.st.p[1].onG, null, { timeout: 5000 });
  for (let n = 0; n < 5; n++) { await grounded(); await B.waitForTimeout(150); await B.keyboard.down("ArrowUp"); await B.waitForTimeout(40); await B.keyboard.up("ArrowUp"); await B.waitForTimeout(300); }
  await grounded();
  await B.keyboard.down("ArrowDown"); await B.waitForTimeout(60); await B.keyboard.up("ArrowDown"); await B.waitForTimeout(800);
  const ca = (await stats(A)).counts, cb = (await stats(B)).counts;
  assert.ok((ca.jump1 || 0) >= 5, `Sprünge des Gasts beim Host: ${ca.jump1}`);
  assert.equal(ca.jump1, cb.jump1, "beide zählen dieselben Sprünge");

  // Emote des Gasts erscheint beim Host
  await B.evaluate(async () => (await import("/js/app/game.js")).sendEmote("😂"));
  let seen = "";
  for (let i = 0; i < 20 && seen !== "😂"; i++) { await A.waitForTimeout(100); seen = await A.evaluate(() => window.__kd.st.p[1].emo); }
  assert.equal(seen, "😂", "Emote angekommen");

  // gleiche Prüfsumme im selben endgültigen Takt, keine Abweichung gemeldet
  const s = await sameAt(A, B);
  assert.ok(s.a && s.a === s.b, `gleicher Zustand bei Takt ${s.f}`);
  const [ma, mb] = [await stats(A), await stats(B)];
  assert.equal(ma.desyncs + mb.desyncs, 0, "keine Abweichung");
  assert.ok(ma.frame > 300 && mb.frame > 300, `Spiel läuft (${ma.frame}/${mb.frame})`);
  assert.ok(Math.abs(ma.frame - mb.frame) < 40, "Seiten zeitlich beieinander");
  for (const p of [A, B]) assert.ok(await p.evaluate(() => !document.getElementById("netPing").hidden), "Ping-Anzeige");
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...bErr], []);
});

test("Rollback: Tor aus festem Startzustand, Wiederholung, Spielende mit gleichem Ergebnis", async () => {
  // Ball fliegt sofort ins rechte Tor, Spiel auf ein Tor (endet danach)
  const patch = "st.ph = 'play'; st.pt = 0; st.b.x = 1200; st.b.y = 560; st.b.vx = 700; st.b.vy = 0; st.rules.win = 1;";
  const { a, A, B, bErr } = await pair({ lat: 80, jit: 30, loss: 0.05 }, patch);
  let ca = {};
  for (let i = 0; i < 40 && !ca.goal0; i++) { await A.waitForTimeout(100); ca = (await stats(A)).counts; }
  assert.equal(ca.goal0, 1, "ein endgültiges Tor für links");
  await A.waitForTimeout(1500);
  for (const p of [A, B]) {
    const r = await p.evaluate(() => ({ s: window.__kd.st.s.join(":"), rep: (window.__kd.replay || []).length }));
    assert.equal(r.s, "1:0"); assert.ok(r.rep > 0, "Wiederholung aufgenommen");
  }
  // nach dem Jubel: Spiel ist aus (win 1), beide zeigen das Ergebnis
  let scr = ["", ""];
  for (let i = 0; i < 80 && !(scr[0] === "end" && scr[1] === "end"); i++) { await A.waitForTimeout(150); scr = await Promise.all([A, B].map(p => p.evaluate(() => window.__kd.screen))); }
  assert.deepEqual(scr, ["end", "end"], "beide auf dem Ergebnis-Bildschirm");
  const [ea, eb] = await Promise.all([A, B].map(p => p.evaluate(() => ({ s: window.__kd.st.s.join(":"), goals: window.__kd.st.stats[0].goals }))));
  assert.deepEqual(ea, eb);
  assert.equal((await stats(A)).counts.goal0, 1, "Tor nur einmal gezählt");
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...bErr], []);
});

test("Rollback: Netz bricht kurz ab (2 s): beide stehen, dann geht es gemeinsam weiter", async () => {
  const { a, A, B, bErr } = await pair({ lat: 40, jit: 10 });
  await A.waitForTimeout(3500);
  // Takte pro Sekunde vor dem Ausfall (zwei Seiten auf einem Rechenkern: langsamer als 60)
  const r0 = (await stats(A)).frame; await A.waitForTimeout(2000); const rate = ((await stats(A)).frame - r0) / 2;
  const f0 = (await stats(A)).frame;
  await A.evaluate(() => { window.__mockNet = { lat: 40, jit: 10, loss: 1 }; });
  await B.evaluate(() => { window.__mockNet = { lat: 40, jit: 10, loss: 1 }; });
  await A.waitForTimeout(2000);
  const f1 = (await stats(A)).frame;
  assert.ok(f1 - f0 < 40, `steht, statt davonzulaufen (${f1 - f0} Takte in 2 s)`);
  await A.evaluate(() => { window.__mockNet = { lat: 40, jit: 10, loss: 0 }; });
  await B.evaluate(() => { window.__mockNet = { lat: 40, jit: 10, loss: 0 }; });
  await A.waitForTimeout(1000);   // aufholen
  const f2 = (await stats(A)).frame; await A.waitForTimeout(2000); const f3 = (await stats(A)).frame;
  assert.ok(f3 - f2 > rate * 2 * 0.6, `läuft wieder (${f3 - f2} Takte in 2 s, vorher ${rate}/s)`);
  const s = await sameAt(A, B);
  assert.ok(s.a && s.a === s.b, "danach gleicher Zustand");
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...bErr], []);
});
