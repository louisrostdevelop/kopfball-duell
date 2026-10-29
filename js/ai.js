// Computer-Gegner
import { W, G, GOAL_W, HR, KS, DIFFS, arenaById, charById, rand, clamp } from "./config.js";
import { gMul, pr } from "./physics.js";

export function makeAI(i, diff, keeper = false) {
  return { i, keeper, d: DIFFS[diff] || DIFFS[1], think: 0, tx: i ? W - 300 : 300, wantJ: 0, hold: 0, kickT: 0, sPress: false, err: 0, jcd: 0 };
}

function predict(st, steps, dt) {
  const b = st.b, ar = arenaById(st.arena), g = 1550 * gMul(st) * (b.fx ? 0.2 : 1);
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy; const r = b.r, out = [];
  for (let n = 0; n < steps; n++) {
    vy += g * dt; x += vx * dt; y += vy * dt;
    if (y + r > G) { y = G - r; vy = -vy * ar.bounce; vx *= ar.roll; }
    if (x - r < 0) { x = r; vx = -vx * 0.7; } if (x + r > W) { x = W - r; vx = -vx * 0.7; }
    out.push({ x, y, t: (n + 1) * dt });
  }
  return out;
}

export function aiInput(ai, st, dt) {
  const p = st.p[ai.i], o = st.p[1 - ai.i], b = st.b, d = ai.d, c = {};
  if (st.ph !== "play") { ai.hold = 0; return c; }
  const dir = p.dir, own = ai.i ? W : 0, r = pr(p);
  const sp = 470 * charById(p.ch).spd * arenaById(st.arena).spd * d.spd;
  if (ai.keeper) return keeperInput(ai, st, p, b, dt);
  ai.think -= dt; ai.jcd -= dt; ai.kickT -= dt;
  if (ai.think <= 0) {
    ai.think = d.react * rand(0.7, 1.3);
    ai.err = rand(-d.err, d.err);
    const path = predict(st, 70, 1 / 50);
    // Bedrohung fürs eigene Tor?
    const towardOwn = b.vx * -dir > 250;
    const nearOwn = Math.abs(b.x - own) < 560;
    let tx;
    // Abfangpunkt: erster Punkt, den ich rechtzeitig erreiche und der tief genug ist
    let ip = null;
    for (const q of path) { if (q.y > G - 300 && Math.abs(q.x - p.x) / sp <= q.t + 0.05) { ip = q; break; } }
    if (!ip) ip = path[path.length - 1];
    if (towardOwn && nearOwn && (b.x - p.x) * dir < 0) {
      // Ball ist hinter mir Richtung Tor: zurück und zwischen Ball und Tor (aber nicht mit Schwung reinköpfen)
      tx = Math.abs(b.x - p.x) < r + b.r + 40 ? p.x : ip.x - dir * (r * 0.6);
    } else if (towardOwn && nearOwn) {
      tx = ip.x - dir * (r + 10);
    } else {
      const myDist = Math.abs(ip.x - p.x), opDist = Math.abs(ip.x - o.x);
      const ballOnTheirSide = (ip.x - W / 2) * dir > -80;
      const slow = Math.hypot(b.vx, b.vy) < 160;
      ai.fb = slow ? (ai.fb || 0) + d.react : 0;
      if (ballOnTheirSide && opDist + 40 < myDist && ai.fb < 2.2 && Math.random() < 0.4 + d.kickSkill * 0.6) {
        // Gegner ist am Ball: zurückfallen und das Tor zustellen
        const front = own + dir * (GOAL_W + r + 30);
        tx = front + (ip.x - front) * 0.3;
      } else {
        // Angriff: hinter den Ball (Richtung eigenes Tor versetzt)
        tx = ip.x - dir * (r * 0.9 + b.r);
      }
    }
    // Nicht ins eigene Tor laufen, wenn nicht nötig
    const goalLine = ai.i ? W - GOAL_W - 10 : GOAL_W + 10;
    if (!(towardOwn && nearOwn)) tx = ai.i ? Math.min(tx, goalLine + 40) : Math.max(tx, goalLine - 40);
    ai.tx = tx + ai.err;
    // Sprungplanung
    ai.wantJ = 0;
    for (const q of path) {
      if (q.t > 0.45) break;
      const dx = Math.abs(q.x - p.x), hy = p.y - q.y;
      if (dx < r + 40 && hy > r * 0.6 && hy < 260 && Math.random() < d.jumpSkill) { ai.wantJ = Math.max(0, q.t - 0.22); break; }
    }
    // Ball liegt auf meinem Kopf: nach vorne laufen und springen
    if (Math.abs(b.x - p.x) < r * 0.6 && b.y < p.y - r && Math.abs(b.vy) < 120) { ai.tx = p.x + dir * 80; ai.wantJ = 0.01; }
  }
  // Bewegung
  const dx = ai.tx - p.x;
  if (dx > 10) c.r = true; else if (dx < -10) c.l = true;
  // Springen
  if (ai.wantJ > 0) { ai.wantJ -= dt; if (ai.wantJ <= 0 && ai.jcd <= 0) { c.j = true; ai.jcd = 0.5; ai.wantJ = 0; } }
  // Schießen
  const fx = p.x + dir * 40 * KS * p.sc, fy = p.y + 46 * KS * p.sc;
  const inReach = Math.hypot(b.x - fx, b.y - fy) < 66 * KS * p.sc + b.r - 6 && (b.x - p.x) * dir > -10;
  if (ai.hold > 0) {
    ai.hold -= dt; c.k = true;
    if (ai.hold <= 0 || (inReach && p.charge > 0.55)) { ai.hold = 0; c.k = false; }
  } else if (inReach && ai.kickT <= 0 && Math.random() < d.kickSkill) {
    // ab und zu aufladen, wenn der Ball ruhig liegt
    const calm = Math.abs(b.vx) < 160 && b.y > G - 60 && Math.abs(o.x - p.x) > 260;
    if (calm && Math.random() < d.kickSkill * 0.5) { ai.hold = 0.75; c.k = true; }
    else { c.k = true; ai.kickT = 0.28; }
  }
  // Super
  const near = Math.hypot(b.x - p.x, b.y - p.y) < r + b.r + 85 && (b.x - p.x) * dir > -20;
  if (p.full && near && Math.random() < d.superUse * 0.2) c.s = true;
  if (p.armed > 0) { ai.tx = b.x - dir * (r + b.r); }
  return c;
}

// Training: bleibt vor dem Tor, springt gegen hohe Bälle, schießt nur weg, wenn der Ball nah am Tor ist
function keeperInput(ai, st, p, b, dt) {
  const c = {}, own = ai.i ? W : 0, dir = p.dir;
  const home = own + dir * (GOAL_W + 70);
  const towards = b.vx * -dir > 120;
  const tx = towards && Math.abs(b.x - own) < 520 ? clamp(b.x, Math.min(home, own + dir * 60), Math.max(home, own + dir * 60)) : home;
  if (tx > p.x + 10) c.r = true; else if (tx < p.x - 10) c.l = true;
  ai.jcd -= dt;
  if (towards && Math.abs(b.x - p.x) < 220 && b.y < p.y - 40 && b.y > p.y - 300 && ai.jcd <= 0 && Math.random() < 0.6) { c.j = true; ai.jcd = 0.7; }
  if (Math.abs(b.x - own) < 260 && Math.abs(b.x - p.x) < 90 && (b.x - p.x) * dir > -10 && b.y > p.y) c.k = Math.random() < 0.5;
  return c;
}
