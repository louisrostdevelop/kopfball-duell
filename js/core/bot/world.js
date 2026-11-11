// Bot: Blick in die Zukunft mit der echten Physik. Ballbahn ohne Spieler (wie ballPhysics), Berührung mit Kopf und Schuh
// über die echten Regeln (ballVsPlayer auf einer Kopie), Bewertung, wohin ein Ball danach fliegt.
// Deterministisch: nur dmath, keine Uhr, kein Zufall; liest den Spielzustand, schreibt nie hinein.
import { W, G, GOAL_W, BAR_T, HR, POWERUPS, arenaById, clamp } from "../../content/config.js";
import { barY, collideCircle, collideRect, pr } from "../sim/base.js";
import { ballVsPlayer } from "../sim/ball.js";
import { obsBall } from "../sim/obstacles.js";
import { gMul, headStats, maxBall, wgt } from "../sim/rules.js";
import { fxGravity } from "../sim/supers.js";
import { BG, KICK, MOVE, PU } from "../sim/tuning.js";
import { movePlayer } from "../sim/player.js";
import { footH } from "../sim/shoe.js";
import { magRun } from "../sim/powerups.js";
import { dhypot, dsin } from "../../content/dmath.js";

// Feldwirkungen der Power-ups ohne aktive Wirkung: gemeinsame Vorlage, wird nie verändert (ballStep zählt nur mit on)
const OFF = { on: false, fl: 0, s: [0, 0], wd: 0, bg: [0, 0], wl: [0, 0], wh: [0, 0], wc: [0, 0], cl: [0, 0], ch: [0, 0], cc: [0, 0], pt: null };

/** Feste Werte der Ballbahn für den aktuellen Zustand (einmal je Überlegung) */
export function ballEnv(st) {
  const ar = arenaById(st.arena), w = wgt(st), ice = st.rules.floor === "ice";
  return {
    st, g: BG() * gMul(st) * w.grav, wind: st.wind ? st.wind.dir * PU.wind : 0,
    drag: ar.ballDrag * w.drag, ice, vDrag: ar.vDrag ? ar.vDrag * w.drag : 0,
    bounce: clamp((ar.bounce + w.bounce) * (st.rules.bounce || 1), 0.2, 0.95), roll: ice ? 0.995 : ar.roll,
    wb: clamp(0.7 * (st.rules.bounce || 1), 0.45, 0.95), lim: maxBall(st),
    // Latte ohne Riesentor (das rechnet die Bahn selbst mit, es kann unterwegs ablaufen)
    bar: [barY(st, 0) + (st.bigGoal[0] > 0 ? PU.goalUp : 0), barY(st, 1) + (st.bigGoal[1] > 0 ? PU.goalUp : 0)],
    hb: clamp(0.82 * Math.sqrt(st.rules.bounce || 1), 0.6, 0.95),   // Abprall am Doppelgänger (wie an einem Kopf)
    obs: st.obs && st.obs.length ? { obs: st.obs, rules: st.rules, arena: st.arena, mod: st.mod, el: st.el, ev: [] } : null,
    F: fieldNow(st), pu: orbsNow(st),
  };
}

// Feldwirkungen jetzt (Zeiten, Treffer und Sperrzeiten von Torwand und Doppelgänger, Portal); OFF, wenn nichts wirkt
function fieldNow(st) {
  const cl = st.clone || [{ t: 0, hp: 0 }, { t: 0, hp: 0 }], sl = st.slow2 || [0, 0], wd = st.wind ? st.wind.t : 0, pt = st.portal;
  const on = st.floatT > 0 || sl[0] > 0 || sl[1] > 0 || wd > 0 || st.bigGoal[0] > 0 || st.bigGoal[1] > 0 || st.wall[0] > 0 || st.wall[1] > 0 || cl[0].t > 0 || cl[1].t > 0 || !!pt;
  if (!on) return OFF;
  const wh = st.wallHp || [0, 0], wc = st.wallCD || [0, 0], cc = st.cloneCD || [0, 0];
  return { on, fl: st.floatT || 0, s: [sl[0], sl[1]], wd, bg: [st.bigGoal[0], st.bigGoal[1]], wl: [st.wall[0], st.wall[1]], wh: [wh[0], wh[1]], wc: [wc[0], wc[1]],
    cl: [cl[0].t, cl[1].t], ch: [cl[0].hp, cl[1].hp], cc: [cc[0], cc[1]], pt: pt ? { ...pt } : null };
}
/**
 * Feldwirkungen für eine Bahn, die t0 Sekunden nach jetzt beginnt: eigene Kopie (die Bahn zählt Zeiten und Treffer
 * herunter, wie das Spiel nach jedem Schritt). Treffer vor t0 kennt sie nicht. into: wiederverwendete Kopie (judge und
 * ballPath rufen das sehr oft auf; keine neuen Objekte je Aufruf), sonst eine neue
 */
function fieldAt(E, t0, into = newField()) {
  const F = E.F;
  if (!F.on) return OFF;
  const m = v => Math.max(0, v - t0), f = into;
  f.on = true; f.fl = m(F.fl); f.s[0] = m(F.s[0]); f.s[1] = m(F.s[1]); f.wd = m(F.wd); f.bg[0] = m(F.bg[0]); f.bg[1] = m(F.bg[1]);
  f.wl[0] = m(F.wl[0]); f.wl[1] = m(F.wl[1]); f.wh[0] = F.wh[0]; f.wh[1] = F.wh[1]; f.wc[0] = m(F.wc[0]); f.wc[1] = m(F.wc[1]);
  f.cl[0] = m(F.cl[0]); f.cl[1] = m(F.cl[1]); f.ch[0] = F.ch[0]; f.ch[1] = F.ch[1]; f.cc[0] = m(F.cc[0]); f.cc[1] = m(F.cc[1]);
  if (F.pt && F.pt.t - t0 > 0) { const q = f.ptq; q.t = F.pt.t - t0; q.i = F.pt.i; q.ax = F.pt.ax; q.ay = F.pt.ay; q.bx = F.pt.bx; q.by = F.pt.by; f.pt = q; } else f.pt = null;
  return f;
}
const newField = () => ({ on: true, fl: 0, s: [0, 0], wd: 0, bg: [0, 0], wl: [0, 0], wh: [0, 0], wc: [0, 0], cl: [0, 0], ch: [0, 0], cc: [0, 0], pt: null, ptq: { t: 0, i: 0, ax: 0, ay: 0, bx: 0, by: 0 } });
// je eine Kopie für ballPath und judge (beide laufen nie ineinander: ballStep ruft keins von beiden)
const FP = newField(), FJ = newField();
// Zeiten nach dem Ball weiterzählen, in der Reihenfolge von step (match.js) und fieldTimers (powerups.js). Ist alles
// abgelaufen, rechnet die Bahn ab hier ohne Feldwirkung weiter (f.on = false): dieselbe Rechnung wie mit lauter Nullen,
// nur schlank (plainStep); b.tch braucht dann niemand mehr (nur Torwand und Doppelgänger lesen es)
function fieldTick(f, dt) {
  let on = false;
  for (let i = 0; i < 2; i++) {
    if (f.wl[i] > 0) { f.wl[i] = Math.max(0, f.wl[i] - dt); on = on || f.wl[i] > 0; }
    if (f.bg[i] > 0) { f.bg[i] = Math.max(0, f.bg[i] - dt); on = on || f.bg[i] > 0; }
  }
  if (f.wd > 0) { f.wd = Math.max(0, f.wd - dt); on = on || f.wd > 0; }
  for (let i = 0; i < 2; i++) {
    if (f.s[i] > 0) { f.s[i] = Math.max(0, f.s[i] - dt); on = on || f.s[i] > 0; }
    if (f.wc[i] > 0) f.wc[i] = Math.max(0, f.wc[i] - dt);
    if (f.cc[i] > 0) f.cc[i] = Math.max(0, f.cc[i] - dt);
    if (!(f.wl[i] > 0)) f.wh[i] = 0;
    if (f.cl[i] > 0) { f.cl[i] = Math.max(0, f.cl[i] - dt); if (f.cl[i] === 0) f.ch[i] = 0; else on = true; }
  }
  if (f.fl > 0) { f.fl = Math.max(0, f.fl - dt); on = on || f.fl > 0; }
  if (f.pt) { f.pt.t -= dt; if (f.pt.t <= 0) f.pt = null; else on = true; }
  f.on = on;
}

// Kugeln (Power-ups) auf dem Feld: Ort, Alter, golden?
const orbsNow = st => (st.pu && st.pu.length ? st.pu.map(u => ({ x: u.x, y: u.y, t: u.t, g: POWERUPS[u.k] && POWERUPS[u.k].fam === "gold" })) : null);
/**
 * Sammelt der Ball (Stand q, tt Sekunden nach jetzt) eine Kugel ein? Wie im Spiel (powerups.js): einsammelbar ab t >= 0,
 * noch nicht abgelaufen, Abstand zur wippenden Kugel unter b.r + 36. Liefert den Bonus (Gold mehr), sonst 0
 */
function orbAt(E, q, tt) {
  for (const u of E.pu) {
    const ut = u.t + tt, rr = q.r + 36;
    if (ut < 0 || ut >= PU.life || Math.abs(q.x - u.x) > rr || Math.abs(q.y - u.y) > rr + 10) continue;
    if (dhypot(q.x - u.x, q.y - (u.y + dsin(ut * 3) * 10)) < rr) return u.g ? ORB_GOLD : ORB;
  }
  return 0;
}
/** Bonus in der Bewertung für einen Treffer, dessen Bahn eine Kugel einsammelt (normal, golden) */
export const ORB = 0.1, ORB_GOLD = 0.18;
/**
 * Steht der Gegner so nah vor seinem Tor (Anteil der Feldbreite ab seiner Wand, wie ein Camper oder Torwart), ist sein
 * Kopf ein Hindernis: ein Torschuss, der dort hindurchginge, gilt höchstens als abgefangen (judge)
 */
export const BODY_ZONE = 0.25;

/**
 * Ball um dt weiter (ohne Spieler), wie ballPhysics: mit Effet, Schwerelos, Zeitblase, Torwand, Doppelgänger, Portal und
 * festgehaltenem Ball (Magnetschuh). f: Feldwirkungen dieser Bahn (fieldAt), werden mitgezählt; b.tch (Zeit seit der
 * letzten Spielerberührung) zählt mit wie im Spiel. Liefert die Seite, für die ein Tor fiele (0 = links schießt, 1 =
 * rechts), sonst -1
 */
export function ballStep(E, b, dt, t, f = OFF) {
  if (!f.on && !b.stick && !b.spin) return plainStep(E, b, dt, t);   // häufigster Fall: schlank (der Bot ruft das sehr oft)
  // Magnetschuh: Ball sitzt auf der Schuhspitze (bewegt sich mit dem Halter), bis die Haltezeit um ist (wie magnetStep)
  if (b.stick) { b.stick.t -= dt; if (b.stick.t <= 0) b.stick = null; }
  // Zeitblase: in der Hälfte rechnet der Ball mit halber Zeit
  const bdt = f.on && f.s[b.x < W / 2 ? 0 : 1] > 0 ? dt * PU.timeK : dt;
  if (!b.stick) {
    const fg = b.fx ? fxGravity(b) : 1;
    b.vy += E.g * fg * (f.fl > 0 ? PU.floatG : 1) * bdt;
    if (b.spin && !b.fx) b.vy += PU.spinK * dhypot(b.vx, b.vy) * bdt;   // Effet (Topspin)
    if (f.wd > 0 && !b.fx) b.vx += E.wind * bdt;
    b.vx *= 1 - E.drag * (E.ice && b.y + b.r > G - 2 ? 0.3 : 1) * bdt;
    if (E.vDrag) b.vy *= 1 - E.vDrag * bdt;
    b.x += b.vx * bdt; b.y += b.vy * bdt;
  } else { b.x += b.vx * dt; b.y += b.vy * dt; }   // gehalten: folgt dem Halter (ohne Zeitblase)
  if (f.on) b.tch = b.stick ? 0 : Math.min(1, (b.tch || 0) + dt);   // nur Torwand und Doppelgänger lesen das
  // gehalten: was ihn ab hier verschiebt oder abbremst, löst ihn (unten)
  const sk = b.stick ? [b.x, b.y, b.vx, b.vy] : null;
  if (b.y + b.r > G && b.vy < 0) b.y = G - b.r;
  if (b.y + b.r > G && b.vy >= 0) {
    const imp = b.vy;
    b.y = G - b.r; b.vy = -b.vy * (b.fx === "bouncy" ? 1.06 : E.bounce); b.spin = 0;
    if (imp > 140) b.vx *= E.roll; else b.vx *= 1 - (1 - E.roll) * KICK.rollFric * bdt;
    if (Math.abs(b.vy) < 70) b.vy = 0;
  }
  if (E.obs) { const ox = b.vx, oy = b.vy; E.obs.el = E.st.el + t; obsBall(E.obs, b, dt); E.obs.ev.length = 0; if (b.vx !== ox || b.vy !== oy) b.spin = 0; }
  if (b.y - b.r < -260) { b.y = -260 + b.r; b.vy = Math.abs(b.vy) * E.wb; b.spin = 0; }
  if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * E.wb; b.spin = 0; }
  if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * E.wb; b.spin = 0; }
  let by0 = 0, by1 = 0;
  for (let side = 0; side < 2; side++) {
    const by = E.bar[side] - (f.bg[side] > 0 ? PU.goalUp : 0), x0 = side ? W - GOAL_W : 0, x1 = side ? W : GOAL_W, px = side ? W - GOAL_W : GOAL_W;
    if (side) by1 = by; else by0 = by;
    if (nearBar(b, side, by)) {
      if (collideRect(b, x0, x1, by - BAR_T / 2, by + BAR_T / 2, 1.6)) { b.spin = 0; if (b.y < by && Math.abs(b.vy) < 90) b.vx += (side ? -1 : 1) * 40; }
      if (collideRect(b, px - 4, px + 4, by - BAR_T / 2, by + 6, 1.6)) b.spin = 0;
    }
    if (!f.on) continue;
    // Torwand: drückt nur nach vorne, nie in den Boden; harte Treffer (Tempo vor dem Aufprall) zählen, nicht in der
    // Klemme (b.tch) und höchstens einer je Sperrzeit; nach PU.wallHp ist sie weg
    if (f.wl[side] > 0) {
      const wx = side ? W - GOAL_W - 10 : GOAL_W + 10;
      // weiter weg, als Hineindrücken und Abprall reichen (Rand 1 px): nur der Boden (Rechnung wie unten, schneller)
      if (!(Math.abs(b.x - wx) >= 8 + b.r)) {
        const fd = side ? -1 : 1, y0 = by + BAR_T / 2, sp0 = dhypot(b.vx, b.vy);
        if ((b.x - wx) * fd < 0 && Math.abs(b.x - wx) < 7 + b.r && b.y > y0 && b.y - b.r < G) b.x = wx + fd * 7.5;
        const hit = collideRect(b, wx - 7, wx + 7, y0, G, 1.75);
        if (b.y + b.r > G) b.y = G - b.r;
        if (hit) {
          b.spin = 0;
          if (sp0 >= PU.wallHard && b.tch >= PU.hitGap && !(f.wc[side] > 0)) { f.wc[side] = PU.hitCD; if (--f.wh[side] <= 0) { f.wl[side] = 0; f.wh[side] = 0; } }
        }
      } else if (b.y + b.r > G) b.y = G - b.r;
    }
    // Doppelgänger: fester Kopf vor dem Tor (unter der Mitte hineingedrückt: zurück auf die Feldseite, nie in den Boden)
    if (f.cl[side] > 0) {
      const cx = side ? W - GOAL_W - HR : GOAL_W + HR, cy = G - HR, m = HR + b.r + 1;
      // außerhalb des Quadrats um den Kopf (Rand 1 px) berührt er den Ball sicher nicht
      if (!(Math.abs(b.x - cx) >= m || Math.abs(b.y - cy) >= m)) {
        const fd = side ? -1 : 1;
        if (b.y > cy && (b.x - cx) * fd < 0 && dhypot(b.x - cx, b.y - cy) < HR + b.r) b.x = cx + (cx - b.x);
        const hc = collideCircle(b, cx, cy, HR + b.r, 0, 0, E.hb);
        if (hc) {
          if (b.y + b.r > G) b.y = G - b.r;
          b.spin = 0; b.stick = null;
          if (hc.imp >= PU.cloneHard && b.tch >= PU.hitGap && !(f.cc[side] > 0)) { f.cc[side] = PU.hitCD; if (--f.ch[side] <= 0) { f.cl[side] = 0; f.ch[side] = 0; } }
        }
      }
    }
  }
  if (sk && b.stick && (b.x !== sk[0] || b.y !== sk[1] || b.vx !== sk[2] || b.vy !== sk[3])) b.stick = null;
  // Portal: einmal vom Eingang auf den Ausgang
  if (f.pt && dhypot(b.x - f.pt.ax, b.y - f.pt.ay) < PU.portalR) { b.x = f.pt.bx; b.y = f.pt.by; b.stick = null; f.pt = null; }
  const sp = dhypot(b.vx, b.vy), lim = b.fx ? 2300 : E.lim;
  if (sp > lim) { b.vx *= lim / sp; b.vy *= lim / sp; }
  if (f.on) fieldTick(f, dt);
  if (b.x + b.r * 0.6 < GOAL_W && b.y - b.r * 0.3 > by0 + BAR_T / 2) return 1;
  if (b.x - b.r * 0.6 > W - GOAL_W && b.y - b.r * 0.3 > by1 + BAR_T / 2) return 0;
  return -1;
}

/**
 * Kann der Ball Latte oder Pfosten der Seite side (Latte auf Höhe by) berühren? Sonst ändern beide nichts (collideRect
 * bewegt nur, wenn der Abstand unter b.r liegt). Rand 1 px, damit Rundung nie zählt; NaN geht den vollen Weg
 */
function nearBar(b, side, by) {
  const far = side ? b.x + b.r + 1 <= W - GOAL_W - 4 : b.x - b.r - 1 >= GOAL_W + 4;
  return !far && !(Math.abs(b.y - by) >= BAR_T / 2 + b.r + 1);
}

// ballStep ohne Feldwirkung, Effet und festgehaltenen Ball: dieselbe Rechnung, nur ohne die Abfragen dafür. Rechnet mit
// lokalen Werten (gleiche Reihenfolge der Rechenschritte, also bitgleich) und schreibt sie nur vor Aufrufen, die den
// Ball lesen (Hindernisse, Latte), und am Ende zurück: spart die vielen Schreibzugriffe (der Bot ruft das sehr oft)
function plainStep(E, b, dt, t) {
  const fg = b.fx ? fxGravity(b) : 1, r = b.r;
  let vy = b.vy + E.g * fg * dt;
  let vx = b.vx * (1 - E.drag * (E.ice && b.y + r > G - 2 ? 0.3 : 1) * dt);
  if (E.vDrag) vy *= 1 - E.vDrag * dt;
  let x = b.x + vx * dt, y = b.y + vy * dt;
  if (y + r > G && vy < 0) y = G - r;
  if (y + r > G && vy >= 0) {
    const imp = vy;
    y = G - r; vy = -vy * (b.fx === "bouncy" ? 1.06 : E.bounce);
    if (imp > 140) vx *= E.roll; else vx *= 1 - (1 - E.roll) * KICK.rollFric * dt;
    if (Math.abs(vy) < 70) vy = 0;
  }
  if (E.obs) { b.x = x; b.y = y; b.vx = vx; b.vy = vy; E.obs.el = E.st.el + t; obsBall(E.obs, b, dt); E.obs.ev.length = 0; x = b.x; y = b.y; vx = b.vx; vy = b.vy; }
  if (y - r < -260) { y = -260 + r; vy = Math.abs(vy) * E.wb; }
  if (x - r < 0) { x = r; vx = Math.abs(vx) * E.wb; }
  if (x + r > W) { x = W - r; vx = -Math.abs(vx) * E.wb; }
  for (let side = 0; side < 2; side++) {
    const by = E.bar[side];
    // wie nearBar(b, side, by), mit den lokalen Werten
    if (side ? x + r + 1 <= W - GOAL_W - 4 : x - r - 1 >= GOAL_W + 4) continue;
    if (Math.abs(y - by) >= BAR_T / 2 + r + 1) continue;
    const x0 = side ? W - GOAL_W : 0, x1 = side ? W : GOAL_W, px = side ? W - GOAL_W : GOAL_W;
    b.x = x; b.y = y; b.vx = vx; b.vy = vy;
    if (collideRect(b, x0, x1, by - BAR_T / 2, by + BAR_T / 2, 1.6) && b.y < by && Math.abs(b.vy) < 90) b.vx += (side ? -1 : 1) * 40;
    collideRect(b, px - 4, px + 4, by - BAR_T / 2, by + 6, 1.6);
    x = b.x; y = b.y; vx = b.vx; vy = b.vy;
  }
  const sp = dhypot(vx, vy), lim = b.fx ? 2300 : E.lim;
  if (sp > lim) { vx *= lim / sp; vy *= lim / sp; }
  b.x = x; b.y = y; b.vx = vx; b.vy = vy;
  if (x + r * 0.6 < GOAL_W && y - r * 0.3 > E.bar[0] + BAR_T / 2) return 1;
  if (x - r * 0.6 > W - GOAL_W && y - r * 0.3 > E.bar[1] + BAR_T / 2) return 0;
  return -1;
}

// alle Felder (Spezialschüsse brauchen ihre Merker, sonst entsteht beim Abwehren NaN), Zeitsperren aus; der Magnetschuh-
// Merker als eigene Kopie (die Bahn zählt seine Zeit herunter)
const copyBall = b => ({ ...b, held: 0, ghost: 0, nhT: 0, vmem: b.vmem || 0, grow: 1, stick: b.stick ? { i: b.stick.i, t: b.stick.t } : null });

/**
 * Ballbahn ab b für T Sekunden in Schritten dt: [{x, y, vx, vy, t}], dazu goal = Seite eines Tors (-1 keins) und gt = Zeit.
 * Bleibt an einem Tor stehen.
 */
export function ballPath(E, b0, T, dt) {
  const b = copyBall(b0), out = [], f = fieldAt(E, 0, FP);
  let goal = -1, gt = 0;
  for (let t = dt; t <= T + 1e-9; t += dt) {
    const gs = ballStep(E, b, dt, t, f);
    out.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, t });
    if (gs >= 0) { goal = gs; gt = t; break; }
  }
  return { pts: out, goal, gt };
}

// Kopie des Zustands für Berührungen (nichts davon landet im echten Spiel)
const scratch = { stats: [{}, {}], ev: [], hs: 0, slow: 0, el: 0 };
function scratchFor(st) {
  scratch.rules = st.rules; scratch.arena = st.arena; scratch.mod = st.mod; scratch.lv = st.lv; scratch.obs = null;
  scratch.p = st.p; scratch.b = null; scratch.ev.length = 0; scratch.hs = 0; scratch.el = st.el; scratch.wall = st.wall; scratch.bigGoal = st.bigGoal;
  scratch.wallHp = st.wallHp; scratch.clone = st.clone; scratch.slow2 = st.slow2; scratch.floatT = st.floatT; scratch.portal = st.portal; scratch.wind = st.wind;
  for (const s of scratch.stats) { s.shots = 0; s.heads = 0; s.slides = 0; s.bombs = 0; s.goals = 0; }
  return scratch;
}

/**
 * Berührung vorausrechnen: Ball (Stand zum Treffzeitpunkt) trifft Spieler in Pose pose (x, y, vx, vy, Bein lgS/lgD/lgV).
 * Echte Regeln für Kopf und Schuh. Liefert den Ball danach (oder null ohne Berührung) und ob es ein Schuss war.
 */
export function contact(st, ball, p, pose) {
  const S = scratchFor(st), b = copyBall(ball);
  const q = { ...p, ...pose, slide: 0, bomb: 0, armed: 0, fireNext: false, hc: 0, pushCD: 1, nhT: 0, lgHit: false, kHitP: true, lgBl: 0 };
  const vx0 = b.vx, vy0 = b.vy;
  S.b = b;
  ballVsPlayer(S, b, q, 1 / 120);
  if (b.vx === vx0 && b.vy === vy0) return null;
  return { b, shot: S.ev.some(e => e.t === "kick") };
}

// ---------- Sprünge: echte Bewegung einmal durchgerechnet, nach Kopf/Arena/Regeln gemerkt ----------
const jumpCache = new Map();
/** Höhenprofil eines Sprungs (voll gehalten bzw. kurz getippt): [{t, y, vy}] relativ zur Standhöhe (y < 0 = oben) */
export function jumpProfile(st, p, full) {
  // alles, wovon der Sprung abhängt (Größe ändert sich fließend: genau genug im Schlüssel, Größen-Power-ups extra)
  const k = [p.ch, (st.lv && st.lv[p.i]) || 1, st.arena, st.mod, st.rules.grav, st.rules.head, p.wingT > 0, p.bigT > 0, p.miniT > 0, p.sc.toFixed(4), full].join("|");
  let prof = jumpCache.get(k);
  if (prof) return prof;
  const S = { arena: st.arena, rules: st.rules, mod: st.mod, lv: st.lv, stats: [{ slides: 0, bombs: 0 }, { slides: 0, bombs: 0 }], ev: [], obs: null, b: { x: 0 }, p: [], bigGoal: [0, 0], wall: [0, 0] };
  const rest = G - footH(p), q = { ...p, x: W / 2, y: rest, vx: 0, vy: 0, onG: true, coy: 0, jHeld: false, lastJ: false, slide: 0, bomb: 0, frz: 0, stun: 0, knock: 0, confT: 0, charmT: 0, sadT: 0, dBuf: 0, lastD: false, slideCD: 1,
    // nur, was im Schlüssel steht: sonst hinge das gemerkte Profil davon ab, welcher Zustand es zuerst berechnet hat
    sc: +p.sc.toFixed(4), wingT: p.wingT > 0 ? 9 : 0, bigT: p.bigT > 0 ? 9 : 0, miniT: p.miniT > 0 ? 9 : 0, djUsed: true, iceB: false, keyM: 0 };
  prof = [];
  const dt = 1 / 120;
  for (let n = 1; n <= 150; n++) {
    movePlayer(S, q, { j: full ? true : n <= 2 }, dt, false);
    prof.push({ t: n * dt, y: q.y - rest, vy: q.vy });
    if (q.onG && n > 3) break;
  }
  if (jumpCache.size > 200) jumpCache.clear();
  jumpCache.set(k, prof);
  return prof;
}

/** Laufgeschwindigkeit des Spielers jetzt (wie movePlayer) */
export function runSpeed(st, p) {
  const ar = arenaById(st.arena), ch = headStats(st, p);
  return MOVE.run * ch.spd * ar.spd * (st.mod === "turbo" ? 1.22 : 1) * st.rules.speed * (p.wingT > 0 ? PU.wingRun : 1) * (p.miniT > 0 ? PU.miniRun : 1) * (p.sadT > 0 ? 0.55 : 1) * magRun(st, p);
}

/**
 * Wie gut ist ein Ball, der so weiterfliegt, für Seite i? +1 sicheres Tor, -1 Eigentor. Der Gegner o kann den Ball
 * abfangen, wenn er rechtzeitig unter/an der Bahn ist (Laufen + Sprunghöhe, mit Reaktionszeit). t0: so viele Sekunden
 * nach jetzt fliegt b los (Feldwirkungen, Kugeln). Sammelt die Bahn eine Kugel ein, gibt es einen Bonus (ORB), außer
 * bei einem sicheren Tor (danach ist jede Wirkung weg) und einem Eigentor.
 */
export function judge(E, st, b, i, T = 1.6, t0 = 0) {
  // ohne Zwischenliste (der Bot ruft das sehr oft auf): Bahn Schritt für Schritt, Abfangen gleich mitprüfen
  const o = st.p[1 - i], ro = pr(o), dir = i ? -1 : 1, dt = 1 / 40, q = copyBall(b), f = fieldAt(E, t0, FJ);
  const spo = runSpeed(st, o), reachH = (G - footH(o)) - 175 * (headStats(st, o).jmp || 1) - ro;   // höchster Punkt, den sein Kopf erreicht
  const restO = G - footH(o) - ro;   // Oberkante seines Kopfs am Boden (die Kopfmitte ist restO + ro)
  // Gegner vor seinem Tor: sein Kopf, wo er jetzt steht (springt oder fällt er, mit der Fallkurve wie simPlan)
  const wall = Math.abs(o.x - (i ? 0 : W)) < BODY_ZONE * W;
  let block = 0, goal = -1, gt = 0, moved = false, orb = 0, body = false;
  for (let t = dt; t <= T + 1e-9; t += dt) {
    const gs = ballStep(E, q, dt, t, f); moved = true;
    if (!block && q.y >= reachH - b.r && Math.max(0, Math.abs(q.x - o.x) - ro - b.r) / spo + 0.12 + (q.y < restO ? 0.18 : 0) <= t) block = 1;
    if (wall && !body && Math.abs(q.x - o.x) < ro + b.r && dhypot(q.x - o.x, q.y - Math.min(restO + ro, o.y + (o.onG ? 0 : o.vy * t + 1500 * t * t))) < ro + b.r) body = true;
    if (E.pu && !orb) orb = orbAt(E, q, t0 + t);
    if (gs >= 0) { goal = gs; gt = t; break; }
  }
  if (goal === 1 - i) return { v: -1, goal, gt };
  if (body) block = 1;   // durch seinen Kopf: kein sicheres Tor, auch wenn er nicht hinkäme (er steht schon da)
  if (goal === i) return { v: block ? 0.3 + orb : 1, goal, gt, block, orb };
  // kein Tor: wo endet der Ball? Vorne gut, vor dem eigenen Tor schlecht
  const end = moved ? q : b;
  const prog = ((end.x - W / 2) * dir) / (W / 2);           // -1 eigenes Tor .. +1 gegnerisches
  const danger = (end.x - (i ? W : 0)) * dir < 300 && end.vx * dir < 0 ? 0.35 : 0;
  return { v: clamp(0.18 * prog - danger, -0.6, 0.3) + orb, goal: -1, gt: 0, block, orb };
}

