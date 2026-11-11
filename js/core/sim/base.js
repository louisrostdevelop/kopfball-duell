// Gemeinsame Bausteine: Ereignisse, Maße, Kollisionen, Super-Leiste
import { G, GOAL_H, HR, clamp, headBonus } from "../../content/config.js";
import { dhypot } from "../../content/dmath.js";
import { shoeGeo } from "./shoe.js";
import { PU } from "./tuning.js";

export const barY = (st, side) => G - GOAL_H * (st.rules ? st.rules.goal : 1) - (st.bigGoal[side] > 0 ? PU.goalUp : 0);   // Riesentor

export const pr = p => HR * p.sc;

/** Schuhmitte und Schwung-Fortschritt (shoe.js) */
export function shoePos(p) { const g = shoeGeo(p); return { x: g.x, y: g.y, k: g.d }; }

export const ev = (st, e) => { st.ev.push(e); };

/** Schutzblase (Power-up): fängt die nächste negative Wirkung auf p ab. true = abgefangen, die Wirkung entfällt */
export function shielded(st, p) {
  if (!(p.shieldT > 0)) return false;
  p.shieldT = 0;
  ev(st, { t: "shield", i: p.i, x: p.x, y: p.y });
  return true;
}

/** Magnetschuh: Ball löst sich (nur, wenn ihn Spieler i hält; ohne i: egal wer); danach fängt ihn kurz keiner (b.magCD) */
export function unstick(st, i) {
  const b = st.b;
  if (b && b.stick && (i === undefined || b.stick.i === i)) { b.stick = null; b.magCD = PU.magLock; }
}

export function addMeter(st, p, v) {
  if (p.armed > 0 || p.full || !st.rules.supers) return;
  const lv = st.lv && st.lv[p.i]; if (lv > 1) v *= 1 + headBonus(lv);   // Kopf-Level lädt den Super schneller
  p.meter = Math.min(100, p.meter + v);
  if (p.meter >= 100) { p.full = true; ev(st, { t: "full", i: p.i }); }
}

export function collideRect(b, x0, x1, y0, y1, rest) {
  const cx = clamp(b.x, x0, x1), cy = clamp(b.y, y0, y1);
  const dx = b.x - cx, dy = b.y - cy, d = dhypot(dx, dy);
  if (d >= b.r) return false;
  let nx, ny;
  if (d === 0) { nx = 0; ny = b.y < (y0 + y1) / 2 ? -1 : 1; } else { nx = dx / d; ny = dy / d; }
  b.x = cx + nx * b.r; b.y = cy + ny * b.r;
  const dot = b.vx * nx + b.vy * ny;
  if (dot < 0) { b.vx -= rest * dot * nx; b.vy -= rest * dot * ny; return true; }
  return false;
}

export function collideCircle(b, cx, cy, minD, pvx, pvy, rest) {
  const dx = b.x - cx, dy = b.y - cy, d = dhypot(dx, dy);
  if (d >= minD || d === 0) return null;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * minD; b.y = cy + ny * minD;
  const rvx = b.vx - pvx, rvy = b.vy - pvy, dot = rvx * nx + rvy * ny;
  if (dot < 0) { b.vx -= (1 + rest) * dot * nx; b.vy -= (1 + rest) * dot * ny; }
  return { nx, ny, imp: -dot };
}
