// Power-ups im Spiel: Lebenszyklus der Kugeln (Ankündigung, Erscheinen, Ablauf, Zerplatzen), Einsammeln (Splitter,
// Funken, Ring, fliegendes Symbol, Banner, Rand), sichtbare Wirkungen am Spieler und auf dem Feld, Abzeichen über dem
// Kopf. Vorlage: tools/powerups/schauraum.html. Liest den Spielzustand nur. Eigene Teilchen
// (gedeckelt) und kurze Abläufe liegen hier; render.js ruft die Ebenen in der richtigen Reihenfolge auf.
import { W, G, GOAL_W, HR, BAR_T, POWERUPS } from "../../content/config.js";
import { pr, shoeGeo } from "../../core/physics.js";
import { PU } from "../../core/sim/tuning.js";
import { t as trn } from "../../content/i18n.js";
import { drawHead } from "./art.js";
import { FAM_HI, drawBadge, drawChip, drawOrb, endPulse, famCol, famOf, hexA, reducedMotion, star, starPath } from "./powerup-art.js";
import { INK, TAU, circ } from "./paint.js";

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const rand = (a, b) => a + Math.random() * (b - a);
const easeOut = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
const elastic = k => { k = clamp(k, 0, 1); return k === 0 || k === 1 ? k : Math.pow(2, -9 * k) * Math.sin((k * 10 - 0.75) * TAU / 3) + 1; };
const spring = (k, f = 9, d = 5) => 1 - Math.exp(-d * k) * Math.cos(f * k);
/** Ein- und Ausblenden einer Wirkung mit Restzeit v und Dauer d */
const fade = (v, d, kin = 4, kout = 4) => clamp(Math.min((d - v) * kin, v * kout), 0, 1);

/** Radius der Kugel (Tintenrand bei 1,12 R = Einsammel-Abstand in powerups.js) */
export const ORB_R = 32;
const BANNER_DUR = 1.6;

// ---------- Reduzierte Bewegung, Qualität ----------
export { reducedMotion };
let hi = true;
export function setPuQuality(q) { hi = q === "high"; }
const few = () => reducedMotion() || !hi;
const nk = k => Math.max(1, Math.round(k * (hi ? 1 : 0.5) * (reducedMotion() ? 0.5 : 1)));

// ---------- Verläufe einmal anlegen (je Canvas), mit translate/scale wiederverwenden statt jedes Bild neu ----------
const gCache = new WeakMap();
function cg(c, key, make) {
  let m = gCache.get(c); if (!m) { m = new Map(); gCache.set(c, m); }
  let g = m.get(key);
  if (!g) { if (m.size > 60) m.clear(); g = make(); m.set(key, g); }
  return g;
}
const radial = (c, stops, x0 = 0, y0 = 0, r0 = 0) => { const g = c.createRadialGradient(x0, y0, r0, 0, 0, 1); for (const [o, col] of stops) g.addColorStop(o, col); return g; };

// ---------- Teilchen (eigener Topf, gedeckelt) ----------
const pp = [];
let dtNow = 1 / 60, T = 0;
function P(o) {
  const cap = Math.round((hi ? 260 : 120) * (reducedMotion() ? 0.6 : 1));
  while (pp.length >= cap) pp.shift();
  const life = o.life ?? 0.5;
  pp.push({ vx: 0, vy: 0, g: 0, drag: 0, rot: 0, vr: 0, size: 4, a: 1, col: "#fff", ...o, life, max: life });
}
/** Teilchen je Sekunde → Anzahl in diesem Bild */
function rate(n) { const x = n * dtNow * (hi ? 1 : 0.5) * (reducedMotion() ? 0.5 : 1); return Math.floor(x) + (Math.random() < x % 1 ? 1 : 0); }

/** Teilchen zeichnen: runde Teilchen direkt an ihrer Stelle, gedrehte über die Grundmatrix (kein save/restore je Teilchen) */
function drawPP(c, add) {
  const ga = c.globalAlpha;
  let base = null;
  for (const p of pp) {
    if (!!p.add !== add) continue;
    const k = p.life / p.max;
    c.globalAlpha = ga * clamp(k * 1.4, 0, 1) * p.a;
    switch (p.type) {
      case "spark": circ(c, p.x, p.y, p.size * (0.5 + k * 0.5)); c.fillStyle = p.col; c.fill(); continue;
      case "ring": circ(c, p.x, p.y, p.size + (1 - k) * p.grow); c.lineWidth = Math.max(0.5, p.w * k); c.strokeStyle = p.col; c.stroke(); continue;
      case "smoke": circ(c, p.x, p.y, p.size * (1.6 - k * 0.6)); c.fillStyle = p.col; c.fill(); continue;
      case "star": star(c, p.x, p.y, p.size, p.col, false, p.rot); continue;
      case "pix": c.fillStyle = p.col; c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); continue;
    }
    if (!base) base = c.getTransform();
    c.setTransform(base); c.translate(p.x, p.y); c.rotate(p.rot);
    switch (p.type) {
      case "shard": c.beginPath(); c.moveTo(-p.size, -p.size * 0.4); c.lineTo(p.size * 0.9, -p.size * 0.7); c.lineTo(p.size * 0.3, p.size * 0.8); c.closePath(); c.fillStyle = p.col; c.fill(); c.lineWidth = 1.5; c.strokeStyle = "rgba(255,255,255,.9)"; c.stroke(); break;
      case "feather": c.beginPath(); c.ellipse(0, 0, p.size * 0.35, p.size, 0, 0, TAU); c.fillStyle = p.col; c.fill(); c.strokeStyle = "rgba(21,17,46,.5)"; c.lineWidth = 1.5; c.stroke(); break;
      case "leaf": c.beginPath(); c.ellipse(0, 0, p.size, p.size * 0.45, 0, 0, TAU); c.fillStyle = p.col; c.fill(); break;
      case "flame": {
        const s = p.size * (0.4 + k * 0.6);
        c.beginPath(); c.moveTo(0, -s * 1.6); c.quadraticCurveTo(s, -s * 0.2, 0, s); c.quadraticCurveTo(-s, -s * 0.2, 0, -s * 1.6); c.closePath();
        c.fillStyle = k > 0.5 ? "#ffd36b" : p.col; c.fill(); break;
      }
      case "text":
        c.font = `${p.size}px 'Lilita One', Impact, sans-serif`; c.textAlign = "center"; c.textBaseline = "alphabetic"; c.lineJoin = "round";
        c.lineWidth = 6; c.strokeStyle = INK; c.strokeText(p.text, 0, 0); c.fillStyle = p.col; c.fillText(p.text, 0, 0); break;
    }
  }
  if (base) c.setTransform(base);
  c.globalAlpha = ga;
}

// ---------- kleine Bausteine ----------
function puff(x, y, n, r = 1) {
  for (let i = 0; i < nk(n); i++) { const a = rand(0, TAU); P({ type: "smoke", x, y, vx: Math.cos(a) * 160 * r, vy: Math.sin(a) * 120 * r, drag: 4, life: 0.5, size: rand(10, 18) * r, col: "rgba(255,255,255,.5)" }); }
}
function dust(x, n = 10) {
  for (let i = 0; i < nk(n); i++) P({ type: "smoke", x: x + rand(-30, 30), y: G - 6, vx: rand(-150, 150) * 2, vy: rand(-100, -40), drag: 4, life: 0.5, size: rand(8, 14), col: "rgba(220,230,200,.55)" });
}
function ring(x, y, col, size, grow, w = 4, life = 0.35) { P({ type: "ring", x, y, life, size, grow, col, add: true, w }); }
function shards(x, y, n, col, o = {}) {
  for (let i = 0; i < nk(n); i++) {
    const a = o.up ? rand(-Math.PI * 0.95, -Math.PI * 0.05) : rand(0, TAU), sp = rand(o.sp0 ?? 150, o.sp1 ?? 400);
    P({ type: "shard", x: x + rand(-(o.w || 0), o.w || 0), y: y + rand(-(o.h || 0), o.h || 0), vx: Math.cos(a) * sp + (o.vx || 0), vy: Math.sin(a) * sp - (o.lift ?? 120), g: 1100, rot: rand(0, 6), vr: rand(-12, 12), life: o.life || 0.9, size: rand(o.s0 ?? 5, o.s1 ?? 10), col, ground: true });
  }
}
function sparks(x, y, n, cols, sp = 300, life = 0.35, size = 2.6) {
  for (let i = 0; i < nk(n); i++) { const a = i / nk(n) * TAU + rand(-0.2, 0.2); P({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 5, life, size, col: cols[i % cols.length], add: true }); }
}
function text(x, y, s, col, size = 22) { P({ type: "text", x, y, vy: -50, life: 0.9, size, text: s, col }); }
// Höhe der Frisur über der Kopfmitte in Kopfradien (Haare, Mütze, Ohren, Sticker-Rand): einmal je Figur gemessen
const hairCache = new Map();
function hairTop(ch) {
  let v = hairCache.get(ch);
  if (v !== undefined) return v;
  v = 1.15;   // Schätzwert ohne Canvas
  try {
    const R = 40, S = 220, cy = S * 0.62, cv = document.createElement("canvas"); cv.width = cv.height = S;
    const x = cv.getContext("2d", { willReadFrequently: true });
    drawHead(x, ch, S / 2, cy, R, { dir: 1, mood: "", t: 0 });
    const d = x.getImageData(0, 0, S, S).data;
    find: for (let y = 0; y < cy; y++) for (let i = 0; i < S; i++) if (d[(y * S + i) * 4 + 3] > 80) { v = Math.max(1, (cy - y) / R); break find; }
  } catch { /* ohne DOM (Tests): Schätzwert */ }
  hairCache.set(ch, v);
  return v;
}
/**
 * Mitte der Abzeichen über dem Spieler: über der höchsten Stelle der Frisur (wächst mit der Kopfgröße, Riesenkopf und Mini),
 * mit Luft für Strecken im Sprung und Federn des Riesenkopfs; Sternchen bei Benommenheit noch etwas höher
 */
const badgeY = p => { const r = pr(p); return p.y + r - (r + r * hairTop(p.ch)) * 1.08 - 21 - (p.stun > 0 ? 12 : 0); };

// ---------- Abläufe: fliegendes Symbol, Banner, Rand, Erdbeben-Risse, Goldschwall ----------
const anims = [];
let banner = null, tint = null;

/** Alles weg (neues Spiel, Menü) */
export function puClear() { pp.length = 0; anims.length = 0; banner = null; tint = null; endK = 1; for (const m of act) m.clear(); }

/**
 * Ereignis aus der Spielphysik (effects.js). st: aktueller Zustand (für Positionen). o.tint: Rand in Familienfarbe
 * (nur wenn der eigene menschliche Spieler einsammelt)
 */
export function puEvent(e, st, o = {}) {
  switch (e.t) {
    case "pu": {
      const fam = e.fam || famOf(e.k), col = famCol(fam), hiC = FAM_HI[fam] || "#fff";
      // kleine Splitter, Funken, schmaler Ring
      shards(e.x, e.y, 6, hexA(col, 0.7), { sp0: 150, sp1: 260, lift: 90, life: 0.6, s0: 4, s1: 7 });
      sparks(e.x, e.y, 12, [hiC, col], 330, 0.35, 2.6);
      ring(e.x, e.y, col, ORB_R * 0.95, 100, 4);
      const to = e.to >= 0 ? e.to : e.i;
      anims.push({ kind: "fly", k: e.k, to, x0: e.x, y0: e.y, t: 0, dur: 0.38 });
      banner = { k: e.k, t: -0.3 };   // erscheint, wenn das Symbol landet; ein neues ersetzt das alte
      if (o.tint) tint = { col, t: 0 };
      const me = st && st.p[e.i], tp = st && st.p[to];
      if (e.k === "boot" && me) { const g = shoeGeo(me); puff(g.x, g.y, 8, 0.7); }
      if (e.k === "head" && me) puff(me.x, me.y, 8, 0.9);
      if (e.k === "mini" && tp) puff(tp.x, tp.y, 12, 0.9);
      if (e.k === "super" && me) anims.push({ kind: "gold", i: e.i, t: 0, dur: 0.9 });
      if (e.k === "goal") { const side = 1 - e.i, gx = side ? W - GOAL_W / 2 : GOAL_W / 2; ring(gx, G - 160, "#ff8ce6", 30, 120, 4, 0.45); }
      break;
    }
    case "puGone": {   // Kugel läuft ab: kleines Zerplatzen
      const col = famCol(famOf(e.k)), y = e.y;
      sparks(e.x, y, 8, ["#fff", col], 200, 0.3, 2.2);
      ring(e.x, y, col, ORB_R * 0.7, 40, 3, 0.25);
      shards(e.x, y, 4, hexA(col, 0.6), { sp0: 80, sp1: 160, lift: 60, life: 0.5, s0: 3, s1: 5 });
      break;
    }
    case "wallcrack": sparks(e.x, e.y, 8, ["#c9f2ff", "#fff"], 260, 0.3, 2.4); break;
    case "wallbreak": {
      const d = e.i ? -1 : 1;
      for (let n = 0; n < nk(22); n++) P({ type: "shard", x: e.x + rand(-7, 7), y: rand(G - 230, G - 6), vx: d * rand(80, 460), vy: rand(-500, -200), g: 1100, rot: rand(0, 6), vr: rand(-12, 12), life: 1.1, size: rand(7, 14), col: "rgba(120,210,255,.75)", ground: true });
      break;
    }
    case "shield": {   // Schutzblase platzt
      const p = st && st.p[e.i], x = p ? p.x : e.x, y = p ? p.y : e.y, r = p ? pr(p) * 1.55 : 80;
      for (let n = 0, m = nk(22); n < m; n++) { const a = n / m * TAU; P({ type: "star", x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: Math.cos(a) * 180, vy: Math.sin(a) * 180, drag: 3, life: 0.6, size: 5, col: n % 3 ? "#ffffff" : "#ffc2f4", vr: 6, add: true }); }
      text(x, y - r - 16, trn("fx.shield"), "#c9f2ff", 26);
      break;
    }
    case "clonehit": ring(e.x, e.y, "#9fe8ff", HR * 0.8, 100, 5); sparks(e.x, e.y, 8, ["#7ef3ff", "#fff"], 220, 0.3); break;
    case "clonebreak":
      for (let n = 0; n < nk(18); n++) P({ type: "pix", x: e.x + rand(-60, 60), y: e.y + rand(-60, 60), vx: rand(-200, 200), vy: rand(-200, 200), life: 0.5, size: rand(4, 8), col: Math.random() < 0.5 ? "#7ef3ff" : "#ff7ae6", add: true });
      break;
    case "portal":
      ring(e.x, e.y, "#ff8a2b", 22, 80, 6, 0.3); ring(e.x2, e.y2, "#3fb8ff", 22, 90, 6, 0.35); sparks(e.x2, e.y2, 10, ["#3fb8ff", "#fff"], 300, 0.3);
      anims.push({ kind: "portalOut", ax: e.x, ay: e.y, bx: e.x2, by: e.y2, t: 0, dur: 0.3 });
      break;
    case "icetap": {
      const p = st && st.p[e.i]; if (p) taps[e.i] = T;
      shards(e.x, e.y, 4, "rgba(200,240,255,.9)", { w: 40, h: 40, sp0: 100, sp1: 220, lift: 160, life: 0.6, s0: 5, s1: 7 });
      break;
    }
    case "icebreak": iceShatter(e.x, e.y); if (e.i === 0 || e.i === 1) broke[e.i] = T; break;
    case "magnet": ring(e.x, e.y, "#5fd0ff", 14, 40, 3, 0.25); break;
    case "quake": {   // Erdbeben: Risse über den Rasen vom Sammler zum Gegner, Staub, Sternchen beim Getroffenen
      const me = st && st.p[e.i], op = st && st.p[1 - e.i];
      anims.push({ kind: "quake", x0: me ? me.x : e.x, x1: e.x, t: 0, dur: 2.9 });
      dust(e.x, 12);
      if (op && op.stun > 0) for (let n = 0; n < nk(6); n++) P({ type: "star", x: op.x, y: op.y - pr(op), vx: Math.cos(n) * 120, vy: -80 + Math.sin(n) * 40, life: 0.9, size: 9, col: "#ffe14d", vr: 5, drag: 2 });
      break;
    }
    case "jump":   // Doppelsprung mit Flügelschuhen: Federn und ein Ring
      for (let n = 0; n < nk(12); n++) P({ type: "feather", x: e.x + rand(-20, 20), y: e.y, vx: rand(-130, 130), vy: rand(60, 180), g: 160, drag: 2, rot: rand(0, 6), vr: rand(-3, 3), life: 1.2, size: 10, col: "#ffffff" });
      ring(e.x, e.y, FAM_HI.mov, 22, 120, 5);
      break;
    case "piep": text(e.x, e.y, trn("fx.piep"), "#ffc2f4", 20); break;
  }
}
function iceShatter(x, y) {
  for (let n = 0; n < nk(24); n++) { const a = rand(0, TAU); P({ type: "shard", x: x + Math.cos(a) * 46, y: y + Math.sin(a) * 46, vx: Math.cos(a) * rand(200, 500), vy: Math.sin(a) * 300 - 200, g: 1100, rot: rand(0, 6), vr: rand(-12, 12), life: 1.1, size: rand(7, 15), col: "rgba(200,240,255,.85)", ground: true }); }
}
const taps = [-9, -9], broke = [-9, -9];

// ---------- Wirkungen verfolgen: seit wann aktiv (federnde Anfänge), Ende mit kleinem Wölkchen ----------
const OWN_B = [["fire", "fireT"], ["boot", "bootT"], ["spin", "spinT"], ["wings", "wingT"], ["head", "bigT"], ["magnet", "magT"], ["bubble", "shieldT"]];
/** Abzeichen eines Spielers: eigene Wirkungen (höchstens 3) und fremde (Mini, Eisblock), [Schlüssel, Restzeit] */
export function puBadges(p) {
  const out = [];
  for (const [k, f] of OWN_B) { let v = p[f] || 0; if (k === "fire" && !(v > 0) && p.fireNext) v = POWERUPS.fire.dur; if (v > 0) out.push([k, v]); }
  if (p.miniT > 0) out.push(["mini", p.miniT]);
  const ice = iceLeft(p); if (ice > 0) out.push(["ice", ice]);
  return out;
}
/** Rest des Eisblocks (nur der Anteil des Power-ups; der Rest des Eis-Supers p.frzS taut nicht ab) */
export const iceLeft = p => (p.iceB && p.frz > 0 ? Math.max(0, p.frz - (p.frzS > 0 ? p.frzS : 0)) : 0);
const act = [new Map(), new Map(), new Map()];   // je Spieler und Feld: Schlüssel → { t0, x, y }
let live = false;
// Spielende: Feldwirkungen und Abzeichen blenden hinter der Ergebnis-Karte sanft aus (die Spielphysik steht dann)
let endK = 1;
/** Deckkraft der Power-up-Darstellung (1, am Spielende gegen 0) */
export const puEndFade = () => endK;

/**
 * Jedes Bild vor dem Zeichnen: Teilchen und Abläufe weiter, Wirkungen verfolgen. dt = 0 hält alles an (Pause, Warten auf
 * die Verbindung, Handy hochkant). replay: Wiederholung (nur zeigen)
 */
export function puTick(dt, st, replay) {
  dtNow = dt; T += dt;
  for (let i = pp.length - 1; i >= 0; i--) {
    const p = pp[i]; p.life -= dt; if (p.life <= 0) { pp.splice(i, 1); continue; }
    p.vy += p.g * dt; if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.ground && p.y > G) { p.y = G; p.vy *= -0.35; p.vx *= 0.7; p.vr *= 0.6; }
  }
  for (let i = anims.length - 1; i >= 0; i--) {
    const a = anims[i]; a.t += dt;
    if (a.kind === "fly" && a.t >= a.dur && !a.landed) { a.landed = true; if (a.tx !== undefined) ring(a.tx, a.ty, "#fff", 16, 30, 3, 0.25); }
    if (a.t > a.dur + (a.kind === "fly" ? 0.05 : 0)) anims.splice(i, 1);
  }
  if (banner) { banner.t += dt; if (banner.t > BANNER_DUR) banner = null; else if (st && st.ph !== "play" && banner.t > 0) banner.t = Math.max(banner.t, BANNER_DUR - 0.25); }
  if (tint && (tint.t += dt) > 0.4) tint = null;
  live = !replay && !!st;
  if (!live || !st.p) return;
  endK = st.ph === "end" ? Math.max(0, endK - dt * 2.5) : 1;
  for (let i = 0; i < 2; i++) {
    const p = st.p[i], m = act[i], now = new Set(puBadges(p).map(([k]) => k));
    // neues Abzeichen springt erst auf, wenn das fliegende Symbol am Kopf ankommt
    for (const k of now) if (!m.has(k)) { const f = anims.find(a => a.kind === "fly" && a.to === i && a.k === k && !a.landed); m.set(k, { t0: T + (f ? f.dur - f.t : 0), x: p.x, y: badgeY(p) }); }
    // Ende einer Wirkung: Wölkchen; Eis taut auf (freigehämmert zersprang es schon bei icebreak)
    for (const [k, v] of m) if (!now.has(k)) {
      m.delete(k);
      if (st.ph === "play") { puff(v.x, v.y, 6, 0.55); if (k === "ice" && T - broke[i] > 0.3) iceShatter(p.x, p.y); if (k === "mini" || k === "boot") puff(p.x, p.y + pr(p) * 0.5, 6, 0.6); }
    }
  }
  const f = act[2];
  for (let s = 0; s < 2; s++) { const k = "goal" + s; if (st.bigGoal[s] > 0) { if (!f.has(k)) f.set(k, { t0: T }); } else f.delete(k); }
}
/** Sekunden seit Beginn einer Wirkung (Wiederholung: aus der Restzeit v und der Dauer des Power-ups pk) */
function age(i, k, v, pk = k) { const e = live && act[i].get(k); return e ? T - e.t0 : POWERUPS[pk].dur - v; }

// ---------- Kugeln ----------
// Leuchten der Ankündigung als Einheitsverlauf je Familie (skaliert gezeichnet, nicht jedes Bild neu)
const teleGrad = (c, fam) => cg(c, "tele" + fam, () => { const col = famCol(fam); return radial(c, [[0, hexA(col, 0.9)], [1, hexA(col, 0)]]); });
/** Kugeln: Ankündigung (Schimmern, dünner Ring am Boden), Erscheinen mit Überschwingen, Schatten, Pulsieren am Ende */
export function drawPuOrbs(c, st, t) {
  for (const u of st.pu) {
    const fam = famOf(u.k), col = famCol(fam);
    if (u.t < 0) {
      const k = clamp((u.t + PU.warn) / PU.warn, 0, 1), a = Math.min(1, k * 2);
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = a * 0.35 * (0.6 + 0.4 * Math.sin(t * 10));
      c.translate(u.x, u.y); c.scale(ORB_R * 0.8 * k + 6, ORB_R * 0.8 * k + 6); c.fillStyle = teleGrad(c, fam); circ(c, 0, 0, 1); c.fill();
      c.restore();
      if (!reducedMotion() && rate(10)) P({ type: "spark", x: u.x + rand(-20, 20), y: u.y + rand(-20, 20), vy: -30, life: 0.4, size: 2, col: FAM_HI[fam], add: true });
    }
    // dünner Ring am Boden (Ankündigung, blendet nach dem Erscheinen kurz aus)
    if (u.t < 0.25) {
      const a = u.t < 0 ? Math.min(1, (u.t + PU.warn) / PU.warn * 2) : 1 - u.t / 0.25;
      c.save(); c.globalAlpha = a * 0.55; c.strokeStyle = col; c.lineWidth = 2.5; c.setLineDash([8, 8]); c.lineDashOffset = -t * 40;
      c.beginPath(); c.ellipse(u.x, G + 4, ORB_R + 4 * Math.sin(t * 6), 6, 0, 0, TAU); c.stroke(); c.restore();
    }
    if (u.t < 0) continue;
    let s = u.t < 0.35 ? elastic(u.t / 0.35) : 1, a = 1;
    const end = PU.life - 2;
    // läuft ab: schrumpft und pulsiert weich, schneller werdend bis 3 Hz (kein hartes Blinken)
    if (u.t > end) { const k = clamp((u.t - end) / 2, 0, 1), q = u.t - end; s *= 1 - 0.25 * k; a = reducedMotion() ? 0.8 + 0.2 * Math.cos(q * TAU) : 0.65 + 0.35 * Math.cos(q * TAU * (1.5 + 0.75 * k)); }
    const y = u.y + Math.sin(u.t * 3) * 10, R = ORB_R * s;
    // Schatten am Boden
    const sh = clamp(1 - (G - (y + R)) / 520, 0.25, 1);
    c.fillStyle = `rgba(0,0,20,${0.22 * sh * a})`; c.beginPath(); c.ellipse(u.x, G + 4, R * 0.8 * sh, 6 * sh, 0, 0, TAU); c.fill();
    drawOrb(c, u.k, u.x, y, R, t + u.id * 0.7, { alpha: a, few: few() });
  }
}

// ---------- Feld ----------
// Schwerelos je Arena: draußen lila Himmel mit Sternen, im Innenraum lila Lichtschimmer ohne Sterne, auf dem Mond (dort
// ist der Himmel schon dunkel und voller Sterne) kräftiger getönt und mit Leuchten am Ball, in der Tiefsee Schimmer
const SKY = { backrooms: "in", tiefsee: "in", mond: "space" };
const skyKind = st => SKY[st.arena] || "out";
// Verläufe als 1 px schmale Streifen (einmal gezeichnet, gestreckt): viel billiger als eine Verlaufsfläche je Bild
const STRIPS = {
  skyout: [0, [[0, "#2a0f5e"], [1, "rgba(122,59,208,.35)"]]],
  skyspace: [0, [[0, "#3a1080"], [1, "rgba(150,80,255,.55)"]]],
  skyin: [0, [[0, "rgba(120,60,230,.75)"], [0.55, "rgba(140,80,240,.35)"], [1, "rgba(160,100,255,.18)"]]],
  shaft: [1, [[0, "rgba(210,170,255,0)"], [0.5, "rgba(210,170,255,.5)"], [1, "rgba(210,170,255,0)"]]],
};
const stripCv = {};
function strip(k) {
  if (stripCv[k]) return stripCv[k];
  const [hor, stops] = STRIPS[k], n = 128, cv = document.createElement("canvas");
  cv.width = hor ? n : 1; cv.height = hor ? 1 : n;
  const x = cv.getContext("2d"), g = hor ? x.createLinearGradient(0, 0, n, 0) : x.createLinearGradient(0, 0, 0, n);
  for (const [o, col] of stops) g.addColorStop(o, col);
  x.fillStyle = g; x.fillRect(0, 0, cv.width, cv.height);
  return (stripCv[k] = cv);
}
/**
 * Schwerelos über Himmel und Tribüne bis zur hinteren Feldkante ft. v: sichtbarer Bereich in Weltkoordinaten
 * { x0, x1, y0 } (ungekappt, wird ganz gefüllt). Verlauf je Größe zwischengespeichert, Sterne in vier Pfaden.
 */
export function drawPuSky(c, st, t, v, ft) {
  if (!(st.floatT > 0)) return;
  const a = fade(st.floatT, POWERUPS.float.dur, 3, 3) * endK;
  if (a <= 0) return;
  const kind = skyKind(st), top = Math.floor(Math.min(v.y0, ft - 80)) - 4, x0 = v.x0 - 4, x1 = v.x1 + 4, h = ft - top;
  c.save();
  c.globalAlpha = a * (kind === "space" ? 0.72 : kind === "in" ? 0.85 : 0.5);
  c.drawImage(strip("sky" + kind), x0, top, x1 - x0, h);
  if (kind === "in") {
    // drei breite, langsam wandernde Lichtbahnen
    const img = strip("shaft");
    for (let i = 0; i < 3; i++) {
      const bw = 260 + i * 70, bx = x0 + ((i * 0.37 + t * (0.025 + i * 0.008)) % 1.3 - 0.15) * (x1 - x0);
      c.globalAlpha = a * (0.32 + 0.12 * Math.sin(t * 0.9 + i * 2));
      c.drawImage(img, bx, top, bw, h);
    }
  } else {
    // Sterne, in vier Gruppen gleicher Deckkraft (je ein Pfad)
    const n = kind === "space" ? 24 : 40, span = x1 - x0, hh = Math.max(60, ft - top - 80);
    c.fillStyle = "#fff";
    for (let gr = 0; gr < 4; gr++) {
      c.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.6 + gr * 1.3)));
      c.beginPath();
      for (let i = gr; i < n; i += 4) starPath(c, x0 + ((i * 197) % 1000) / 1000 * span, top + 20 + (i * 83) % hh, 2 + (i % 3) * 1.4);
      c.fill();
    }
  }
  c.restore();
}

/** Feld hinter den Spielern: Zeitblase (Tönung), Erdbeben-Risse, Portale (dunkle Mitte), Doppelgänger */
export function drawPuFieldBack(c, st, t) {
  if (endK <= 0) return;
  const ga = c.globalAlpha; c.globalAlpha = ga * endK;
  lensFill(c, st);
  for (const a of anims) {
    if (a.kind === "quake") cracks(c, a);
    else if (a.kind === "portalOut") { const k = 1 - a.t / a.dur; portalCore(c, a.ax, a.ay, "#ff8a2b", k, k); portalCore(c, a.bx, a.by, "#3fb8ff", k, k); }
  }
  if (st.portal) {
    const pt = st.portal, a = fade(pt.t, POWERUPS.portal.dur, 3, 3);
    portalCore(c, pt.ax, pt.ay, "#ff8a2b", a); portalCore(c, pt.bx, pt.by, "#3fb8ff", a);
  }
  if (st.clone) for (let i = 0; i < 2; i++) if (st.clone[i] && st.clone[i].t > 0) clone(c, st, i, t);
  c.globalAlpha = ga;
}

/**
 * Feld vor den Spielern: Zeitblase (Rand), Portalringe (immer sichtbar, auch wenn ein Spieler davor steht), Windstreifen
 * und Blätter, Drall und Sterne am Ball, Leuchten am Ball (Schwerelos), Magnetbögen am Ball
 */
export function drawPuFieldFront(c, st, t) {
  if (endK <= 0) return;
  const ga = c.globalAlpha; c.globalAlpha = ga * endK;
  lensRim(c, st, t);
  for (const a of anims) if (a.kind === "portalOut") { const k = 1 - a.t / a.dur; portalRings(c, a.ax, a.ay, "#ff8a2b", t, k, k); portalRings(c, a.bx, a.by, "#3fb8ff", -t, k, k); }
  if (st.portal) {
    const pt = st.portal, a = fade(pt.t, POWERUPS.portal.dur, 3, 3);
    portalRings(c, pt.ax, pt.ay, "#ff8a2b", t, a); portalRings(c, pt.bx, pt.by, "#3fb8ff", -t, a);
  }
  const b = st.b;
  if (st.slow2 && b && st.slow2[b.x < W / 2 ? 0 : 1] > 0 && rate(24)) P({ type: "spark", x: b.x + rand(-8, 8), y: b.y + rand(-8, 8), life: 0.6, size: 6, col: "rgba(190,230,255,.55)" });
  if (st.wind && st.wind.t > 0) wind(c, st.wind, t);
  if (b && st.floatT > 0) {
    // Schwerelos: weiches lila Leuchten um den Ball (auf dem Mond kräftiger, dort ändert sich der Himmel kaum)
    const fa = fade(st.floatT, POWERUPS.float.dur, 3, 3) * (skyKind(st) === "space" ? 0.75 : 0.45), rr = b.r * 2.6;
    c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha *= fa; c.translate(b.x, b.y); c.scale(rr, rr);
    c.fillStyle = cg(c, "floatBall", () => radial(c, [[0, "rgba(200,140,255,.85)"], [0.45, "rgba(170,100,255,.35)"], [1, "rgba(150,80,255,0)"]]));
    circ(c, 0, 0, 1); c.fill(); c.restore();
  }
  if (b && b.spin) {
    c.save(); c.translate(b.x, b.y); c.rotate(t * 18); c.strokeStyle = "#ffd36b"; c.lineWidth = 3; c.lineCap = "round"; c.globalAlpha *= 0.85;
    for (let k = 0; k < 2; k++) { c.beginPath(); c.arc(0, 0, b.r * 1.35, k * Math.PI, k * Math.PI + 1.1); c.stroke(); }
    c.restore();
    for (let n = rate(40); n > 0; n--) { const q = t * 22 + n; P({ type: "spark", x: b.x + Math.cos(q) * b.r * 0.8, y: b.y + Math.sin(q) * b.r * 0.8, life: 0.45, size: 3, col: "#ffd36b", add: true }); }
  }
  if (b && st.floatT > 0 && Math.hypot(b.vx || 0, b.vy || 0) > 80 && rate(18)) P({ type: "star", x: b.x - 12, y: b.y + rand(-10, 10), vx: -30, vy: 10, life: 0.9, size: rand(4, 7), col: Math.random() < 0.5 ? "#fff6c8" : "#ffc2f4", vr: 3 });
  if (b && b.stick && st.p[b.stick.i]) magnetArc(c, st.p[b.stick.i], b);
  c.globalAlpha = ga;
}
/** Teilchen und Abläufe in der Welt (ganz vorn): fliegendes Symbol, Goldschwall */
export function drawPuWorldTop(c, st, t) {
  for (const a of anims) {
    if (a.kind === "fly") {
      const p = st.p[a.to]; if (!p) continue;
      const u = easeOut(a.t / a.dur), tx = p.x, ty = badgeY(p); a.tx = tx; a.ty = ty;
      if (a.t >= a.dur) continue;   // gelandet: ab hier steht das Abzeichen
      const x = lerp(a.x0, tx, u), y = lerp(a.y0, ty, u) - Math.sin(u * Math.PI) * 90;
      c.save(); c.translate(x, y); c.scale(1.15 - u * 0.15, 1.15 - u * 0.15); drawChip(c, a.k, 0, 0, 18, t); c.restore();
      if (rate(30)) P({ type: "spark", x, y, life: 0.25, size: 2.5, col: FAM_HI[famOf(a.k)] || "#fff", add: true });
    } else if (a.kind === "gold") {
      const p = st.p[a.i]; if (!p) continue;
      const f = easeOut(a.t / 0.5) * (1 - clamp((a.t - 0.6) / 0.3, 0, 1)), r = pr(p) * 2;
      c.save(); c.globalCompositeOperation = "lighter"; c.globalAlpha = 0.45 * f; c.translate(p.x, p.y); c.scale(r, r);
      c.fillStyle = cg(c, "gold", () => radial(c, [[0, "rgba(255,214,60,1)"], [1, "rgba(255,214,60,0)"]], 0, 0, 10 / 120));
      circ(c, 0, 0, 1); c.fill(); c.restore();
      for (let n = rate(30); n > 0; n--) P({ type: "star", x: p.x + rand(-60, 60), y: p.y + rand(-60, 60), vy: -60, life: 0.7, size: 6, col: "#ffe14d", vr: 4, add: true });
    }
  }
  c.save();
  drawPP(c, false);
  c.globalCompositeOperation = "lighter"; drawPP(c, true);
  c.restore();
}

// Zeitblase: Halbellipse über der eigenen Hälfte. Füllung und Rand getrennt (der Rand ist nur der Bogen, keine Linie
// über den Boden); überlappen beide Blasen in der Mitte, wird die Schnittfläche einmal getönt und jeder Bogen endet am
// Rand der anderen Blase
const LENS_RX = W * 0.25 + 10, LENS_RY = 300;
const lensCx = i => (i ? W * 0.75 : W * 0.25);
const lensA = (st, i) => (st.slow2 && st.slow2[i] > 0 ? fade(st.slow2[i], POWERUPS.time.dur) : 0);
// Schnittpunkt beider Blasen liegt auf der Mittellinie: Winkel dort auf der linken (L) und rechten (R) Ellipse
const LENS_K = Math.acos((W / 2 - W * 0.25) / LENS_RX), LENS_L = TAU - LENS_K, LENS_R = Math.PI + LENS_K;
function lensFill(c, st) {
  const a0 = lensA(st, 0), a1 = lensA(st, 1);
  if (a0 <= 0 && a1 <= 0) return;
  const ga = c.globalAlpha, both = a0 > 0 && a1 > 0, weak = a1 <= a0 ? 1 : 0;
  c.fillStyle = "rgba(120,170,255,.13)";
  for (let i = 0; i < 2; i++) {
    const a = i ? a1 : a0;
    if (a <= 0) continue;
    c.globalAlpha = ga * a; c.beginPath();
    if (!both || i !== weak) { c.moveTo(lensCx(i) - LENS_RX, G); c.ellipse(lensCx(i), G, LENS_RX, LENS_RY, 0, Math.PI, TAU); }
    // die schwächere spart die Schnittfläche aus (Bogen bis zur Mitte, zurück am Bogen der anderen)
    else if (i === 1) { c.ellipse(lensCx(1), G, LENS_RX, LENS_RY, 0, LENS_R, TAU); c.lineTo(lensCx(0) + LENS_RX, G); c.ellipse(lensCx(0), G, LENS_RX, LENS_RY, 0, TAU, LENS_L, true); }
    else { c.moveTo(lensCx(0) - LENS_RX, G); c.ellipse(lensCx(0), G, LENS_RX, LENS_RY, 0, Math.PI, LENS_L); c.ellipse(lensCx(1), G, LENS_RX, LENS_RY, 0, LENS_R, Math.PI, true); }
    c.closePath(); c.fill();
  }
  c.globalAlpha = ga;
}
function lensRim(c, st, t) {
  const a0 = lensA(st, 0), a1 = lensA(st, 1);
  if (a0 <= 0 && a1 <= 0) return;
  const ga = c.globalAlpha, both = a0 > 0 && a1 > 0;
  for (let i = 0; i < 2; i++) {
    const a = i ? a1 : a0;
    if (a <= 0) continue;
    // nur der Bogen (keine Linie über den Boden); beide aktiv: jeder endet an der Mittellinie
    c.globalAlpha = ga * a; c.beginPath();
    c.ellipse(lensCx(i), G, LENS_RX, LENS_RY, 0, i && both ? LENS_R : Math.PI, !i && both ? LENS_L : TAU);
    c.lineWidth = 3.5; c.strokeStyle = "rgba(190,235,255,.75)"; c.stroke();
    c.globalAlpha = ga * a * 0.5; c.lineWidth = 12; c.strokeStyle = "rgba(255,255,255,.12)";
    c.beginPath(); c.ellipse(lensCx(i), G, LENS_RX - 30, LENS_RY - 30, 0, Math.PI * 1.1 + Math.sin(t) * 0.03, Math.PI * 1.45); c.stroke();
  }
  c.globalAlpha = ga;
}
function cracks(c, a) {
  const u = clamp(a.t / 0.5, 0, 1), al = a.t > 2.6 ? Math.max(0, 1 - (a.t - 2.6) * 3.3) : 1, d = a.x1 >= a.x0 ? 1 : -1;
  const end = lerp(a.x0, a.x1, u);
  c.save(); c.globalAlpha *= al; c.lineJoin = "round"; c.lineCap = "round";
  c.beginPath(); let x = a.x0, k = 0; c.moveTo(x, G + 6);
  while ((end - x) * d > 0) { x += 34 * d; const y = G + 6 + (k++ % 2 ? 9 : -2); c.lineTo(d > 0 ? Math.min(x, end) : Math.max(x, end), y); }
  c.strokeStyle = INK; c.lineWidth = 5; c.stroke(); c.strokeStyle = "#ffd36b"; c.lineWidth = 1.5; c.stroke();
  c.restore();
}
/** Portal hinter den Spielern: dunkle Mitte (Verlauf je Farbe einmal angelegt) */
function portalCore(c, x, y, col, a, sc = 1) {
  if (a <= 0 || sc <= 0) return;
  c.save(); c.globalAlpha *= a; c.translate(x, y); c.scale(0.5 * sc * 48, sc * 48);
  c.fillStyle = cg(c, "portal" + col, () => radial(c, [[0, "rgba(10,10,30,.95)"], [1, hexA(col, 0.2)]], 0, 0, 4 / 48));
  circ(c, 0, 0, 1); c.fill();
  c.restore();
}
/** Portal vor den Spielern: vier drehende Ringe */
function portalRings(c, x, y, col, rot, a, sc = 1) {
  if (a <= 0 || sc <= 0) return;
  c.save(); c.globalAlpha *= a; c.translate(x, y); c.scale(0.5 * sc, sc);
  for (let i = 0; i < 4; i++) { c.rotate(rot * 2 + i); c.beginPath(); c.arc(0, 0, 60 - i * 6, 0, 4.2); c.lineWidth = 9 - i * 1.5; c.strokeStyle = i % 2 ? "#ffffff" : col; c.stroke(); }
  c.restore();
}
// Doppelgänger: Hologramm je Figur, Blickrichtung, Bildschärfe und Phase der Scanlines einmal vorgerendert; ganz getönt
// (auch Haare und Stirnband außerhalb des Kopfkreises), Scanlines nur auf der Figur
const holoCache = new Map(), HOLO_M = HR * 1.9;
function holo(ch, dir, px, ph) {
  const key = ch + "|" + dir + "|" + px + "|" + ph;
  let cv = holoCache.get(key);
  if (cv) return cv;
  if (holoCache.size > 24) holoCache.clear();
  const m = HOLO_M, S = Math.ceil(2 * m * px);
  cv = document.createElement("canvas"); cv.width = cv.height = S;
  const x = cv.getContext("2d"); x.scale(S / (2 * m), S / (2 * m));
  drawHead(x, ch, m, m, HR, { dir, mood: "", t: 7 });
  x.globalCompositeOperation = "source-atop";
  x.fillStyle = "rgba(60,160,255,.5)"; x.fillRect(0, 0, 2 * m, 2 * m);
  x.fillStyle = "rgba(170,235,255,.25)"; x.fillRect(0, 0, 2 * m, 2 * m);
  x.fillStyle = "rgba(255,255,255,.22)"; x.beginPath();
  for (let yy = ph * 2; yy < 2 * m; yy += 6) x.rect(0, yy, 2 * m, 2);
  x.fill();
  holoCache.set(key, cv);
  return cv;
}
function clone(c, st, side, t) {
  const cl = st.clone[side], x = side ? W - GOAL_W - HR : GOAL_W + HR, y = G - HR, p = st.p[side];
  // sanftes Pulsieren (unter 1 Hz) statt Flackern; weniger Bewegung: ruhig
  const pulse = reducedMotion() ? 0.78 : 0.76 + 0.08 * Math.sin(t * 4 + side);
  const a = pulse * Math.min(1, cl.t / 0.4) * Math.min(1, (POWERUPS.clone.dur - cl.t) * 4);
  const jx = reducedMotion() ? 0 : (cl.hp < PU.cloneHp ? rand(-1.5, 1.5) : rand(-0.5, 0.5));
  c.fillStyle = "rgba(0,0,20,.22)"; c.beginPath(); c.ellipse(x, G + 3, HR * 0.9, 8, 0, 0, TAU); c.fill();
  const px = Math.min(6, Math.ceil(Math.abs(c.getTransform().a) * 4) / 4), ph = Math.floor(((t * 40) % 6) / 2);
  const ga = c.globalAlpha;
  c.globalAlpha = ga * a;
  c.drawImage(holo(p.ch, side ? -1 : 1, px, ph), x + jx - HOLO_M, y - HOLO_M, 2 * HOLO_M, 2 * HOLO_M);
  if (cl.hp < PU.cloneHp) { c.beginPath(); c.moveTo(x + jx - HR * 0.2, y - HR * 0.9); c.lineTo(x + jx + HR * 0.05, y - HR * 0.35); c.lineTo(x + jx - HR * 0.15, y); c.lineTo(x + jx + HR * 0.2, y + HR * 0.5); c.lineWidth = 2.5; c.strokeStyle = "#ffffff"; c.stroke(); }
  c.globalAlpha = ga;
}
function wind(c, w, t) {
  const a = fade(w.t, POWERUPS.wind.dur, 3, 3), d = w.dir || 1;
  c.save(); c.globalAlpha *= 0.4 * a; c.strokeStyle = "#e6f6ff"; c.lineWidth = 3; c.lineCap = "round";
  c.beginPath();
  for (let i = 0; i < 14; i++) {
    const y = 90 + (i * 37) % (G - 110), span = W + 300, x0 = ((t * 900 + i * 173) % span) - 150, x = d > 0 ? x0 : W - x0, L = 90 + (i % 3) * 30;
    c.moveTo(x, y); c.lineTo(x + d * L, y); c.quadraticCurveTo(x + d * (L + 40), y - 4, x + d * (L + 30), y - 18);
  }
  c.stroke();
  c.restore();
  if (endK < 1) return;
  for (let n = rate(7 * a); n > 0; n--) P({ type: "leaf", x: d > 0 ? -20 : W + 20, y: rand(120, G - 30), vx: d * rand(600, 900), vy: rand(-30, 30), life: 2.2, size: 9, col: Math.random() < 0.5 ? "#3ddc84" : "#ffd36b", rot: rand(0, 6), vr: 6 });
}
function magnetArc(c, p, b) {
  const g = shoeGeo(p), x0 = g.x + g.ux * g.hl, y0 = g.y + g.uy * g.hl;
  c.save(); c.globalCompositeOperation = "lighter"; c.lineJoin = "round";
  for (let k = 0; k < 2; k++) {
    c.beginPath(); c.moveTo(x0, y0);
    for (let s = 1; s <= 6; s++) { const u = s / 6, j = s < 6 ? 5 : 0; c.lineTo(lerp(x0, b.x, u) + rand(-j, j), lerp(y0, b.y, u) + rand(-j, j)); }
    c.strokeStyle = k ? "#ffffff" : "rgba(95,208,255,.8)"; c.lineWidth = k ? 1.5 : 4; c.stroke();
  }
  c.restore();
}

// ---------- Tor (Riesentor federnd, Torwand) ----------
/** Sichtbare Lattenhöhe: das Tor wächst federnd auf die PU.goalUp der Physik */
export function goalLift(st, side) {
  if (!(st.bigGoal[side] > 0)) return 0;
  const tau = age(2, "goal" + side, st.bigGoal[side], "goal");
  return PU.goalUp - PU.goalUp * clamp(spring(tau, 14, 4), 0, 1.4);
}
/** konvexe Hülle (Umriss des Torkastens aus den Ecken vorn und hinten) */
function hull(pts) {
  pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length > 1 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
/**
 * Riesentor: pinkes Leuchten auf der ganzen Netzfläche (hinter dem Netz und den Spielern, render.js goalBack), pulsiert
 * weich. g: Torgeometrie { gl, xb, by, fGlT, fXbT, fGlB, fXbB }
 */
export function drawBigGoal(c, st, side, g, t) {
  if (!(st.bigGoal[side] > 0) || endK <= 0) return;
  const a = fade(st.bigGoal[side], POWERUPS.goal.dur, 6, 3) * endK;
  const pts = hull([[g.gl, g.by], [g.xb, g.by], [g.gl, G], [g.xb, G], g.fGlT, g.fXbT, g.fGlB, g.fXbB]);
  // deckend getönt statt additiv: auf hellem Rasen würde Pink sonst zu Grau
  c.save(); c.globalAlpha *= a * (0.4 + 0.1 * Math.sin(t * 6));
  c.beginPath(); pts.forEach(([x, y], n) => (n ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
  c.fillStyle = "#ff4fd8"; c.fill();
  c.restore();
}
/**
 * Torwand: Sechseck-Energiewand vor dem Tor (Lage aus der Physik), kräftig gefüllt, leuchtende Kante zur Feldseite, Risse
 * nach dem ersten harten Treffer. Einmal je Seite, Höhe, Bildschärfe und Zustand vorgerendert; im Bild nur noch ein
 * Bild, ein weiches Pulsieren und ein heller Schimmer, der langsam nach oben wandert.
 */
const wallCache = new Map(), WALL_W = 22, WALL_PAD = 8;
function wallImg(side, h, px, cracked) {
  const key = side + "|" + h + "|" + px + "|" + cracked;
  let cv = wallCache.get(key);
  if (cv) return cv;
  if (wallCache.size > 16) wallCache.clear();
  const w = WALL_W + 2 * WALL_PAD, x0 = WALL_PAD, ex = side ? x0 : x0 + WALL_W;
  cv = document.createElement("canvas"); cv.width = Math.ceil(w * px); cv.height = Math.ceil(h * px);
  const c = cv.getContext("2d"); c.scale(px, px);
  c.fillStyle = "rgba(80,180,255,.4)"; c.fillRect(x0, 0, WALL_W, h);
  c.save(); c.beginPath(); c.rect(x0, 0, WALL_W, h); c.clip();
  c.strokeStyle = "rgba(220,245,255,.8)"; c.lineWidth = 2; c.beginPath();
  const hs = 12, rows = Math.ceil((h + hs) / (hs * 0.9));
  for (let row = 0; row <= rows; row++) for (let col = 0; col < 2; col++) {
    const cx = x0 + 5 + col * 12 + (row % 2) * 6, cy = row * hs * 0.9;
    for (let k = 0; k < 6; k++) { const q = k * TAU / 6 + Math.PI / 6; c[k ? "lineTo" : "moveTo"](cx + Math.cos(q) * 7, cy + Math.sin(q) * 7); }
    c.closePath();
  }
  c.stroke(); c.restore();
  if (cracked) {
    const my = h * 0.45;
    c.strokeStyle = "#ffffff"; c.lineWidth = 3; c.lineJoin = "round";
    c.beginPath(); c.moveTo(x0 + 6, my - 34); c.lineTo(x0 + 16, my - 14); c.lineTo(x0 + 3, my); c.lineTo(x0 + 15, my + 26); c.moveTo(x0 + 16, my - 14); c.lineTo(x0 + 20, my - 29); c.stroke();
  }
  // Kanten: dünn zum Tor, zur Feldseite leuchtend (breiter Schein, heller Kern)
  c.strokeStyle = "rgba(200,240,255,.6)"; c.lineWidth = 1.5;
  c.beginPath(); c.moveTo(side ? x0 + WALL_W : x0, 0); c.lineTo(side ? x0 + WALL_W : x0, h); c.stroke();
  c.beginPath(); c.moveTo(ex, 0); c.lineTo(ex, h);
  c.lineWidth = 10; c.strokeStyle = "rgba(60,170,255,.45)"; c.stroke();
  c.lineWidth = 3; c.strokeStyle = "rgba(225,248,255,.95)"; c.stroke();
  wallCache.set(key, cv);
  return cv;
}
export function drawWall(c, st, side, by, t) {
  if (!(st.wall[side] > 0) || endK <= 0) return;
  const wx = side ? W - GOAL_W - 10 : GOAL_W + 10, top = by + BAR_T / 2, h = Math.round(G - top), x0 = wx - 11;
  const a = fade(st.wall[side], POWERUPS.wall.dur, 5, 4) * endK, ga = c.globalAlpha;
  const px = Math.min(6, Math.ceil(Math.abs(c.getTransform().a) * 4) / 4), cracked = (st.wallHp ? st.wallHp[side] : PU.wallHp) < PU.wallHp;
  c.globalAlpha = ga * a * (0.9 + 0.1 * Math.sin(t * 5));
  c.drawImage(wallImg(side, h, px, cracked), x0 - WALL_PAD, G - h, WALL_W + 2 * WALL_PAD, h);
  // Schimmer: helles Band wandert nach oben (weniger Bewegung: ruhig)
  if (!reducedMotion()) {
    const sy = G + 14 - ((t * 70) % (h + 28)), y0 = Math.max(G - h, sy - 14), y1 = Math.min(G, sy + 14);
    if (y1 > y0) { c.globalCompositeOperation = "lighter"; c.globalAlpha = ga * a * 0.3; c.fillStyle = "#9fdcff"; c.fillRect(x0, y0, WALL_W, y1 - y0); c.globalCompositeOperation = "source-over"; }
  }
  c.globalAlpha = ga;
}

// ---------- Spieler ----------
/** Sichtbare Größe des Schuhs: wächst federnd auf ×1,6 (Riesenschuh), passt danach genau zur Kapsel der Physik */
export function bootScale(p) {
  if (!(p.bootT > 0)) return 1;
  const tau = age(p.i, "boot", p.bootT);
  return tau < 0.8 ? 1 + (PU.bootSize - 1) * clamp(elastic(tau / 0.6), 0, 1.25) : PU.bootSize;
}
/** Federn des Riesenkopfs (Stauchung x/y), 0 = ruhig */
export function headWobble(p) {
  if (!(p.bigT > 0) && !(p.miniT > 0)) return 0;
  const tau = p.bigT > 0 ? age(p.i, "head", p.bigT) : age(p.i, "mini", p.miniT);
  return tau < 1.2 ? Math.sin(tau * 18) * Math.exp(-tau * 3) * 0.12 : 0;
}
/** Wackeln des Eisblocks beim Freihämmern (px) */
export const iceJit = i => (!reducedMotion() && T - taps[i] < 0.07 ? 3 : 0);

/** Wirkungen am Spieler nach dem Schuh: brennender Schuh, Zählring (Effet), Flügel, Magnetbögen, Seifenblase */
export function drawPuPlayer(c, st, p, t) {
  const r = pr(p), g = (p.fireNext || p.spinN > 0 || p.wingT > 0 || p.magT > 0) ? shoeGeo(p) : null;
  if (p.fireNext && g) {
    // Flammen nur an Schuhspitze und Sohle, steigen kaum (bleiben unter dem Gesicht)
    let nx = -g.uy, ny = g.ux;   // Normale zur Sohle (nach unten)
    if (ny < 0) { nx = -nx; ny = -ny; }
    const sole = g.L * 0.22;
    for (let n = rate(26); n > 0; n--) {
      const u = rand(0.1, 0.55) * g.L, toe = Math.random() < 0.55;
      P({ type: "flame", x: g.x + g.ux * (toe ? g.hl * rand(0.85, 1.05) : u) + (toe ? 0 : nx * sole), y: g.y + g.uy * (toe ? g.hl : u) + (toe ? rand(-4, 6) : ny * sole), vx: rand(-15, 15) + g.dir * 20, vy: rand(-80, -35), drag: 2, life: 0.3, size: rand(6, 9) * p.sc, col: "#ff5a1f", add: true });
    }
  }
  if (p.spinN > 0 && g) {
    c.save(); c.translate(g.x, g.y); c.rotate(t * 6); c.strokeStyle = "#ffd36b"; c.lineWidth = 3; c.lineCap = "round";
    const rr = g.L * 0.62;
    c.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) { c.globalAlpha = i < p.spinN ? 0.9 : 0.22; c.beginPath(); c.arc(0, 0, rr, i * TAU / 3, i * TAU / 3 + 1.4); c.stroke(); }
    c.restore();
  }
  if (p.wingT > 0 && g) {
    // Flügel an der Ferse, zeigt nach hinten (flattert in der Luft schnell, am Boden ruhig)
    const k = g.L / 48 * 0.72, flap = p.onG ? Math.sin(t * 8) * 0.15 : Math.sin(t * 22) * 0.4;
    c.save(); c.translate(g.x - g.ux * g.L * 0.42, g.y - g.uy * g.L * 0.42 - g.L * 0.08); c.scale(g.dir * k, k); c.rotate(-1.2 + flap);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-34, -38, -8, -50); c.quadraticCurveTo(6, -28, 18, -40); c.quadraticCurveTo(20, -14, 0, 0); c.closePath();
    c.fillStyle = "#fff"; c.fill(); c.lineWidth = 3 / k; c.strokeStyle = INK; c.lineJoin = "round"; c.stroke(); c.restore();
  }
  if (p.magT > 0 && g) {
    const tip = { x: g.x + g.ux * g.hl, y: g.y + g.uy * g.hl }, k = g.L / 48;
    c.save(); c.translate(tip.x, tip.y); c.scale(g.dir, 1); c.strokeStyle = "rgba(120,220,255,.85)"; c.lineWidth = 2.5; c.lineCap = "round";
    for (let i = 0; i < 3; i++) { const rr = (16 + i * 10 + (t * 36) % 10) * k; c.globalAlpha = 1 - i * 0.25; c.beginPath(); c.arc(0, 0, rr, -1.2, 0.3); c.stroke(); }
    c.restore();
  }
  if (p.shieldT > 0 && endK > 0) bubble(c, p, r, t);
}
/** Schutzblase: Verläufe als Einheitsverläufe (einmal angelegt), mit translate/scale auf Größe gebracht */
function bubble(c, p, r, t) {
  const left = p.shieldT, tau = age(p.i, "bubble", left), grow = easeOut(tau / 0.3);
  const rr = (r * 1.55 + Math.sin(t * 5) * 2) * (0.6 + 0.4 * grow);
  c.save(); c.globalAlpha *= endK * (left < 1 ? endPulse(t) : 1);
  c.translate(p.x, p.y); c.scale(rr, rr);
  c.fillStyle = cg(c, "bubble", () => radial(c, [[0, "rgba(255,255,255,.04)"], [0.85, "rgba(180,240,255,.16)"], [1, "rgba(255,255,255,.5)"]], -0.3, -0.4, 0.2));
  circ(c, 0, 0, 1); c.fill();
  c.lineWidth = 3 / rr;
  c.strokeStyle = cg(c, "bubbleIr", () => { const q = c.createLinearGradient(-1, -1, 1, 1); q.addColorStop(0, "rgba(255,120,220,.7)"); q.addColorStop(0.5, "rgba(120,255,230,.7)"); q.addColorStop(1, "rgba(255,240,120,.7)"); return q; });
  c.stroke();
  c.fillStyle = "rgba(255,255,255,.8)"; c.beginPath(); c.ellipse(-0.45, -0.55, 0.22, 0.09, -0.7, 0, TAU); c.fill();
  c.restore();
}

/** Abzeichen über dem Kopf mit Ablauf-Ring (nebeneinander, letzte Sekunde pulsiert, neue springen bei Ankunft des Symbols auf) */
export function drawPuBadges(c, st, p, t) {
  const list = puBadges(p); if (!list.length || endK <= 0) return;
  const r = 13, gap = 2 * r + 9, y = badgeY(p), x0 = p.x - (list.length - 1) * gap / 2;
  list.forEach(([k, v], n) => {
    const x = x0 + n * gap, e = live && act[p.i].get(k);
    if (e) { e.x = x; e.y = y; }
    const pop = e ? clamp(elastic((T - e.t0) / 0.3), 0, 1.3) : 1;
    if (pop <= 0.01) return;
    c.save(); c.globalAlpha *= endK; c.translate(x, y); c.scale(pop, pop); drawBadge(c, k, 0, 0, r, v / POWERUPS[k].dur, t, v < 1); c.restore();
  });
}

// ---------- Banner, Rand ----------
/**
 * Banner mit Name und Kurzzeile (Basiskoordinaten, unter dem HUD bei y0). Nur eins gleichzeitig, ein neues ersetzt das alte.
 */
export function drawPuBanner(c, y0) {
  if (!banner || banner.t < 0) return;
  const tt = banner.t, k = banner.k, col = famCol(famOf(k)), info = POWERUPS[k];
  const s = reducedMotion() ? 1 : tt < 0.25 ? lerp(0.7, 1.05, easeOut(tt / 0.25)) : tt < 0.4 ? lerp(1.05, 1, (tt - 0.25) / 0.15) : 1;
  const a = Math.min(1, tt * 6) * (tt > BANNER_DUR - 0.3 ? Math.max(0, (BANNER_DUR - tt) / 0.3) : 1);
  const name = String(info.name || k).toUpperCase(), tag = String(info.tag || ""), by = y0 + 44 - (reducedMotion() ? 0 : (1 - Math.min(1, tt * 5)) * 30);
  c.save(); c.globalAlpha = a; c.translate(W / 2, by); c.rotate(-0.04); c.scale(s, s);
  c.textAlign = "center"; c.textBaseline = "alphabetic"; c.lineJoin = "round"; c.font = "44px 'Lilita One', Impact, sans-serif";
  const hw = Math.max(c.measureText(name).width, tag ? tag.length * 9 : 0) / 2 + 8;
  bannerBox = { x0: W / 2 - hw, x1: W / 2 + hw, y0: by - 44, y1: by + (tag ? 38 : 10) };
  c.lineWidth = 11; c.strokeStyle = INK; c.strokeText(name, 0, 0); c.lineWidth = 4.5; c.strokeStyle = "#fff"; c.strokeText(name, 0, 0); c.fillStyle = col; c.fillText(name, 0, 0);
  if (tag) { c.rotate(0.04); c.font = "900 18px Nunito, sans-serif"; c.lineWidth = 5; c.strokeStyle = INK; c.strokeText(tag, 0, 30); c.fillStyle = "#fff"; c.fillText(tag, 0, 30); }
  c.restore();
}
let bannerBox = null;
/** Für Tests: welches Banner gerade steht und wo (Basiskoordinaten, ungefähr) */
export const puBannerInfo = () => (banner && banner.t >= 0 ? { k: banner.k, t: banner.t, box: bannerBox } : null);
/** Rand in Familienfarbe nach dem Einsammeln: Farbe und Stärke für die Vignette in render.js (null: keiner) */
export const puTint = () => (tint ? { col: tint.col, a: (1 - tint.t / 0.4) * (reducedMotion() ? 0.12 : 0.22) } : null);
/** Äußere Farbe der Vignette mit Rand in Familienfarbe: Tönung über dem Abdunkeln va (rgba-Text, null: kein Rand) */
export function puTintOver(va) {
  const tn = puTint(); if (!tn) return null;
  const n = parseInt(tn.col.slice(1), 16), a = tn.a, A = a + va * (1 - a), k = a / A;
  return `rgba(${Math.round((n >> 16) * k)},${Math.round(((n >> 8) & 255) * k)},${Math.round(20 * (1 - k) + (n & 255) * k)},${A.toFixed(3)})`;
}
/** Rand leicht in Familienfarbe als eigene Fläche (Bildschirmkoordinaten; nur ohne Vignette, Qualität „Schnell“) */
export function drawPuTint(c, cw, ch) {
  if (!tint) return;
  const a = puTint().a;
  const g = c.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, Math.max(cw, ch) * 0.65);
  g.addColorStop(0, hexA(tint.col, 0)); g.addColorStop(1, hexA(tint.col, a));
  c.fillStyle = g; c.fillRect(0, 0, cw, ch);
}
/** Für Tests und Messung: Anzahl eigener Teilchen */
export const puParticles = () => pp.length;
