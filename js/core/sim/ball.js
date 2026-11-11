// Ball: Flug, Boden, Wände, Latten, Tor-Erkennung, Kopf und Fuß
import { W, G, GOAL_W, BAR_T, HR, SR, arenaById, clamp } from "../../content/config.js";
import { addMeter, barY, collideCircle, collideRect, ev, pr, shoePos, unstick } from "./base.js";
import { goal } from "./goal.js";
import { obsBall } from "./obstacles.js";
import { baseBR, gMul, maxBall, wgt } from "./rules.js";
import { endFx, fxGravity, meteorImpact, stoneRoll, superStep, touch } from "./supers.js";
import { bombBall, slideBall } from "./tricks.js";
import { pinBall } from "./powerups.js";
import { magnetReady, shoeBall, touchesBall } from "./shoe.js";
import { BG, KICK, PU, bv, pv } from "./tuning.js";
import { dexp, dhypot, rnd, rrange } from "../../content/dmath.js";

// Ball klemmt zwischen beiden Spielern: nach kurzer Zeit springt er fair nach oben raus
export function unjam(st, dt) {
  const b = st.b, [a, c] = st.p;
  const near = p => dhypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 10 || dhypot(b.x - shoePos(p).x, b.y - shoePos(p).y) < SR * p.sc + b.r + 10;
  const between = (b.x - a.x) * (b.x - c.x) < 0;
  // nach Position messen (die Geschwindigkeit kann beim Einklemmen riesig sein, obwohl sich nichts bewegt)
  if (near(a) && near(c) && between && !b.fx) {
    if (st.jamX === undefined || dhypot(b.x - st.jamX, b.y - st.jamY) > 34) { st.jamX = b.x; st.jamY = b.y; st.jam = 0; }
    else st.jam += dt;
  } else { st.jam = 0; st.jamX = undefined; }
  if (st.jam > 0.7) {
    st.jamX = undefined;
    st.jam = 0;
    b.vy = -bv(900); b.vx = (rnd(st) < 0.5 ? -1 : 1) * rrange(st, 220, 300); b.y -= 6; b.ghost = 0.3; unstick(st);
    ev(st, { t: "pop", x: b.x, y: b.y });
  }
}

export function ballPhysics(st, dt, postGoal) {
  const b = st.b, ar = arenaById(st.arena);
  // Größe
  const tr = baseBR(st) * (b.fx === "giant" || b.grow > 1 ? b.grow : 1);
  if (b.fx !== "giant" && b.grow > 1) b.grow = Math.max(1, b.grow - dt * 0.8);
  b.r += (tr - b.r) * Math.min(1, dt * 10);
  const fxGrav = fxGravity(b);
  // Tempo-Gedächtnis: wie schnell war der Ball kurz vor einer Berührung?
  b.vmem = Math.max(dhypot(b.vx, b.vy), (b.vmem || 0) * dexp(-dt * KICK.memDecay));
  if (b.fx && !postGoal) superStep(st, b, dt);
  // Zeitblase (Power-up): in der Hälfte von i rechnet der Ball mit halber Zeit (Schwerkraft, Bewegung, Drehung, Reibung)
  const half = b.x < W / 2 ? 0 : 1, bdt = st.slow2 && st.slow2[half] > 0 ? dt * PU.timeK : dt;
  // Magnetschuh: der Ball sitzt auf der Schuhspitze (powerups.js magnetStep), keine eigene Bewegung
  if (!b.stick) {
    const fl = st.floatT > 0 ? PU.floatG : 1;   // Schwerelos
    b.vy += BG() * gMul(st) * fxGrav * wgt(st).grav * fl * bdt;
    if (b.spin && !b.fx) b.vy += PU.spinK * dhypot(b.vx, b.vy) * bdt;   // Effet: Topspin drückt den Ball nach unten
    if (st.wind && st.wind.t > 0 && !b.fx) b.vx += st.wind.dir * PU.wind * bdt;   // Rückenwind
    b.vx *= 1 - ar.ballDrag * wgt(st).drag * (st.rules.floor === "ice" && b.y + b.r > G - 2 ? 0.3 : 1) * bdt;
    if (ar.vDrag) b.vy *= 1 - ar.vDrag * wgt(st).drag * bdt;   // Wasser bremst auch nach oben und unten
    b.x += b.vx * bdt; b.y += b.vy * bdt;
    b.av = b.vx / b.r; b.a += b.av * bdt;
  }
  if (b.held > 0) b.held -= dt;
  if (b.nhT > 0) b.nhT -= dt;
  if (b.magCD > 0) b.magCD = Math.max(0, b.magCD - dt);
  b.tch = Math.min(1, (b.tch || 0) + dt);   // Zeit seit der letzten Berührung durch einen Spieler (Klemm-Regel an Torwand und Klon)

  if (b.ghost > 0) b.ghost -= dt;
  if (!postGoal && !(b.ghost > 0)) {
    // Magnetschuh: fangen kann nur, wer den Ball nicht zugleich mit dem Gegner berührt, weder jetzt noch auf der eigenen
    // Schuhspitze (sonst entschiede die Reihenfolge, wer ihn behält); sonst fängt keiner, Sperrzeit wie nach dem Lösen
    if (!b.stick && st.p.some(p => magnetReady(b, p) && contested(b, p, st.p[1 - p.i]))) b.magCD = PU.magLock;
    st.p.forEach(p => ballVsPlayer(st, b, p, dt));
  }
  if (b.stick) b.tch = 0;
  // Magnetschuh: was den gehaltenen Ball ab hier verschiebt oder abbremst (Boden, Hindernis, Wand, Decke, Latte, Pfosten,
  // Torwand, Doppelgänger), löst ihn (unten). Sonst säße er nächsten Schritt wieder auf der Spitze, auch hinter einer Wand.
  const sk = b.stick ? [b.x, b.y, b.vx, b.vy] : null;
  // Boden
  if (b.y + b.r > G && b.vy < 0) b.y = G - b.r; // gerade weggeschossen: nur aus dem Boden heben
  if (b.y + b.r > G && b.vy >= 0) {
    const imp = b.vy;
    b.y = G - b.r; b.spin = 0;
    const bounce = b.fx === "bouncy" ? 1.06 : clamp((ar.bounce + wgt(st).bounce) * (st.rules.bounce || 1), 0.2, 0.95);
    b.vy = -b.vy * bounce;
    // Aufprall kostet einmal etwas Tempo, Rollen nur wenig pro Sekunde (nicht jeder Schritt wie ein Aufprall)
    const roll = st.rules.floor === "ice" ? 0.995 : ar.roll;
    if (imp > 140) b.vx *= roll; else b.vx *= 1 - (1 - roll) * KICK.rollFric * bdt;
    if (Math.abs(b.vy) < 70) b.vy = 0;
    if (imp > 220) ev(st, { t: "bounce", x: b.x, y: G, v: imp });
    if ((b.fx === "meteor" || b.fx === "stone") && b.fxP === 2) { meteorImpact(st, b); if (b.fx === "stone") stoneRoll(st, b); }
    if (b.fx && !["bouncy", "giant"].includes(b.fx) && !(b.fx === "stone" && b.fxP === 3)) endFx(st);
  }
  if (st.obs && st.obs.length) { const ox = b.vx, oy = b.vy; obsBall(st, b, dt); if (b.vx !== ox || b.vy !== oy) b.spin = 0; }
  // Decke & Wände (Effet: jede Berührung löscht ihn)
  const wb = clamp(0.7 * (st.rules.bounce || 1), 0.45, 0.95);
  if (b.y - b.r < -260) { b.y = -260 + b.r; b.vy = Math.abs(b.vy) * wb; b.spin = 0; }
  if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * wb; b.spin = 0; if (b.fx && b.fx !== "bouncy") endFx(st); }
  if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * wb; b.spin = 0; if (b.fx && b.fx !== "bouncy") endFx(st); }
  // Latten
  for (let side = 0; side < 2; side++) {
    const by = barY(st, side);
    const x0 = side ? W - GOAL_W : 0, x1 = side ? W : GOAL_W;
    if (collideRect(b, x0, x1, by - BAR_T / 2, by + BAR_T / 2, 1.6)) {
      b.spin = 0;
      if (dhypot(b.vx, b.vy) > 200) ev(st, { t: "post", x: b.x, y: by });
      // Ball liegt auf der Latte: sanft zurück ins Feld rollen lassen
      if (b.y < by && Math.abs(b.vy) < 90) b.vx += (side ? -1 : 1) * 40;
      if (b.fx && b.fx !== "bouncy" && b.fx !== "giant") endFx(st);
    }
    // Pfosten vorne (dünn)
    const px = side ? W - GOAL_W : GOAL_W;
    if (collideRect(b, px - 4, px + 4, by - BAR_T / 2, by + 6, 1.6)) b.spin = 0;
    // Torwand-Power-up: hält PU.wallHp harte Treffer (Balltempo vor dem Aufprall); im Torjubel nur Abprall
    if (st.wall[side] > 0) {
      const wx = side ? W - GOAL_W - 10 : GOAL_W + 10, fd = side ? -1 : 1, y0 = by + BAR_T / 2, sp0 = dhypot(b.vx, b.vy);
      // hält nur nach vorne: steckt der Ball mit der Mitte schon hinter der Mitte der Wand (hineingedrückt), kommt er
      // trotzdem auf die Feldseite (sonst schiebt man ihn mit Kopf oder Magnetschuh durch die Wand ins Tor)
      if ((b.x - wx) * fd < 0 && Math.abs(b.x - wx) < 7 + b.r && b.y > y0 && b.y - b.r < G) b.x = wx + fd * 7.5;
      const hit = collideRect(b, wx - 7, wx + 7, y0, G, 1.75);
      if (b.y + b.r > G) b.y = G - b.r;   // nie in den Boden drücken
      if (hit && !postGoal) {
        ev(st, { t: "wallhit", x: wx, y: b.y });
        b.spin = 0;
        if (b.fx && b.fx !== "giant") endFx(st);
        if (sp0 >= PU.wallHard && hardHit(st, b, "wallCD", side)) {
          st.wallHp[side]--;
          ev(st, { t: "wallcrack", i: side, x: wx, y: b.y, hp: Math.max(0, st.wallHp[side]) });
          if (st.wallHp[side] <= 0) { st.wall[side] = 0; st.wallHp[side] = 0; ev(st, { t: "wallbreak", i: side, x: wx, y: b.y }); }
        }
      }
    }
    // Doppelgänger-Power-up: fester Kopf vor dem eigenen Tor
    if (st.clone && st.clone[side].t > 0) cloneBall(st, b, side, postGoal);
  }
  if (sk && b.stick && (b.x !== sk[0] || b.y !== sk[1] || b.vx !== sk[2] || b.vy !== sk[3])) unstick(st);
  // Portal-Power-up: Ball nah am Eingang → auf den Ausgang (Tempo, Richtung und Effet bleiben), nur einmal
  const pt = st.portal;
  if (pt && !postGoal && dhypot(b.x - pt.ax, b.y - pt.ay) < PU.portalR) {
    b.x = pt.bx; b.y = pt.by; unstick(st); st.portal = null;
    ev(st, { t: "portal", i: pt.i, x: pt.ax, y: pt.ay, x2: pt.bx, y2: pt.by });
  }
  // Tempo-Limit
  const sp = dhypot(b.vx, b.vy), lim = b.fx ? 2300 : maxBall(st);
  if (sp > lim) { b.vx *= lim / sp; b.vy *= lim / sp; }
  // Tor?
  if (!postGoal && st.ph === "play") {
    if (b.x + b.r * 0.6 < GOAL_W && b.y - b.r * 0.3 > barY(st, 0) + BAR_T / 2) goal(st, 1);
    else if (b.x - b.r * 0.6 > W - GOAL_W && b.y - b.r * 0.3 > barY(st, 1) + BAR_T / 2) goal(st, 0);
  }
}

// Magnetschuh: berührt der Gegner o den Ball jetzt oder dort, wo p ihn festhalten würde (Schuhspitze)?
function contested(b, p, o) {
  if (touchesBall(b, o)) return true;
  const t = { x: b.x, y: b.y, vx: 0, vy: 0, r: b.r };
  pinBall(t, p);
  return touchesBall(t, o);
}

/**
 * Harter Treffer an Torwand oder Doppelgänger zählt? Nicht, wenn ein Spieler den Ball eben noch berührt hat (Ball
 * eingeklemmt zwischen Kopf/Schuh und Hindernis: dort entsteht in jedem Schritt riesiges Tempo, ohne dass jemand schießt),
 * und je Hindernis höchstens ein Treffer in PU.hitCD Sekunden. k: "wallCD" oder "cloneCD"
 */
function hardHit(st, b, k, side) {
  if (b.tch < PU.hitGap || st[k][side] > 0) return false;
  st[k][side] = PU.hitCD;
  return true;
}

// Doppelgänger: Ball prallt ab wie an einem stehenden Kopf; harte Treffer zählen, nach PU.cloneHp ist er weg.
// Im Torjubel nur Abprall (kein Treffer, kein Ereignis).
function cloneBall(st, b, side, postGoal) {
  const c = st.clone[side], cx = side ? W - GOAL_W - HR : GOAL_W + HR, cy = G - HR, fd = side ? -1 : 1;
  // unter der Kopfmitte hinter die Mitte gedrückt (Klemme am Boden): zurück auf die Feldseite (sonst rutscht er durch)
  if (b.y > cy && (b.x - cx) * fd < 0 && dhypot(b.x - cx, b.y - cy) < HR + b.r) b.x = cx + (cx - b.x);
  const hc = collideCircle(b, cx, cy, HR + b.r, 0, 0, clamp(0.82 * Math.sqrt(st.rules.bounce || 1), 0.6, 0.95));
  if (!hc) return;
  if (b.y + b.r > G) b.y = G - b.r;   // nie in den Boden drücken (der Boden ist schon gerechnet)
  b.spin = 0; unstick(st);
  if (postGoal) return;
  if (b.fx && b.fx !== "giant") endFx(st);
  if (hc.imp < PU.cloneHard || !hardHit(st, b, "cloneCD", side)) return;
  c.hp--;
  ev(st, { t: "clonehit", i: side, x: cx, y: cy, hp: Math.max(0, c.hp) });
  if (c.hp <= 0) { st.clone[side] = { t: 0, hp: 0 }; ev(st, { t: "clonebreak", i: side, x: cx, y: cy }); }
}

/** Ball gegen Spieler. Hält der eigene Magnetschuh den Ball, keine Berührung; berührt ihn der Gegner, löst er sich. */
export function ballVsPlayer(st, b, p, dt) {
  if (b.stick && b.stick.i === p.i) return;
  const x = b.x, y = b.y, vx = b.vx, vy = b.vy, held = !!b.stick;
  hitPlayer(st, b, p, dt);   // hält der Gegner den Ball, fängt p ihn hier nicht (magnetCatch), er löst sich nur
  if (b.x === x && b.y === y && b.vx === vx && b.vy === vy) return;
  b.tch = 0;
  if (held) unstick(st);
}

function hitPlayer(st, b, p, _dt) {
  const r = pr(p);
  // gerade gequetscht/gespitzelt: kurz keine zweite Berührung. Das gilt nur, solange der Ball wegfliegt:
  // kommt er zurück (Gegner schießt sofort zurück), prallt er ab, sonst flöge er durch den Grätschenden hindurch.
  if (b.nhT > 0 && b.nh === p.i && (b.x - p.x) * (b.vx - p.vx) > 0) return;
  if (p.bomb && bombBall(st, b, p)) { b.spin = 0; return; }
  if (p.slide > 0 && !p.slideHit && slideBall(st, b, p)) { b.spin = 0; return; }
  if (b.fx && b.fxO === p.i && b.fxT < 0.25) return; // eigener Schuss löst sich erst
  // Kopf
  const preVx = b.vx, preLt = b.lt, preK = b.ltk;
  const hc = collideCircle(b, p.x, p.y, r + b.r, p.vx, p.vy, clamp(0.82 * Math.sqrt(st.rules.bounce || 1), 0.6, 0.95));
  if (hc) {
    b.spin = 0;
    // Harter Schuss des Gegners trifft mich: ich werde ein Stück zurückgedrückt
    if (preLt === 1 - p.i && (preK === "kick" || preK === "super") && hc.imp > 450 && p.pushCD <= 0) {
      const k = Math.min(1, (hc.imp - 450) / 900) * (p.bigT > 0 ? 0.6 : 1);
      p.vx += Math.sign(preVx || -p.dir) * (160 + 220 * k); p.pushCD = 0.35; p.knock = 0.15 + 0.1 * k;
      if (k > 0.5) { p.vy = Math.min(p.vy, -pv(140)); p.onG = false; }
    }
    if (!touch(st, b, p, "head")) return;
    b.vx += p.vx * 0.25 + (hc.ny < 0.1 ? p.dir * 160 : 0); // Schub nach vorn nur bei echtem Kopfball, nicht wenn der Ball unten am Kinn klemmt
    if (p.vy < -150 && hc.ny < -0.3) { const w = p.bigT > 0 ? PU.headPow : 1; b.vy -= bv(260) * w; b.vx += p.dir * 220 * w; } // Kopfball-Wucht (Riesenkopf ×1,15)
    if (hc.imp > 160 && p.hc <= 0) {
      p.hc = 0.12; st.stats[p.i].heads++;
      addMeter(st, p, 4 * (st.mod === "superfast" ? 2 : 1));
      ev(st, { t: "head", i: p.i, x: b.x - hc.nx * b.r, y: b.y - hc.ny * b.r, v: hc.imp });
    }
  }
  // Schuh: echte Form, Schuss aus dem Schwung (shoe.js)
  shoeBall(st, b, p);
}
