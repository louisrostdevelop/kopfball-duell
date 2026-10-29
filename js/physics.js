// Spielphysik. Läuft beim Host bzw. offline, der Gast bekommt nur Zustände + Events.
import { W, H, G, GOAL_W, BAR_Y, BAR_T, HR, BR, SR, FOOT, REST, STEP, KS, charById, arenaById, PU_KEYS, clamp, rand } from "./config.js";

export function newMatch(o) {
  const ar = arenaById(o.arena);
  const st = {
    arena: ar.id, mod: o.mod || null, dur: o.dur || 90, pus: o.pus !== false, golden: o.golden !== false,
    t: o.dur || 90, ph: "cd", pt: 3, gold: false, el: 0,
    s: [0, 0],
    p: [mkPlayer(0, o.chars[0]), mkPlayer(1, o.chars[1])],
    b: null, pu: [], puT: rand(6, 9), puId: 1,
    wall: [0, 0], bigGoal: [0, 0],
    ev: [], hs: 0, slow: 0,
    stats: [mkStats(), mkStats()],
    lastGoal: null, trail: 0, seq: 0,
  };
  st.b = mkBall(st);
  return st;
}
const mkStats = () => ({ shots: 0, heads: 0, goals: 0, supers: 0, pus: 0, stomps: 0, headGoals: 0, superGoals: 0, longGoals: 0, lastSecGoals: 0, ownGoals: 0, maxTrail: 0 });
function mkPlayer(i, ch) {
  return {
    i, ch, x: i ? W - 360 : 360, y: REST, vx: 0, vy: 0, dir: i ? -1 : 1, onG: true,
    kick: 0, kHit: false, kHeld: false, kPow: 1, chT: 0, charge: 0, lastJ: false, lastS: false,
    meter: 0, full: false, armed: 0, frz: 0, stun: 0, sc: 1, bigT: 0, miniT: 0, spdT: 0, jmpT: 0, fireNext: false,
    hc: 0, sc2: 0, mood: "", moodT: 0, emo: "", emoT: 0, land: 0,
  };
}
function mkBall(st) {
  return { x: W / 2, y: 170, vx: rand(-40, 40), vy: 0, r: baseBR(st), a: 0, av: 0, fx: "", fxT: 0, fxO: -1, fxP: 0, fxK: 0, fxBX: 0, fxBY: 0, fxDX: 0, fxDY: 0, alpha: 1, grow: 1, lt: -1, ltk: "", ltx: 0, held: 0 };
}
const baseBR = st => BR * (st.mod === "bigball" ? 1.55 : 1);
export const gMul = st => arenaById(st.arena).g * (st.mod === "lowgrav" ? 0.55 : 1);
export const barY = (st, side) => BAR_Y - (st.bigGoal[side] > 0 ? 80 : 0);
export const pr = p => HR * p.sc;
export function shoePos(p) {
  const k = p.kick > 0 ? Math.sin((1 - p.kick / 0.24) * Math.PI) : 0;
  const wind = p.kHeld && p.charge > 0 ? -p.charge * 0.6 : 0;
  return { x: p.x + p.dir * (16 + 34 * k + 22 * wind) * KS * p.sc, y: p.y + (FOOT - 20 * KS * k) * p.sc, k };
}
const ev = (st, e) => { st.ev.push(e); };

export function kickoff(st) {
  const keep = st.p.map(p => ({ meter: p.meter, full: p.full, ch: p.ch, emo: p.emo, emoT: p.emoT }));
  st.p = [mkPlayer(0, keep[0].ch), mkPlayer(1, keep[1].ch)];
  st.p.forEach((p, i) => { p.meter = keep[i].meter; p.full = keep[i].full; p.emo = keep[i].emo; p.emoT = keep[i].emoT; });
  st.b = mkBall(st); st.pu = []; st.wall = [0, 0]; st.bigGoal = [0, 0];
}

// Echtzeit-Fortschritt inkl. Hit-Stop und Zeitlupe
export function advance(st, dt, inp, acc) {
  if (st.hs > 0) { st.hs -= dt; return acc; }
  if (st.slow > 0) { st.slow -= dt; dt *= 0.28; }
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 12) { step(st, STEP, inp); acc -= STEP; n++; if (st.hs > 0) { acc = 0; break; } }
  return acc;
}

export function step(st, dt, inp) {
  st.el += dt;
  if (st.ph === "end") { tickCosmetics(st, dt); return; }
  if (st.ph === "cd" || st.ph === "ko") {
    st.pt -= dt; tickCosmetics(st, dt);
    st.p.forEach((p, i) => movePlayer(st, p, inp[i] || {}, dt, true));
    if (st.pt <= 0) { st.ph = "play"; ev(st, { t: "go" }); }
    return;
  }
  if (st.ph === "goal") {
    st.pt -= dt; tickCosmetics(st, dt);
    // Ball und Spieler dürfen nachlaufen
    st.p.forEach((p, i) => movePlayer(st, p, {}, dt, false));
    ballPhysics(st, dt, true);
    if (st.pt <= 0) {
      if (st.gold || (st.t <= 0 && st.s[0] !== st.s[1])) { st.ph = "end"; ev(st, { t: "end" }); return; }
      kickoff(st); st.ph = "ko"; st.pt = 1.0; ev(st, { t: "ko" });
    }
    return;
  }
  // play
  if (!st.gold) {
    const before = st.t; st.t -= dt;
    if (before > 10 && st.t <= 10) ev(st, { t: "ten" });
    if (st.t <= 0) {
      st.t = 0;
      if (st.s[0] === st.s[1] && st.golden) { st.gold = true; kickoff(st); st.ph = "cd"; st.pt = 2.2; ev(st, { t: "golden" }); return; }
      st.ph = "end"; ev(st, { t: "end" }); return;
    }
  }
  tickCosmetics(st, dt);
  const sfast = st.mod === "superfast" ? 2 : 1;
  st.p.forEach((p, i) => {
    const c = inp[i] || {};
    addMeter(st, p, 1.1 * dt * sfast);
    movePlayer(st, p, c, dt, false);
    handleKick(st, p, c, dt);
    handleSuper(st, p, c);
  });
  playerVsPlayer(st);
  ballPhysics(st, dt, false);
  powerups(st, dt);
  ["wall", "bigGoal"].forEach(k => { st[k][0] = Math.max(0, st[k][0] - dt); st[k][1] = Math.max(0, st[k][1] - dt); });
}

function tickCosmetics(st, dt) {
  st.p.forEach(p => {
    if (p.emoT > 0) p.emoT -= dt; else p.emo = "";
    if (p.moodT > 0) p.moodT -= dt; else p.mood = "";
    if (p.land > 0) p.land -= dt;
  });
}
function addMeter(st, p, v) {
  if (p.armed > 0 || p.full) return;
  p.meter = Math.min(100, p.meter + v);
  if (p.meter >= 100) { p.full = true; ev(st, { t: "full", i: p.i }); }
}

function movePlayer(st, p, c, dt, frozenPhase) {
  const ar = arenaById(st.arena), ch = charById(p.ch);
  // Timer
  p.hc = Math.max(0, p.hc - dt); p.sc2 = Math.max(0, p.sc2 - dt);
  ["bigT", "miniT", "spdT", "jmpT"].forEach(k => { if (p[k] > 0) p[k] = Math.max(0, p[k] - dt); });
  if (p.frz > 0) p.frz = Math.max(0, p.frz - dt);
  if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
  if (p.armed > 0) { p.armed -= dt; if (p.armed <= 0) { p.armed = 0; p.meter = 60; ev(st, { t: "disarm", i: p.i }); } }
  let tsc = p.bigT > 0 ? 1.45 : p.miniT > 0 ? 0.62 : 1;
  if (st.mod === "minihead") tsc *= 0.78;
  p.sc += (tsc - p.sc) * Math.min(1, dt * 8);
  const r = pr(p);
  const locked = frozenPhase || p.frz > 0 || p.stun > 0;
  const turbo = st.mod === "turbo" ? 1.22 : 1;
  const sp = 430 * ch.spd * ar.spd * turbo * (p.spdT > 0 ? 1.45 : 1) * (p.miniT > 0 ? 1.08 : 1) * (p.kHeld && p.charge > 0.2 ? 0.75 : 1);
  const want = locked ? 0 : ((c.r ? 1 : 0) - (c.l ? 1 : 0)) * sp;
  const acc = (p.onG ? 5200 : 3400) * ar.grip * (p.frz > 0 ? 0.2 : 1);
  const d = want - p.vx, mx = acc * dt;
  p.vx += Math.abs(d) < mx ? d : Math.sign(d) * mx;
  if (!locked && c.j && p.onG) {
    p.vy = -1000 * ch.jmp * (p.jmpT > 0 ? 1.3 : 1) * Math.sqrt(gMul(st)) * (st.mod === "lowgrav" ? 1 : 1);
    p.onG = false; ev(st, { t: "jump", i: p.i, x: p.x, y: p.y + (FOOT + SR) * p.sc });
  }
  p.lastJ = !!c.j;
  p.vy += 2700 * gMul(st) * dt;
  p.x += p.vx * dt; p.y += p.vy * dt;
  const rest = G - (FOOT + SR) * p.sc;
  if (p.y >= rest) {
    if (!p.onG && p.vy > 500) { ev(st, { t: "land", i: p.i, x: p.x, y: G, v: p.vy }); p.land = 0.15; }
    p.y = rest; p.vy = 0; p.onG = true;
  } else if (p.onG && p.y < rest - 1) {
    // steht evtl. auf Latte
    p.onG = onBar(st, p);
    if (!p.onG && p.vy === 0) p.onG = false;
  }
  p.x = clamp(p.x, r, W - r);
  // Latte: von unten Kopf stoßen, von oben drauf landen
  for (let side = 0; side < 2; side++) {
    const by = barY(st, side), x0 = side ? W - GOAL_W - 6 : 0, x1 = side ? W : GOAL_W + 6;
    if (p.x + r * 0.7 < x0 || p.x - r * 0.7 > x1) continue;
    const foot = p.y + (FOOT + SR) * p.sc;
    if (p.vy >= 0 && foot >= by - BAR_T / 2 && foot - p.vy * dt <= by - BAR_T / 2 + 2) {
      p.y = by - BAR_T / 2 - (FOOT + SR) * p.sc; p.vy = 0; p.onG = true; continue;
    }
    if (p.y - r < by + BAR_T / 2 && p.y > by) { p.y = by + BAR_T / 2 + r; if (p.vy < 0) p.vy = 0; }
  }
}
function onBar(st, p) {
  const foot = p.y + (FOOT + SR) * p.sc, r = pr(p);
  for (let side = 0; side < 2; side++) {
    const by = barY(st, side), x0 = side ? W - GOAL_W - 6 : 0, x1 = side ? W : GOAL_W + 6;
    if (p.x + r * 0.7 >= x0 && p.x - r * 0.7 <= x1 && Math.abs(foot - (by - BAR_T / 2)) < 3) return true;
  }
  return false;
}

function handleKick(st, p, c, dt) {
  const can = p.frz <= 0 && p.stun <= 0;
  if (p.kick > 0) p.kick = Math.max(0, p.kick - dt);
  if (can && c.k && !p.kHeld) {
    p.kHeld = true; p.chT = 0; p.charge = 0;
    if (p.kick <= 0.06) { p.kick = 0.24; p.kHit = false; p.kPow = 1; ev(st, { t: "swing", i: p.i }); }
  } else if (c.k && p.kHeld && can) {
    p.chT += dt;
    const before = p.charge;
    p.charge = clamp((p.chT - 0.18) / 0.55, 0, 1);
    if (before < 1 && p.charge >= 1) ev(st, { t: "charged", i: p.i });
  } else if (!c.k && p.kHeld) {
    p.kHeld = false;
    if (p.charge > 0.12 && can) { p.kick = 0.24; p.kHit = false; p.kPow = 1 + p.charge * 0.75; ev(st, { t: "swing", i: p.i, pow: p.kPow }); }
    p.charge = 0; p.chT = 0;
  }
  if (!can) { p.kHeld = false; p.charge = 0; }
}
function handleSuper(st, p, c) {
  const press = c.s && !p.lastS; p.lastS = !!c.s;
  if (!press || p.frz > 0 || p.stun > 0) return;
  if (p.full && p.armed <= 0) {
    p.full = false; p.meter = 0;
    const b = st.b;
    if (Math.hypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 90) fireSuper(st, p, charById(p.ch).super);
    else { p.armed = 4; ev(st, { t: "arm", i: p.i }); }
  }
}

// Spieler gegen Spieler (inkl. Draufspringen)
function playerVsPlayer(st) {
  const [a, b] = st.p, ra = pr(a), rb = pr(b);
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = ra + rb;
  if (d >= min || d === 0) return;
  const top = dy < -min * 0.55 ? b : dy > min * 0.55 ? a : null;
  if (top && top.vy > 150) {
    const bot = top === a ? b : a;
    top.vy = -820; top.onG = false;
    top.y = bot.y - (pr(top) + pr(bot)) * 0.95;
    if (top.sc2 <= 0) {
      bot.stun = Math.max(bot.stun, 0.55); top.sc2 = 0.8;
      st.stats[top.i].stomps++;
      ev(st, { t: "stomp", i: top.i, x: bot.x, y: bot.y - pr(bot) });
    }
    return;
  }
  const push = (min - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
  a.x = clamp(a.x - push, ra, W - ra); b.x = clamp(b.x + push, rb, W - rb);
}

// Ball
function maxBall(st) { return 1250 * arenaById(st.arena).maxB * (st.mod === "turbo" ? 1.15 : 1); }

function ballPhysics(st, dt, postGoal) {
  const b = st.b, ar = arenaById(st.arena);
  // Größe
  const tr = baseBR(st) * (b.fx === "giant" || b.grow > 1 ? b.grow : 1);
  if (b.fx !== "giant" && b.grow > 1) b.grow = Math.max(1, b.grow - dt * 0.8);
  b.r += (tr - b.r) * Math.min(1, dt * 10);
  const fxGrav = fxGravity(b);
  if (b.fx && !postGoal) superStep(st, b, dt);
  b.vy += 1550 * gMul(st) * fxGrav * dt;
  b.vx *= 1 - ar.ballDrag * dt;
  b.x += b.vx * dt; b.y += b.vy * dt;
  b.av = b.vx / b.r; b.a += b.av * dt;
  if (b.held > 0) b.held -= dt;

  if (!postGoal) {
    st.p.forEach(p => ballVsPlayer(st, b, p, dt));
  }
  // Boden
  if (b.y + b.r > G) {
    const imp = b.vy;
    b.y = G - b.r;
    const bounce = b.fx === "bouncy" ? 1.06 : ar.bounce;
    b.vy = -b.vy * bounce; b.vx *= ar.roll;
    if (Math.abs(b.vy) < 70) b.vy = 0;
    if (imp > 220) ev(st, { t: "bounce", x: b.x, y: G, v: imp });
    if (b.fx === "meteor" && b.fxP === 2) { meteorImpact(st, b); }
    if (b.fx && !["bouncy", "giant"].includes(b.fx)) endFx(st);
  }
  // Decke & Wände
  if (b.y - b.r < -260) { b.y = -260 + b.r; b.vy = Math.abs(b.vy) * 0.7; }
  if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; if (b.fx && b.fx !== "bouncy") endFx(st); }
  if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.7; if (b.fx && b.fx !== "bouncy") endFx(st); }
  // Latten
  for (let side = 0; side < 2; side++) {
    const by = barY(st, side);
    const x0 = side ? W - GOAL_W : 0, x1 = side ? W : GOAL_W;
    if (collideRect(b, x0, x1, by - BAR_T / 2, by + BAR_T / 2, 1.6)) {
      if (Math.hypot(b.vx, b.vy) > 200) ev(st, { t: "post", x: b.x, y: by });
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

function collideRect(b, x0, x1, y0, y1, rest) {
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

function collideCircle(b, cx, cy, minD, pvx, pvy, rest) {
  const dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
  if (d >= minD || d === 0) return null;
  const nx = dx / d, ny = dy / d;
  b.x = cx + nx * minD; b.y = cy + ny * minD;
  const rvx = b.vx - pvx, rvy = b.vy - pvy, dot = rvx * nx + rvy * ny;
  if (dot < 0) { b.vx -= (1 + rest) * dot * nx; b.vy -= (1 + rest) * dot * ny; }
  return { nx, ny, imp: -dot };
}

function touch(st, b, p, kind) {
  const prevOwner = b.fxO;
  if (b.fx && prevOwner !== p.i) {
    // Gegner berührt Spezialschuss
    if (b.fx === "fire") {
      p.vx = -p.dir * 700; p.vy = -520; p.onG = false; p.stun = 0.8;
      ev(st, { t: "burn", i: p.i, x: p.x, y: p.y });
      return false; // Ball fliegt durch
    }
    if (b.fx === "ice") { p.frz = 1.9; ev(st, { t: "freeze", i: p.i, x: p.x, y: p.y }); }
    if (b.fx === "giant") { /* bleibt groß */ }
    else endFx(st);
    ev(st, { t: "save", i: p.i, x: b.x, y: b.y });
  }
  b.lt = p.i; b.ltk = kind; b.ltx = p.x;
  if (p.armed > 0) { p.armed = 0; fireSuper(st, p, charById(p.ch).super); return false; }
  if (p.fireNext && kind === "kick") { p.fireNext = false; fireSuper(st, p, "fire"); return false; }
  return true;
}

function ballVsPlayer(st, b, p, dt) {
  const r = pr(p), ch = charById(p.ch);
  if (b.fx === "fire" && b.fxO !== p.i && Math.hypot(b.x - p.x, b.y - p.y) < r + b.r) { touch(st, b, p, "head"); return; }
  if (b.fx === "fire" && b.fxO === p.i) return;
  if (b.fx && b.fxO === p.i && b.fxT < 0.25) return; // eigener Schuss löst sich erst
  // Kopf
  const hc = collideCircle(b, p.x, p.y, r + b.r, p.vx, p.vy, 0.82);
  if (hc) {
    if (!touch(st, b, p, "head")) return;
    b.vx += p.vx * 0.22 + p.dir * 120;
    if (p.vy < -150 && hc.ny < -0.3) { b.vy -= 260; b.vx += p.dir * 220; } // Kopfball-Wucht
    if (hc.imp > 160 && p.hc <= 0) {
      p.hc = 0.12; st.stats[p.i].heads++;
      addMeter(st, p, 4 * (st.mod === "superfast" ? 2 : 1));
      ev(st, { t: "head", i: p.i, x: b.x - hc.nx * b.r, y: b.y - hc.ny * b.r, v: hc.imp });
    }
  }
  // Schuh
  const s = shoePos(p);
  const sc = collideCircle(b, s.x, s.y, SR * p.sc + b.r, p.vx, p.vy, 0.55);
  if (sc && sc.imp > 120) { touch(st, b, p, "shoe"); }
  // Schuss
  if (p.kick > 0.06 && !p.kHit) {
    const fx = p.x + p.dir * 40 * KS * p.sc, fy = p.y + 46 * KS * p.sc;
    const reach = 66 * KS * p.sc + b.r;
    if (Math.hypot(b.x - fx, b.y - fy) < reach && (b.x - p.x) * p.dir > -18 * KS * p.sc) {
      p.kHit = true;
      if (!touch(st, b, p, "kick")) return;
      const pow = ch.pow * p.kPow * (p.miniT > 0 ? 0.8 : 1) * (p.bigT > 0 ? 1.1 : 1);
      const air = !p.onG;
      const high = b.y < p.y;
      b.vx = p.dir * (660 + 300 * (pow - 1) + 300 * (p.kPow - 1)) * pow + p.vx * 0.2;
      b.vy = air ? (high ? -260 : -400) : high ? -680 : -600;
      b.vy *= 0.9 + (p.kPow - 1) * 0.25;
      if (p.kPow > 1.3) b.vy *= 0.8;
      b.held = 0.05;
      st.stats[p.i].shots++;
      addMeter(st, p, 6 * (st.mod === "superfast" ? 2 : 1));
      ev(st, { t: "kick", i: p.i, x: b.x, y: b.y, pow: p.kPow });
      if (p.kPow > 1.45) st.hs = 0.07;
    }
  }
}

// ---------- Spezialschüsse ----------
function target(st, i, hi) {
  const side = i ? 0 : 1;
  const x = side ? W - GOAL_W * 0.45 : GOAL_W * 0.45;
  const by = barY(st, side);
  const y = hi ? by + 50 : by + (G - by) * 0.55;
  return { x, y };
}
function aim(b, tx, ty, sp) { const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1; b.vx = dx / d * sp; b.vy = dy / d * sp; }
function steer(b, tx, ty, rate, sp, dt) {
  const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(ty - b.y, tx - b.x);
  let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const a = cur + clamp(d, -rate * dt, rate * dt);
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
}
function fxGravity(b) {
  switch (b.fx) {
    case "fire": case "thunder": case "rocket": case "ghost": case "tornado": case "magnet": case "clone": return 0;
    case "meteor": return 0;
    case "ice": return 0.25;
    case "banana": return 0;
    default: return 1;
  }
}

export function fireSuper(st, p, kind) {
  const b = st.b, t = target(st, p.i, false);
  b.fx = kind; b.fxT = 0; b.fxO = p.i; b.fxP = 0; b.alpha = 1; b.lt = p.i; b.ltk = "super"; b.ltx = p.x;
  // Ball vor den Fuß holen, damit er nicht im Kopf steckt
  if (Math.hypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 4) { b.x = p.x + p.dir * (pr(p) + b.r + 6); }
  st.stats[p.i].supers++;
  switch (kind) {
    case "fire": aim(b, t.x, t.y, 1500); break;
    case "ice": aim(b, t.x, t.y - 40, 1250); break;
    case "thunder": aim(b, t.x, t.y, 1200); b.fxBX = b.vx; b.fxBY = b.vy; break;
    case "rocket": b.vx = 0; b.vy = -80; break;
    case "banana": b.vx = p.dir * 700; b.vy = -900; break;
    case "ghost": aim(b, t.x, t.y, 1350); break;
    case "giant": b.grow = 2.4; aim(b, t.x, t.y - 120, 1050); break;
    case "tornado": b.fxBX = b.x; b.vx = 0; b.vy = -650; break;
    case "magnet": b.vx = p.dir * 900; b.vy = -650; break;
    case "meteor": b.vx = 0; b.vy = -2300; break;
    case "bouncy": b.vx = p.dir * 1100; b.vy = 700; break;
    case "clone": aim(b, t.x, t.y, 1150); b.fxBX = b.x; b.fxBY = b.y; b.fxDX = b.vx; b.fxDY = b.vy; b.fxK = [-1, 0, 1][Math.floor(Math.random() * 3)]; break;
  }
  st.hs = 0.12; st.slow = 0.25;
  ev(st, { t: "super", i: p.i, k: kind, x: b.x, y: b.y });
}

function superStep(st, b, dt) {
  b.fxT += dt;
  const t = target(st, b.fxO, false), t2 = target(st, b.fxO, true);
  switch (b.fx) {
    case "fire": if (b.fxT > 1.6) endFx(st); break;
    case "ice": if (b.fxT > 1.6) endFx(st); break;
    case "thunder": {
      const ph = Math.floor(b.fxT / 0.11);
      if (ph !== b.fxP) { b.fxP = ph; ev(st, { t: "zap", x: b.x, y: b.y }); }
      aim(b, t.x, t.y, 1200);
      const ax = b.vx / 1200, ay = b.vy / 1200, s = (ph % 2 ? 1 : -1) * 560;
      b.vx += -ay * s; b.vy += ax * s;
      if (b.fxT > 1.8) endFx(st); break;
    }
    case "rocket":
      if (b.fxP === 0 && b.fxT > 0.38) { b.fxP = 1; aim(b, t2.x, t2.y, 1800); ev(st, { t: "launch", x: b.x, y: b.y }); }
      if (b.fxT > 2) endFx(st); break;
    case "banana": steer(b, t.x, t.y + 20, 2.6 + b.fxT * 2, 1150, dt); if (b.fxT > 2.2) endFx(st); break;
    case "ghost": b.alpha = b.fxT < 0.15 ? 1 : Math.abs(b.x - t.x) < 140 ? 0.9 : 0.05; if (b.fxT > 1.6) endFx(st); break;
    case "giant": if (b.fxT > 3.5) { b.fx = ""; b.fxO = -1; } break;
    case "tornado":
      if (b.fxP === 0) {
        b.vx = Math.cos(b.fxT * 16) * 520 + (b.fxBX - b.x) * 3; b.vy = -620;
        if (b.fxT > 0.55 || b.y < 120) { b.fxP = 1; aim(b, t.x, t.y, 1300); ev(st, { t: "launch", x: b.x, y: b.y }); }
      } else steer(b, t.x, t.y, 7, 1450, dt);
      if (b.fxT > 2.4) endFx(st); break;
    case "magnet": steer(b, t.x, t.y, 3.2, 1150, dt); if (b.fxT > 2.4) endFx(st); break;
    case "meteor":
      if (b.fxP === 0 && b.y < -230) {
        b.fxP = 2; const side = b.fxO ? -1 : 1;
        b.x = t.x - side * 430; b.y = -240; aim(b, t.x, t.y + 30, 1900); ev(st, { t: "launch", x: b.x, y: 0 });
      }
      if (b.fxT > 2.5) endFx(st); break;
    case "bouncy": if (b.fxT > 3.2) endFx(st); break;
    case "clone": {
      b.fxBX += b.fxDX * dt; b.fxBY += b.fxDY * dt;
      const amp = 95 * Math.sin(Math.min(1, b.fxT / 0.35) * Math.PI / 2);
      const d = Math.hypot(b.fxDX, b.fxDY) || 1, px = -b.fxDY / d, py = b.fxDX / d;
      const nx = b.fxBX + px * amp * b.fxK, ny = b.fxBY + py * amp * b.fxK;
      b.vx = (nx - b.x) / dt; b.vy = (ny - b.y) / dt;
      b.x = nx - b.vx * dt; b.y = ny - b.vy * dt; // wird gleich wieder addiert
      if (b.fxT > 1.8) endFx(st); break;
    }
  }
}
function endFx(st) {
  const b = st.b;
  if (!b.fx) return;
  if (b.fx === "clone") { const s = Math.hypot(b.fxDX, b.fxDY) || 1; b.vx = b.fxDX / s * 900; b.vy = b.fxDY / s * 900; }
  if (b.fx === "giant") b.grow = Math.max(b.grow, 2.4);
  b.fx = ""; b.fxO = -1; b.alpha = 1; b.fxP = 0;
}
function meteorImpact(st, b) {
  ev(st, { t: "quake", x: b.x, y: G });
  st.p.forEach(p => { if (p.i !== b.fxO && p.onG && Math.abs(p.x - b.x) < 240) { p.stun = 0.7; p.vy = -420; p.onG = false; } });
}

// ---------- Power-ups ----------
function powerups(st, dt) {
  if (!st.pus) return;
  st.puT -= dt;
  if (st.puT <= 0 && st.pu.length < 2) {
    st.puT = st.mod === "pu2" ? rand(3, 5) : rand(7, 11);
    const k = PU_KEYS[Math.floor(Math.random() * PU_KEYS.length)];
    st.pu.push({ id: st.puId++, k, x: rand(330, W - 330), y: rand(150, 300), t: 0 });
    ev(st, { t: "puSpawn" });
  }
  const b = st.b;
  for (let n = st.pu.length - 1; n >= 0; n--) {
    const u = st.pu[n]; u.t += dt;
    if (u.t > 13) { st.pu.splice(n, 1); continue; }
    if (Math.hypot(b.x - u.x, b.y - (u.y + Math.sin(u.t * 3) * 10)) < b.r + 36 && b.lt >= 0) {
      st.pu.splice(n, 1); applyPu(st, b.lt, u.k, u.x, u.y);
    }
  }
}
function applyPu(st, i, k, x, y) {
  const me = st.p[i], op = st.p[1 - i];
  st.stats[i].pus++;
  switch (k) {
    case "bighead": me.bigT = 8; me.miniT = 0; break;
    case "mini": op.miniT = 8; op.bigT = 0; break;
    case "freeze": op.frz = 2.5; break;
    case "speed": me.spdT = 8; break;
    case "jump": me.jmpT = 8; break;
    case "fire": me.fireNext = true; break;
    case "wall": st.wall[i] = 7; break;
    case "biggoal": st.bigGoal[1 - i] = 8; break;
    case "meter": me.meter = 100; me.full = true; break;
  }
  ev(st, { t: "pu", i, k, x, y });
}

// ---------- Tore ----------
function goal(st, i) {
  const b = st.b, other = 1 - i;
  st.s[i]++;
  const own = b.lt === other;
  const kind = own ? "own" : b.ltk === "super" || b.fx ? "super" : b.ltk === "head" ? "head" : "kick";
  const long = !own && b.lt === i && (i === 0 ? b.ltx < W / 2 - 40 : b.ltx > W / 2 + 40);
  const lastSec = !st.gold && st.t < 3;
  const S = st.stats[i];
  S.goals++;
  if (own) st.stats[other].ownGoals++;
  if (kind === "head") S.headGoals++;
  if (kind === "super") S.superGoals++;
  if (long) S.longGoals++;
  if (lastSec) S.lastSecGoals++;
  st.lastGoal = { i, kind, long, lastSec, gold: st.gold, x: b.x, y: b.y, s: [...st.s] };
  st.p[i].mood = "happy"; st.p[i].moodT = 3; st.p[other].mood = "sad"; st.p[other].moodT = 3;
  addMeter(st, st.p[other], 15);
  endFx(st); b.alpha = 1;
  st.ph = "goal"; st.pt = 3.7; st.slow = 0.9;
  ev(st, { t: "goal", i, kind, long, lastSec, gold: st.gold, x: b.x, y: b.y, s: [...st.s] });
}

// Für den Online-Gast: eigene Figur sofort lokal bewegen (ohne Ball)
export function predictPlayer(st, p, c, dt) {
  const locked = st.ph === "cd" || st.ph === "ko";
  movePlayer(st, p, st.ph === "goal" || st.ph === "end" ? {} : c, dt, locked);
  if (st.ph === "play") handleKick(st, p, c, dt);
}
export function emote(st, i, e) { const p = st.p[i]; p.emo = e; p.emoT = 2.2; ev(st, { t: "emote", i, e }); }
export function skipCelebration(st) { if (st.ph === "goal" && st.pt > 0.3) st.pt = 0.3; }
export const REPLAY_START = 2.75, REPLAY_END = 0.35; // pt-Fenster, in dem die Wiederholung läuft
