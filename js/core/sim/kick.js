// Schuss: Ausholen, Loslassen, Schussart und Richtung
import { G, SR, KS, clamp } from "../../content/config.js";
import { ev, pr, shoePos } from "./base.js";
import { endSlide } from "./tricks.js";
import { AIR, KICK } from "./tuning.js";
import { headStats } from "./rules.js";

export function swingNow(st, p) {
  p.kick = KICK.swing; p.kHit = false; p.kHitP = false; p.kPow = 1 + p.charge * 0.75;
  ev(st, { t: "swing", i: p.i, pow: p.kPow });
}

export function handleKick(st, p, c, dt) {
  // Halten = aufladen (der Ball verhält sich dabei ganz normal), Loslassen = Schuss, und zwar sofort:
  // die Schussbewegung trifft schon im selben Physikschritt, in dem losgelassen wird.
  const can = p.frz <= 0 && p.stun <= 0 && !(p.slide > 0) && !p.bomb;
  if (p.kick > 0) p.kick = Math.max(0, p.kick - dt);
  if (can && c.k && !p.kHeld) {
    p.kHeld = true; p.chT = 0; p.charge = 0;
  } else if (c.k && p.kHeld && can) {
    p.chT += dt;
    const before = p.charge;
    p.charge = clamp((p.chT - 0.05) / 0.3, 0, 1); // voll nach 0,35 s
    if (before < 1 && p.charge >= 1) ev(st, { t: "charged", i: p.i });
  } else if (!c.k && p.kHeld) {
    p.kHeld = false;
    if (can) swingNow(st, p);
    p.charge = 0; p.chT = 0;
  }
  if (!can) { p.kHeld = false; p.charge = 0; }
}

// Fuß trifft den Gegner: dezenter Schubser, abhängig von der Aufladung
export function kickPush(st, p) {
  if (!(p.kick > KICK.hitFrom) || p.kHitP) return;
  const o = st.p[1 - p.i];
  if (o.pushCD > 0) return;
  const fx = p.x + p.dir * 40 * KS * p.sc, fy = p.y + 46 * KS * p.sc;
  const ro = pr(o), so = shoePos(o);
  const hitHead = Math.hypot(o.x - fx, o.y - fy) < ro + 26 * KS * p.sc;
  const hitFoot = Math.hypot(so.x - fx, so.y - fy) < SR * o.sc + 30 * KS * p.sc;
  if (!(hitHead || hitFoot) || (o.x - p.x) * p.dir < -10) return;
  p.kHitP = true;
  const c = (p.kPow - 1) / 0.75;
  const big = o.bigT > 0 ? 0.6 : o.miniT > 0 ? 1.3 : 1; // schwerer Kopf lässt sich schwerer schubsen
  o.vx = p.dir * (320 + 160 * c) * big;
  o.vy = Math.min(o.vy, -(110 + 140 * c) * big); o.onG = false;
  o.knock = 0.22 + 0.08 * c; o.coy = 0; o.jHeld = false;
  if (o.slide > 0) endSlide(o);
  o.pushCD = 0.55;
  if (o.kHeld) { o.kHeld = false; o.charge = 0; o.chT = 0; } // Aufladen wird unterbrochen
  ev(st, { t: "bump", i: p.i, x: (fx + o.x) / 2, y: (fy + o.y) / 2, pow: 1 + c });
}

// Schussart nach dem, was man sieht:
// Ball ruhig am Boden = Lupfer (steil), Ball rollt/springt flach = Strahl (hart, flach), Ball in der Luft = Volley (flach, hoch getroffen leicht nach unten)
export function kickKind(b) {
  if (b.y + b.r < G - 34) return "volley";
  const sp = KICK.memClassify ? Math.max(b.vmem || 0, Math.hypot(b.vx, b.vy)) : Math.hypot(b.vx, b.vy);
  return sp < KICK.lobSpeed ? "lob" : "drive";
}

export function kickVec(st, p, b, c, qm, pm) {
  const kind = kickKind(b), ch = headStats(st, p);
  const base = ((KICK.tap + 400 * (ch.pow - 1)) * pm + KICK.chargeAdd * c) * qm, lift = (0.7 + 0.3 * qm) / AIR.tb;
  // Lupfer: auch waagrecht langsamer, damit er bei gleicher Höhe an derselben Stelle landet
  if (kind === "lob") return { kind, vx: base * 0.5 / AIR.tb, vy: -(800 + 380 * c) * lift };
  if (kind === "volley") return { kind, vx: base * 1.05, vy: b.y < p.y ? -(180 + 150 * c) * lift : -(480 + 300 * c) * lift };
  return { kind, vx: base, vy: -(KICK.driveVy + KICK.driveCharge * c) * lift };
}

// Vorschau für den Richtungspfeil beim Halten: nur wenn der Ball in Schussnähe ist
export function kickPreview(st, p) {
  const b = st.b, fx = p.x + p.dir * 40 * KS * p.sc, fy = p.y + 46 * KS * p.sc;
  const reach = 66 * KS * p.sc + b.r;
  if (Math.hypot(b.x - fx, b.y - fy) > reach * 2 || (b.x - p.x) * p.dir < -18 * KS * p.sc) return null;
  const pm = headStats(st, p).pow * (p.miniT > 0 ? 0.8 : 1) * (p.bigT > 0 ? 1.1 : 1);
  const kv = kickVec(st, p, b, p.charge, 1, pm);
  return { kind: kv.kind, ang: Math.atan2(kv.vy, p.dir * kv.vx), c: p.charge };
}
