// Spezialschüsse und was passiert, wenn jemand den Ball berührt (abwehren, auslösen)
import { W, G, GOAL_W, BAR_T, charById, clamp } from "../../content/config.js";
import { barY, ev, pr, shielded, unstick } from "./base.js";
import { ballG } from "./rules.js";
import { pv } from "./tuning.js";
import { datan2, dcos, dhypot, dsin, rnd } from "../../content/dmath.js";

export function handleSuper(st, p, c) {
  const press = c.s && !p.lastS; p.lastS = !!c.s;
  if (!press || p.frz > 0 || p.stun > 0) return;
  if (p.full && p.armed <= 0) {
    p.full = false; p.meter = 0;
    const b = st.b;
    if (dhypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 90) fireSuper(st, p, charById(p.ch).super);
    else { p.armed = 4; ev(st, { t: "arm", i: p.i }); }
  }
}

export function touch(st, b, p, kind) {
  const prevOwner = b.fxO;
  if (b.fx && prevOwner !== p.i) {
    // Gegner berührt Spezialschuss
    // Jeder Spezialschuss ist abwehrbar. Wer blockt, zahlt einen kleinen Preis (die Schutzblase fängt ihn einmal ab).
    const safe = HURT.has(b.fx) && shielded(st, p);
    if (!safe && b.fx === "fire") { p.vx = -p.dir * 420; p.vy = Math.min(p.vy, -260); p.onG = false; p.stun = Math.max(p.stun, 0.3); ev(st, { t: "burn", i: p.i, x: p.x, y: p.y }); }
    if (!safe && b.fx === "ice") { p.frz = Math.max(p.frz, 1.1); p.frzS = Math.max(p.frzS || 0, 1.1); ev(st, { t: "freeze", i: p.i, x: p.x, y: p.y }); }   // frzS: nicht abtaubar (Eisblock)
    if (!safe) blockFx(st, b, p);
    if (b.fx === "giant") {
      // Riesenball ist schwer: der erste Blocker wird weggeschoben, der Ball rollt weiter aufs Tor; der zweite stoppt ihn
      if (!b.fxK) { b.fxK = 1; b.fxTY = b.fxT + 0.35; const away = Math.sign(p.x - b.x) || -p.dir; p.vx = away * 300; p.vy = Math.min(p.vy, -pv(700)); p.onG = false; p.knock = Math.max(p.knock, 0.4); p.stun = Math.max(p.stun, 0.45); b.fxP = 1; }   // hochgeschleudert: der Ball rollt unten durch
      else if (b.fxT > b.fxTY) endFx(st);   // derselbe Zusammenstoß zählt nicht doppelt
    }
    else if (b.fx === "bouncy" && !b.fxDY) { b.fxDY = 1; b.fxTY = b.fxT + 0.3; p.stun = Math.max(p.stun, 0.3); }   // Flummi prallt einmal ab und springt weiter aufs Tor
    else if (b.fx === "bouncy" && b.fxT < b.fxTY) { /* derselbe Zusammenstoß */ }
    else endFx(st);
    // Riesenball und Flummi laufen weiter: bleibt der Super aktiv, gehört der Ball weiter dem Schützen (sonst zählte
    // ein Tor danach als Eigentor des Blockers)
    if (b.fx) return true;
    ev(st, { t: "save", i: p.i, x: b.x, y: b.y });
  }
  b.lt = p.i; b.ltk = kind; b.ltx = p.x;
  if (p.armed > 0) { p.armed = 0; fireSuper(st, p, charById(p.ch).super); return false; }
  if (p.fireNext && kind === "kick") { p.fireNext = false; p.fireT = 0; fireSuper(st, p, "fire"); return false; }
  return true;
}

// Spezialschüsse mit einem Preis für den Blocker (Feuer, Eis, Meme-Supers): dagegen hilft die Schutzblase
const HURT = new Set(["fire", "ice", "brezel", "sad", "flex", "bassdrop", "aimbot", "stone", "crypto", "rizz"]);

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
export function target(st, i, hi, b = null) {
  const side = i ? 0 : 1;
  const x = side ? W - GOAL_W * 0.45 : GOAL_W * 0.45;
  const by = barY(st, side);
  let y = hi ? by + 50 : by + (G - by) * 0.55;
  // Kommt der Ball von schräg oben, den Zielpunkt so weit senken, dass die Bahn unter der Latte durchgeht
  // (sonst prallen Supers aus der Nähe an der Lattenecke ab und rollen zurück)
  if (b && !hi) {
    const gl = side ? W - GOAL_W : GOAL_W, yc = by + BAR_T / 2 + b.r + 6, ahead = (gl - b.x) * (x - b.x) > 0 && Math.abs(gl - b.x) > 1;
    if (ahead && b.y < yc && b.y + (y - b.y) * (gl - b.x) / (x - b.x) < yc) y = Math.min(G - b.r - 2, b.y + (yc - b.y) * (x - b.x) / (gl - b.x));
  }
  return { x, y };
}

export function aim(b, tx, ty, sp) { const dx = tx - b.x, dy = ty - b.y, d = dhypot(dx, dy) || 1; b.vx = dx / d * sp; b.vy = dy / d * sp; }

export function steer(b, tx, ty, rate, sp, dt) {
  const cur = datan2(b.vy, b.vx), want = datan2(ty - b.y, tx - b.x);
  let d = want - cur; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
  const a = cur + clamp(d, -rate * dt, rate * dt);
  b.vx = dcos(a) * sp; b.vy = dsin(a) * sp;
}

export function fxGravity(b) {
  switch (b.fx) {
    case "fire": case "thunder": case "rocket": case "ghost": case "tornado": case "magnet": case "clone": return 0;
    case "meteor": return 0;
    case "flex": return b.fxP === 1 ? 2.2 : 0;   // Flex: flach heran, dann ein Hüpfer über den Verteidiger
    case "bassdrop": case "aimbot": case "copypaste": case "crypto": case "ghosting": case "rizz": case "brezel": return 0;
    case "stone": return b.fxP === 3 ? 1 : 0;
    case "ice": case "sad": return 0.25;
    case "banana": return 0;
    default: return 1;
  }
}

export function fireSuper(st, p, kind) {
  const b = st.b, t = target(st, p.i, false, b);
  b.fx = kind; b.fxT = 0; b.fxO = p.i; b.fxP = 0; b.fxK = 0; b.fxDY = 0;   // Merker vom letzten Super nicht mitschleppen
  b.alpha = 1; b.lt = p.i; b.ltk = "super"; b.ltx = p.x; b.spin = 0; unstick(st);   // kein Effet, Magnet lässt los; der Schuss gehört dem Schützen (Tor zählt als Super, nicht als Eigentor)
  // Ball vor den Fuß holen, damit er nicht im Kopf steckt
  if (dhypot(b.x - p.x, b.y - p.y) < pr(p) + b.r + 4) { b.x = p.x + p.dir * (pr(p) + b.r + 6); }
  st.stats[p.i].supers++;
  switch (kind) {
    case "fire": aim(b, t.x, t.y, 1550); break;
    case "ice": aim(b, t.x, t.y - 40, 1300); break;
    case "thunder": aim(b, t.x, t.y, 1050); break;
    case "rocket": { b.vx = 0; b.vy = -80; const t2 = target(st, p.i, true); b.fxTX = t2.x; b.fxTY = t2.y; break; }
    case "banana": b.vx = p.dir * 700; b.vy = -900; break;
    case "ghost": aim(b, t.x, t.y, 1300); break;
    case "giant": b.grow = 2.0; aim(b, t.x, t.y - 60, 1150); break;
    case "tornado": b.fxBX = b.x; b.vx = 0; b.vy = -650; break;
    case "magnet": b.vx = p.dir * 900; b.vy = -650; break;
    case "meteor": b.vx = 0; b.vy = -2300; b.fxTX = t.x; b.fxTY = G; break;
    case "bouncy": b.vx = (p.i ? -1 : 1) * 1450; b.vy = 500; break;
    case "clone": case "copypaste": aim(b, t.x, t.y, 1150); b.fxBX = b.x; b.fxBY = b.y; b.fxDX = b.vx; b.fxDY = b.vy; b.fxK = [-1, 0, 1][Math.floor(rnd(st) * 3)] * (p.i ? -1 : 1); break;   // welcher der drei echt ist; für rechts gespiegelt (gleicher Zufall = spiegelbildlich)
    case "sad": aim(b, t.x, t.y - 40, 1250); break;
    case "flex": aim(b, t.x, t.y - 20, 1150); break;
    case "bassdrop": aim(b, b.x + p.dir * 260, 250, 950); break;   // schwebt tiefer: mit einem Sprung erreichbar
    case "aimbot": aim(b, t.x, t.y - 90, 950); break;
    case "stone": b.vx = 0; b.vy = -2300; b.fxTX = t.x; b.fxTY = G; break;
    case "crypto": b.vx = p.dir * 380; b.vy = -760; break;
    case "ghosting": aim(b, t.x, t.y, 1150); break;
    case "rizz": aim(b, t.x, t.y - 60, 1000); break; // verliebt erst beim Abwehren (wie jeder Super: erst abwehrbar, dann Preis)
    case "brezel": b.vx = p.dir * 900; b.vy = -220; b.fxDX = p.dir; break;
  }
  st.hs = 0.12; st.slow = 0.25;
  ev(st, { t: "super", i: p.i, k: kind, x: b.x, y: b.y });
}

export function superStep(st, b, dt) {
  b.fxT += dt;
  const t = target(st, b.fxO, false, b);
  switch (b.fx) {
    case "fire": if (b.fxT > 1.6) endFx(st); break;
    case "ice": if (b.fxT > 1.6) endFx(st); break;
    case "thunder": {
      const ph = Math.floor(b.fxT / 0.11);
      if (ph !== b.fxP) { b.fxP = ph; ev(st, { t: "zap", x: b.x, y: b.y }); }
      aim(b, t.x, t.y, 1050);
      const ax = b.vx / 1050, ay = b.vy / 1050, s = (ph % 2 ? 1 : -1) * (b.fxO ? -1 : 1) * 420;   // Zickzack für beide Seiten gespiegelt
      b.vx += -ay * s; b.vy += ax * s;
      if (b.fxT > 1.8) endFx(st); break;
    }
    case "rocket":
      if (b.fxP === 0 && b.fxT > 0.5) { b.fxP = 1; aim(b, b.fxTX, b.fxTY, 1400); ev(st, { t: "launch", x: b.x, y: b.y }); }
      if (b.fxT > 2) endFx(st); break;
    // aus der Nähe enger einlenken, sonst fliegt die Kurve übers Tor
    case "banana": steer(b, t.x, t.y + 20, 2.6 + b.fxT * 2 + 900 / Math.max(150, dhypot(t.x - b.x, t.y - b.y)), 1000, dt); if (b.fxT > 2.2) endFx(st); break;
    case "ghost": b.alpha = b.fxT < 0.2 ? 1 : Math.abs(b.x - t.x) < 320 ? 0.95 : 0.2; if (b.fxT > 1.6) endFx(st); break;
    case "giant":
      if (b.fxP === 1) { aim(b, t.x, t.y - 40, 900); if (b.fxT > b.fxTY) b.fxP = 2; }   // nach dem Durchbrechen wieder aufs Tor
      if (b.fxT > 3) { b.fx = ""; b.fxO = -1; } break;
    case "tornado":
      if (b.fxP === 0) {
        b.vx = (b.fxO ? -1 : 1) * dcos(b.fxT * 16) * 520 + (b.fxBX - b.x) * 3; b.vy = -620;
        if (b.fxT > 0.55 || b.y < 120) { b.fxP = 1; aim(b, t.x, t.y, 1300); ev(st, { t: "launch", x: b.x, y: b.y }); }
      } else steer(b, t.x, t.y, 4, 1250, dt);
      if (b.fxT > 2.4) endFx(st); break;
    case "magnet": steer(b, t.x, t.y, 2.6 + 900 / Math.max(150, dhypot(t.x - b.x, t.y - b.y)), 1100, dt); if (b.fxT > 2.4) endFx(st); break;
    case "meteor":
      if (b.fxP === 0 && b.y < -230) {
        // Bahn so legen, dass der Meteor knapp unter der Latte durch ins Tor fällt (nicht an die Lattenecke)
        b.fxP = 2; const side = b.fxO ? -1 : 1, gl = side > 0 ? W - GOAL_W : GOAL_W, yc = barY(st, b.fxO ? 0 : 1) + BAR_T / 2 + b.r + 16;
        b.x = gl - side * (yc + 240) / 2; b.y = -240; b.fxTX = gl + side * (G - yc) / 2; b.fxTY = G; aim(b, b.fxTX, b.fxTY, 950); ev(st, { t: "launch", x: b.x, y: 0 });
      }
      if (b.fxP === 2) aim(b, b.fxTX, b.fxTY, 950);   // gerade Bahn halten (Luftwiderstand würde sie sonst verbiegen)
      if (b.fxP === 0 && b.fxT > 1.2) endFx(st);
      if (b.fxT > 2.5) endFx(st); break;
    case "bouncy": { // flache, gleich hohe Sprünge Richtung Tor (nicht über die Latte, nicht zurück ins eigene Tor)
      const side = b.fxO ? -1 : 1;
      if (b.y + b.r > G - 4 && b.vy < 0) { b.fxK = (b.fxK || 0) + 1; b.vy = -Math.sqrt(2 * ballG(st) * (b.fxK % 2 ? 60 : 165)); }   // flach, hoch, flach …: schwer zu timen
      b.vx = side * Math.max(1300, Math.abs(b.vx));
      if (b.fxT > 3.2) endFx(st); break;
    }
    case "sad": if (b.fxT > 1.7) endFx(st); break;
    case "flex": {
      const side = b.fxO ? -1 : 1;
      const gl = side > 0 ? W - GOAL_W : GOAL_W;
      if (b.fxP === 0) {
        aim(b, t.x, t.y - 20, 1150);
        // Hüpfer so berechnet, dass der Ball an der Torlinie wieder unten ist (über den Verteidiger, unter die Latte)
        if (Math.abs(gl - b.x) < 600) {
          const T = Math.abs(gl - b.x) / 1000, g = ballG(st) * 2.2, yl = Math.min(G - b.r - 8, t.y + 10);
          b.fxP = 1; b.vy = -Math.max(0, (0.5 * g * T * T - (yl - b.y)) / Math.max(0.05, T)); ev(st, { t: "launch", x: b.x, y: b.y });
        }
      } else b.vx = side * 1000;
      if (b.fxT > 2.2) endFx(st); break;
    }
    case "bassdrop":
      if (b.fxP === 0 && b.fxT > 0.3) { b.fxP = 1; b.vx = 0; b.vy = 0; ev(st, { t: "drop", x: b.x, y: b.y }); }
      if (b.fxP === 1) { b.vx = 0; b.vy = 0; if (b.fxT > 0.75) { b.fxP = 2; ev(st, { t: "launch", x: b.x, y: b.y }); } }
      if (b.fxP === 2) {
        const ph = Math.floor(b.fxT / 0.13);
        if (ph !== b.fxK) { b.fxK = ph; ev(st, { t: "zap", x: b.x, y: b.y }); }
        aim(b, t.x, t.y, 700);
        const ax = b.vx / 700, ay = b.vy / 700, s = (ph % 2 ? 1 : -1) * (b.fxO ? -1 : 1) * 300 * clamp(dhypot(t.x - b.x, t.y - b.y) / 450, 0.25, 1);   // kurz vor dem Tor ruhiger
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
        if (b.fxT > 0.95 || b.y < 90 || Math.abs(t.x - b.x) < 360) { b.fxP = 1; aim(b, t.x, t.y + 30, 1600); ev(st, { t: "launch", x: b.x, y: b.y }); }   // nah am Tor früher los (sonst Lattenecke)
      }
      if (b.fxT > 2.4) endFx(st); break;
    case "ghosting": b.alpha = b.fxT < 0.15 ? 1 : Math.abs(b.x - t.x) < 240 ? 0.95 : 0.1; if (b.fxT > 1.7) endFx(st); break;
    case "rizz": {
      steer(b, t.x, t.y, 2.4 + 900 / Math.max(150, dhypot(t.x - b.x, t.y - b.y)), 1050, dt);
      // Schlangenlinie, für beide Seiten gespiegelt (gleiche Drehrichtung von links wie von rechts)
      const w = (b.fxO ? 1 : -1) * dcos(b.fxT * 11) * 0.9 * dt * 11, c = dcos(w), s = dsin(w), vx = b.vx;
      b.vx = vx * c - b.vy * s; b.vy = vx * s + b.vy * c;
      if (b.fxT > 2.6) endFx(st); break;
    }
    case "brezel":
      if (b.fxP === 0 && b.fxT > 0.22) { b.fxP = 1; b.fxBX = 0; }
      if (b.fxP === 1) {
        // Looping: Geschwindigkeit dreht einmal ganz herum (nach oben über den Kopf), dann Feuer aufs Tor
        const w = -b.fxDX * Math.PI * 2 / 0.62, a = w * dt, c = dcos(a), s = dsin(a), vx = b.vx;
        b.vx = vx * c - b.vy * s; b.vy = vx * s + b.vy * c; b.fxBX += Math.abs(a);
        if (b.fxBX >= Math.PI * 2) { b.fxP = 2; aim(b, t.x, t.y, 1350); ev(st, { t: "launch", x: b.x, y: b.y }); }
      }
      if (b.fxT > 2.4) endFx(st); break;
    case "clone": case "copypaste": {
      b.fxBX += b.fxDX * dt; b.fxBY += b.fxDY * dt;
      const amp = 75 * dsin(Math.min(1, b.fxT / 0.35) * Math.PI / 2);
      const d = dhypot(b.fxDX, b.fxDY) || 1, px = -b.fxDY / d, py = b.fxDX / d;
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
  if (b.fx === "clone" || b.fx === "copypaste") { const s = dhypot(b.fxDX, b.fxDY) || 1; b.vx = b.fxDX / s * 900; b.vy = b.fxDY / s * 900; }
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
