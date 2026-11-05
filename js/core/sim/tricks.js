// Arschbombe und Grätsche: Landung, Ende, Wirkung auf Ball und Gegner
import { G, SR, FOOT, clamp } from "../../content/config.js";
import { addMeter, ev, pr, shoePos } from "./base.js";
import { kickMul } from "./rules.js";
import { touch } from "./supers.js";
import { MOVE, bombPow, bv, pv } from "./tuning.js";

export function endSlide(p) { p.slide = 0; p.slideCD = MOVE.slideCD; }

export function bombLand(st, p) {
  const k = bombPow(p);
  p.bomb = 0; p.bombRec = MOVE.bombRec; p.land = 0.12 + 0.1 * k;
  ev(st, { t: "pound", i: p.i, x: p.x, y: p.y + (FOOT + SR) * p.sc, k });
}

// Arschbombe trifft den Ball von oben
export function bombBall(st, b, p) {
  const r = pr(p), bottom = p.y + (FOOT + SR) * p.sc, dxb = b.x - p.x, reach = r * 0.95 + b.r * 0.6;
  if (Math.abs(dxb) > reach || b.y < p.y + r * 0.3 || b.y - b.r > bottom + 4 || b.y + b.r < p.y) return false;
  const k = bombPow(p);
  if (b.y > p.y) p.y = Math.min(p.y, b.y - b.r - (FOOT + SR) * p.sc - 1); // sauber auf den Ball setzen, nicht hinein
  p.bomb = 0; p.vy = -pv(360 + 200 * k); p.onG = false; p.jHeld = false; p.coy = 0; p.bombLock = true;
  b.nh = p.i; b.nhT = 0.22;
  if (!touch(st, b, p, "bomb")) return true;
  const ox = clamp(dxb / reach, -1, 1), flat = Math.min(1, Math.abs(ox) * 1.5), km = kickMul(st);
  const side = Math.abs(ox) < 0.12 ? p.dir : Math.sign(ox);
  if (b.y + b.r >= G - 16) {
    // gequetscht: seitlich raus, je weiter vom Rand getroffen, desto flacher und schneller
    b.vx = side * (650 + 850 * k) * (0.3 + 0.7 * Math.max(0.15, flat)) * km;
    b.vy = -bv(420 + 560 * k) * (1 - 0.55 * flat) * km;
    b.y = G - b.r - 1;
    ev(st, { t: "squash", i: p.i, x: b.x, y: G - b.r, k, flat });
  } else {
    // in der Luft: runter geschmettert
    b.vy = Math.max(b.vy, 0) + (700 + 600 * k) * km; b.vx = b.vx * 0.5 + ox * 300;
    ev(st, { t: "smash", i: p.i, x: b.x, y: b.y, k });
  }
  b.held = 0.05;
  st.hs = Math.max(st.hs, 0.02 + 0.015 * k);
  addMeter(st, p, 6 * (st.mod === "superfast" ? 2 : 1));
  return true;
}

// Grätsche spitzelt den Ball flach weg
export function slideBall(st, b, p) {
  const f = shoePos(p);
  if (b.y < p.y + (FOOT + SR) * p.sc - 110 || Math.hypot(b.x - f.x, b.y - f.y) > SR * p.sc * 1.4 + b.r) return false;
  p.slideHit = true;
  b.nh = p.i; b.nhT = 0.12;
  if (!touch(st, b, p, "slide")) return true;
  const v = clamp(380 + Math.abs(p.vx) * 0.75, 420, 1050) * kickMul(st);
  b.vx = p.slideDir * v; b.vy = -bv(220); b.y = Math.min(b.y, G - b.r - 1);
  p.vx *= 0.6;
  ev(st, { t: "poke", i: p.i, x: b.x, y: b.y, v });
  return true;
}

// Grätsche trifft den Gegner am Boden: kurz ins Stolpern, mehr nicht
export function slideTripHit(st, p) {
  if (!(p.slide > 0) || p.slideHitP) return false;
  const o = st.p[1 - p.i];
  if (!o.onG || o.tripCD > 0) return false;
  const f = shoePos(p);
  if (Math.abs((o.y + (FOOT + SR) * o.sc) - (p.y + (FOOT + SR) * p.sc)) > 30) return false; // gleiche Höhe (nicht auf der Latte)
  return (o.x - p.x) * p.slideDir >= 0 && Math.abs(o.x - f.x) <= pr(o) * 0.8 + SR * p.sc;
}

export function slideTrip(st, p) {
  const o = st.p[1 - p.i];
  p.slideHitP = true; p.vx *= 0.4;
  o.stun = Math.max(o.stun, MOVE.tripStun); o.tripCD = MOVE.tripCD;
  o.vx = p.slideDir * 260; o.vy = -pv(240); o.onG = false; o.jHeld = false; o.coy = 0;
  if (o.slide > 0) endSlide(o);
  if (o.kHeld) { o.kHeld = false; o.charge = 0; o.chT = 0; }
  ev(st, { t: "trip", i: p.i, x: o.x, y: G - 20 });
}
