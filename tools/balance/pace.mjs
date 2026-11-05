// Balance-Werkzeug (kein Test): node tools/balance/pace.mjs [Varianten] [Spiele] [Arenen] [Regeln-JSON]
// Vergleich von Ball-Tempo-Varianten über viele Computer-Spiele
const P = await import("../../js/core/physics.js");
const AI = await import("../../js/core/ai.js");
const C = await import("../../js/content/config.js");
const base = { ...P.KICK };
const VARIANTS = {
  A_alt:          { memClassify: false, hsMode: "all", carryMode: "none", carry: 0, softCap: false, driveVy: 470 },
  Z_final:        {},
  P_old19:        { tap: 1050, chargeAdd: 480, cap: 1900, swing: 0.24, hitFrom: 0.06, power: 99999 },
  P_mid:          { tap: 1250, chargeAdd: 900, cap: 2400 },
  P_flat:         { driveVy: 380, driveCharge: 220 },
  P_capLow:       { cap: 2400 },
  Z_roll8:        { rollFric: 8 },
  Z_roll22:       { rollFric: 22 },
  Z_altRoll:      { rollFric: 120 },
  B_gedaechtnis:  { memClassify: true },
  C_kurzStand:    { memClassify: true, hsMode: "hard" },
  D_add30:        { memClassify: true, hsMode: "hard", carryMode: "add", carry: 0.3 },
  E_add45:        { memClassify: true, hsMode: "hard", carryMode: "add", carry: 0.45 },
  F_add60:        { memClassify: true, hsMode: "hard", carryMode: "add", carry: 0.6 },
  G_max90:        { memClassify: true, hsMode: "hard", carryMode: "max", carry: 0.9 },
  H_add45flach:   { memClassify: true, hsMode: "hard", carryMode: "add", carry: 0.45, driveVy: 400 },
  I_add45weich:   { memClassify: true, hsMode: "hard", carryMode: "add", carry: 0.45, softCap: true },
  J_add40weichF:  { memClassify: true, hsMode: "hard", carryMode: "add", carry: 0.4, softCap: true, driveVy: 430 },
  K_add55weich:   { memClassify: true, hsMode: "hard", carryMode: "add", carry: 0.55, softCap: true },
  L_add40keinSt:  { memClassify: true, hsMode: "none", carryMode: "add", carry: 0.4, softCap: true, driveVy: 430 },
};
const only = process.argv[2] ? process.argv[2].split(",") : Object.keys(VARIANTS);
const N = +(process.argv[3] || 10);
const arenas = (process.argv[4] || "stadion").split(",");
const rules = process.argv[5] ? JSON.parse(process.argv[5]) : {};
const DT = 1 / 60;
function play(seedIdx, arena) {
  const st = P.newMatch({ chars: [["kalle", "tank", "bolt", "nala"][seedIdx % 4], ["yuki", "rocco", "flummi", "max"][seedIdx % 4]], arena, dur: 90, pus: true, golden: false, rules });
  const diffs = [[1, 1], [2, 2], [1, 2], [3, 2]][seedIdx % 4];
  const a = [AI.makeAI(0, diffs[0]), AI.makeAI(1, diffs[1])];
  let acc = 0, t = 0;
  const m = { goals: 0, own: 0, spdSum: 0, spdN: 0, fast: 0, kicks: 0, heads: 0, ratio: [], drop: 0, capHit: 0, lobFast: 0, stalls: 0, stallT: 0, post: [], kinds: {}, maxSpd: 0, hsTime: 0 };
  const pending = [];
  const lim = P.KICK.cap * C.arenaById(arena).maxB * Math.max(1, (rules.kick || 1));
  while (st.ph !== "end" && t < 200) {
    t += DT;
    const hs0 = st.hs;
    acc = P.advance(st, DT, [AI.aiInput(a[0], st, DT), AI.aiInput(a[1], st, DT)], acc);
    if (hs0 > 0) m.hsTime += DT;
    const sp = Math.hypot(st.b.vx, st.b.vy);
    if (st.ph === "play") {
      m.spdSum += sp; m.spdN++; if (sp > 1000) m.fast++; m.maxSpd = Math.max(m.maxSpd, sp);
      if (sp < 120) { m.stallT += DT; if (m.stallT > 1.5) { m.stalls++; m.stallT = -999; } } else m.stallT = 0;
    }
    for (const q of pending) { q.t -= DT; if (q.t <= 0 && !q.done) { q.done = true; m.post.push(sp / Math.max(1, q.out)); } }
    for (const e of st.ev.splice(0)) {
      if (e.t === "goal") { m.goals++; if (e.kind === "own") m.own++; }
      if (e.t === "head") m.heads++;
      if (e.t === "kick") {
        m.kicks++; m.kinds[e.kind] = (m.kinds[e.kind] || 0) + 1;
        if (e.inSpd > 600) { m.ratio.push(e.spd / e.inSpd); if (e.spd < e.inSpd) m.drop++; }
        if (e.spd >= lim * 0.97) m.capHit++;
        if (e.kind === "lob" && e.inSpd > 600) m.lobFast++;
        pending.push({ t: 0.25, out: e.spd });
      }
    }
  }
  return m;
}
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
console.log(`${N} Spiele je Variante, Arenen ${arenas.join("/")}, Regeln ${JSON.stringify(rules)}`);
console.log("Variante        Tore Eigen  Tempo  >1000  Schüsse Kopf  aus/ein  langsamer  nach0,25s  amLimit  LupferSchnell Stillst  Standbild");
for (const name of only) {
  Object.assign(P.KICK, base, VARIANTS[name]);
  const R = [];
  for (let k = 0; k < N; k++) R.push(play(k, arenas[k % arenas.length]));
  const sum = f => R.reduce((x, r) => x + f(r), 0);
  const kicks = sum(r => r.kicks), ratios = R.flatMap(r => r.ratio), posts = R.flatMap(r => r.post);
  const row = [
    name.padEnd(15),
    (sum(r => r.goals) / N).toFixed(1).padStart(4), (sum(r => r.own) / N).toFixed(1).padStart(5),
    (sum(r => r.spdSum) / sum(r => r.spdN)).toFixed(0).padStart(6), ((sum(r => r.fast) / sum(r => r.spdN)) * 100).toFixed(0).padStart(5) + "%",
    (kicks / N).toFixed(0).padStart(7), (sum(r => r.heads) / N).toFixed(0).padStart(5),
    avg(ratios).toFixed(2).padStart(8), ((sum(r => r.drop) / Math.max(1, ratios.length)) * 100).toFixed(0).padStart(9) + "%",
    avg(posts).toFixed(2).padStart(10), ((sum(r => r.capHit) / kicks) * 100).toFixed(0).padStart(8) + "%",
    (sum(r => r.lobFast) / N).toFixed(1).padStart(13), (sum(r => r.stalls) / N).toFixed(1).padStart(8),
    (sum(r => r.hsTime) / N).toFixed(1).padStart(9) + "s",
  ];
  console.log(row.join(" "));
}
