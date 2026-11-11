// Bot-Kern: Entscheidung (Optionen mit vorausgerechnetem Ergebnis) und Ausführung (Laufen, Sprung, Schwung).
// Läuft im Physikschritt, Zustand in st.bot[i] (klonbar, Rollback setzt ihn mit zurück). Nur dmath, eigener Zufallsstrom.
// Rolle Torwart (Training): nur Abwehr und Wegschießen, bleibt vor dem eigenen Tor (KEEPER_ZONE).
import { W, G, GOAL_W, arenaById, clamp } from "../../content/config.js";
import { pr } from "../sim/base.js";
import { aimAngle, footH, shoeDims, shoeGeoAt, shotH, swingAt, swingVelAt, swingAngles, tUpOf } from "../sim/shoe.js";
import { kickMul, maxBall } from "../sim/rules.js";
import { MOVE, PU, SHOE } from "../sim/tuning.js";
import { datan2, dcos, dhypot, dsin, rnd } from "../../content/dmath.js";
import { ballEnv, ballPath, contact, judge, jumpProfile, runSpeed } from "./world.js";
import { levelOf } from "./levels.js";

const DT = 1 / 120;
let thinkPath = null;
const HEAD_ANGLES = [0.25, 0.7, 1.15];
const AIR_SWING = [0.45, 0.75];   // Schwung-Fortschritt beim Treffer in der Luft   // Treffpunkt am Kopf: fast oben, schräg, seitlich (rad ab senkrecht)   // Bahn der letzten Überlegung (nur innerhalb eines Schritts benutzt, nicht im Zustand)
const gauss = B => (rnd(B) + rnd(B) + rnd(B) - 1.5) * 1.41;   // ungefähr Normalverteilung, Streuung ~1

/** Torwart: so weit (Anteil der Feldbreite, ab der eigenen Wand) geht er höchstens vors Tor, etwa bis zur Strafraumhöhe */
export const KEEPER_ZONE = 0.25;

/** Bot-Zustand für Spieler i (alles einfache Werte: wird mit dem Spielzustand geklont und gehasht). keeper: Rolle Torwart */
export function makeBrain(i, level, seed, keeper = false) {
  const B = { i, lvl: level, rng: (seed ^ (0x9E3779B9 * (i + 1))) >>> 0, thinkT: 0, wait: 0, jHold: 0, jFull: true, press: 0, kErr: 0, kErrT: 0,
    sup: 0, slideCD: 0, switches: 0, tx: -1, jit: 0, jcd: 0, mag: 0, magW: 0, magX: 0, magJ: -1, iced: 0, tapT: 0, tapK: 0,
    plan: { k: "none", tx: 0, jumpAt: -1, pressAt: -1, jFull: true, v: 0, at: 0, cx: 0, cy: 0, ct: 0 } };
  if (keeper) B.keeper = true;
  return B;
}
/**
 * Torwart: läuft er nach vorne, das Ziel um den Bremsweg vor die Grenze legen (sonst rutscht er drüber, auf Eis weit).
 * Bremsen wie movePlayer ohne Eingabe (mit Gegenrichtung bremst er sogar schneller).
 */
function keeperBrake(st, B, p, tx) {
  if (!B.keeper) return tx;
  const dir = B.i ? -1 : 1, v = p.vx * dir;   // (Richtung zum Feld, nicht die Blickrichtung)
  if (v <= 0) return tx;
  const grip = arenaById(st.arena).grip * (st.rules.floor === "ice" ? 0.16 : 1) * (p.onG && p.slick ? 0.2 : 1);
  const a = (p.onG ? 6400 : 4600) * grip * MOVE.stopG, lim = (B.i ? W : 0) + dir * (zoneOf(B) - v * v / (2 * a) - 6);
  return (tx - lim) * dir > 0 ? lim : tx;
}
/** Torwart: Abstand von der eigenen Wand, bis zu dem er geht (0 = keine Grenze) */
const zoneOf = B => (B.keeper ? W * KEEPER_ZONE : 0);
/** liegt x außerhalb seines Bereichs? */
const outOfZone = (B, x) => B.keeper && (x - (B.i ? W : 0)) * (B.i ? -1 : 1) > zoneOf(B);
/** Ziel in den Bereich holen (nur Torwart) */
function inZone(B, pl, r) {
  if (!B.keeper) return pl;
  const z = zoneOf(B);
  pl.tx = B.i ? clamp(pl.tx, W - z, W - r) : clamp(pl.tx, r, z);
  return pl;
}

// Schuh-Pose, in der die Schuhmitte auf Höhe h (relativ zur Kopfmitte, + = tiefer) steht: Fortschritt d und Tempo
// (Schwungzeit je Spieler: Riesenschuh schwingt langsamer)
function shoeAtHeight(h, p) {
  const { a0, a1 } = swingAngles(), rr = SHOE.ring;
  const ca = clamp(h / rr, dcos(a1), 1), a = Math.max(a0, acosD(ca));
  const d = clamp((a - a0) / (a1 - a0), 0, 1);
  // d = 1 - (1 - f)^3 → f; Tempo wie im Schwung aus der Ruhe
  const f = 1 - cbrt3(1 - d);
  return { d, a, v: swingVelAt(f * tUpOf(p), p) };
}
const acosD = x => datan2(Math.sqrt(Math.max(0, 1 - x * x)), x);
const cbrt3 = x => { if (x <= 0) return 0; let y = x > 0.5 ? x : 0.5; for (let k = 0; k < 12; k++) y -= (y * y * y - x) / (3 * y * y); return y; };
/** Riesenschuh: so viel weiter reicht der Schuh als normal (Länge der Kapsel), sonst 0 */
const bootX = p => (p.bootT > 0 ? shoeDims(p).L * (1 - 1 / PU.bootSize) : 0);

/**
 * Plan durchspielen: Spieler läuft zu pl.tx, springt nach pl.jumpAt s, schwingt nach pl.press s; Ball auf der Bahn F
 * (Schritte DT). Erste echte Berührung von Kopf oder Schuh → Ball danach (echte Regeln), Zeit und Ort; sonst null.
 */
function simPlan(st, p, F, pl, sp, rest, prof) {
  const r = pr(p), br = st.b.r, tu = tUpOf(p), far = r * (SHOE.ring + 1.2) + bootX(p);
  for (let n = 0; n < F.length; n++) {
    const q = F[n], t = q.t;
    const dx = pl.tx - p.x, mv = Math.abs(dx) > sp * t, x = p.x + clamp(dx, -sp * t, sp * t), vx = mv ? Math.sign(dx) * sp : 0;
    let y = rest, vy = 0, onG = true;
    if (pl.jumpAt >= 0 && t >= pl.jumpAt && prof) { const f = prof[Math.min(prof.length - 1, Math.round((t - pl.jumpAt) / DT))]; if (f && !(f.y >= -0.01 && t - pl.jumpAt > 0.1)) { y = rest + f.y; vy = f.vy; onG = false; } }
    else if (!p.onG) { y = Math.min(rest, p.y + p.vy * t + 1500 * t * t); vy = p.vy; onG = y >= rest; }
    let lgS = 0, lgD = 0, lgV = 0;
    if (pl.press >= 0 && t >= pl.press && t - pl.press <= tu + 0.02) { lgS = 1; lgD = swingAt(t - pl.press, p); lgV = swingVelAt(t - pl.press, p); }
    const dd = dhypot(q.x - x, q.y - y);
    if (dd > far + br) { if (pl.until && t > pl.until) return null; continue; }   // weit weg: weder Kopf noch Schuh
    let hit = dd < r + br;
    if (!hit) {
      const g = shoeGeoAt(p, lgD, x, y), rx = q.x - g.x, ry = q.y - g.y, s = clamp(rx * g.ux + ry * g.uy, -g.hl, g.hl);
      hit = dhypot(q.x - (g.x + g.ux * s), q.y - (g.y + g.uy * s)) < g.rs + br;
    }
    if (hit) {
      const c = contact(st, { ...st.b, ...q }, p, { x, y, vx, vy, onG, lgS, lgD, lgV });
      return c ? { b: c.b, t, x: q.x, y: q.y } : null;
    }
  }
  return null;
}

/** Optionen bewerten und einen Plan wählen */
function think(st, B, p, L, E) {
  const b = st.b, i = B.i, dir = p.dir, r = pr(p), rest = G - footH(p), own = i ? W : 0;
  const sp = runSpeed(st, p);
  // Wahrnehmung: Tempo des Balls mit Schätzfehler (wächst mit der Vorausschau)
  const nb = { ...b, vx: b.vx + gauss(B) * L.perr, vy: b.vy + gauss(B) * L.perr * 0.6 };
  const P = ballPath(E, nb, 1.5, 1 / 60);
  const prof = p.onG ? jumpProfile(st, p, true) : null;
  const cands = [];
  const reach = (tx, t) => Math.abs(tx - p.x) / sp <= t + 0.02;
  // Ist der Gegner vorher am Ball? Dann wird die Bahn bis dahin eine andere: Plan taugt wenig
  const o = st.p[1 - i], ro = pr(o), spo = runSpeed(st, o), restO = G - footH(o);
  // frühester Punkt der Bahn, den sein Kopf oder Schuh erreicht (mit kurzer Reaktion, Sprung kostet Zeit)
  let tOpp = 99;
  for (const q of P.pts) {
    // Reichweite: Kopf oder Schuh (auch im Sprung), Höhe: Sprung plus Kopf
    const high = q.y < restO - ro - b.r * 0.5, tooHigh = q.y < restO - ro - 200 * (o.onG ? 1 : 0.4);
    if (tooHigh) continue;
    if (Math.max(0, Math.abs(q.x - o.x) - ro * (SHOE.ring + 0.5) - b.r) / spo + (o.onG ? (high ? 0.12 : 0.05) : 0.02) <= q.t) { tOpp = q.t; break; }
  }
  // steht der Gegner still neben einem ruhigen Ball, reagiert er nicht sofort: sonst warten beide ewig
  const oIdle = o.onG && Math.abs(o.vx) < 40 && o.lgS === 0 && dhypot(b.vx, b.vy) < 80;
  const first = q => tOpp + (oIdle ? 0.25 : 0) < q.t - 0.05;
  // Konter-Risiko: ein Treffer weit vor dem eigenen Tor, der kein sicheres Tor wird, lässt hinten offen. Das zählt nur so
  // weit, wie der Gegner kontern kann: steht er tief in seiner Hälfte (oDeep 1 = vor seinem Tor wie ein Camper, 0 = ab der
  // Mitte), muss er den Ball übers ganze Feld schießen; sonst spielte der Profi gegen einen Camper nur aus der eigenen Hälfte
  const oDeep = clamp(((o.x - own) * dir - W / 2) / (W / 2 - GOAL_W - ro), 0, 1);
  const deep = tx => (1 - oDeep) * clamp(((tx - own) * dir - (GOAL_W + r)) / (W - 2 * GOAL_W), 0, 1);
  // Anstoß (noch niemand am Ball): wer zuerst dran ist, hat ihn. Frühe Treffer zählen viel, Konter-Risiko nicht
  const ko = b.lt === -1;
  const val = (j, q, extra, tx) => {
    let v = j.v - 0.12 * q.t - extra;
    if (ko) return j.goal === 1 - i ? v : (q.t < tOpp - 0.03 ? 1 : 0) + 0.4 * j.v - 0.3 * q.t;   // erst das Rennen gewinnen, dann gut treffen
    if (j.goal !== i || j.block) v -= 0.22 * deep(tx);
    if (first(q)) v = v * 0.35 - 0.08;
    return v;
  };
  // Plan ehrlich durchspielen: laufen, springen, schwingen, bis der Ball wirklich zuerst Kopf oder Schuh berührt
  const F = ballPath(E, nb, 1.5, DT).pts;
  const evalPlan = pl => {
    const c = simPlan(st, p, F, pl, sp, rest, prof);
    if (!c) return null;
    const j = judge(E, st, c.b, i, 1.6, c.t), q = { t: c.t };
    return { v: val(j, q, pl.jumpAt >= 0 ? 0.04 : 0, pl.tx), t: c.t, cx: c.x, cy: c.y };
  };
  const add = (k, pl) => {
    if (pl.tx <= r || pl.tx >= W - r || outOfZone(B, pl.tx)) return;   // (Torwart: nur vor dem eigenen Tor)
    pl.until = pl.t0 + 0.3;
    const e = evalPlan(pl);
    if (e) cands.push({ k, tx: pl.tx, t: e.t, v: e.v, jumpAt: pl.jumpAt >= 0 ? st.el + pl.jumpAt : -1, pressAt: k === "air" ? st.el + pl.press : -1, cx: e.cx, cy: e.cy, ct: e.t, pl });
  };
  const rs = shoeDims(p).rs, tu = tUpOf(p);
  for (let k = 1; k < P.pts.length; k += 3) {
    const q = P.pts[k];
    // Schuh: Ball in Reichweite der Kreisbahn; Schwung so, dass der Schuh zur Zeit des Balls auf seiner Höhe ist
    const h = (q.y - rest) / r;
    if (p.onG && h > SHOE.top - 0.05) {
      const s0 = shoeAtHeight(h, p), ox = dsin(s0.a) * SHOE.ring * r + (b.r + rs) * 0.7, tx = q.x - dir * ox;
      const tp = q.t - (1 - cbrt3(1 - s0.d)) * tu;
      if (tp >= 0 && reach(tx, q.t)) add("shoe", { tx, jumpAt: -1, press: tp, t0: q.t });
    }
    // Schuss in der Luft: abspringen und schwingen, sodass der Schuh den Ball oben trifft (Ball zu hoch für den Stand)
    if (prof && h <= SHOE.top + 0.25) {
      for (const d of AIR_SWING) {
        const { a0, a1 } = swingAngles(), a = a0 + (a1 - a0) * d, rr = SHOE.ring * r;
        const hx = q.x - dir * (dsin(a) * rr + (b.r + rs) * 0.6), hy = q.y - dcos(a) * rr;
        if (hy >= rest - 20 || !reach(hx, q.t + 0.15)) continue;   // im Sprung darf er noch laufen
        const need = hy - rest, tr = (1 - cbrt3(1 - d)) * tu;
        const f = prof.find(z => Math.abs(z.y - need) < 9 && z.t <= q.t);
        if (f && q.t - tr >= 0) add("air", { tx: hx, jumpAt: q.t - f.t, press: q.t - tr, t0: q.t });
      }
    }
    // Kopfball: Ball oben bis seitlich vor dem Kopf, im Stand oder im Sprung
    for (const phi of HEAD_ANGLES) {
      const rr = r + b.r - 1, hx = q.x - dir * dsin(phi) * rr, hy = q.y + dcos(phi) * rr;
      if (hy >= rest + 4 || !reach(hx, q.t + (hy > rest - 10 ? 0 : 0.15))) continue;
      if (hy > rest - 10) { if (!reach(hx, q.t)) continue; add("head", { tx: hx, jumpAt: -1, press: -1, t0: q.t }); continue; }
      if (!prof) continue;
      const need = hy - rest;
      for (const f of prof) { if (f.vy >= 0) break; if (f.y <= need) { if (f.t <= q.t) add("jump", { tx: hx, jumpAt: q.t - f.t, press: -1, t0: q.t }); break; } }
    }
  }
  cands.sort((a, c) => c.v - a.v);
  // Die besten noch einmal mit kleinen Fehlern durchspielen (etwas zu früh/spät, etwas daneben):
  // ein Treffer, der bei kleinen Fehlern ins eigene Tor geht, ist keiner
  const missV = P.goal === 1 - i ? -0.9 : -0.05;
  for (const cd of cands.slice(0, 5)) {
    let sum = 0, n = 0, worst = 1;
    for (const [dt0, dx] of [[-0.035, 0], [0.035, 0], [0, 16], [0, -16]]) {
      const pl = { tx: cd.pl.tx + dir * dx, jumpAt: cd.pl.jumpAt >= 0 ? cd.pl.jumpAt + dt0 : -1, press: cd.pl.press >= 0 ? cd.pl.press + dt0 : -1, until: cd.pl.until };
      const e = evalPlan(pl), v = e ? e.v : missV;   // verfehlt: der Ball fliegt weiter (aufs eigene Tor = schlimm)
      sum += v; n++; if (v < worst) worst = v;
    }
    cd.v = 0.6 * cd.v + 0.4 * (sum / n) - (worst <= -0.8 ? 0.5 : 0);
  }
  cands.sort((a, c) => c.v - a.v);
  let pick = cands[0];
  // schwächere Stufen nehmen öfter eine der nächstbesten Möglichkeiten
  if (cands.length > 1 && rnd(B) > L.best) { const alt = cands.slice(1, 4).filter(c => c.v > 0); if (alt.length) pick = alt[Math.min(alt.length - 1, Math.floor(rnd(B) * alt.length))]; }
  const threat = P.goal === 1 - i;
  thinkPath = P;
  if (pick && (pick.v > 0.04 || (threat && pick.v > -0.95))) return inZone(B, pick, r);
  return inZone(B, safeWay(st, B, p, E, P, fallback(st, B, p, P, pick, threat)), r);
}

/** Plan ohne gewollten Treffer: Tor sichern (zustellen, zurück auf die Torseite, retten) */
function fallback(st, B, p, P, pick, threat) {
  const b = st.b, i = B.i, dir = p.dir, r = pr(p), own = i ? W : 0;
  // keine gute Berührung: Tor sichern. Ball zwischen mir und dem eigenen Tor → zurück auf die Torseite
  const behind = (b.x - p.x) * dir < -r * 0.3;
  const home = own + dir * (GOAL_W + r + 30);
  let tx;
  if (behind) tx = b.x - dir * (r + b.r + 30);
  else if (threat) { const q = P.pts.find(z => (z.x - home) * dir < r) || P.pts[P.pts.length - 1]; tx = q.x - dir * r * 0.5; }
  else { tx = home + (b.x - home) * (B.keeper ? 0.15 : 0.4); if ((b.x - tx) * dir < r + b.r + 30) tx = b.x - dir * (r + b.r + 30); }   // Torwart: bleibt nah am Tor
  return { k: behind ? "back" : threat ? "save" : "guard", tx: clamp(tx, r, W - r), t: 0.4, v: pick ? Math.min(0, pick.v) : -0.2, jumpAt: -1, pressAt: -1, cx: b.x, cy: b.y, ct: 0 };
}

/**
 * Unterwegs nicht aus Versehen ins eigene Tor lenken: läuft der Ball auf dem Weg zum Ziel gegen Kopf oder Schuh und
 * ginge danach Richtung eigenes Tor, lieber anhalten, zurückweichen oder drüber springen.
 */
function safeWay(st, B, p, E, P, plan) {
  const r = pr(p), sp = runSpeed(st, p), rest = G - footH(p), prof = p.onG ? jumpProfile(st, p, true) : null;
  const bump = (tx, jump) => {
    let worst = null;
    for (const q of P.pts) {
      if (q.t > 0.5) break;
      const x = p.x + clamp(tx - p.x, -sp * q.t, sp * q.t);
      let y = p.onG ? rest : p.y + p.vy * q.t;
      if (jump && prof) { const f = prof.find(z => z.t >= q.t); y = rest + (f ? f.y : 0); }
      if (dhypot(q.x - x, q.y - y) < r + st.b.r || dhypot(q.x - x, q.y - (y + SHOE.ring * r)) < 14 * SHOE.size * p.sc * (p.bootT > 0 ? PU.bootSize : 1) + st.b.r) {
        const c = contact(st, { ...st.b, ...q }, p, { x, y, vx: 0, vy: 0, onG: !jump, lgS: 0, lgD: 0, lgV: 0 });
        worst = c ? judge(E, st, c.b, B.i, 1.6, q.t).v : 0;
        break;
      }
    }
    return worst;
  };
  const v0 = bump(plan.tx, false);
  if (v0 === null || v0 > -0.3) return plan;
  let best = { tx: plan.tx, jump: false, v: v0 };
  for (const [tx, jump] of [[p.x, false], [p.x - p.dir * 90, false], [plan.tx, true], [p.x, true]]) {
    if (jump && !p.onG) continue;
    const v = bump(tx, jump), vv = v === null ? 0.05 : v;
    if (vv > best.v + 0.05) best = { tx, jump, v: vv };
  }
  return { ...plan, tx: clamp(best.tx, r, W - r), jumpAt: best.jump ? st.el : -1, k: best.jump ? "hop" : plan.k };
}

/**
 * Schwung in delay Schritten: trifft er, und was wird aus dem Ball? Echte Vorausrechnung mit Timing-Fehler der Stufe.
 * Liefert den Wert (judge) oder null ohne Treffer.
 */
function swingValue(st, B, p, E, P, delay) {
  const b = st.b, N = Math.ceil(tUpOf(p) * 120) + 2;
  for (let n = 1; n <= N; n++) {
    const t = n * DT, tt = t + delay * DT, q0 = P.pts[clamp(Math.round((tt + B.kErr) / DT) - 1, 0, P.pts.length - 1)];
    if (!q0) return null;
    const q = { ...b, ...q0 };
    // eigener Weg: läuft höchstens bis zum Ziel (dort bremst er), bremst er gerade ab, bleibt er etwa stehen
    const want = B.tx >= 0 ? B.tx - p.x : p.vx * tt, mv = p.vx * tt * want > 0 ? Math.sign(want) * Math.min(Math.abs(p.vx * tt), Math.abs(want)) : 0;
    const x = p.x + mv, y = p.onG ? p.y : p.y + p.vy * tt, d = swingAt(t, p);
    const g = shoeGeoAt(p, d, x, y), rx = q.x - g.x, ry = q.y - g.y, s = clamp(rx * g.ux + ry * g.uy, -g.hl, g.hl);
    if (dhypot(q.x - (g.x + g.ux * s), q.y - (g.y + g.uy * s)) < g.rs + b.r) {
      const c = contact(st, q, p, { x, y, vx: p.vx, vy: p.vy, onG: p.onG, lgS: 1, lgD: d, lgV: swingVelAt(t, p) });
      // nur ein echter Schuss zählt: trifft der Schuh erst oben (Schwung schon vorbei), prallt der Ball nur ab, dann lieber später drücken
      if (!c) return null;
      const spd = dhypot(c.b.vx, c.b.vy);
      return judge(E, st, c.b, B.i, 1.6, tt).v + 0.15 * clamp((spd - SHOE.minShot) / (SHOE.maxShot - SHOE.minShot), 0, 1);
    }
  }
  return null;
}
/** Jetzt den Schwung starten? Nur, wenn ein späterer Zeitpunkt (bis 0,06 s) nicht deutlich besser wäre */
function pressNow(st, B, p, L, E) {
  const b = st.b, r = pr(p);
  if (p.lgS !== 0 || p.slide > 0 || p.bomb || B.press > 0) return null;
  if ((b.x - p.x) * p.dir < -r * 0.2 || dhypot(b.x - p.x, b.y - p.y) > r * 3.6 + b.r + bootX(p)) return null;
  const P = ballPath(E, b, 0.32, DT);
  const now = swingValue(st, B, p, E, P, 0);
  if (now === null) return null;
  let later = -9;
  for (const dl of [2, 4, 7]) { const v = swingValue(st, B, p, E, P, dl); if (v !== null && v > later) later = v; }
  return now >= later - 0.03 ? now : null;
}

/**
 * Eisblock (Power-up, p.iceB): eingefroren tippt der Bot abwechselnd links und rechts, je ein Schritt lang (jeder neue
 * Druck taut ab), so schnell wie seine Stufe (L.tap je Sekunde, leicht gestreut über seinen Zufallsstrom). Der erste
 * Druck kommt nach der Reaktionszeit. Danach plant er neu. Nur, solange Hämmern noch abtaut (p.frz über dem Rest des
 * Eis-Supers p.frzS). true = eingefroren, c ist die ganze Eingabe
 */
function iceTap(B, p, L, dt, c) {
  if (!(p.frz > 0 && p.iceB && p.frz > (p.frzS || 0))) { B.iced = 0; return false; }
  if (!B.iced) { B.iced = 1; B.tapT = L.react; B.mag = 0; }
  B.thinkT = 0; B.jHold = 0; B.plan.k = "none"; B.plan.jumpAt = -1; B.plan.pressAt = -1;
  B.tapT -= dt;
  if (B.tapT <= 0) {
    B.tapT = (0.85 + 0.3 * rnd(B)) / L.tap; B.tapK = 1 - B.tapK;
    // nie die Taste, die gerade noch gehalten war (zählt nicht als neuer Druck)
    let k = B.tapK ? "r" : "l";
    if (p.keyM & (k === "l" ? 1 : 2)) { k = k === "l" ? "r" : "l"; B.tapK = 1 - B.tapK; }
    c[k] = true;
  }
  return true;
}

/**
 * Magnetschuh (Power-up, p.magT). Fangen: ein Ball, der in Kopfhöhe vor ihm ankommt (dort steht der oben gehaltene
 * Schuh), langsam genug (Relativtempo), mit Zeit fürs Bein (Schwung plus etwas) und ohne den Gegner in der Nähe
 * (MAG.opp) und ohne schon sehr guten Treffer-Plan (MAG.plan): Taste halten und an die Stelle laufen, an der der Schuh
 * den Ball trifft (auch im Lauf). Halten: läuft Richtung Tor und lässt los (= Schuss wie magnetShot), sobald der Schuss
 * frei aufs Tor geht, der Gegner zu nah kommt oder MAG.hold um ist. Liefert die Eingabe oder null (normal)
 */
function magnet(st, B, p, E, dt) {
  const b = st.b, c = {}, o = st.p[1 - B.i];
  if (b.stick && b.stick.i === B.i) {
    B.mag = 2; B.magJ = -1; B.thinkT = 0; B.plan.k = "none";
    const j = judge(E, st, magShot(st, b, p), B.i), held = PU.magHold - b.stick.t;
    const close = dhypot(o.x - b.x, o.y - b.y) < pr(o) + b.r + 70 + Math.abs(o.vx) * 0.12;   // gleich nimmt er ihn mir ab
    if ((j.goal === B.i && !j.block) || held >= MAG.hold || (close && held > 0.05)) { B.mag = 0; return c; }   // loslassen = Schuss
    c.k = true;
    // Richtung gegnerisches Tor (nicht in die Wand)
    if ((p.dir > 0 ? W - GOAL_W - 140 - p.x : p.x - GOAL_W - 140) > 0) c[p.dir > 0 ? "r" : "l"] = true;
    return c;
  }
  if (B.mag === 2) B.mag = 0;
  if (!(p.magT > 0) || b.fx || b.stick) { B.mag = 0; B.magJ = -1; return null; }
  if (B.mag === 1) {
    B.magW -= dt;
    // kam nicht, jemand hat den Ball berührt, oder ungeplant in der Luft: Bein runter, neu planen
    if (B.magW <= 0 || (!p.onG && B.magJ === -1) || (b.tch < dt * 1.5 && b.lt !== -1)) { B.mag = 0; B.magJ = -1; B.jHold = 0; B.thinkT = 0; return null; }
    c.k = true;
    const dx = B.magX - p.x, dead = 4 + Math.abs(p.vx) * 0.02;
    if (dx > dead) c.r = true; else if (dx < -dead) c.l = true;
    // Sprung zum geplanten Zeitpunkt (voll gehalten wie jumpProfile)
    if (B.magJ >= 0 && st.el >= B.magJ && p.onG) { B.jHold = 0.36; B.magJ = -2; }
    if (B.jHold > 0) { B.jHold -= dt; c.j = true; }
    return c;
  }
  const r = pr(p);
  if (!p.onG || p.lgS !== 0 || p.slide > 0 || B.press > 0 || B.plan.v > MAG.plan || dhypot(b.vx, b.vy) > PU.magRel || Math.abs(b.x - p.x) > r * 9) return null;
  const P = ballPath(E, b, 0.6, 1 / 60), rest = G - footH(p), g = shoeGeoAt(p, 1, 0, rest), tu = tUpOf(p) + 0.05, sp = runSpeed(st, p) * 0.8;
  const restO = G - footH(o), prof = jumpProfile(st, p, true);
  for (const q of P.pts) {
    if (q.t < tu || q.t < (b.magCD || 0) + 0.02) continue;
    if (Math.abs(o.x - q.x) < MAG.opp && q.y > restO - pr(o) - 240) continue;   // Gegner ist auch dran
    // Höhe: im Stand, sonst ein Sprung, der den Kopf zur Zeit q.t auf die nötige Höhe bringt (steigend oder oben)
    const need = q.y - g.y;   // Kopfhöhe relativ zum Stand, bei der die Schuhmitte auf Höhe des Balls ist
    let js = -1, hy = 0, hvy = 0;
    if (need > -(g.hl + g.rs + b.r)) js = -1;
    else {
      const f = prof.find(z => z.vy <= 60 && Math.abs(z.y - need) < 14 && z.t <= q.t - 0.02);
      if (!f) continue;
      js = q.t - f.t; hy = f.y; hvy = f.vy;
    }
    if (dhypot(q.vx, q.vy - hvy) > PU.magRel * 0.8) continue;   // zu schnell
    // Standorte: stehen bleiben, Ball an der Spitze, an der Mitte, an der Ferse des oben gehaltenen Schuhs
    for (const x of [p.x, q.x - g.x - p.dir * (g.hl + g.rs) * 0.6, q.x - g.x, q.x - g.x + p.dir * g.hl * 0.6]) {
      if (x <= r || x >= W - r || Math.abs(x - p.x) > sp * Math.max(0, q.t - 0.05)) continue;   // zu weit
      const rx = q.x - (x + g.x), ry = q.y - (g.y + hy), sl = clamp(rx * g.ux + ry * g.uy, -g.hl, g.hl);
      if (dhypot(rx - g.ux * sl, ry - g.uy * sl) > g.rs + b.r - 2) continue;   // Schuh trifft ihn dort nicht
      // vorher an Kopf oder Schuh (auf dem Weg dorthin, Bein noch im Schwung)?
      let bump = false;
      for (const z of P.pts) {
        if (z.t >= q.t - 1e-9) break;
        const hx = p.x + clamp(x - p.x, -sp * z.t, sp * z.t), jz = js >= 0 && z.t >= js ? prof[Math.min(prof.length - 1, Math.round((z.t - js) * 120))].y : 0;
        if (dhypot(z.x - hx, z.y - (rest + jz)) < r + b.r + 4) { bump = true; break; }
        if (z.t < tu && dhypot(z.x - (hx + g.x), z.y - (g.y + jz)) < g.hl + g.rs + b.r + 6) { bump = true; break; }
      }
      if (bump) continue;
      B.mag = 1; B.magW = q.t + 0.12; B.magX = x; B.magJ = js >= 0 ? st.el + js : -1; B.jHold = 0; c.k = true;
      if (js >= 0 && js < dt) { B.jHold = 0.36; B.magJ = -2; c.j = true; }
      return c;
    }
  }
  return null;
}
/** Magnetschuh: Gegner so nah am Fangpunkt (px, opp): nicht fangen; Plan so gut (plan): lieber den Plan; so lange höchstens halten (hold, s) */
export const MAG = { opp: 120, plan: 0.9, hold: 0.8 };
// Ball nach dem Loslassen des Magnetschuhs (wie magnetShot in powerups.js, mit Effet)
function magShot(st, b, p) {
  const dir = p.lgDir || p.dir, a = aimAngle(shotH(b, p)) * Math.PI / 180, sp = Math.min(PU.magShot * kickMul(st), maxBall(st));
  return { ...b, stick: null, vx: dir * dcos(a) * sp, vy: -dsin(a) * sp, spin: p.spinN > 0 ? 1 : 0, lt: p.i };
}

/** Eingabe des Bots für diesen Physikschritt */
export function brainInput(st, B, dt) {
  const p = st.p[B.i], b = st.b, L = levelOf(B.lvl), c = {};
  if (st.ph !== "play") { B.thinkT = 0; B.jHold = 0; B.plan.k = "none"; return c; }
  const r = pr(p), dir = p.dir;
  B.thinkT -= dt; B.wait -= dt; B.press -= dt; B.slideCD -= dt; B.kErrT -= dt; B.sup -= dt; B.jcd -= dt;
  if (iceTap(B, p, L, dt, c)) return c;
  const E = ballEnv(st);
  const mc = magnet(st, B, p, E, dt);
  if (mc) return mc;
  if (B.thinkT <= 0) {
    B.thinkT = L.think * (0.8 + 0.4 * rnd(B));
    const np = think(st, B, p, L, E), op = B.plan, P = thinkPath; thinkPath = null;
    const touchK = k => k === "shoe" || k === "head" || k === "jump";
    let take = op.k === "none", sw = false;
    if (!take && touchK(op.k)) {
      // geplanter Treffer noch gültig? Die neue Vorhersage muss zur geplanten Zeit nah am Treffpunkt sein
      const dt0 = op.at - st.el, q = P && P.pts.find(z => z.t >= dt0 - 1e-6);
      const valid = dt0 > -0.05 && q && dhypot(q.x - op.cx, q.y - op.cy) < 55;
      const same = touchK(np.k) && Math.abs(np.ct + st.el - op.at) < 0.12 && dhypot(np.cx - op.cx, np.cy - op.cy) < 45;
      if (same) { op.tx = np.tx; op.v = np.v; op.cx = np.cx; op.cy = np.cy; if (np.jumpAt >= 0 && op.jumpAt >= 0) op.jumpAt = np.jumpAt + B.jit; if (np.pressAt >= 0 && op.pressAt >= 0) op.pressAt = np.pressAt + B.jit; }
      else if (!valid || np.v > op.v + 0.15) { take = true; sw = true; }
    } else if (!take) {
      // Stellungsspiel: Ziel laufend nachführen; ein Treffer-Plan löst es ab
      if (touchK(np.k) || np.k !== op.k) { take = true; sw = np.k !== op.k; } else { op.tx = np.tx; op.v = np.v; }
    }
    if (take) {
      if (op.k === "none" && b.lt === -1) B.wait = L.react * 0.8;   // Anpfiff: auch der Bot braucht einen Moment
      if (sw) { B.switches++; if (Math.abs(np.tx - B.tx) > 60) B.wait = L.react * 0.5; }
      B.jit = gauss(B) * L.tjit;
      B.plan = { k: np.k, tx: np.tx, jumpAt: np.jumpAt >= 0 ? np.jumpAt + B.jit : -1, pressAt: np.pressAt >= 0 ? np.pressAt + B.jit : -1, jFull: true, v: np.v, at: st.el + np.ct, cx: np.cx, cy: np.cy, ct: np.ct };
    }
  }
  const pl = B.plan;
  // Laufen mit Bremsweg (während der Reaktionszeit läuft der alte Weg weiter)
  // (schwingt der Schuh gerade nach oben, bleibt das Ziel: pressNow hat mit ihm gerechnet, sonst läuft er dem Schuss davon)
  if ((B.wait <= 0 || pl.k === "none") && !(p.lgS === 1 && !p.lgHit)) B.tx = pl.tx;
  const tx = keeperBrake(st, B, p, B.tx < 0 ? p.x : B.tx), dx = tx - p.x, dead = 6 + Math.abs(p.vx) * 0.03;
  if (dx > dead) c.r = true; else if (dx < -dead) c.l = true;
  // Block im Weg (Layouts mit Mauer): drüberspringen, sonst bleibt der Bot davor hängen
  if (p.onG && (c.l || c.r) && st.obs && st.obs.length && B.jcd <= 0) {
    const mv = c.r ? 1 : -1;
    for (const ob of st.obs) if (ob.t === "plat" && ob.block) {
      const edge = mv > 0 ? ob.x - ob.w / 2 : ob.x + ob.w / 2, gap = (edge - p.x) * mv - r * 0.8;
      if (gap > -4 && gap < 50 && (tx - edge) * mv > 0) { B.jHold = Math.max(B.jHold, 0.3); B.jcd = 0.4; break; }
    }
  }
  // Ball liegt auf meinem Kopf: nach vorne und springen (Torwart: nur in seinem Bereich)
  if (Math.abs(b.x - p.x) < r * 0.6 && b.y < p.y - r && b.y > p.y - r - b.r - 30 && Math.abs(b.vy) < 120 && !outOfZone(B, p.x + dir * 80)) { c.r = dir > 0; c.l = dir < 0; if (p.onG) { B.jHold = 0.3; } }
  // Sprung zum geplanten Zeitpunkt
  if (pl.jumpAt >= 0 && p.onG && st.el >= pl.jumpAt) {
    // nur springen, wenn der Ball noch in der Nähe des geplanten Treffpunkts ist (sonst ist der Plan veraltet)
    const left = pl.at - st.el;
    if (left > -0.02 && left < 0.7 && dhypot(b.x - pl.cx, b.y - pl.cy) < dhypot(b.vx, b.vy) * left + 140) B.jHold = pl.jFull ? 0.36 : 0.02;
    pl.jumpAt = -1;
  }
  if (B.jHold > 0) { B.jHold -= dt; c.j = true; }
  // Schwung: im richtigen Moment, wenn der Treffer etwas bringt
  if (B.kErrT <= 0) { B.kErrT = 0.3; B.kErr = gauss(B) * L.tjit; }
  // Schuss in der Luft: Schwung zum geplanten Zeitpunkt (die Flugbahn kennt nur der Plan)
  if (pl.pressAt >= 0 && st.el >= pl.pressAt) { if (!p.onG && p.lgS === 0 && B.press <= 0) { c.k = true; B.press = tUpOf(p) + SHOE.tDown * 0.6; } pl.pressAt = -1; }
  const v = pressNow(st, B, p, L, E);
  if (v !== null) {
    const threat = pl.k === "save" || pl.k === "back";
    const want = threat ? v > -0.9 : v > 0.05 || (pl.k === "shoe" && v > pl.v - 0.3);
    if (want && rnd(B) >= L.hes * 0.5) { c.k = true; B.press = tUpOf(p) + SHOE.tDown * 0.6; }
  }
  // Grätsche: flacher Ball kurz vor mir, der Gegner ist dran
  const o = st.p[1 - B.i];
  if (p.onG && B.slideCD <= 0 && p.slideCD <= 0 && b.y > G - 70 && !outOfZone(B, p.x + dir * r * 3)) {
    const ahead = (b.x - p.x) * dir, oNear = Math.abs(o.x - b.x) < 130 && (o.x - b.x) * dir > 0;
    if (ahead > r + 30 && ahead < r + 170 && oNear) { B.slideCD = 1.2; if (rnd(B) < L.slide) c.d = true; }
  }
  // Super: voller Balken, Ball vor mir in der gegnerischen Hälfte
  if (p.full && B.sup <= 0 && (b.x - p.x) * dir > 0 && dhypot(b.x - p.x, b.y - p.y) < r + b.r + 85 && (b.x - W / 2) * dir > -100) { B.sup = 0.5; if (rnd(B) < L.sup * 0.5) c.s = true; }
  if (p.armed > 0) B.tx = b.x - dir * (r + b.r);
  return c;
}
