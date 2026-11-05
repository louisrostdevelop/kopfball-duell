// Spieler: Laufen, Springen, Spieler gegen Spieler
import { W, G, GOAL_W, BAR_T, SR, FOOT, charById, arenaById, clamp } from "../config.js";
import { barY, ev, pr } from "./base.js";
import { obsPlayer } from "./obstacles.js";
import { gMul } from "./rules.js";
import { bombLand, endSlide } from "./tricks.js";
import { MOVE, PG, bombPow, pv } from "./tuning.js";

export function tickCosmetics(st, dt) {
  st.p.forEach(p => {
    if (p.emoT > 0) p.emoT -= dt; else p.emo = "";
    if (p.moodT > 0) p.moodT -= dt; else p.mood = "";
    if (p.land > 0) p.land -= dt;
  });
}

export function movePlayer(st, p, c, dt, frozenPhase) {
  const ar = arenaById(st.arena), ch = charById(p.ch);
  // Timer
  p.hc = Math.max(0, p.hc - dt); p.sc2 = Math.max(0, p.sc2 - dt); p.pushCD = Math.max(0, p.pushCD - dt); p.knock = Math.max(0, p.knock - dt);
  ["bigT", "miniT", "spdT", "jmpT", "confT", "djT"].forEach(k => { if (p[k] > 0) p[k] = Math.max(0, p[k] - dt); });
  if (p.frz > 0) p.frz = Math.max(0, p.frz - dt);
  if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
  if (p.armed > 0) { p.armed -= dt; if (p.armed <= 0) { p.armed = 0; p.meter = 60; ev(st, { t: "disarm", i: p.i }); } }
  let tsc = p.bigT > 0 ? 1.35 : p.miniT > 0 ? 0.7 : 1;
  if (st.mod === "minihead") tsc *= 0.78;
  tsc *= st.rules.head;
  p.sc += (tsc - p.sc) * Math.min(1, dt * 8);
  const r = pr(p);
  const locked = frozenPhase || p.frz > 0 || p.stun > 0;
  const turbo = (st.mod === "turbo" ? 1.22 : 1) * st.rules.speed;
  const sp = 505 * ch.spd * ar.spd * turbo * (p.spdT > 0 ? 1.35 : 1) * (p.miniT > 0 ? 1.08 : 1) * (p.kHeld && p.charge > 0.2 ? 0.9 : 1);
  const dirIn = ((c.r ? 1 : 0) - (c.l ? 1 : 0)) * (p.confT > 0 ? -1 : 1); // verwirrt: links/rechts vertauscht
  const grip = ar.grip * (st.rules.floor === "ice" ? 0.16 : 1) * (p.onG && p.slick ? 0.2 : 1);
  const rest = G - (FOOT + SR) * p.sc;
  // Unten wird kurz gepuffert: direkt nach einem Schuss oder kurz nach dem Absprung geht der Druck nicht verloren.
  // Ein Druck in der Luft bleibt eine Bombe, ein Druck am Boden eine Grätsche.
  if (c.d && !p.lastD) { p.dBuf = 0.16; p.dAir = !p.onG; }
  p.lastD = !!c.d;
  if (p.dBuf > 0) p.dBuf = Math.max(0, p.dBuf - dt);
  if (p.dBuf > 0 && p.dAir === p.onG) p.dBuf = 0;
  const dPress = p.dBuf > 0;
  if (p.stompImm > 0) p.stompImm -= dt;
  p.slideCD = Math.max(0, p.slideCD - dt); p.bombRec = Math.max(0, p.bombRec - dt); p.tripCD = Math.max(0, p.tripCD - dt);
  if (p.onG) p.coy = MOVE.coyote; else p.coy = Math.max(0, p.coy - dt);
  if ((locked || !p.onG) && p.slide > 0) endSlide(p);
  // Unten am Boden: Grätsche (Richtung = Laufrichtung, sonst Blickrichtung)
  if (!locked && dPress && p.onG && p.slide <= 0 && p.slideCD <= 0 && !(p.kick > 0.1)) {
    p.slide = MOVE.slideT; p.slideDir = dirIn || p.dir; p.slideHit = false; p.slideHitP = false; p.dBuf = 0;
    p.vx = p.slideDir * Math.max(Math.abs(p.vx) * (Math.sign(p.vx) === p.slideDir ? 1 : 0), sp * MOVE.slideV);
    if (p.kHeld) { p.kHeld = false; p.charge = 0; p.chT = 0; }
    st.stats[p.i].slides++;
    ev(st, { t: "slide", i: p.i, x: p.x, y: G, dir: p.slideDir });
  }
  // Unten in der Luft: Arschbombe, sofort und ohne Halt
  else if (!locked && dPress && !p.onG && !p.bomb && !p.bombLock && p.slide <= 0 && p.y < rest - MOVE.bombMinH) {
    p.bomb = 1; p.bombY = p.y; p.vy = Math.max(p.vy, MOVE.bombV); p.vx *= 0.4; p.jHeld = false; p.dBuf = 0;
    if (p.kHeld) { p.kHeld = false; p.charge = 0; p.chT = 0; }
    st.stats[p.i].bombs++;
    ev(st, { t: "bomb", i: p.i, x: p.x, y: p.y });
  }
  // Waagerecht
  if (p.slide > 0) {
    p.slide -= dt;
    const tgt = p.slideDir * sp * 0.45, dec = 1500 * Math.max(0.25, grip) * dt, d = tgt - p.vx;
    p.vx += Math.abs(d) < dec ? d : Math.sign(d) * dec;
    if (p.slide <= 0) endSlide(p);
  } else {
    const want = locked ? 0 : dirIn * sp;
    let acc = (p.onG ? 6400 : 4600) * grip * (p.frz > 0 ? 0.2 : 1) * (p.knock > 0 ? 0.12 : 1);
    if (want !== 0 && p.vx !== 0 && Math.sign(want) !== Math.sign(p.vx) && p.onG && p.knock <= 0 && grip >= 0.5) acc *= MOVE.turn;
    else if (want === 0) acc *= MOVE.stopG;
    if (p.bomb) acc *= 0.3;
    if (p.bombRec > 0) acc *= 0.5;
    const d = want - p.vx, mx = acc * dt;
    p.vx += Math.abs(d) < mx ? d : Math.sign(d) * mx;
  }
  // Springen: halten = voller Sprung, kurz tippen = halber
  const gm0 = gMul(st), jv = -pv(1010) * ch.jmp * (p.jmpT > 0 ? 1.25 : 1) * Math.min(Math.pow(gm0, 0.25), Math.sqrt(1.5 * gm0)); // weniger Schwerkraft = höhere Sprünge (max. 1,5-fach)
  const jPress = !!c.j && !p.lastJ;
  if (!locked && c.j && (p.onG || p.coy > 0) && !p.bomb && p.vy >= -50) {
    if (p.slide > 0) endSlide(p);
    p.vy = jv; p.onG = false; p.coy = 0; p.jHeld = true; p.jRel = false; p.jT = 0;
    ev(st, { t: "jump", i: p.i, x: p.x, y: p.y + (FOOT + SR) * p.sc });
  } else if (!locked && jPress && !p.onG && p.djT > 0 && !p.djUsed && !p.bomb) {
    p.vy = jv * 0.85; p.djUsed = true; p.jHeld = true; p.jRel = false; p.jT = 0;
    ev(st, { t: "jump", i: p.i, x: p.x, y: p.y + (FOOT + SR) * p.sc, dbl: true });
  }
  p.lastJ = !!c.j;
  if (p.jHeld) {
    p.jT += dt;
    if (!c.j) p.jRel = true;
    if (p.jRel && p.jT >= MOVE.cutMin && p.vy < 0) { p.vy *= MOVE.cut; p.jHeld = false; }
    if (p.vy >= 0) p.jHeld = false;
  }
  // Schwerkraft: am Scheitel kurz schweben, beim Fallen etwas schneller
  let gm = 1;
  if (!p.bomb) { if (p.vy > 0) gm = MOVE.fallG; else if (p.jHeld && p.vy > -pv(MOVE.apexV)) gm = MOVE.apexG; }
  p.vy += PG() * gMul(st) * gm * dt;
  if (p.bomb) p.vy = Math.max(p.vy, MOVE.bombV);
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (p.y >= rest) {
    if (!p.onG) {
      if (p.bomb) bombLand(st, p);
      else if (p.vy > 500) { ev(st, { t: "land", i: p.i, x: p.x, y: G, v: p.vy }); p.land = 0.15; }
    }
    p.y = rest; p.vy = 0; p.onG = true; p.djUsed = false; p.jHeld = false; p.bombLock = false; p.slick = false;
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
      if (p.bomb) bombLand(st, p);
      p.y = by - BAR_T / 2 - (FOOT + SR) * p.sc; p.vy = 0; p.onG = true; p.jHeld = false; p.bombLock = false; continue;
    }
    if (p.y - r < by + BAR_T / 2 && p.y > by) { p.y = by + BAR_T / 2 + r; if (p.vy < 0) p.vy = 0; }
  }
  if (st.obs && st.obs.length) obsPlayer(st, p, dt, rest);
}

export function onBar(st, p) {
  const foot = p.y + (FOOT + SR) * p.sc, r = pr(p);
  if (st.obs) for (const o of st.obs) if (o.t === "plat" && p.x + r * 0.8 > o.x - o.w / 2 && p.x - r * 0.8 < o.x + o.w / 2 && Math.abs(foot - o.y) < 4) return true;
  for (let side = 0; side < 2; side++) {
    const by = barY(st, side), x0 = side ? W - GOAL_W - 6 : 0, x1 = side ? W : GOAL_W + 6;
    if (p.x + r * 0.7 >= x0 && p.x - r * 0.7 <= x1 && Math.abs(foot - (by - BAR_T / 2)) < 3) return true;
  }
  return false;
}

// Spieler gegen Spieler (inkl. Draufspringen)
export function playerVsPlayer(st) {
  const [a, b] = st.p, ra = pr(a), rb = pr(b);
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = ra + rb;
  if (d >= min || d === 0) return;
  const top = dy < -min * 0.55 ? b : dy > min * 0.55 ? a : null;
  if (top && top.vy > 150) {
    const bot = top === a ? b : a;
    const bk = top.bomb ? bombPow(top) : 0, bombed = !!top.bomb;
    top.vy = -pv(bombed ? 620 : 820); top.onG = false; top.bomb = 0; top.jHeld = false; top.coy = 0; top.bombLock = true;
    top.vx = (Math.sign(top.x - bot.x) || -top.dir) * 240; // vom Kopf abprallen, nicht drauf sitzen bleiben
    top.y = bot.y - (pr(top) + pr(bot)) * 1.01;
    if (top.sc2 <= 0 && !(bot.stompImm > 0)) {
      const stn = bombed ? 0.45 + 0.4 * bk : 0.55;
      bot.stun = Math.max(bot.stun, stn); top.sc2 = 0.8;
      bot.stompImm = stn + 1.1; // danach eine Weile nicht wieder betäubbar: Zeit zum Wegkommen
      if (bot.kHeld) { bot.kHeld = false; bot.charge = 0; bot.chT = 0; }
      st.stats[top.i].stomps++;
      ev(st, { t: "stomp", i: top.i, x: bot.x, y: bot.y - pr(bot), bomb: bombed, k: bk });
    }
    return;
  }
  const push = (min - Math.abs(dx)) / 2 * (dx >= 0 ? 1 : -1);
  // nie in einen Block schieben: wer an einer Wand steht, gibt nicht nach, der andere weicht ganz aus
  const ma = sideRoom(st, a, -push), mb = sideRoom(st, b, push);
  const fa = sideRoom(st, a, ma - (push - mb)), fb = sideRoom(st, b, mb - (-push - ma));
  a.x = clamp(a.x + fa, ra, W - ra); b.x = clamp(b.x + fb, rb, W - rb);
}

// wie weit sich Spieler p seitlich um mx bewegen kann, ohne in einen Block zu geraten
export function sideRoom(st, p, mx) {
  if (!st.obs || !st.obs.length || !mx) return mx;
  const r = pr(p) * 0.8, top = p.y - pr(p), bot = p.y + (FOOT + SR) * p.sc;
  for (const o of st.obs) {
    if (o.t !== "plat" || bot <= o.y + 4 || top >= o.y + o.h - 4) continue;
    const x0 = o.x - o.w / 2, x1 = o.x + o.w / 2;
    if (mx > 0 && p.x + r <= x0 + 1) mx = Math.min(mx, Math.max(0, x0 - (p.x + r)));
    if (mx < 0 && p.x - r >= x1 - 1) mx = Math.max(mx, Math.min(0, x1 - (p.x - r)));
  }
  return mx;
}

export function emote(st, i, e) { const p = st.p[i]; p.emo = e; p.emoT = 2.2; ev(st, { t: "emote", i, e }); }
