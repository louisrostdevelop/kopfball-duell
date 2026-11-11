// Balance-Werkzeug (kein Test): node tools/balance/hw.mjs [Varianten]   (NB=Anzahl Flanken)
// Kopfball gegen anfliegende Bälle: wie viel Zeit bleibt zum Reagieren und wie genau muss man timen?
// Ball startet bei t=0 (= Gegner hat ihn gerade berührt). Für jeden Absprung-Zeitpunkt prüfen, ob ein Kopfball nach vorne gelingt.
// "Reaktion" = spätester Absprung, der noch klappt (so lange hat man Zeit, den Ball zu lesen). "Fenster" = wie viele ms Absprung klappen.
const P = await import("../../js/core/physics.js");
const C = await import("../../js/content/config.js");
const M0 = { ...P.MOVE };
const VARIANTS = {
  jetzt:            { tp: 1, tb: 1 },
  "B1.25":          { tp: 1, tb: 1.25 },
  "B1.25 Sp1.1":    { tp: 1.1, tb: 1.25 },
  "B1.25 Scheitel": { tp: 1, tb: 1.25, apexG: 0.45, apexV: 300 },
  "B1.25 Fall1.0":  { tp: 1, tb: 1.25, fallG: 1.0 },
  "B1.25 Fall0.9":  { tp: 1, tb: 1.25, fallG: 0.9 },
  "B1.25 Sch+F1.0": { tp: 1, tb: 1.25, apexG: 0.45, apexV: 300, fallG: 1.0 },
  "B1.15":          { tp: 1, tb: 1.15 },
  "B1.35":          { tp: 1, tb: 1.35 },
  "Sp1.2":          { tp: 1.2, tb: 1 },
  "B1.25 Sp1.15":   { tp: 1.15, tb: 1.25 },
  "B1.25 Sp1.2":    { tp: 1.2, tb: 1.25 },
  "B1.2 Sp1.1":     { tp: 1.1, tb: 1.2 },
  "B1.2 Sp1.15":    { tp: 1.15, tb: 1.2 },
  "B1.2":           { tp: 1, tb: 1.2 },
  "B1.1 Sp1.15":    { tp: 1.15, tb: 1.1 },
  "B1.3 Sp1.15":    { tp: 1.15, tb: 1.3 },
  "Sp1.15":         { tp: 1.15, tb: 1 },
};
const only = process.argv[2] ? process.argv[2].split(",") : Object.keys(VARIANTS);
const DT = 1 / 120;
let rs = 7; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
const balls = [];
for (let i = 0; i < +(process.env.NB || 220); i++) balls.push({ dx: 300 + rnd() * 600, vx: -(350 + rnd() * 850), vy: -(150 + rnd() * 900), y: 300 + rnd() * 250 });
function trial(ball, tj, full, tb) {
  const st = P.newMatch({ chars: ["kalle", "yuki"], arena: "stadion", dur: 90, pus: false }); st.ph = "play"; st.pus = false;
  const p = st.p[0]; p.x = 500; st.p[1].x = C.W - 150;
  const b = st.b; b.x = p.x + ball.dx; b.y = ball.y; b.vx = ball.vx; b.vy = ball.vy / tb;
  let flew = false;
  for (let k = 0; k < Math.round(3 / DT); k++) {
    const t = k * DT;
    if (!p.onG) flew = true;
    const j = t >= tj && !(flew && p.onG) && (full ? t < tj + 1.2 : t < tj + 0.05); // nur ein Sprung, kein Nachhüpfen
    P.step(st, DT, [{ j }, {}]);
    for (const e of st.ev.splice(0)) if (e.t === "head" && e.i === 0) {
      for (let m = 0; m < 6; m++) P.step(st, DT, [{}, {}]);
      return b.vx > 150;
    }
    if (st.ph !== "play" || b.x < p.x - 120) return false;
  }
  return false;
}
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
console.log("Variante           braucht Sprung  treffbar   Fenster   Reaktionszeit (spätester Absprung)   flach/steil Reaktion");
for (const name of only) {
  const v = VARIANTS[name];
  P.AIR.tp = v.tp; P.AIR.tb = v.tb;
  Object.assign(P.MOVE, M0, Object.fromEntries(Object.entries(v).filter(([k]) => k in M0 || k === "apexV")));
  let need = 0; const win = [], late = [], lateF = [], lateS = [];
  for (const bl of balls) {
    if (trial(bl, 99, true, v.tb)) continue; // im Stand erreichbar
    need++;
    let hits = 0, last = -1;
    for (let tj = 0; tj < 2.4; tj += 0.01) if (trial(bl, tj, true, v.tb)) { hits++; last = tj; }
    if (hits) { win.push(hits * 10); late.push(last * 1000); (Math.abs(bl.vy) < 600 ? lateF : lateS).push(last * 1000); }
  }
  console.log(name.padEnd(18), String(need).padStart(8), String(win.length).padStart(10), (avg(win).toFixed(0) + " ms").padStart(10), (avg(late).toFixed(0) + " ms").padStart(16), "                    ", avg(lateF).toFixed(0).padStart(5), "/", avg(lateS).toFixed(0));
}
