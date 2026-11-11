// Schuh als Form mit echter Kollision, läuft auf einem Kreis um die Kopfmitte.
// Drücken = Schwung sofort, ein Tipp = voller Schwung, Halten = Bein bleibt oben (weich, schießt nicht).
// Kraft aus dem Tempo des Schuhs im Moment des Treffens, mit Leitplanken. Grätsche und Bombe haben Vorrang.
// Zustand am Spieler: lgS (0 Ruhe, 1 hoch, 2 oben, 3 zurück), lgD (Fortschritt 0..1), lgV (Fortschritt je Sekunde),
// lgT, lgD0, lgTop, lgHit (Treffer in diesem Schwung), lgWait (erst neu drücken), lgBuf, lgK (Taste im letzten Schritt).
import { G, clamp } from "../../content/config.js";
import { addMeter, ev, pr, shielded, unstick } from "./base.js";
import { headStats, kickMul, maxBall } from "./rules.js";
import { touch } from "./supers.js";
import { KICK, MOVE, PU, SHOE, pv } from "./tuning.js";
import { kickSpin, magnetCatch } from "./powerups.js";
import { datan2, dcos, dhypot, dsin } from "../../content/dmath.js";

const D2R = Math.PI / 180;
const dacos = x => datan2(Math.sqrt(Math.max(0, 1 - x * x)), x);   // deterministisch (sqrt ist überall bit-gleich)
const A0 = () => SHOE.rest * D2R;
// höchste Stellung: hängt nur an SHOE (rest, top, ring); gemerkt, solange die gleich bleiben (der Spielplatz ändert sie)
let a1In = [NaN, NaN, NaN], a1V = 0;
const A1 = () => {
  if (SHOE.rest !== a1In[0] || SHOE.top !== a1In[1] || SHOE.ring !== a1In[2]) {
    a1In = [SHOE.rest, SHOE.top, SHOE.ring]; a1V = Math.max(A0() + 0.2, dacos(clamp(SHOE.top / SHOE.ring, -1, 1)));
  }
  return a1V;
};

/** Abstand Kopfmitte bis Boden: der Kopf steht auf dem Boden */
export const footH = p => pr(p);

/** Maße des Schuhs (Länge, Radius der Kapsel, halbe Länge der Mittellinie), je Spieler (Riesenschuh ×1,6) */
export function shoeDims(p) {
  const bs = p.bootT > 0 ? PU.bootSize : 1, L = 46 * SHOE.size * p.sc * bs, rs = 11 * SHOE.size * p.sc * bs;
  return { L, rs, hl: Math.max(0, L / 2 - rs) };
}
const dims = shoeDims;
/** Zeit nach oben je Spieler (Riesenschuh schwingt langsamer); ohne Spieler die normale (Bot wie bisher) */
export const tUpOf = p => SHOE.tUp * (p && p.bootT > 0 ? PU.bootUp : 1);

/**
 * Pose des Schuhs in Weltkoordinaten: Mitte (x, y), Achse (ux, uy) Richtung Spitze, Kapsel (hl, rs), Blickrichtung dir,
 * a = Winkel auf dem Kreis, tilt = Drehung des Schuhs nach oben. Zur Grätsche (flach vorne am Boden) und zurück wird
 * weich übergeblendet (lgBl), nichts springt. Während eines Schwungs bleibt der Schuh auf der Seite, auf der er begann.
 */
export function shoeGeo(p) {
  const { L, rs, hl } = dims(p), r = pr(p);
  const dir = p.lgS && p.lgDir ? p.lgDir : p.dir, d = p.lgD, a = A0() + (A1() - A0()) * d, tilt = A0() + (a - A0()) * SHOE.turn, rr = SHOE.ring * r;
  const nx = p.x + dir * dsin(a) * rr, ny = p.y + dcos(a) * rr;
  const bl = p.lgBl || 0;
  if (bl <= 0) return { x: nx, y: ny, ux: dir * dcos(tilt), uy: -dsin(tilt), hl, rs, L, dir, a, tilt, d };
  // Grätschen-Haltung: flach vorne, Sohle am Boden (hängt am Kopf, auch wenn man aus der Grätsche springt)
  const sd = p.slide > 0 ? p.slideDir : p.lgSlDir || dir, sx = p.x + sd * r * 0.95, sy = p.y + footH(p) - rs;
  if (sd !== dir) return bl < 0.5 ? { x: nx, y: ny, ux: dir * dcos(tilt), uy: -dsin(tilt), hl, rs, L, dir, a, tilt, d } : { x: sx, y: sy, ux: sd, uy: 0, hl, rs, L, dir: sd, a: 0, tilt: 0, d: 0 };
  const tb = tilt * (1 - bl);
  return { x: nx + (sx - nx) * bl, y: ny + (sy - ny) * bl, ux: dir * dcos(tb), uy: -dsin(tb), hl, rs, L, dir, a, tilt: tb, d };
}

/** Pose bei Fortschritt d und Kopfposition (x, y), für Vorhersagen (Bot); sonst wie shoeGeo */
export function shoeGeoAt(p, d, x, y) {
  const { rs, hl } = dims(p), dir = p.dir, a = A0() + (A1() - A0()) * d, tilt = A0() + (a - A0()) * SHOE.turn, rr = SHOE.ring * pr(p);
  const w = trig(a, tilt);
  return { x: x + dir * w.sa * rr, y: y + w.ca * rr, ux: dir * w.ct, uy: -w.st, hl, rs };
}
// sin/cos von Winkel und Neigung für shoeGeoAt (der Bot fragt dieselben Stellungen sehr oft ab): zwei gemerkte
// Stellungen, sonst neu gerechnet (gleiche Zahlen, dsin und dcos sind reine Funktionen; Object.is trennt 0 und -0)
const TRIG = [{ a: undefined, tilt: undefined, sa: 0, ca: 0, ct: 0, st: 0 }, { a: undefined, tilt: undefined, sa: 0, ca: 0, ct: 0, st: 0 }];
let trigN = 0;
function trig(a, tilt) {
  for (const w of TRIG) if (Object.is(w.a, a) && Object.is(w.tilt, tilt)) return w;
  const w = TRIG[trigN]; trigN = 1 - trigN;
  w.a = a; w.tilt = tilt; w.sa = dsin(a); w.ca = dcos(a); w.ct = dcos(tilt); w.st = dsin(tilt);
  return w;
}
/** Schwung-Fortschritt t Sekunden nach dem Drücken (aus der Ruhe); mit p je Spieler (Riesenschuh) */
export const swingAt = (t, p) => { const u = tUpOf(p); return t >= u ? 1 : easeUp(t / u); };
/** Fortschritt je Sekunde t Sekunden nach dem Drücken (aus der Ruhe), für Vorhersagen (Bot); mit p je Spieler */
export const swingVelAt = (t, p) => { const u = tUpOf(p); return t >= u ? 0 : easeUpD(t / u) / u; };
/** Winkel auf dem Kreis: Ruhe und höchste Stellung (rad), für Vorhersagen (Bot) */
export const swingAngles = () => ({ a0: A0(), a1: A1() });

/** Tempo eines Punkts auf dem Schuh (s = Abstand von der Mitte entlang der Achse) */
function pointVel(p, g, s) {
  if (p.slide > 0 || p.bomb || p.lgBl > 0) return { vx: p.vx, vy: p.vy };
  const rr = SHOE.ring * pr(p), ad = (A1() - A0()) * p.lgV, td = SHOE.turn * ad;
  return {
    vx: p.vx + g.dir * rr * dcos(g.a) * ad - g.dir * dsin(g.tilt) * td * s,
    vy: p.vy - rr * dsin(g.a) * ad - dcos(g.tilt) * td * s,
  };
}

const easeUp = f => 1 - (1 - f) * (1 - f) * (1 - f), easeUpD = f => 3 * (1 - f) * (1 - f);
const easeDn = f => (f < 0.5 ? 2 * f * f : 1 - (2 - 2 * f) * (2 - 2 * f) / 2), easeDnD = f => (f < 0.5 ? 4 * f : 4 * (1 - f));

/**
 * Schwung abbrechen (Grätsche, Bombe, Einfrieren, Schubser): das Bein geht zügig und ohne Kraft zurück (kein Sprung
 * in die Ruhe), für den nächsten Schwung muss neu gedrückt werden
 */
export function legCancel(p) {
  if (p.lgD > 0 && p.lgS !== 3) { p.lgS = 3; p.lgT = 0; p.lgTop = p.lgD; }
  p.lgHit = true; p.lgWait = true;
}

function startSwing(st, p) {
  p.lgS = 1; p.lgT = 0; p.lgD0 = p.lgD; p.lgHit = false; p.kHitP = false; p.lgWait = false; p.lgBuf = 0; p.lgDir = p.dir;
  ev(st, { t: "swing", i: p.i, pow: 1 });
}

/** Bein-Bewegung je Zustand: hoch (Tempo nach oben), oben halten, zurück */
function legMove(p, dt, held) {
  if (p.lgS === 1) {
    const u = tUpOf(p);
    p.lgT += dt; const f = Math.min(1, p.lgT / u);
    p.lgD = p.lgD0 + (1 - p.lgD0) * easeUp(f);
    p.lgV = f < 1 ? (1 - p.lgD0) * easeUpD(f) / u : 0;
    if (f >= 1) { p.lgS = held ? 2 : 3; p.lgT = 0; p.lgTop = p.lgD; }
  } else if (p.lgS === 2) {
    p.lgD = 1; p.lgV = 0;
    if (!held) { p.lgS = 3; p.lgT = 0; p.lgTop = 1; }
  } else if (p.lgS === 3) {
    p.lgT += dt; const f = Math.min(1, p.lgT / SHOE.tDown);
    p.lgD = p.lgTop * (1 - easeDn(f)); p.lgV = -p.lgTop * easeDnD(f) / SHOE.tDown;
    if (f >= 1) { p.lgS = 0; p.lgD = 0; p.lgV = 0; }
  } else { p.lgD = 0; p.lgV = 0; }
  if (p.lgS === 0) p.lgDir = 0;
}

/** Ein Physikschritt des Beins */
export function shoeLeg(st, p, c, dt) {
  const k = !!c.k, press = k && !p.lgK;
  p.lgK = k;
  // Grätschen-Haltung weich ein- und ausblenden (rein in 0,05 s, raus in 0,08 s)
  if (p.slide > 0) p.lgSlDir = p.slideDir;
  p.lgBl = p.slide > 0 ? Math.min(1, (p.lgBl || 0) + dt / 0.05) : Math.max(0, (p.lgBl || 0) - dt / 0.08);
  if (p.slide > 0 || p.bomb) {
    // Grätsche/Bombe haben Vorrang: ein laufender Schwung geht kraftlos zurück. Druck kurz vor Ende der Grätsche merken.
    if (p.lgS === 1 || p.lgS === 2) legCancel(p);
    if (press && p.slide > 0 && p.slide <= SHOE.buffer) p.lgBuf = 1;
    if (!p.lgBuf) p.lgWait = true;
    legMove(p, dt, false);
    return;
  }
  if (!k) p.lgWait = false;
  if (p.frz > 0 || p.stun > 0) { if (p.lgS === 1 || p.lgS === 2) legCancel(p); legMove(p, dt, false); return; }
  if ((press || p.lgBuf) && (p.lgS === 0 || p.lgS === 3)) startSwing(st, p);
  legMove(p, dt, k && !p.lgWait);
}

/** Schwingt der Schuh gerade nach oben und hat in diesem Schwung noch nicht getroffen? */
const swinging = p => p.lgS === 1 && p.lgV > 0 && !p.lgHit;

/** Berührt der Ball den Schuh? Nächster Punkt auf der Mittellinie (s, qx, qy), Abstand, Mindestabstand; sonst null */
function shoeHit(b, p) {
  const g = shoeGeo(p);
  const rx = b.x - g.x, ry = b.y - g.y, s = clamp(rx * g.ux + ry * g.uy, -g.hl, g.hl);
  const qx = g.x + g.ux * s, qy = g.y + g.uy * s, dx = b.x - qx, dy = b.y - qy, dist = dhypot(dx, dy), minD = g.rs + b.r;
  return dist >= minD || dist === 0 ? null : { g, s, qx, qy, dx, dy, dist, minD };
}

/** Berührt der Ball Kopf oder Schuh von p (nur Lage, ohne Sperren)? */
export const touchesBall = (b, p) => dhypot(b.x - p.x, b.y - p.y) < pr(p) + b.r || !!shoeHit(b, p);

/** Magnetschuh: würde das gehaltene Bein von p den freien Ball b jetzt fangen (Berührung, Relativtempo, keine Sperrzeit)? */
export function magnetReady(b, p) {
  if (!(p.magT > 0) || p.lgS !== 2 || b.fx || b.stick || b.magCD > 0 || p.slide > 0 || p.bomb) return false;
  const h = shoeHit(b, p);
  if (!h) return false;
  const fv = pointVel(p, h.g, h.s);
  return dhypot(b.vx - fv.vx, b.vy - fv.vy) < PU.magRel;
}

/** Schuh gegen Ball: Kapsel, Abprall mit dem Tempo des Schuhs, im Schwung ein Schuss (einmal je Schwung) */
export function shoeBall(st, b, p) {
  if (p.slide > 0 || p.bomb) return;   // Grätsche und Bombe haben eigene Regeln (tricks.js)
  const h = shoeHit(b, p);
  if (!h) return;
  const { g, s, qx, qy, dx, dy, dist, minD } = h, fv = pointVel(p, g, s);
  // Magnetschuh: gehaltenes Bein fängt einen langsamen freien Ball (kein Abprall)
  if (magnetReady(b, p) && magnetCatch(st, b, p, fv)) return;
  b.spin = 0;   // jede Berührung löscht den Effet (ein Schuss setzt ihn gleich neu)
  const nx = dx / dist, ny = dy / dist;
  b.x = qx + nx * minD; b.y = qy + ny * minD;
  // Ball hinter der Kopfmitte (Ferse): nur abprallen, ein Schuss würde ihn durch den Kopf nach vorne holen
  const shot = swinging(p) && (b.x - p.x) * g.dir > 0;
  const ch = headStats(st, p), boot = p.bootT > 0;
  // Riesenschuh: Schusskraft ×1,12 (wie Mini ×0,8); dazu reicht der größere Schuh weiter, der Schwung ist langsamer
  const pm = shot ? SHOE.power * ch.pow * (p.miniT > 0 ? PU.miniPow : 1) * (p.bigT > 0 ? 1.1 : 1) * (boot ? PU.bootPow : 1) * kickMul(st) : 1;
  // Schuh-Tempo im Schwung gewichtet (Kraft), Laufen/Springen zählt voll
  const fvx = p.vx + (fv.vx - p.vx) * pm, fvy = p.vy + (fv.vy - p.vy) * pm;
  const vn = (b.vx - fvx) * nx + (b.vy - fvy) * ny;
  if (vn >= 0) return;
  const inSpd = Math.max(b.vmem || 0, dhypot(b.vx, b.vy));
  const e = shot ? SHOE.eSwing : SHOE.ePass;
  b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
  if (!shot) { if (-vn > 120) touch(st, b, p, "shoe"); return; }
  // Griff: quer zur Berührung nimmt der Ball einen Teil der Fußbewegung mit
  const tx = -ny, ty = nx, vt = (b.vx - fvx) * tx + (b.vy - fvy) * ty;
  b.vx -= SHOE.grip * vt * tx; b.vy -= SHOE.grip * vt * ty;
  // Richtung: der Fuß läuft auf der Kreisbahn, sein Tempo zeigt in Kopfhöhe fast senkrecht nach oben. Ein Schuss wird
  // deshalb ein Stück zum Abflugwinkel der Trefferhöhe gezogen (SHOE.aim, vom Boden gelupft, in Kopfhöhe gerade, darüber
  // leicht nach unten); Timing und Treffpunkt bestimmen den Winkel spürbar mit. Nie nach hinten.
  aimShot(b, p, g.dir);
  // Leitplanken: nach vorne nie zu schwach, nie zu schnell
  const sp = dhypot(b.vx, b.vy), fwd = b.vx * p.dir > 0, hi = Math.min(SHOE.maxShot * kickMul(st) * (boot ? PU.bootPow : 1), maxBall(st));
  const want = clamp(sp, fwd ? SHOE.minShot * kickMul(st) : 0, hi), m = want / (sp || 1);
  b.vx *= m; b.vy *= m;
  p.lgHit = true;
  if (!touch(st, b, p, "kick")) return;   // Super gezündet (Feuer-Power-up oder scharfer Super): der übernimmt
  const spd = dhypot(b.vx, b.vy), ang = datan2(-b.vy, Math.abs(b.vx)) / D2R;
  // Lupfer: ruhig liegender Ball mit Bogen; Volley: Ball kam durch die Luft; sonst Strahl
  const kind = b.y + b.r < G - 34 && inSpd > 150 ? "volley" : ang > KICK.lobAng && inSpd < KICK.lobSpeed ? "lob" : "drive";
  const c = clamp((spd - SHOE.minShot) / (SHOE.maxShot - SHOE.minShot), 0, 1);
  b.kin = inSpd; b.held = 0.05;
  st.stats[p.i].shots++;
  addMeter(st, p, 6 * (st.mod === "superfast" ? 2 : 1));
  ev(st, { t: "kick", i: p.i, x: b.x, y: b.y, pow: 1 + c * 0.75, q: 1, c, spd, kind, inSpd });
  kickSpin(p, b);
  if (spd > KICK.power) { b.pw = 0.55; p.vx -= p.dir * (90 + 120 * c); } else b.pw = 0;
}

/** Abflugwinkel (Grad, nach vorne-oben) für die Trefferhöhe: h = 1 Ball liegt am Boden, 0 Kopfmitte, -1 einen Kopfradius höher */
export function aimAngle(h) {
  const hh = clamp(h, -1, 1);
  return hh >= 0 ? SHOE.angMid + (SHOE.angLow - SHOE.angMid) * hh : SHOE.angMid + (SHOE.angMid - SHOE.angHigh) * hh;
}
/**
 * Höhe des Balls ab Kopfmitte für aimAngle: nach unten 1 = Ball liegt am Boden (der Kopf steht selbst auf dem Boden, ein
 * Ball dort ist nur gut r/2 tiefer), nach oben -1 = einen Kopfradius höher. Ball liegt am Boden = Boden, auch wenn er
 * größer ist als der Kopf (sonst läge seine Mitte über der Kopfmitte)
 */
export function shotH(b, p) {
  const dy = b.y - p.y, gh = (G - b.r) - p.y, onFloor = b.y + b.r >= G - 2;
  return onFloor ? 1 : dy >= 0 ? dy / (gh > 1 ? gh : pr(p)) : dy / pr(p);
}
function aimShot(b, p, dir) {
  const sp = dhypot(b.vx, b.vy);
  if (!sp) return;
  const now = datan2(-b.vy, b.vx * dir), want = aimAngle(shotH(b, p)) * D2R;
  const ang = clamp(now + (want - now) * SHOE.aim, SHOE.angMin * D2R, SHOE.angMax * D2R);
  b.vx = dir * dcos(ang) * sp; b.vy = -dsin(ang) * sp;
}

/** Schuh trifft den Gegner im Schwung: ein fester, mittlerer Schubser je Schwung (gehaltenes Bein schubst nicht) */
export function shoePush(st, p) {
  if (p.lgS !== 1 || p.lgV <= 0 || p.kHitP || p.slide > 0) return;
  const o = st.p[1 - p.i];
  if (o.pushCD > 0) return;
  const g = shoeGeo(p), tx = g.x + g.ux * g.hl, ty = g.y + g.uy * g.hl;
  if (dhypot(o.x - tx, o.y - ty) > pr(o) + g.rs || (o.x - p.x) * p.dir < -10) return;
  p.kHitP = true;
  if (shielded(st, o)) return;   // Schutzblase fängt den Schubser ab
  unstick(st, o.i);
  const big = o.bigT > 0 ? 0.6 : o.miniT > 0 ? 1.3 : 1;
  o.vx = p.dir * 400 * big; o.vy = Math.min(o.vy, -pv(180) * big); o.onG = false;
  o.knock = 0.26; o.coy = 0; o.jHeld = false; o.pushCD = 0.55;
  if (o.slide > 0) { o.slide = 0; o.slideCD = MOVE.slideCD; }
  if (o.lgS) legCancel(o);
  ev(st, { t: "bump", i: p.i, x: (tx + o.x) / 2, y: (ty + o.y) / 2, pow: 1.5 });
}

/** Startwerte am Spieler (alle Spieler bekommen die Felder, damit Zustände gleich aufgebaut sind) */
export const legFields = () => ({ lgS: 0, lgD: 0, lgV: 0, lgT: 0, lgD0: 0, lgTop: 0, lgHit: false, lgWait: false, lgBuf: 0, lgK: false, lgBl: 0, lgDir: 0, lgSlDir: 0 });
