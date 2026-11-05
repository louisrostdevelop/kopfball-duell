// Gemeinsame Bausteine: Ereignisse, Maße, Kollisionen, Super-Leiste
import { G, GOAL_H, HR, FOOT, KS, clamp, headBonus } from "../../content/config.js";
import { KICK } from "./tuning.js";

export const barY = (st, side) => G - GOAL_H * (st.rules ? st.rules.goal : 1) - (st.bigGoal[side] > 0 ? 60 : 0);

export const pr = p => HR * p.sc;

export function shoePos(p) {
  if (p.slide > 0) return { x: p.x + p.slideDir * 50 * KS * p.sc, y: p.y + (FOOT + 4) * p.sc, k: 0 };
  if (p.bomb) return { x: p.x - p.dir * 8 * KS * p.sc, y: p.y + FOOT * 0.82 * p.sc, k: 0 };
  const pr0 = p.kick > 0 ? 1 - p.kick / KICK.swing : 1;
  const k = p.kick > 0 ? (pr0 < 0.3 ? Math.sin(pr0 / 0.3 * Math.PI / 2) : Math.cos((pr0 - 0.3) / 0.7 * Math.PI / 2)) : 0;
  const wind = p.kHeld && p.charge > 0 ? -p.charge * 0.6 : 0;
  return { x: p.x + p.dir * (16 + 34 * k + 22 * wind) * KS * p.sc, y: p.y + (FOOT - 20 * KS * k) * p.sc, k };
}

export const ev = (st, e) => { st.ev.push(e); };

export function addMeter(st, p, v) {
  if (p.armed > 0 || p.full || !st.rules.supers) return;
  const lv = st.lv && st.lv[p.i]; if (lv > 1) v *= 1 + headBonus(lv);   // Kopf-Level lädt den Super schneller
  p.meter = Math.min(100, p.meter + v);
  if (p.meter >= 100) { p.full = true; ev(st, { t: "full", i: p.i }); }
}

export function collideRect(b, x0, x1, y0, y1, rest) {
  const cx = clamp(b.x, x0, x1), cy = clamp(b.y, y0, y1);
  const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
  if (d >= b.r) return false;
  let nx, ny;
  if (d === 0) { nx = 0; ny = b.y < (y0 + y1) / 2 ? -1 : 1; } else { nx = dx / d; ny = dy / d; }
  b.x = cx + nx * b.r; b.y = cy + ny * b.r;
  const dot = b.vx * nx + b.vy * ny;
  if (dot < 0) { b.vx -= rest * dot * nx; b.vy -= rest * dot * ny; return true; }
  return false;
}

export function collideCircle(b, cx, cy, minD, pvx, pvy, rest) {
  const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
  if (d >= minD || d === 0) return null;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * minD; b.y = cy + ny * minD;
  const rvx = b.vx - pvx, rvy = b.vy - pvy, dot = rvx * nx + rvy * ny;
  if (dot < 0) { b.vx -= (1 + rest) * dot * nx; b.vy -= (1 + rest) * dot * ny; }
  return { nx, ny, imp: -dot };
}
