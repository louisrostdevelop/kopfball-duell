// Bot-Messlabor (kein Test): node tools/botlab.mjs [Paarungen] [Spiele] [Optionen]
// Paarung "A-B": A spielt links, B rechts. Spieler: new0..new3 (Bot), keeper (Bot als Torwart wie im Training, Stufe
// Mittel), camper, rusher, juggler, slider, climber (einfache Skript-Gegner). Beispiel: node tools/botlab.mjs camper-new3,rusher-keeper 20
// Optionen: --arena=stadion --obs=0 (Layout-Nummer) --len=90 --pu=1 --json (Rohdaten)
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../js/", import.meta.url);
const NAMES = ["Leicht", "Mittel", "Schwer", "Profi"];
const label = s => s.replace(/^new(\d)$/, (_, n) => "Bot " + NAMES[n]).replace(/^keeper$/, "Torwart");

if (isMainThread) {
  const args = process.argv.slice(2), opt = Object.fromEntries(args.filter(a => a.startsWith("--")).map(a => { const [k, v] = a.slice(2).split("="); return [k, v ?? "1"]; }));
  const pos = args.filter(a => !a.startsWith("--"));
  const pairs = (pos[0] || "camper-new3,rusher-new3,new3-new2,new2-new1,new1-new0,rusher-keeper").split(",");
  const N = +(pos[1] || 12);
  const jobs = []; for (const pair of pairs) for (let k = 0; k < N; k++) jobs.push({ pair, k });
  const res = {}; let next = 0, done = 0;
  const workers = Math.min(availableParallelism(), jobs.length);
  await new Promise(resolve => {
    for (let w = 0; w < workers; w++) {
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { opt } });
      const feed = () => { if (next < jobs.length) wk.postMessage(jobs[next++]); else wk.terminate(); };
      wk.on("message", m => { (res[m.pair] ||= []).push(m); done++; if (done === jobs.length) resolve(); feed(); });
      wk.on("error", e => { console.error(e); process.exit(1); });
      feed();
    }
  });
  if (opt.json) { console.log(JSON.stringify(res)); process.exit(0); }
  console.log(`Arena ${opt.arena || "stadion"}, ${N} Spiele je Paarung à ${opt.len || 90} s\n`);
  console.log("Paarung".padEnd(28) + "Siege L:R   Tore L:R    o.Anst. L:R  Anstoß  ET L/R (selbst)    peinl. R  Wechsel/min R  µs/Schritt");
  for (const pair of pairs) {
    const r = res[pair], n = r.length, sum = f => r.reduce((a, m) => a + f(m), 0);
    const w = sum(m => m.s[0] > m.s[1]), l = sum(m => m.s[0] < m.s[1]), g = sum(m => m.s[0] + m.s[1]);
    const [a, b] = pair.split("-").map(label);
    console.log(`${(a + " – " + b).padEnd(28)}${String(w).padStart(3)}:${String(l).padEnd(5)}  ${(sum(m => m.s[0]) / n).toFixed(1).padStart(4)}:${(sum(m => m.s[1]) / n).toFixed(1).padEnd(5)}  ${(sum(m => m.s[0] - m.koS[0]) / n).toFixed(1).padStart(4)}:${(sum(m => m.s[1] - m.koS[1]) / n).toFixed(1).padEnd(5)}  ${String(Math.round(100 * sum(m => m.ko) / Math.max(1, g))).padStart(4)} %  ${(sum(m => m.own[0]) / n).toFixed(1)}/${(sum(m => m.own[1]) / n).toFixed(1)} (${(sum(m => m.self[0]) / n).toFixed(1)}/${(sum(m => m.self[1]) / n).toFixed(1)})  ${(sum(m => m.emb[1]) / n).toFixed(1).padStart(5)}     ${(sum(m => m.sw[1]) / n).toFixed(1).padStart(5)}        ${(sum(m => m.us[1]) / n).toFixed(1)}`);
  }
  if (opt.detail) for (const pair of pairs) {
    const r = res[pair], add = (arr, k) => { const o = {}; for (const m of r) for (const [kk, v] of Object.entries(m[arr][k])) o[kk] = (o[kk] || 0) + v; return Object.entries(o).map(([kk, v]) => kk + " " + (v / r.length).toFixed(1)).join(", "); };
    console.log(`  ${pair}: Tore L [${add("kinds", 0)}] R [${add("kinds", 1)}] · Anstoß-Tore L/R ${(r.reduce((a, m) => a + m.koS[0], 0) / r.length).toFixed(1)}/${(r.reduce((a, m) => a + m.koS[1], 0) / r.length).toFixed(1)} · peinlich R [${add("embK", 1)}]`);
  }
  console.log("\nET = Eigentore (letzte Berührung vor dem Gegentor), peinl. = peinliche Momente des rechten Spielers je Spiel");
} else {
  const Wd = await import(new URL("core/bot/world.js", ROOT)), P = await import(new URL("core/physics.js", ROOT)), C = await import(new URL("content/config.js", ROOT));
  const { opt } = workerData, DT = 1 / 60;
  const CH = ["kalle", "tank", "bolt", "nala", "yuki", "rocco", "flummi", "max", "tina", "magnus"];
  // Skript-Gegner (wie einfache menschliche Spielweisen)
  const scripts = {
    rusher: i => { let kt = 0, jt = 0; return st => { const p = st.p[i], b = st.b, d = p.dir, c = {}; const tx = b.x - d * 70; if (tx > p.x + 12) c.r = true; else if (tx < p.x - 12) c.l = true; kt -= DT; jt -= DT; const dx = (b.x - p.x) * d, dist = Math.hypot(b.x - p.x, b.y - p.y); if (dx > -5 && dist < 150 && kt <= 0) { c.k = true; kt = 0.35; } if (Math.abs(b.x - p.x) < 90 && b.y < p.y - 60 && b.y > p.y - 260 && p.onG && jt <= 0) { c.j = true; jt = 0.6; } return c; }; },
    camper: i => { let kt = 0, jt = 0; return st => { const p = st.p[i], b = st.b, own = i ? C.W : 0, d = p.dir, c = {}; const home = own + d * (C.GOAL_W + 60); if (home > p.x + 12) c.r = true; else if (home < p.x - 12) c.l = true; kt -= DT; jt -= DT; if (Math.abs(b.x - p.x) < 150 && (b.x - p.x) * d > -5 && kt <= 0) { c.k = true; kt = 0.3; } if (Math.abs(b.x - p.x) < 140 && b.y < p.y - 50 && p.onG && jt <= 0) { c.j = true; jt = 0.5; } return c; }; },
    juggler: i => { let jt = 0; return st => { const p = st.p[i], b = st.b, d = p.dir, c = {}; const tx = b.x - d * 18; if (tx > p.x + 8) c.r = true; else if (tx < p.x - 8) c.l = true; jt -= DT; if (Math.abs(b.x - p.x) < 60 && b.y < p.y - 40 && b.vy > 0 && p.onG && jt <= 0) { c.j = true; jt = 0.25; } return c; }; },
    slider: i => { let st0 = 0, kt = 0; return st => { const p = st.p[i], b = st.b, d = p.dir, c = {}; const tx = b.x - d * 160; if (tx > p.x + 12) c.r = true; else if (tx < p.x - 12) c.l = true; st0 -= DT; kt -= DT; const ah = (b.x - p.x) * d; if (b.y > C.G - 80 && ah > 60 && ah < 220 && st0 <= 0) { c.d = true; st0 = 0.8; } if (ah > -5 && Math.hypot(b.x - p.x, b.y - p.y) < 140 && kt <= 0) { c.k = true; kt = 0.4; } return c; }; },
    climber: i => { let jt = 0, kt = 0; return st => { const p = st.p[i], b = st.b, d = p.dir, c = {}; const tx = b.x - d * 50; if (tx > p.x + 12) c.r = true; else if (tx < p.x - 12) c.l = true; jt -= DT; kt -= DT; if (b.y < p.y - 30 && Math.abs(b.x - p.x) < 200 && p.onG && jt <= 0) { c.j = true; jt = 0.4; } if (Math.hypot(b.x - p.x, b.y - p.y) < 140 && kt <= 0) { c.k = true; kt = 0.3; } return c; }; },
  };
  const ctrl = (name, i) => (/^new\d$|^keeper$/.test(name) ? null : scripts[name](i));   // Bot: läuft im Physikschritt
  const play = (pair, k) => {
    const names = pair.split("-"), lv = names.map(n => (n === "keeper" ? { level: 1, keeper: true } : (/^new(\d)$/.exec(n) || [])[1]));
    const st = P.newMatch({ chars: [CH[k % CH.length], CH[(k + 3) % CH.length]], arena: opt.arena || "stadion", dur: +(opt.len || 90), pus: opt.pu !== "0", golden: false, rules: opt.obs !== undefined ? { obs: +opt.obs } : {}, seed: 1000 + k * 7, bots: lv.map(x => (x === undefined ? null : typeof x === "object" ? x : +x)) });
    const f = names.map((n, i) => ctrl(n, i));
    const m = { pair, s: [0, 0], ko: 0, koS: [0, 0], own: [0, 0], self: [0, 0], emb: [0, 0], embK: [{}, {}], kinds: [{}, {}], sw: [0, 0], us: [0, 0] };
    let acc = 0, t = 0, koT = 0, steps = 0, us = 0;
    const idle = [0, 0], wall = [0, 0], inGoal = [0, 0];
    const lastIn = [{}, {}], touchSnap = [null, null], jumps = [];
    while (st.ph !== "end" && t < 400) {
      t += DT;
      const inp = f.map(g => (g ? g(st) : {}));
      lastIn[0] = inp[0]; lastIn[1] = inp[1];
      const pre = { ...st.b }, preLt = st.b.lt;
      const t0 = st.bot ? performance.now() : 0;
      acc = P.advance(st, DT, inp, acc);
      if (st.bot) { us += performance.now() - t0; steps++; }
      // Berührung: Ballstand davor merken (für echte Eigentore: wäre er ohne die Berührung auch reingegangen?)
      if (st.b.lt !== preLt && st.b.lt >= 0) touchSnap[st.b.lt] = pre;
      if (st.ph === "play") koT += DT; else if (st.ph === "ko" || st.ph === "cd") koT = 0;
      for (const e of st.ev.splice(0)) {
        if (e.t === "goal") { m.s[e.i]++; if (koT < 3) { m.ko++; m.koS[e.i]++; } if (e.kind === "own") { const x = 1 - e.i; m.own[x]++; const sn = touchSnap[x]; if (sn && Wd.ballPath(Wd.ballEnv(st), sn, 2, 1 / 60).goal !== e.i) m.self[x]++; } m.kinds[e.i][e.kind] = (m.kinds[e.i][e.kind] || 0) + 1; }
        if (e.t === "jump") jumps.push({ i: e.i, t: 0, near: false });   // sinnloser Sprung: Ball kommt in 0,8 s nicht in Kopfnähe
      }
      for (const j of jumps) { const p = st.p[j.i]; j.t += DT; if (Math.hypot(st.b.x - p.x, st.b.y - p.y) < C.HR * p.sc + st.b.r + 90) j.near = true; }
      for (let n = jumps.length - 1; n >= 0; n--) if (jumps[n].t > 0.8) { const j = jumps.splice(n, 1)[0]; if (!j.near) { m.emb[j.i] += 0.5; m.embK[j.i].jump = (m.embK[j.i].jump || 0) + 0.5; } }
      if (st.ph !== "play") continue;
      st.p.forEach((p, i) => {
        const b = st.b, r = C.HR * p.sc, own = i ? C.W : 0;
        // steht, obwohl der Ball frei und ruhig in Reichweite liegt
        const free = Math.hypot(b.x - p.x, b.y - p.y) < r * 2.6 && Math.hypot(b.vx, b.vy) < 150 && Math.abs(p.vx) < 20;
        idle[i] = free ? idle[i] + DT : 0; if (idle[i] > 1.5) { m.emb[i]++; m.embK[i].idle = (m.embK[i].idle || 0) + 1; idle[i] = -99; }
        const atWall = (p.x < r + 3 && lastIn[i].l) || (p.x > C.W - r - 3 && lastIn[i].r);
        wall[i] = atWall ? wall[i] + DT : 0; if (wall[i] > 0.6) { m.emb[i]++; m.embK[i].wall = (m.embK[i].wall || 0) + 1; wall[i] = -99; }
        const stuck = Math.abs(p.x - own) < C.GOAL_W && (b.x - C.W / 2) * (i ? -1 : 1) > 0;
        inGoal[i] = stuck ? inGoal[i] + DT : 0; if (inGoal[i] > 2) { m.emb[i]++; m.embK[i].goal = (m.embK[i].goal || 0) + 1; inGoal[i] = -99; }
      });
    }
    if (st.bot) st.bot.forEach((B, i) => { if (B) m.sw[i] = B.switches / (st.el / 60); });
    m.us = [0, steps ? +((us / steps) * 1000 / 2).toFixed(1) : 0];   // µs je Physikschritt inkl. Physik
    return m;
  };
  parentPort.on("message", j => parentPort.postMessage(play(j.pair, j.k)));
}
