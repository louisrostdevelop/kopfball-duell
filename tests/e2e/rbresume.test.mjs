// Rollback-Netcode und Wiederverbinden: Abriss ohne Neustart, Gast startet die App neu, Host startet die App neu,
// Revanche. Nach jeder Wiederaufnahme: neue Sitzung auf beiden Seiten, Stand erhalten, beide rechnen wieder gleich.
import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { start, openPage, closeAll } from "./lib.mjs";

let env;
before(async () => { env = await start(); });
afterEach(t => closeAll(env, t));
after(async () => { await env.close(); });

const VIEW = { viewport: { width: 1000, height: 560 } };
const MOCK = { path: fileURLToPath(new URL("./mockpeer.js", import.meta.url)) };
const stats = p => p.evaluate(async () => (await import("/js/app/rbnet.js")).rbStats());
const playing = p => p.waitForFunction(() => window.__kd.rb && window.__kd.netWait === null && window.__kd.rb.peer.frame > 30, null, { timeout: 30000 });
async function same(A, B) {
  for (let i = 0; i < 20; i++) {
    const sa = await stats(A), sb = await stats(B);
    if (sa && sb && sa.ep === sb.ep) {
      const f = Math.min(sa.sync, sb.sync) - 1;
      const h = p => p.evaluate(async fr => { const R = await import("/js/core/rollback.js"); const st = window.__kd.rb && window.__kd.rb.peer.session.stateAt(fr); return st ? R.hashState(st) : null; }, f);
      const [a, b] = [await h(A), await h(B)];
      if (a && a === b) return true;
    }
    await A.waitForTimeout(250);
  }
  return false;
}
async function match(patch = "st.s = [2, 1]; st.t = 50;") {
  const a = await openPage(env, VIEW, { init: [MOCK] });
  const A = a.page;
  await A.click("#modeCard"); await A.waitForTimeout(200); await A.click("#modeGrid [data-mode=online]"); await A.waitForTimeout(200); await A.click("#btnPlay"); await A.waitForTimeout(200);
  await A.click("#btnHost"); await A.waitForTimeout(500);
  const code = (await A.textContent("#lobbyCode")).trim();
  const B = await a.ctx.newPage(); const bErr = []; B.on("pageerror", e => bErr.push("Gast: " + e.message));
  await B.goto(env.url + "/index.html?join=" + code); await B.waitForTimeout(2500);
  if (await B.locator("#modalOk").isVisible()) await B.click("#modalOk");
  // eslint-disable-next-line no-new-func -- Test: Startzustand im Browser vorgeben
  await A.evaluate(src => { window.__kd.testPatch = new Function("st", src); }, patch);
  await A.click("#btnLobbyStart");
  await playing(A); await playing(B);
  return { a, A, B, bErr };
}
async function reopen(ctx) {
  const P = await ctx.newPage(); const err = []; P.on("pageerror", e => err.push(e.message));
  await P.goto(env.url + "/index.html"); return { P, err };
}

test("Rollback: Verbindung reißt ab und kommt zurück (ohne Neustart)", async () => {
  const { a, A, B, bErr } = await match();
  const ep0 = (await stats(A)).ep;
  await B.evaluate(() => window.__mockDrop());
  await A.waitForFunction(() => !!window.__kd.netWait, null, { timeout: 5000 });
  await playing(A); await playing(B);
  const [sa, sb] = [await stats(A), await stats(B)];
  assert.notEqual(sa.ep, ep0, "neue Sitzung"); assert.equal(sa.ep, sb.ep, "beide in derselben neuen Sitzung");
  for (const p of [A, B]) assert.deepEqual(await p.evaluate(() => window.__kd.st.s), [2, 1], "Stand erhalten");
  assert.ok(await same(A, B), "beide rechnen wieder gleich");
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...bErr], []);
});

test("Rollback: Gast startet die App neu und ist wieder im selben Spiel", async () => {
  const { a, A, B } = await match("st.s = [1, 3]; st.t = 40;");
  await A.waitForTimeout(500);
  await B.close();
  const { P: C, err } = await reopen(a.ctx);
  await playing(C); await playing(A);
  assert.equal(await C.evaluate(() => window.__kd.mode), "guest");
  for (const p of [A, C]) assert.deepEqual(await p.evaluate(() => window.__kd.st.s), [1, 3], "Stand erhalten");
  assert.ok(await same(A, C), "beide rechnen wieder gleich");
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...err], []);
});

test("Rollback: Host startet die App neu, Stand und Zeit bleiben", async () => {
  const { a, A, B, bErr } = await match("st.s = [3, 2]; st.t = 50;");
  await A.waitForTimeout(1300);   // Host sichert jede Sekunde
  const t0 = await A.evaluate(() => window.__kd.st.t);
  await A.close();
  const { P: D, err } = await reopen(a.ctx);
  await D.waitForFunction(() => window.__kd.mode === "host" && window.__kd.st && window.__kd.st.s[0] === 3, null, { timeout: 15000 });
  await playing(D); await playing(B);
  for (const p of [D, B]) assert.deepEqual(await p.evaluate(() => window.__kd.st.s), [3, 2], "Stand erhalten");
  const t1 = await D.evaluate(() => window.__kd.st.t);
  assert.ok(t1 <= t0 && t1 > t0 - 6, `Spielzeit fortgesetzt: ${t0.toFixed(1)} -> ${t1.toFixed(1)}`);
  assert.ok(await same(D, B), "beide rechnen wieder gleich");
  assert.deepEqual([...err, ...bErr], []);
});

test("Rollback: Abpfiff, Revanche (neues Spiel, neue Sitzung)", async () => {
  const { a, A, B, bErr } = await match("st.s = [1, 0]; st.t = 1.5;");   // mit Führung: kein Golden Goal
  await Promise.all([A, B].map(p => p.waitForFunction(() => window.__kd.screen === "end", null, { timeout: 30000 })));
  const ep0 = (await stats(A)).ep;
  await B.click("#btnEndAgain");   // Gast fragt an
  await A.waitForFunction(() => document.getElementById("btnEndAgain").classList.contains("wants"), null, { timeout: 5000 });
  await A.click("#btnEndAgain");   // Host startet
  await playing(A); await playing(B);
  const [sa, sb] = [await stats(A), await stats(B)];
  assert.notEqual(sa.ep, ep0); assert.equal(sa.ep, sb.ep);
  for (const p of [A, B]) assert.deepEqual(await p.evaluate(() => [window.__kd.screen, window.__kd.st.s]), [null, [0, 0]]);
  assert.ok(await same(A, B));
  assert.deepEqual([...a.errors.filter(e => !e.includes("TUNNEL")), ...bErr], []);
});
