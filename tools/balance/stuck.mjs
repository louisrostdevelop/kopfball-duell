// Balance-Werkzeug (kein Test): sucht Hindernis-Layouts, in denen der Ball lange liegt oder hängt
// Sucht in allen Layouts nach Situationen, in denen der Ball lange liegt oder ein Spieler festhängt
const P = await import("../../js/physics.js");
const AI = await import("../../js/ai.js");
const { LAYOUTS } = await import("../../js/layouts.js");
const N = +(process.argv[2] || 16);
for (const ar of (process.argv[3] ? process.argv[3].split(",") : Object.keys(LAYOUTS))) for (let li = 0; li < LAYOUTS[ar].length; li++) for (const field of [0.82, 1, 1.18]) {
  let worst = 0, where = "", onTop = 0, pStuck = 0, goals = 0;
  for (let k = 0; k < N; k++) {
    const st = P.newMatch({ chars: [["kalle", "tank", "bolt", "nala"][k % 4], ["yuki", "rocco", "flummi", "max"][k % 4]], arena: ar, dur: 90, pus: true, golden: false, rules: { obs: li, field } });
    const a = [AI.makeAI(0, 1 + (k % 2)), AI.makeAI(1, 1 + ((k + 1) % 2))]; let acc = 0, t = 0, slowT = 0, topT = 0; const still = [0, 0], last = [{}, {}];
    while (st.ph !== "end" && t < 140) {
      t += 1 / 60; acc = P.advance(st, 1 / 60, [AI.aiInput(a[0], st, 1 / 60), AI.aiInput(a[1], st, 1 / 60)], acc);
      for (const e of st.ev.splice(0)) if (e.t === "goal") goals++;
      if (st.ph !== "play") { slowT = 0; continue; }
      const sp = Math.hypot(st.b.vx, st.b.vy);
      if (sp < 60) { slowT += 1 / 60; if (slowT > worst) { worst = slowT; where = `b(${st.b.x.toFixed(0)},${st.b.y.toFixed(0)}) p0(${st.p[0].x.toFixed(0)},${st.p[0].y.toFixed(0)}) p1(${st.p[1].x.toFixed(0)},${st.p[1].y.toFixed(0)})`; } } else slowT = 0;
      const onPlat = st.obs.some(o => o.t === "plat" && st.b.x > o.x - o.w / 2 && st.b.x < o.x + o.w / 2 && Math.abs(st.b.y + st.b.r - o.y) < 3);
      if (onPlat) { topT += 1 / 60; onTop = Math.max(onTop, topT); } else topT = 0;
      st.p.forEach((p, i) => { if (Math.abs(p.x - (last[i].x ?? p.x)) < 0.01 && Math.abs(p.y - (last[i].y ?? p.y)) < 0.01 && Math.abs(st.b.x - p.x) > 300) still[i] += 1 / 60; else still[i] = 0; pStuck = Math.max(pStuck, still[i]); last[i] = { x: p.x, y: p.y }; });
    }
  }
  const flag = worst > 2.5 || onTop > 1.2 ? "  <-- prüfen" : "";
  console.log(`${ar.padEnd(8)} ${LAYOUTS[ar][li].name.padEnd(12)} Feld ${String(field).padEnd(4)} Tore ${(goals / N).toFixed(1).padStart(4)}  Ball liegt max ${worst.toFixed(1)} s  auf Plattform max ${onTop.toFixed(1)} s${flag}${worst > 2.5 ? "  " + where : ""}`);
}
