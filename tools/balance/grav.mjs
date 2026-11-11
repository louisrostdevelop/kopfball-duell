// Balance-Werkzeug (kein Test): node tools/balance/grav.mjs [Varianten] [Spiele] [Arenen] [Verzögerung]
// Schwerkraft-Varianten: Spielfluss + Reaktions-Test (Bot mit Verzögerung wie ein Mensch am Handy)
const P = await import("../../js/core/physics.js");
const { makeBrain, brainInput } = await import("../../js/core/bot/brain.js");
const C = await import("../../js/content/config.js");
const baseK = { ...P.KICK }, baseA = { ...P.AIR };
const VARIANTS = {
  "V0_jetzt":     {},
  "A_1.1":        { tp: 1.1, tb: 1.1 },
  "B_1.2":        { tp: 1.2, tb: 1.2 },
  "C_1.3":        { tp: 1.3, tb: 1.3 },
  "F_1.2_cap24":  { tp: 1.2, tb: 1.2, cap: 2400 },
  "G_p1.25_b1.15": { tp: 1.25, tb: 1.15 },
  "H_p1.15_b1.25": { tp: 1.15, tb: 1.25 },
  "I_1.3_cap24":  { tp: 1.3, tb: 1.3, cap: 2400 },
  "J_V0_cap24":   { cap: 2400 },
  "L_cap22":      { cap: 2200 },
  "N_nurBall1.2": { tb: 1.2 },
  "O_nurSpieler1.2": { tp: 1.2 },
  "P_b1.25_s1.15": { tp: 1.15, tb: 1.25 },
  "P_mond0.6":     { tp: 1.15, tb: 1.25, moonG: 0.6 },
  "P_mond0.65":    { tp: 1.15, tb: 1.25, moonG: 0.65 },
  "Q_b1.2_s1.15":  { tp: 1.15, tb: 1.2 },
};
const only = process.argv[2] ? process.argv[2].split(",") : Object.keys(VARIANTS);
const N = +(process.argv[3] || 16);
const arenas = (process.argv[4] || "stadion,strand,neon,eis").split(",");
const LAG = +(process.argv[5] || 0.15);
const DT = 1 / 60;
const chars = [["kalle", "yuki"], ["tank", "rocco"], ["bolt", "flummi"], ["nala", "max"]];

function play(k, arena, lagSide) {
  const diffs = lagSide >= 0 ? [2, 2] : [[1, 1], [2, 2], [1, 2], [3, 2]][k % 4];
  // Bot im Physikschritt; die verzögerte Seite rechnet ihr Bot außerhalb (einmal je Bild), ihre Eingaben kommen LAG s später an
  const st = P.newMatch({ chars: chars[k % 4], arena, dur: 90, pus: true, golden: false, seed: 900 + k, bots: diffs.map((d, i) => (i === lagSide ? null : d)) });
  const ext = lagSide >= 0 ? makeBrain(lagSide, diffs[lagSide], 900 + k) : null;
  const q = [];
  const lagN = Math.round(LAG / DT);
  let acc = 0, t = 0;
  const m = { goals: [0, 0], spdSum: 0, spdN: 0, sp: [], air: 0, kicks: 0, heads: 0, over: 0, stalls: 0, stallT: 0, pops: 0, touches: 0, win: [], jumps: 0, jAir: [], kinds: {} };
  const jt = [null, null], prevIn = [false, false];
  let shot = null;
  while (st.ph !== "end" && t < 200) {
    t += DT;
    const inp = [{}, {}];
    if (ext) { q.push(brainInput(st, ext, DT)); inp[lagSide] = q.length > lagN ? q.shift() : {}; }
    acc = P.advance(st, DT, inp, acc);
    const b = st.b, sp = Math.hypot(b.vx, b.vy);
    if (st.ph === "play") {
      m.spdSum += sp; m.spdN++; m.sp.push(sp);
      if (b.y + b.r < 0) m.air++; if (b.y - b.r <= -259) m.ceil = (m.ceil || 0) + DT; if (b.y + b.r >= C.G - 1) m.ground = (m.ground || 0) + 1;
      if (sp < 120) { m.stallT += DT; if (m.stallT > 1.5) { m.stalls++; m.stallT = -999; } } else m.stallT = 0;
      // Ball fliegt übers Tor (über der Latte in den Torbereich)
      for (let s = 0; s < 2; s++) {
        const inZone = (s ? b.x > C.W - C.GOAL_W : b.x < C.GOAL_W) && b.y < P.barY(st, s);
        if (inZone && !prevIn[s]) m.over++;
        prevIn[s] = inZone;
      }
      // Reaktionsfenster: Schuss Richtung Tor des Gegners -> Zeit bis der Ball beim Verteidiger ist
      if (shot) {
        shot.t += DT; const d = st.p[shot.def];
        if ((b.x - d.x) * shot.dir >= 0 || shot.t > 3) { if (shot.t <= 3) m.win.push(shot.t); shot = null; }
      }
    }
    for (const p of st.p) { if (!p.onG && jt[p.i] === null) jt[p.i] = t; if (p.onG && jt[p.i] !== null) { const d = t - jt[p.i]; if (d > 0.2) m.jAir.push(d); jt[p.i] = null; } }
    for (const e of st.ev.splice(0)) {
      if (e.t === "head") { m.heads++; m.touches++; }
      if (e.t === "kick") {
        m.kicks++; m.touches++; m.kinds[e.kind] = (m.kinds[e.kind] || 0) + 1;
        const sh = st.p[e.i], def = 1 - e.i, dir = sh.dir;
        if (Math.abs(b.vx) > 400 && Math.sign(b.vx) === dir && (st.p[def].x - b.x) * dir > 150) shot = { t: 0, def, dir };
      }
      if (e.t === "pop") m.pops++;
    }
  }
  m.score = [...st.s];
  return m;
}
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const pct = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length * p)]; };
console.log(`${N} Spiele je Variante, Arenen ${arenas.join("/")}, Lag ${LAG}s`);
console.log("Variante        Tore  Tempo  p90  Oben% Boden%  Schüsse Kopf  Drüber Stillst Pops  Sprung-s  Fenster med/p10  | Lag-Bot Torant. | Lupf% Volley%");
for (const name of only) {
  const v = VARIANTS[name];
  Object.assign(P.KICK, baseK, Object.fromEntries(Object.entries(v).filter(([k]) => k in baseK)));
  C.arenaById("mond").g = v.moonG || 0.5;
  Object.assign(P.AIR, baseA, { tp: v.tp ?? 1, tb: v.tb ?? 1 });
  const R = [], L = [];
  for (let k = 0; k < N; k++) R.push(play(k, arenas[k % arenas.length], -1));
  for (let k = 0; k < N; k++) L.push(play(k, arenas[k % arenas.length], k % 2));
  const sum = f => R.reduce((x, r) => x + f(r), 0);
  const sps = R.flatMap(r => r.sp), wins = R.flatMap(r => r.win), jA = R.flatMap(r => r.jAir);
  let lagG = 0, allG = 0; L.forEach((r, k) => { const ls = k % 2; lagG += r.score[ls]; allG += r.score[0] + r.score[1]; });
  const kinds = {}; R.forEach(r => { for (const k in r.kinds) kinds[k] = (kinds[k] || 0) + r.kinds[k]; });
  const kt = sum(r => r.kicks);
  console.log([
    name.padEnd(15),
    (sum(r => r.score[0] + r.score[1]) / N).toFixed(1).padStart(4),
    (sum(r => r.spdSum) / sum(r => r.spdN)).toFixed(0).padStart(6), pct(sps, 0.9).toFixed(0).padStart(5),
    (sum(r => r.air) / sum(r => r.spdN) * 100).toFixed(0).padStart(5) + "%", (sum(r => r.ground || 0) / sum(r => r.spdN) * 100).toFixed(0).padStart(5) + "%",
    (kt / N).toFixed(0).padStart(7), (sum(r => r.heads) / N).toFixed(0).padStart(5),
    (sum(r => r.over) / N).toFixed(1).padStart(7), (sum(r => r.stalls) / N).toFixed(1).padStart(7), (sum(r => r.pops) / N).toFixed(1).padStart(5),
    avg(jA).toFixed(2).padStart(9),
    (pct(wins, 0.5).toFixed(2) + "/" + pct(wins, 0.1).toFixed(2)).padStart(16),
    " |", ((lagG / Math.max(1, allG)) * 100).toFixed(0).padStart(7) + "%  ", (allG / N).toFixed(1).padStart(5),
    " |", ((kinds.lob || 0) / kt * 100).toFixed(0).padStart(4) + "%", ((kinds.volley || 0) / kt * 100).toFixed(0).padStart(6) + "%",
  ].join(" "));
}
