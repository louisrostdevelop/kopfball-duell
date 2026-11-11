// Vergleich alter gegen neuer Stand (kein Test): rechnen Bot und Spiel bitgenau gleich? Gedacht für Umbauten, die nur
// schneller werden sollen (z. B. world.js). Beide Stände spielen dieselben Spiele mit denselben Eingriffen; nach jedem
// 30. Schritt und am Ende muss hashState gleich sein (enthält st.bot mit Plan und Zufallsstrom, also jede Entscheidung).
// Dazu die Rechenzeit je Schritt, abwechselnd alt und neu auf demselben Stand.
//   git archive -o /tmp/alt.tar <rev> js && mkdir /tmp/alt && tar -xf /tmp/alt.tar -C /tmp/alt
//   node tools/botcmp.mjs /tmp/alt [Spiele je Modus] [Modi]
// Modi: fx (alle Feldwirkungen dauerhaft an, dazu alle 1–3 s ein erzwungenes Power-up), rnd (alle 1–3 s ein erzwungenes
// Power-up, oft mit Effet), many (Regel pu: many), nat (natürliche Kugeln, jedes 5. Spiel Ranked), obs (Hindernisse,
// Feldgrößen, erzwungene Power-ups). Stufen und Rollen wechseln (Profi, Leicht, Torwart, Mensch mit Zufallseingaben).
import { fileURLToPath } from "node:url";

const [oldRoot, nArg = "8", modeArg = "fx,rnd,many,nat,obs"] = process.argv.slice(2);
if (!oldRoot) { console.error("Aufruf: node tools/botcmp.mjs <Verzeichnis mit altem js/> [Spiele] [Modi]"); process.exit(2); }
const newRoot = fileURLToPath(new URL("..", import.meta.url));
const load = async r => ({
  P: await import(r + "/js/core/physics.js"), C: await import(r + "/js/content/config.js"),
  U: await import(r + "/js/core/sim/powerups.js"), R: await import(r + "/js/core/rollback.js"),
});
const A = await load(oldRoot), B = await load(newRoot);
const DT = A.C.STEP;
const CH = ["kalle", "tank", "bolt", "nala", "yuki", "rocco", "flummi", "max", "tina", "magnus"];
const ARENAS = A.C.ARENAS.map(a => a.id);
const LV = [[3, 3], [0, 3], [3, 1], [2, 2], [null, 3], [3, { level: 1, keeper: true }]];
let seed = 777;
const lcg = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const refresh = (M, st) => {
  st.floatT = 5; st.slow2 = [3, 3]; st.wind.t = 5; if (!st.portal) M.U.applyPu(st, 0, "portal", 0, 0);
  st.wall = [5, 5]; st.wallHp = [2, 2]; st.clone = [{ t: 6, hp: 2 }, { t: 6, hp: 2 }]; st.bigGoal = [6, 6];
};
const q = (x, p) => { const y = [...x].sort((u, v) => u - v); return y[Math.min(y.length - 1, Math.floor(y.length * p))]; };
const mean = x => x.reduce((u, v) => u + v, 0) / x.length;
const fmt = x => `Mittel ${(mean(x) * 1000).toFixed(0)} µs, p99 ${q(x, 0.99).toFixed(2)} ms, p99,9 ${q(x, 0.999).toFixed(2)} ms, max ${q(x, 1).toFixed(1)} ms`;
let bad = 0;
for (const [mi, mode] of modeArg.split(",").entries()) {
  const TA = [], TB = [];
  let steps = 0;
  for (let g = mi * 100; g < mi * 100 + +nArg; g++) {
    const rules = mode === "many" ? { pu: "many" } : mode === "obs" ? { obs: g % 3, ...(g % 2 ? { field: g % 4 === 1 ? 0.82 : 1.2 } : {}) } : {};
    const arena = (mode === "fx" || mode === "rnd") && g % 3 ? "stadion" : ARENAS[g % ARENAS.length];
    const o = { chars: [CH[g % 10], CH[(g + 3) % 10]], arena, dur: 40, pus: true, golden: mode !== "fx" && g % 2 === 0, fair: mode === "nat" && g % 5 === 4, rules, seed: 9000 + g * 31, bots: LV[g % LV.length] };
    const a = A.P.newMatch(o), b = B.P.newMatch(o);
    let next = 1 + lcg() * 2;
    while (a.ph !== "end" && a.el < 150) {
      if (a.ph === "play") {
        if (mode === "fx") { refresh(A, a); refresh(B, b); }
        if (mode !== "many" && mode !== "nat" && a.el >= next) {
          next = a.el + 1 + lcg() * 2;
          const k = A.C.PU_KEYS[Math.floor(lcg() * A.C.PU_KEYS.length)], i = lcg() < 0.5 ? 0 : 1;
          A.U.applyPu(a, i, k, a.b.x, a.b.y); B.U.applyPu(b, i, k, b.b.x, b.b.y);
          if (lcg() < 0.3) { a.b.spin = 1; b.b.spin = 1; }
        }
      }
      const r = lcg(), h = o.bots[0] === null ? { l: r < 0.3, r: r > 0.6, j: r > 0.9, k: r > 0.45 && r < 0.55 } : {};
      const t0 = performance.now(); A.P.step(a, DT, [{ ...h }, {}]); const t1 = performance.now(); B.P.step(b, DT, [{ ...h }, {}]); const t2 = performance.now();
      TA.push(t1 - t0); TB.push(t2 - t1); a.ev.length = 0; b.ev.length = 0; steps++;
      if (steps % 30 === 0 && A.R.hashState(a) !== B.R.hashState(b)) break;
    }
    if (A.R.hashState(a) !== B.R.hashState(b)) { bad++; console.log(`ABWEICHUNG ${mode} Spiel ${g} bei ${a.el.toFixed(3)} s`); }
  }
  console.log(`${mode}: ${nArg} Spiele, ${steps} Schritte; alt ${fmt(TA)}; neu ${fmt(TB)}; neu/alt ${(mean(TB) / mean(TA)).toFixed(2)}`);
}
console.log(bad ? `${bad} Abweichungen` : "alle Spiele bitgenau gleich");
process.exit(bad ? 1 : 0);
