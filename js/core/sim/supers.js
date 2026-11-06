// Spezialschüsse und was passiert, wenn jemand den Ball berührt (abwehren, auslösen)
import { W, G, GOAL_W, charById, clamp } from "../../content/config.js";
import { barY, ev, pr } from "./base.js";
import { pv } from "./tuning.js";

export function handleSuper(st, p, c) {
  const press = c.s && !p.lastS; p.lastS = !!c.s;
  if (!press || p.frz > 0 || p.stun > 0) return;
  if (p.full && p.armed <= 0) {
    p.full = false; p.meter = 0;
    const b = st.b;
    if (Math.hypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 90) fireSuper(st, p, charById(p.ch).super);
    else { p.armed = 4; ev(st, { t: "arm", i: p.i }); }
  }
}

export function touch(st, b, p, kind) {
  const prevOwner = b.fxO;
  if (b.fx && prevOwner !== p.i) {
    // Gegner berührt Spezialschuss
    // Jeder Spezialschuss ist abwehrbar. Wer blockt, zahlt einen kleinen Preis.
    if (b.fx === "fire") { p.vx = -p.dir * 420; p.vy = Math.min(p.vy, -260); p.onG = false; p.stun = Math.max(p.stun, 0.3); ev(st, { t: "burn", i: p.i, x: p.x, y: p.y }); }
    if (b.fx === "ice") { p.frz = Math.max(p.frz, 1.1); ev(st, { t: "freeze", i: p.i, x: p.x, y: p.y }); }
    blockFx(st, b, p);
    if (b.fx === "giant") { /* bleibt groß */ }
    else endFx(st);
    ev(st, { t: "save", i: p.i, x: b.x, y: b.y });
  }
  b.lt = p.i; b.ltk = kind; b.ltx = p.x;
  if (p.armed > 0) { p.armed = 0; fireSuper(st, p, charById(p.ch).super); return false; }
  if (p.fireNext && kind === "kick") { p.fireNext = false; fireSuper(st, p, "fire"); return false; }
  return true;
}

// Preis fürs Abwehren der Meme-Supers (jeder bleibt abwehrbar)
function blockFx(st, b, p) {
  const away = Math.sign(p.x - b.x) || -p.dir;
  switch (b.fx) {
    case "brezel": p.vx = -p.dir * 420; p.vy = Math.min(p.vy, -260); p.onG = false; p.stun = Math.max(p.stun, 0.3); ev(st, { t: "burn", i: p.i, x: p.x, y: p.y }); break;
    case "sad": p.sadT = Math.max(p.sadT || 0, 1.5); ev(st, { t: "sad", i: p.i, x: p.x, y: p.y }); break;
    case "flex": p.confT = Math.max(p.confT, 0.6); ev(st, { t: "blind", i: p.i, x: p.x, y: p.y }); break;
    case "bassdrop": p.vx = away * 520; p.knock = Math.max(p.knock, 0.35); ev(st, { t: "bass", i: p.i, x: p.x, y: p.y }); break;
    case "aimbot": p.stun = Math.max(p.stun, 0.5); ev(st, { t: "lag", i: p.i, x: p.x, y: p.y }); break;
    case "stone": p.vx = away * 420; p.stun = Math.max(p.stun, 0.35); ev(st, { t: "bonk", i: p.i, x: p.x, y: p.y }); break;
    case "crypto": p.vx = away * 320; p.stun = Math.max(p.stun, 0.45); ev(st, { t: "rug", i: p.i, x: p.x, y: p.y }); break;
    case "rizz": p.charmT = Math.max(p.charmT || 0, 0.6); ev(st, { t: "charm", i: p.i, x: p.x, y: p.y }); break;
  }
}

// ---------- Spezialschüsse ----------
export function target(st, i, hi) {
  const side = i ? 0 : 1;
  const x = side ? W - GOAL_W * 0.45 : GOAL_W * 0.45;
  const by = barY(st, side);
  const y = hi ? by + 50 : by + (G - by) * 0.55;
  return { x, y };
}

export function aim(b, tx, ty, sp) { const dx = tx - b.x, dy = ty - b.y, d = Math.hypot(dx, dy) || 1; b.vx = dx / d * sp; b.vy = dy / d * sp; }

export function steer(b, tx, ty, rate, sp, dt) {
  const cur = Math.atan2(b.vy, b.vx), want = Math.atan2(ty - b.y, tx - b.x);
  let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const a = cur + clamp(d, -rate * dt, rate * dt);
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
}

export function fxGravity(b) {
  switch (b.fx) {
    case "fire": case "thunder": case "rocket": case "ghost": case "tornado": case "magnet": case "clone": return 0;
    case "meteor": return 0;
    case "flex": case "bassdrop": case "aimbot": case "copypaste": case "crypto": case "ghosting": case "rizz": case "brezel": return 0;
    case "stone": return b.fxP === 3 ? 1 : 0;
    case "ice": case "sad": return 0.25;
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
    case "fire": aim(b, t.x, t.y, 1350); break;
    case "ice": aim(b, t.x, t.y - 40, 1150); break;
    case "thunder": aim(b, t.x, t.y, 1050); break;
    case "rocket": { b.vx = 0; b.vy = -80; const t2 = target(st, p.i, true); b.fxTX = t2.x; b.fxTY = t2.y; break; }
    case "banana": b.vx = p.dir * 700; b.vy = -900; break;
    case "ghost": aim(b, t.x, t.y, 1150); break;
    case "giant": b.grow = 2.0; aim(b, t.x, t.y - 120, 1000); break;
    case "tornado": b.fxBX = b.x; b.vx = 0; b.vy = -650; break;
    case "magnet": b.vx = p.dir * 900; b.vy = -650; break;
    case "meteor": b.vx = 0; b.vy = -2300; b.fxTX = t.x; b.fxTY = G; break;
    case "bouncy": b.vx = p.dir * 1100; b.vy = 700; break;
    case "clone": case "copypaste": aim(b, t.x, t.y, 1150); b.fxBX = b.x; b.fxBY = b.y; b.fxDX = b.vx; b.fxDY = b.vy; b.fxK = [-1, 0, 1][Math.floor(Math.random() * 3)]; break;
    case "sad": aim(b, t.x, t.y - 40, 1100); break;
    case "flex": b.vx = p.dir * 700; b.vy = -900; break;
    case "bassdrop": aim(b, b.x + p.dir * 260, 170, 950); break;
    case "aimbot": aim(b, t.x, t.y - 90, 950); break;
    case "stone": b.vx = 0; b.vy = -2300; b.fxTX = t.x; b.fxTY = G; break;
    case "crypto": b.vx = p.dir * 380; b.vy = -760; break;
    case "ghosting": aim(b, t.x, t.y, 1150); break;
    case "rizz": aim(b, t.x, t.y - 60, 1000); st.p.forEach(o => { if (o.i !== p.i) o.charmT = Math.max(o.charmT || 0, 0.7); }); break;
    case "brezel": b.vx = p.dir * 900; b.vy = -220; b.fxDX = p.dir; break;
  }
  st.hs = 0.12; st.slow = 0.25;
  ev(st, { t: "super", i: p.i, k: kind, x: b.x, y: b.y });
}

export function superStep(st, b, dt) {
  b.fxT += dt;
  const t = target(st, b.fxO, false);
  switch (b.fx) {
    case "fire": if (b.fxT > 1.6) endFx(st); break;
    case "ice": if (b.fxT > 1.6) endFx(st); break;
    case "thunder": {
      const ph = Math.floor(b.fxT / 0.11);
      if (ph !== b.fxP) { b.fxP = ph; ev(st, { t: "zap", x: b.x, y: b.y }); }
      aim(b, t.x, t.y, 1050);
      const ax = b.vx / 1050, ay = b.vy / 1050, s = (ph % 2 ? 1 : -1) * 420;
      b.vx += -ay * s; b.vy += ax * s;
      if (b.fxT > 1.8) endFx(st); break;
    }
    case "rocket":
      if (b.fxP === 0 && b.fxT > 0.5) { b.fxP = 1; aim(b, b.fxTX, b.fxTY, 1400); ev(st, { t: "launch", x: b.x, y: b.y }); }
      if (b.fxT > 2) endFx(st); break;
    case "banana": steer(b, t.x, t.y + 20, 2.6 + b.fxT * 2, 1150, dt); if (b.fxT > 2.2) endFx(st); break;
    case "ghost": b.alpha = b.fxT < 0.2 ? 1 : Math.abs(b.x - t.x) < 320 ? 0.95 : 0.2; if (b.fxT > 1.6) endFx(st); break;
    case "giant": if (b.fxT > 3) { b.fx = ""; b.fxO = -1; } break;
    case "tornado":
      if (b.fxP === 0) {
        b.vx = Math.cos(b.fxT * 16) * 520 + (b.fxBX - b.x) * 3; b.vy = -620;
        if (b.fxT > 0.55 || b.y < 120) { b.fxP = 1; aim(b, t.x, t.y, 1300); ev(st, { t: "launch", x: b.x, y: b.y }); }
      } else steer(b, t.x, t.y, 4, 1250, dt);
      if (b.fxT > 2.4) endFx(st); break;
    case "magnet": steer(b, t.x, t.y, 2.6, 1100, dt); if (b.fxT > 2.4) endFx(st); break;
    case "meteor":
      if (b.fxP === 0 && b.y < -230) {
        b.fxP = 2; const side = b.fxO ? -1 : 1;
        b.x = t.x - side * 430; b.y = -240; aim(b, t.x, t.y + 30, 1500); ev(st, { t: "launch", x: b.x, y: 0 });
      }
      if (b.fxP === 0 && b.fxT > 1.2) endFx(st);
      if (b.fxT > 2.5) endFx(st); break;
    case "bouncy": if (b.fxT > 3.2) endFx(st); break;
    case "sad": if (b.fxT > 1.7) endFx(st); break;
    case "flex": steer(b, t.x, t.y + 20, 2.6 + b.fxT * 2, 1150, dt); if (b.fxT > 2.2) endFx(st); break;
    case "bassdrop":
      if (b.fxP === 0 && b.fxT > 0.3) { b.fxP = 1; b.vx = 0; b.vy = 0; ev(st, { t: "drop", x: b.x, y: b.y }); }
      if (b.fxP === 1) { b.vx = 0; b.vy = 0; if (b.fxT > 0.75) { b.fxP = 2; ev(st, { t: "launch", x: b.x, y: b.y }); } }
      if (b.fxP === 2) {
        const ph = Math.floor(b.fxT / 0.13);
        if (ph !== b.fxK) { b.fxK = ph; ev(st, { t: "zap", x: b.x, y: b.y }); }
        aim(b, t.x, t.y, 1100);
        const ax = b.vx / 1100, ay = b.vy / 1100, s = (ph % 2 ? 1 : -1) * 520;
        b.vx += -ay * s; b.vy += ax * s;
      }
      if (b.fxT > 2.4) endFx(st); break;
    case "aimbot": if (b.fxT > 0.25) steer(b, t.x, t.y, 6, 1250, dt); if (b.fxT > 2.0) endFx(st); break;
    case "stone":
      if (b.fxP === 0 && b.y < -230) {
        b.fxP = 2; const side = b.fxO ? -1 : 1;
        b.x = t.x - side * 430; b.y = -240; aim(b, t.x - side * 160, G, 1500); ev(st, { t: "launch", x: b.x, y: 0 });
      }
      if (b.fxP === 3) { const side = b.fxO ? -1 : 1; b.vx = side * 650; if (b.fxT > b.fxTY) endFx(st); }
      if (b.fxP === 0 && b.fxT > 1.2) endFx(st);
      if (b.fxT > 3.2) endFx(st); break;
    case "crypto":
      if (b.fxP === 0) {
        const side = b.fxO ? -1 : 1, ph = Math.floor(b.fxT / 0.16);
        b.vx = side * 380; b.vy = ph % 2 ? -60 : -760;
        if (b.fxT > 0.95 || b.y < 90) { b.fxP = 1; aim(b, t.x, t.y + 30, 1600); ev(st, { t: "launch", x: b.x, y: b.y }); }
      }
      if (b.fxT > 2.4) endFx(st); break;
    case "ghosting": b.alpha = b.fxT < 0.15 ? 1 : Math.abs(b.x - t.x) < 240 ? 0.95 : 0.1; if (b.fxT > 1.7) endFx(st); break;
    case "rizz": {
      steer(b, t.x, t.y, 2.4, 1050, dt);
      const w = Math.cos(b.fxT * 11) * 0.9 * dt * 11, c = Math.cos(w), s = Math.sin(w), vx = b.vx;
      b.vx = vx * c - b.vy * s; b.vy = vx * s + b.vy * c;
      if (b.fxT > 2.6) endFx(st); break;
    }
    case "brezel":
      if (b.fxP === 0 && b.fxT > 0.22) { b.fxP = 1; b.fxBX = 0; }
      if (b.fxP === 1) {
        // Looping: Geschwindigkeit dreht einmal ganz herum (nach oben über den Kopf), dann Feuer aufs Tor
        const w = -b.fxDX * Math.PI * 2 / 0.62, a = w * dt, c = Math.cos(a), s = Math.sin(a), vx = b.vx;
        b.vx = vx * c - b.vy * s; b.vy = vx * s + b.vy * c; b.fxBX += Math.abs(a);
        if (b.fxBX >= Math.PI * 2) { b.fxP = 2; aim(b, t.x, t.y, 1350); ev(st, { t: "launch", x: b.x, y: b.y }); }
      }
      if (b.fxT > 2.4) endFx(st); break;
    case "clone": case "copypaste": {
      b.fxBX += b.fxDX * dt; b.fxBY += b.fxDY * dt;
      const amp = 75 * Math.sin(Math.min(1, b.fxT / 0.35) * Math.PI / 2);
      const d = Math.hypot(b.fxDX, b.fxDY) || 1, px = -b.fxDY / d, py = b.fxDX / d;
      const nx = b.fxBX + px * amp * b.fxK, ny = b.fxBY + py * amp * b.fxK;
      b.vx = (nx - b.x) / dt; b.vy = (ny - b.y) / dt;
      b.x = nx - b.vx * dt; b.y = ny - b.vy * dt; // wird gleich wieder addiert
      if (b.fxT > 1.8) endFx(st); break;
    }
  }
}

export function endFx(st) {
  const b = st.b;
  if (!b.fx) return;
  if (b.fx === "clone" || b.fx === "copypaste") { const s = Math.hypot(b.fxDX, b.fxDY) || 1; b.vx = b.fxDX / s * 900; b.vy = b.fxDY / s * 900; }
  if (b.fx === "giant") b.grow = Math.max(b.grow, 2.0);
  b.fx = ""; b.fxO = -1; b.alpha = 1; b.fxP = 0;
}

/** Steinschlag nach dem Einschlag: rollt schwer weiter Richtung Tor */
export function stoneRoll(st, b) {
  b.fxP = 3; b.fxTY = b.fxT + 0.9; b.vy = 0;
}

export function meteorImpact(st, b) {
  ev(st, { t: "quake", x: b.x, y: G });
  st.p.forEach(p => { if (p.i !== b.fxO && p.onG && Math.abs(p.x - b.x) < 170) { p.stun = 0.4; p.vy = -pv(380); p.onG = false; } });
}
