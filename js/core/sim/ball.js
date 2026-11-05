// Ball: Flug, Boden, Wände, Latten, Tor-Erkennung, Kopf und Fuß
import { W, G, GOAL_W, BAR_T, SR, KS, charById, arenaById, clamp, rand } from "../../content/config.js";
import { addMeter, barY, collideCircle, collideRect, ev, pr, shoePos } from "./base.js";
import { goal } from "./goal.js";
import { kickVec } from "./kick.js";
import { obsBall } from "./obstacles.js";
import { baseBR, gMul, kickMul, maxBall, wgt } from "./rules.js";
import { endFx, fxGravity, meteorImpact, superStep, touch } from "./supers.js";
import { bombBall, slideBall } from "./tricks.js";
import { BG, KICK, bv, pv } from "./tuning.js";

// Ball klemmt zwischen beiden Spielern: nach kurzer Zeit springt er fair nach oben raus
export function unjam(st, dt) {
  const b = st.b, [a, c] = st.p;
  const near = p => Math.hypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 10 || Math.hypot(b.x - shoePos(p).x, b.y - shoePos(p).y) < SR * p.sc + b.r + 10;
  const between = (b.x - a.x) * (b.x - c.x) < 0;
  // nach Position messen (die Geschwindigkeit kann beim Einklemmen riesig sein, obwohl sich nichts bewegt)
  if (near(a) && near(c) && between && !b.fx) {
    if (st.jamX === undefined || Math.hypot(b.x - st.jamX, b.y - st.jamY) > 34) { st.jamX = b.x; st.jamY = b.y; st.jam = 0; }
    else st.jam += dt;
  } else { st.jam = 0; st.jamX = undefined; }
  if (st.jam > 0.7) {
    st.jamX = undefined;
    st.jam = 0;
    b.vy = -bv(900); b.vx = (Math.random() < 0.5 ? -1 : 1) * rand(220, 300); b.y -= 6; b.ghost = 0.3;
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
  b.vmem = Math.max(Math.hypot(b.vx, b.vy), (b.vmem || 0) * Math.exp(-dt * KICK.memDecay));
  if (b.fx && !postGoal) superStep(st, b, dt);
  b.vy += BG() * gMul(st) * fxGrav * wgt(st).grav * dt;
  if (st.wind && st.wind.t > 0 && !b.fx) b.vx += st.wind.dir * 300 * dt;
  b.vx *= 1 - ar.ballDrag * wgt(st).drag * (st.rules.floor === "ice" && b.y + b.r > G - 2 ? 0.3 : 1) * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.av = b.vx / b.r; b.a += b.av * dt;
  if (b.held > 0) b.held -= dt;
  if (b.nhT > 0) b.nhT -= dt;

  if (b.ghost > 0) b.ghost -= dt;
  if (!postGoal && !(b.ghost > 0)) {
    st.p.forEach(p => ballVsPlayer(st, b, p, dt));
  }
  // Boden
  if (b.y + b.r > G && b.vy < 0) b.y = G - b.r; // gerade weggeschossen: nur aus dem Boden heben
  if (b.y + b.r > G && b.vy >= 0) {
    const imp = b.vy;
    b.y = G - b.r;
    const bounce = b.fx === "bouncy" ? 1.06 : clamp((ar.bounce + wgt(st).bounce) * (st.rules.bounce || 1), 0.2, 0.95);
    b.vy = -b.vy * bounce;
    // Aufprall kostet einmal etwas Tempo, Rollen nur wenig pro Sekunde (vorher wurde jeder Schritt wie ein Aufprall gebremst)
    const roll = st.rules.floor === "ice" ? 0.995 : ar.roll;
    if (imp > 140) b.vx *= roll; else b.vx *= 1 - (1 - roll) * KICK.rollFric * dt;
    if (Math.abs(b.vy) < 70) b.vy = 0;
    if (imp > 220) ev(st, { t: "bounce", x: b.x, y: G, v: imp });
    if (b.fx === "meteor" && b.fxP === 2) { meteorImpact(st, b); }
    if (b.fx && !["bouncy", "giant"].includes(b.fx)) endFx(st);
  }
  if (st.obs && st.obs.length) obsBall(st, b, dt);
  // Decke & Wände
  const wb = clamp(0.7 * (st.rules.bounce || 1), 0.45, 0.95);
  if (b.y - b.r < -260) { b.y = -260 + b.r; b.vy = Math.abs(b.vy) * wb; }
  if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * wb; if (b.fx && b.fx !== "bouncy") endFx(st); }
  if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * wb; if (b.fx && b.fx !== "bouncy") endFx(st); }
  // Latten
  for (let side = 0; side < 2; side++) {
    const by = barY(st, side);
    const x0 = side ? W - GOAL_W : 0, x1 = side ? W : GOAL_W;
    if (collideRect(b, x0, x1, by - BAR_T / 2, by + BAR_T / 2, 1.6)) {
      if (Math.hypot(b.vx, b.vy) > 200) ev(st, { t: "post", x: b.x, y: by });
      // Ball liegt auf der Latte: sanft zurück ins Feld rollen lassen
      if (b.y < by && Math.abs(b.vy) < 90) b.vx += (side ? -1 : 1) * 40;
      if (b.fx && b.fx !== "bouncy" && b.fx !== "giant") endFx(st);
    }
    // Pfosten vorne (dünn)
    const px = side ? W - GOAL_W : GOAL_W;
    collideRect(b, px - 4, px + 4, by - BAR_T / 2, by + 6, 1.6);
    // Torwand-Power-up
    if (st.wall[side] > 0) {
      const wx = side ? W - GOAL_W - 10 : GOAL_W + 10;
      if (collideRect(b, wx - 7, wx + 7, by + BAR_T / 2, G, 1.75)) {
        ev(st, { t: "wallhit", x: wx, y: b.y });
        if (b.fx && b.fx !== "giant") endFx(st);
      }
    }
  }
  // Tempo-Limit
  const sp = Math.hypot(b.vx, b.vy), lim = b.fx ? 2300 : maxBall(st);
  if (sp > lim) { b.vx *= lim / sp; b.vy *= lim / sp; }
  // Tor?
  if (!postGoal && st.ph === "play") {
    if (b.x + b.r * 0.6 < GOAL_W && b.y - b.r * 0.3 > barY(st, 0) + BAR_T / 2) goal(st, 1);
    else if (b.x - b.r * 0.6 > W - GOAL_W && b.y - b.r * 0.3 > barY(st, 1) + BAR_T / 2) goal(st, 0);
  }
}

export function ballVsPlayer(st, b, p, dt) {
  const r = pr(p), ch = charById(p.ch);
  if (b.nhT > 0 && b.nh === p.i) return; // gerade gequetscht/gespitzelt: kurz keine zweite Berührung
  if (p.bomb && bombBall(st, b, p)) return;
  if (p.slide > 0 && !p.slideHit && slideBall(st, b, p)) return;
  if (b.fx && b.fxO === p.i && b.fxT < 0.25) return; // eigener Schuss löst sich erst
  // Kopf
  const preVx = b.vx, preVy = b.vy, preLt = b.lt, preK = b.ltk;
  const hc = collideCircle(b, p.x, p.y, r + b.r, p.vx, p.vy, clamp(0.82 * Math.sqrt(st.rules.bounce || 1), 0.6, 0.95));
  if (hc) {
    // Harter Schuss des Gegners trifft mich: ich werde ein Stück zurückgedrückt
    if (preLt === 1 - p.i && (preK === "kick" || preK === "super") && hc.imp > 450 && p.pushCD <= 0) {
      const k = Math.min(1, (hc.imp - 450) / 900) * (p.bigT > 0 ? 0.6 : 1);
      p.vx += Math.sign(preVx || -p.dir) * (160 + 220 * k); p.pushCD = 0.35; p.knock = 0.15 + 0.1 * k;
      if (k > 0.5) { p.vy = Math.min(p.vy, -pv(140)); p.onG = false; }
    }
    if (!touch(st, b, p, "head")) return;
    b.vx += p.vx * 0.25 + (hc.ny < 0.1 ? p.dir * 160 : 0); // Schub nach vorn nur bei echtem Kopfball, nicht wenn der Ball unten am Kinn klemmt
    if (p.vy < -150 && hc.ny < -0.3) { b.vy -= bv(260); b.vx += p.dir * 220; } // Kopfball-Wucht
    // Kopfball beim Aufladen/Ausholen: mehr Kraft, aber weniger als ein sauberer Schuss mit dem Fuß
    let hp = 0;
    // Power-Kopfball nur, wenn der Ball wirklich oben am Kopf ist. Ein Ball unten am Kinn/Fuß ist Sache des Schusses.
    const atHead = b.y < p.y + r * 0.35;
    if (!atHead) { /* nichts: Schuss übernimmt */ }
    else if (p.kHeld && p.charge > 0.08) { hp = p.charge; p.kHeld = false; p.charge = 0; p.chT = 0; }
    else if (p.kick > KICK.hitFrom && !p.kHit) { hp = Math.max(0.25, (p.kPow - 1) / 0.75); p.kHit = true; }
    if (hp > 0) {
      const pm = ch.pow * (p.miniT > 0 ? 0.8 : 1) * (p.bigT > 0 ? 1.1 : 1);
      b.vx = p.dir * (Math.abs(b.vx) * 0.25 + (540 + 460 * hp) * pm * kickMul(st)) + p.vx * 0.15;
      b.vy = Math.min(b.vy, -bv(300 + 360 * hp));
      if (hp > 0.6) st.hs = Math.max(st.hs, 0.015);
    }
    if ((hc.imp > 160 || hp > 0) && p.hc <= 0) {
      p.hc = 0.12; st.stats[p.i].heads++;
      addMeter(st, p, 4 * (st.mod === "superfast" ? 2 : 1));
      ev(st, { t: "head", i: p.i, x: b.x - hc.nx * b.r, y: b.y - hc.ny * b.r, v: hc.imp, pow: 1 + hp * 0.6 });
    }
  }
  // Schuh
  const s = shoePos(p);
  const sc = collideCircle(b, s.x, s.y, SR * p.sc + b.r, p.vx, p.vy, 0.55);
  if (sc && sc.imp > 120) { touch(st, b, p, "shoe"); }
  // Schuss
  if (p.kick > KICK.hitFrom && !p.kHit) {
    const fx = p.x + p.dir * 40 * KS * p.sc, fy = p.y + 46 * KS * p.sc;
    const reach = 66 * KS * p.sc + b.r;
    const dist = Math.hypot(b.x - fx, b.y - fy);
    const through = (st.obs || []).some(o => o.t === "plat" && b.x > o.x - o.w / 2 && b.x < o.x + o.w / 2 && ((fy < o.y && b.y > o.y + o.h) || (fy > o.y + o.h && b.y < o.y)));
    if (dist < reach && !through && (b.x - p.x) * p.dir > -18 * KS * p.sc) {
      p.kHit = true;
      if (!touch(st, b, p, "kick")) return;
      // Trefferqualität: sauber am Fuß = volle Kraft, am Rand der Reichweite deutlich weniger
      const q = clamp((1 - dist / reach) * 1.7, 0, 1);
      const qm = 0.7 + 0.3 * q;
      // aufgeladen (c = 0..1): härter UND deutlich höher
      const c = (p.kPow - 1) / 0.75;
      const pm = ch.pow * (p.miniT > 0 ? 0.8 : 1) * (p.bigT > 0 ? 1.1 : 1);
      const kv = kickVec(st, p, b, c, qm, pm);
      const wk = kickMul(st);
      const inSpd = Math.max(b.vmem || 0, Math.hypot(b.vx, b.vy)); // Tempo vor dem Abprall an Kopf/Schuh
      let ox = p.dir * kv.vx * wk, oy = kv.vy * wk;
      const m = Math.hypot(ox, oy) || 1;
      let nm = m;
      if (KICK.carryMode === "add") nm = m + KICK.carry * inSpd * qm;
      else if (KICK.carryMode === "max") nm = Math.max(m, inSpd * KICK.carry * qm);
      if (KICK.softCap) { const L = maxBall(st), knee = L * 0.6; if (nm > knee) nm = knee + (L - knee) * Math.tanh((nm - knee) / (L - knee)); }
      ox *= nm / m; oy *= nm / m;
      b.vx = ox + p.vx * 0.2;
      b.vy = oy;
      b.kin = inSpd;
      b.held = 0.05;
      st.stats[p.i].shots++;
      addMeter(st, p, 6 * (st.mod === "superfast" ? 2 : 1));
      const pow = 1 + (p.kPow - 1) * qm;
      const spd = Math.hypot(b.vx, b.vy);
      ev(st, { t: "kick", i: p.i, x: b.x, y: b.y, pow, q, c, spd, kind: kv.kind, inSpd });
      if (KICK.hsMode === "all") { if (q > 0.45 || c > 0.3) st.hs = Math.max(st.hs, 0.028 + 0.05 * c); }
      else if (KICK.hsMode === "hard") { if (spd > KICK.power) st.hs = Math.max(st.hs, 0.03 + 0.03 * clamp((spd - KICK.power) / 900, 0, 1)); }
      if (spd > KICK.power) { b.pw = 0.55; p.vx -= p.dir * (90 + 120 * c); } else b.pw = 0;
    }
  }
}
