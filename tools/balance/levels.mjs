// Balance-Werkzeug (kein Test): Wie stark ist ein Kopf-Level? Computer gegen Computer, gleiche Schwierigkeit,
// gleiche Köpfe, Seiten getauscht. node tools/balance/levels.mjs [Spiele pro Level=200]
import { seedRandom } from "../../tests/lib/rng.mjs";
const P = await import("../../js/core/physics.js");
const N = +(process.argv[2] || 200), DT = 1 / 60, HEADS = ["kalle", "yuki", "bolt", "rocco", "tank", "nala"];
function game(i, lvA, lvB, swap) {
  seedRandom(5000 + i);
  const ch = HEADS[i % HEADS.length], lv = swap ? [lvB, lvA] : [lvA, lvB];
  const st = P.newMatch({ chars: [ch, ch], arena: "stadion", dur: 60, pus: true, golden: false, rules: {}, levels: lv, seed: 5000 + i, bots: [2, 2] });
  let acc = 0, f = 0;
  while (st.ph !== "end" && f < 60 * 80) { f++; acc = P.advance(st, DT, [{}, {}], acc); st.ev.length = 0; }
  const a = swap ? st.s[1] : st.s[0], b = swap ? st.s[0] : st.s[1];
  return a > b ? 1 : a < b ? 0 : 0.5;
}
for (const L of (process.env.LV || "1,4,7,10").split(",").map(Number)) {
  let w = 0; for (let i = 0; i < N; i++) w += game(i, L, 1, i % 2 === 1);
  console.log(`Level ${String(L).padStart(2)} gegen Level 1: ${(w / N * 100).toFixed(1)} % Punkte (Sieg 1, Remis 0,5)`);
}
