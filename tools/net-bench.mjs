// Messung Online-Sync (kein Test): zwei Tabs (Host, Gast), PeerJS-Ersatz mit nachgespieltem Netz, beide Spieler
// mit festem Zufalls-Eingabemuster. Vergleicht, was der Gast zeichnet, mit dem, was beim Host wirklich passiert.
//   node tools/net-bench.mjs [Sekunden=20]          Szenarien: gut, mobil, schlecht
//   NET=mobil node tools/net-bench.mjs
// Kennzahlen (Gast-Sicht):
//   Ball-Verzug   Verzögerung, mit der der Ball beim Gast dem echten Ball folgt (beste Übereinstimmung)
//   Ball-Fehler   mittlere Abweichung bei diesem Verzug (px, Spielfeld 1600 breit): Zittern, Sprünge, Ungenauigkeit
//   Sprünge/min   Bilder, in denen der Ball beim Gast > 60 px vom echten Ballweg abweicht (sichtbares Springen)
//   Eigener Kopf  Abweichung der eigenen (vorhergesagten) Figur vom echten Stand beim Host, mit 0 ms Verzug
//   Daten         empfangene Bytes pro Sekunde in beide Richtungen
import { serve } from "./serve.mjs";
import { fileURLToPath } from "node:url";

const SECS = +(process.argv[2] || 20);
const SCEN = { gut: { lat: 20, jit: 5, loss: 0 }, mobil: { lat: 50, jit: 25, loss: 0.02 }, schlecht: { lat: 90, jit: 45, loss: 0.06 } };
const pick = process.env.NET ? process.env.NET.split(",") : Object.keys(SCEN);
const { chromium } = await import("playwright").catch(() => import(process.env.PW_MODULE || "/opt/npm-tools/node_modules/playwright/index.mjs"));
const MOCK = fileURLToPath(new URL("../tests/e2e/mockpeer.js", import.meta.url));

async function scenario(name, n, browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 560 } });
  await ctx.addInitScript(n2 => { window.__mockNet = n2; }, n);
  await ctx.addInitScript({ path: MOCK });
  await ctx.addInitScript(() => { if (!sessionStorage.getItem("s")) { localStorage.setItem("kopfball-duell-save-v2", JSON.stringify({ tutorial: true, daily: { last: new Date().toISOString().slice(0, 10), streak: 1 } })); sessionStorage.setItem("s", 1); } });
  await ctx.route("**/vendor/peerjs.min.js", r => r.fulfill({ body: "", contentType: "text/javascript" }));
  const errs = [];
  ctx.on("weberror", e => errs.push(String(e.error())));
  const H = await ctx.newPage(); await H.goto(url + "/index.html"); await H.waitForTimeout(1500);
  await H.evaluate(async () => (await import("/js/ui/screens/online.js")).openOnline());
  await H.click("#btnHost"); await H.waitForTimeout(500);
  const code = (await H.textContent("#lobbyCode")).trim();
  const G = await ctx.newPage(); await G.goto(url + "/index.html?join=" + code); await G.waitForTimeout(2500);
  // Feste Eingabemuster statt Tastatur (Host Spieler 0, Gast Spieler 1)
  for (const [p, seed, idx] of [[H, 11, 0], [G, 29, 1]]) {
    await p.evaluate(async ([sd, i]) => {
      const sv = await import("/js/app/services.js"), di = await import("/js/adapters/input/dom-input.js");
      let s = sd, left = 0, cur = {}; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      let last = performance.now();
      sv.provide({ input: { ...di, getInput: (who) => {
        if (who !== i) return {};
        const now = performance.now(); left -= (now - last) / 1000; last = now;
        if (left <= 0) { left = 0.15 + rnd() * 0.5; const x = rnd(); cur = { l: x < 0.4, r: x > 0.55, j: rnd() < 0.25, k: rnd() < 0.3 }; }
        return cur;
      } } });
    }, [seed, idx]);
  }
  await H.bringToFront(); await H.click("#btnLobbyStart"); await H.waitForTimeout(3600);
  if (process.env.DEBUG) console.error(await G.evaluate(() => JSON.stringify({ mode: window.__kd.mode, scr: window.__kd.screen, snaps: window.__kd.snaps.length, ph: window.__kd.st && window.__kd.st.ph, seq: window.__kd.lastSeq, bytes: window.__mockBytes })), await H.evaluate(() => JSON.stringify({ mode: window.__kd.mode, ph: window.__kd.st.ph, bytes: window.__mockBytes })));
  // Aufzeichnen (Zeit = gemeinsame Uhr: timeOrigin + now)
  for (const p of [H, G]) await p.evaluate(() => {
    window.__rec = []; window.__mockBytes.conn = 0; window.__mockBytes.fast = 0;
    const f = () => { const st = window.__kd.st; if (st && st.ph === "play") window.__rec.push([performance.timeOrigin + performance.now(), st.b.x, st.b.y, st.p[0].x, st.p[0].y, st.p[1].x, st.p[1].y]); requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  // Goldenes Tor / Ende vermeiden: Uhr des Hosts immer wieder zurückstellen, Tore egal
  const t0 = Date.now();
  while (Date.now() - t0 < SECS * 1000) { await H.evaluate(() => { const st = window.__kd.st; if (st.t < 20) st.t = 60; }); await H.waitForTimeout(1000); }
  const [h, g] = await Promise.all([H, G].map(p => p.evaluate(() => ({ rec: window.__rec, bytes: { ...window.__mockBytes } }))));
  await ctx.close();
  if (errs.length) console.error("Fehler im Browser:", errs.slice(0, 5));
  if (!g.rec.length) throw new Error("Gast hat nichts aufgezeichnet");
  return { name, ...metrics(h.rec, g.rec), bytes: Math.round((h.bytes.conn + h.bytes.fast + g.bytes.conn + g.bytes.fast) / SECS) };
}

// Host-Verlauf an Zeit t (linear zwischen Bildern)
function at(rec, t, col) {
  let lo = 0, hi = rec.length - 1; if (t <= rec[0][0] || t >= rec[hi][0]) return null;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (rec[m][0] <= t) lo = m; else hi = m; }
  const a = rec[lo], b = rec[hi], k = (t - a[0]) / (b[0] - a[0]);
  return [a[col] + (b[col] - a[col]) * k, a[col + 1] + (b[col + 1] - a[col + 1]) * k];
}
function err(h, g, lag, col) {
  let s = 0, n = 0, jumps = 0;
  for (const r of g) { const q = at(h, r[0] - lag, col); if (!q) continue; const e = Math.hypot(r[col] - q[0], r[col + 1] - q[1]); s += e; n++; if (e > 60) jumps++; }
  return { mean: n ? s / n : 999, jumps, n };
}
function metrics(h, g) {
  let best = { lag: 0, mean: 1e9 };
  for (let lag = 0; lag <= 400; lag += 5) { const e = err(h, g, lag, 1); if (e.mean < best.mean) best = { lag, ...e }; }
  const own = err(h, g, 0, 5);
  const mins = (g.at(-1)[0] - g[0][0]) / 60000;
  return { ballLag: best.lag, ballErr: +best.mean.toFixed(1), jumpsPerMin: Math.round(best.jumps / mins), ownErr: +own.mean.toFixed(1), frames: g.length };
}

const { server, url } = await serve(0);
const browser = await chromium.launch();
const out = [];
for (const k of pick) { const r = await scenario(k, SCEN[k], browser, url); out.push(r); console.log(JSON.stringify(r)); }
await browser.close(); server.close();
console.log("\nNetz       Ball-Verzug  Ball-Fehler  Sprünge/min  Eigener Kopf  Daten");
for (const r of out) console.log(`${r.name.padEnd(10)} ${String(r.ballLag).padStart(7)} ms ${String(r.ballErr).padStart(9)} px ${String(r.jumpsPerMin).padStart(10)} ${String(r.ownErr).padStart(10)} px ${String(Math.round(r.bytes / 1024 * 10) / 10).padStart(6)} KB/s`);
