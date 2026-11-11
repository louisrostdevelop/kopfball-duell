// Power-ups (Vorlage: tools/powerups/schauraum.html): Glaskugel, die 18 Symbole,
// Teilchen der Familie, Abzeichen mit Ablauf-Ring. Reine Zeichen-Funktionen ohne Spielzustand; genutzt im Spiel
// (render.js, powerup-fx.js) und überall, wo ein Power-up-Symbol erscheint (drawPuIcon in art.js).
// Pfade sind immer geschlossen bzw. neu begonnen, jedes save() hat sein restore().
import { POWERUPS, PU_FAM } from "../../content/config.js";
import { INK, TAU, circ, shade } from "./paint.js";

/** Familienfarbe und helle Zweitfarbe (Glanz, Teilchen) */
export const FAM_HI = { atk: "#ffd36b", def: "#c9f2ff", mov: "#d9ffe9", chaos: "#ffc2f4", gold: "#fff4b8" };
export const famOf = k => (POWERUPS[k] ? POWERUPS[k].fam : "gold");
export const famCol = fam => PU_FAM[fam] || PU_FAM.gold;

const W = "#ffffff";
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Farbe mit Deckkraft aus #rrggbb */
export function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; }
function outline(c, w) { c.lineWidth = w; c.strokeStyle = INK; c.stroke(); }

// Reduzierte Bewegung (System): kein Flackern, nur sanftes Pulsieren. Allgemein pulsiert nichts schneller als 3 Hz.
const mq = globalThis.matchMedia ? globalThis.matchMedia("(prefers-reduced-motion: reduce)") : null;   // i18n-ok: Media-Query
let reduce = !!(mq && mq.matches);
if (mq && mq.addEventListener) mq.addEventListener("change", e => { reduce = e.matches; });
/** Weniger Bewegung gewünscht (System): kein Wackeln, keine Blitze, weniger Teilchen */
export const reducedMotion = () => reduce;
/** Deckkraft für „läuft gleich ab“: weiches Pulsieren mit 2,5 Hz, bei weniger Bewegung langsam und schwach */
export const endPulse = t => (reduce ? 0.8 + 0.15 * Math.cos(t * TAU * 0.8) : 0.62 + 0.38 * Math.cos(t * TAU * 2.5));

// ---------- Symbole: weiß mit Tintenrand, Kantenlänge etwa 2s, Mitte im Ursprung ----------
function bootPath(c, s) {
  c.beginPath();
  c.moveTo(-0.75 * s, 0.55 * s); c.lineTo(0.62 * s, 0.55 * s);
  c.quadraticCurveTo(0.95 * s, 0.55 * s, 0.9 * s, 0.15 * s);
  c.quadraticCurveTo(0.82 * s, -0.12 * s, 0.25 * s, -0.12 * s);
  c.lineTo(-0.2 * s, -0.75 * s); c.lineTo(-0.72 * s, -0.75 * s);
  c.quadraticCurveTo(-0.85 * s, 0, -0.75 * s, 0.55 * s); c.closePath();
}
/** Stern mit 4 Zacken als Teilpfad (ohne beginPath: mehrere Sterne in einem Pfad, eine Füllung), rot: Drehung */
export function starPath(c, x, y, r, rot = 0) {
  for (let i = 0; i < 8; i++) { const rr = i % 2 ? r * 0.38 : r, a = i * Math.PI / 4 - Math.PI / 2 + rot; c[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
}
/** Stern mit 4 Zacken (fill: weiß gefüllt mit Tintenrand, sonst nur gefüllt), rot: Drehung */
export function star(c, x, y, r, col, fill, rot = 0) {
  c.beginPath(); starPath(c, x, y, r, rot); c.fillStyle = col; c.fill();
  if (fill) outline(c, Math.max(1, r * 0.2));
}
/** Doppelter Strich: Tinte breit, darüber weiß schmal */
function inkLine(c, wIn, wOut, col = W) { c.lineWidth = wIn; c.strokeStyle = INK; c.stroke(); c.lineWidth = wOut; c.strokeStyle = col; c.stroke(); }

/** Symbol k mit halber Kantenlänge s am Ursprung; t bewegt die Flügel */
export function drawIcon(c, k, s, t = 0) {
  c.save(); c.lineJoin = "round"; c.lineCap = "round";
  const lw = Math.max(1.5, s * 0.13), ga = c.globalAlpha;
  const fillOut = () => { c.fillStyle = W; c.fill(); outline(c, lw); };
  switch (k) {
    case "fire": {
      bootPath(c, s * 0.82); fillOut();
      c.beginPath(); c.moveTo(-0.15 * s, -0.25 * s); c.quadraticCurveTo(-0.65 * s, -0.75 * s, -0.25 * s, -1.05 * s); c.quadraticCurveTo(-0.15 * s, -0.75 * s, 0.05 * s, -0.7 * s);
      c.quadraticCurveTo(0.05 * s, -1.0 * s, 0.35 * s, -1.1 * s); c.quadraticCurveTo(0.25 * s, -0.7 * s, 0.55 * s, -0.45 * s); c.quadraticCurveTo(0.35 * s, -0.2 * s, -0.15 * s, -0.25 * s); c.closePath();
      c.fillStyle = "#ffd36b"; c.fill(); outline(c, lw);
      break;
    }
    case "boot":
      bootPath(c, s * 1.05); fillOut();
      c.beginPath(); c.moveTo(-0.55 * s, 0.3 * s); c.lineTo(0.55 * s, 0.3 * s); outline(c, lw * 0.8);
      for (const [x, y, a] of [[-0.95, -0.9, -2.3], [1.0, -0.55, -0.6]]) { c.save(); c.translate(x * s, y * s); c.rotate(a); c.beginPath(); c.moveTo(0, 0); c.lineTo(0.35 * s, 0); outline(c, lw); c.restore(); }
      break;
    case "spin": {
      const cx = 0.12 * s, cy = 0.1 * s;
      circ(c, cx, cy, 0.55 * s); fillOut();
      c.beginPath(); for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + i * TAU / 5; c.lineTo(cx + Math.cos(a) * 0.2 * s, cy + Math.sin(a) * 0.2 * s); } c.closePath(); c.fillStyle = INK; c.fill();
      c.beginPath(); c.arc(cx, cy, 0.92 * s, -2.7, -0.4); inkLine(c, lw * 1.6, lw * 0.7);
      c.save(); c.translate(cx + Math.cos(-0.4) * 0.92 * s, cy + Math.sin(-0.4) * 0.92 * s); c.rotate(1.2);
      c.beginPath(); c.moveTo(0, -0.28 * s); c.lineTo(0.3 * s, 0.05 * s); c.lineTo(-0.25 * s, 0.12 * s); c.closePath(); c.fillStyle = W; c.fill(); outline(c, lw * 0.8); c.restore();
      break;
    }
    case "goal":
      c.beginPath(); c.moveTo(-0.85 * s, 0.85 * s); c.lineTo(-0.85 * s, -0.35 * s); c.lineTo(0.85 * s, -0.35 * s); c.lineTo(0.85 * s, 0.85 * s); inkLine(c, lw * 2.2, lw * 1.1);
      c.beginPath(); c.moveTo(0, -1.05 * s); c.lineTo(0.42 * s, -0.55 * s); c.lineTo(0.15 * s, -0.55 * s); c.lineTo(0.15 * s, 0.45 * s); c.lineTo(-0.15 * s, 0.45 * s); c.lineTo(-0.15 * s, -0.55 * s); c.lineTo(-0.42 * s, -0.55 * s); c.closePath(); fillOut();
      break;
    case "wall":
      c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * TAU / 6; c.lineTo(Math.cos(a) * 0.95 * s, Math.sin(a) * 0.95 * s); } c.closePath(); fillOut();
      c.beginPath(); for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * TAU / 6; c.lineTo(Math.cos(a) * 0.48 * s, Math.sin(a) * 0.48 * s); } c.closePath(); outline(c, lw * 0.8);
      break;
    case "bubble":
      circ(c, 0, 0, 0.9 * s); c.fillStyle = "rgba(255,255,255,.85)"; c.fill(); outline(c, lw);
      c.beginPath(); c.arc(0, 0, 0.62 * s, 3.6, 4.5); outline(c, lw);
      star(c, 0.45 * s, -0.45 * s, 0.22 * s, INK);
      break;
    case "clone":
      for (const [x, a] of [[0.28, 0.55], [-0.22, 1]]) {
        c.globalAlpha = ga * a; circ(c, x * s, 0.05 * s, 0.62 * s); fillOut();
        c.fillStyle = INK; circ(c, (x + 0.15) * s, -0.02 * s, 0.1 * s); c.fill(); circ(c, (x + 0.42) * s, -0.02 * s, 0.1 * s); c.fill();
      }
      c.globalAlpha = ga;
      break;
    case "time":
      c.beginPath(); c.moveTo(-0.6 * s, -0.9 * s); c.lineTo(0.6 * s, -0.9 * s); c.lineTo(0.08 * s, 0); c.lineTo(0.6 * s, 0.9 * s); c.lineTo(-0.6 * s, 0.9 * s); c.lineTo(-0.08 * s, 0); c.closePath(); fillOut();
      c.beginPath(); c.moveTo(-0.32 * s, 0.75 * s); c.lineTo(0.32 * s, 0.75 * s); c.lineTo(0, 0.38 * s); c.closePath(); c.fillStyle = "#ffd36b"; c.fill();
      break;
    case "wings":
      c.save(); c.translate(0.12 * s, 0.25 * s); bootPath(c, s * 0.78); fillOut(); c.restore();
      c.save(); c.translate(-0.45 * s, -0.25 * s); c.rotate(-0.5 + Math.sin(t * 9) * 0.25);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-0.55 * s, -0.75 * s, -0.15 * s, -0.95 * s); c.quadraticCurveTo(0.1 * s, -0.5 * s, 0.3 * s, -0.75 * s); c.quadraticCurveTo(0.35 * s, -0.3 * s, 0, 0); c.closePath();
      c.fillStyle = W; c.fill(); outline(c, lw * 0.85); c.restore();
      break;
    case "head":
      circ(c, 0, 0, 0.55 * s); fillOut();
      c.fillStyle = INK; circ(c, 0.12 * s, -0.08 * s, 0.09 * s); c.fill(); circ(c, 0.34 * s, -0.08 * s, 0.09 * s); c.fill();
      for (let i = 0; i < 4; i++) {
        c.save(); c.rotate(Math.PI / 4 + i * Math.PI / 2); c.translate(0.82 * s, 0);
        c.beginPath(); c.moveTo(0.22 * s, 0); c.lineTo(-0.08 * s, -0.2 * s); c.lineTo(-0.08 * s, 0.2 * s); c.closePath(); c.fillStyle = W; c.fill(); outline(c, lw * 0.8); c.restore();
      }
      break;
    case "magnet":
      c.beginPath(); c.arc(0, -0.1 * s, 0.62 * s, Math.PI, 0); c.lineTo(0.62 * s, 0.75 * s); c.lineTo(0.22 * s, 0.75 * s); c.lineTo(0.22 * s, -0.1 * s);
      c.arc(0, -0.1 * s, 0.22 * s, 0, Math.PI, true); c.lineTo(-0.22 * s, 0.75 * s); c.lineTo(-0.62 * s, 0.75 * s); c.closePath(); fillOut();
      c.fillStyle = "#ff4d6d";
      for (const x of [-0.62, 0.22]) { c.beginPath(); c.rect(x * s, 0.42 * s, 0.4 * s, 0.33 * s); c.fill(); outline(c, lw); }
      break;
    case "mini":
      circ(c, 0, 0.05 * s, 0.32 * s); fillOut();
      for (const d of [-1, 1]) {
        c.save(); c.translate(d * 0.8 * s, 0.05 * s);
        c.beginPath(); c.moveTo(-d * 0.3 * s, 0); c.lineTo(d * 0.02 * s, -0.22 * s); c.lineTo(d * 0.02 * s, 0.22 * s); c.closePath(); c.fillStyle = W; c.fill(); outline(c, lw * 0.8); c.restore();
      }
      break;
    case "ice":
      for (let a = 0; a < 3; a++) {
        c.save(); c.rotate(a * Math.PI / 3);
        c.beginPath(); c.moveTo(0, -0.95 * s); c.lineTo(0, 0.95 * s); inkLine(c, lw * 2.1, lw);
        for (const d of [-1, 1]) { c.beginPath(); c.moveTo(0, d * 0.55 * s); c.lineTo(0.25 * s, d * 0.8 * s); c.moveTo(0, d * 0.55 * s); c.lineTo(-0.25 * s, d * 0.8 * s); inkLine(c, lw * 1.5, lw * 0.6); }
        c.restore();
      }
      break;
    case "quake":
      c.beginPath(); c.moveTo(-0.95 * s, 0.35 * s); c.lineTo(0.95 * s, 0.35 * s); c.lineTo(0.95 * s, 0.85 * s); c.lineTo(-0.95 * s, 0.85 * s); c.closePath(); fillOut();
      c.beginPath(); c.moveTo(-0.1 * s, -0.95 * s); c.lineTo(0.2 * s, -0.4 * s); c.lineTo(-0.15 * s, -0.15 * s); c.lineTo(0.18 * s, 0.35 * s); c.lineTo(-0.05 * s, 0.85 * s); inkLine(c, lw * 2, lw * 0.8, "#ffd36b");
      break;
    case "float":
      circ(c, 0, 0, 0.5 * s); fillOut();
      c.save(); c.scale(1, 0.32); c.beginPath(); c.arc(0, 0, 0.95 * s, -0.2, Math.PI + 0.2); inkLine(c, lw * 2.4, lw * 1.1); c.restore();
      star(c, 0.75 * s, -0.75 * s, 0.18 * s, W, true); star(c, -0.8 * s, -0.55 * s, 0.12 * s, W, true);
      break;
    case "wind":
      for (const [x0, wy, w] of [[-0.5, -0.5, 0.9], [-0.85, 0, 1.4], [-0.6, 0.5, 1]]) {
        c.beginPath(); c.moveTo(x0 * s, wy * s); c.lineTo((x0 + w) * s, wy * s); c.quadraticCurveTo((x0 + w + 0.35) * s, (wy - 0.05) * s, (x0 + w + 0.2) * s, (wy - 0.32) * s); inkLine(c, lw * 2.3, lw * 1.1);
      }
      break;
    case "super":
      c.beginPath(); [[-0.15, -0.95], [0.55, -0.95], [0.15, -0.15], [0.6, -0.15], [-0.3, 0.95], [-0.05, 0.1], [-0.5, 0.1]].forEach(([a, b], n) => (n ? c.lineTo(a * s, b * s) : c.moveTo(a * s, b * s))); c.closePath();
      c.fillStyle = "#fff6c8"; c.fill(); outline(c, lw);
      break;
    case "portal":
      for (const [x, col] of [[-0.42, "#ff8a2b"], [0.42, "#3fb8ff"]]) {
        c.save(); c.translate(x * s, 0); c.scale(0.55, 1);
        circ(c, 0, 0, 0.75 * s); c.fillStyle = col; c.fill(); outline(c, lw * 1.6);
        circ(c, 0, 0, 0.42 * s); c.fillStyle = W; c.fill(); c.restore();
      }
      break;
    default: circ(c, 0, 0, s * 0.5); fillOut();
  }
  c.restore();
}

// ---------- Teilchen der Familie (kreisen um die Kugel): Glut, Eiskristalle, Federn, Glitch-Pixel, Goldfunken ----------
export function famParticles(c, fam, t, R, a = 1, few = false) {
  const F = famCol(fam), hi = FAM_HI[fam] || W, n = few ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const ph = i / n, ang = t * (fam === "chaos" ? 1.9 : 1.1) + ph * TAU, rr = R * (1.25 + 0.18 * Math.sin(t * 2.3 + i * 1.7));
    let x = Math.cos(ang) * rr, y = Math.sin(ang) * rr * 0.62;
    c.save(); c.globalAlpha = a * (0.55 + 0.45 * Math.sin(t * 3 + i));
    if (fam === "atk") {
      const up = (t * 0.9 + ph) % 1; x = Math.cos(ph * TAU * 3) * R * 0.95; y = R * 0.7 - up * R * 2.1;
      c.globalAlpha = a * (1 - up); circ(c, x, y, R * 0.075 * (1 - up * 0.5)); c.fillStyle = i % 2 ? hi : F; c.fill();
    } else if (fam === "def") {
      c.translate(x, y); c.rotate(t + i);
      c.beginPath(); for (let k = 0; k < 6; k++) { const q = k * TAU / 6; c.lineTo(Math.cos(q) * R * 0.09, Math.sin(q) * R * 0.09); } c.closePath(); c.fillStyle = hi; c.fill();
    } else if (fam === "mov") {
      c.translate(x, y); c.rotate(ang + Math.PI / 2); c.beginPath(); c.ellipse(0, 0, R * 0.05, R * 0.13, 0, 0, TAU); c.fillStyle = i % 2 ? W : hi; c.fill();
    } else if (fam === "chaos") {
      const g = Math.sin(t * 13 + i * 4) > 0.6 ? R * 0.12 : 0;
      c.fillStyle = i % 2 ? "#ff7ae6" : "#7ef3ff"; c.fillRect(x - R * 0.06 + g, y - R * 0.06, R * 0.12, R * 0.12);
    } else star(c, x, y, R * 0.11 * (0.7 + 0.3 * Math.sin(t * 6 + i)), i % 2 ? W : hi);
    c.restore();
  }
}

// ---------- Kugel ----------
// Verläufe gelten im Koordinatensystem beim Füllen: einmal je Familie und Radius anlegen, dann mit translate wiederverwenden
const gradCache = new WeakMap();
function grads(c, fam, R) {
  let m = gradCache.get(c); if (!m) { m = new Map(); gradCache.set(c, m); }
  const key = fam + "|" + Math.round(R * 4);
  let g = m.get(key);
  if (!g) {
    const F = famCol(fam), hi = FAM_HI[fam] || W;
    const glow = c.createRadialGradient(0, 0, R * 0.3, 0, 0, R * 1.7); glow.addColorStop(0, hexA(F, 0.35)); glow.addColorStop(1, hexA(F, 0));
    const body = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R); body.addColorStop(0, hi); body.addColorStop(0.55, F); body.addColorStop(1, shade(F, -0.35));
    // Regenbogen-Schimmer am Rand in 16 Stufen (wandert langsam)
    const ir = [];
    for (let k = 0; k < 16; k++) {
      const q = c.createLinearGradient(-R, -R, R, R), p = clamp(0.5 + 0.3 * Math.sin(k / 16 * TAU), 0.01, 0.99);
      q.addColorStop(0, "rgba(255,120,220,0)"); q.addColorStop(p, "rgba(150,255,240,.35)"); q.addColorStop(1, "rgba(255,240,120,0)"); ir.push(q);
    }
    g = { glow, body, ir };
    if (m.size > 40) m.clear();
    m.set(key, g);
  }
  return g;
}

/**
 * Glaskugel mit Tintenrand, weißem Rand, Farbverlauf der Familie, Regenbogenschimmer, Symbol als Münze, Glanzlicht und
 * kreisenden Teilchen. o: { alpha, few (weniger Teilchen), glow (false: ohne Leuchten) }
 */
export function drawOrb(c, k, x, y, R, t, o = {}) {
  const fam = famOf(k), a = o.alpha ?? 1, gold = fam === "gold", G = grads(c, fam, R);
  c.save(); c.translate(x, y); c.globalAlpha *= a;
  const ga = c.globalAlpha;
  if (o.glow !== false) {
    c.globalCompositeOperation = "lighter"; c.fillStyle = G.glow; circ(c, 0, 0, R * 1.7); c.fill();
    c.globalCompositeOperation = "source-over";
  }
  famParticles(c, fam, t, R, ga, o.few);
  circ(c, 0, 0, R * 1.12); c.fillStyle = INK; c.fill();
  circ(c, 0, 0, R * 1.06); c.fillStyle = gold ? "#fff1a6" : W; c.fill();
  circ(c, 0, 0, R); c.fillStyle = G.body; c.fill();
  c.save(); circ(c, 0, 0, R); c.clip();
  const irk = ((Math.floor(t * 1.3 / TAU * 16) % 16) + 16) % 16;
  c.lineWidth = R * 0.18; c.strokeStyle = G.ir[irk]; circ(c, 0, 0, R * 0.93); c.stroke();
  // Symbol als Münze: dreht sich um die senkrechte Achse
  const sx = Math.max(0.12, Math.abs(Math.cos(t * 1.7)));
  c.save(); c.scale(sx, 1); c.globalAlpha = ga * (0.75 + 0.25 * sx); drawIcon(c, k, R * 0.62, t); c.restore();
  // Glanz
  c.fillStyle = W;
  c.globalAlpha = ga * 0.75; c.beginPath(); c.ellipse(-R * 0.38, -R * 0.52, R * 0.3, R * 0.13, -0.6, 0, TAU); c.fill();
  c.globalAlpha = ga * 0.35; c.beginPath(); c.ellipse(R * 0.45, R * 0.5, R * 0.12, R * 0.06, -0.6, 0, TAU); c.fill();
  c.restore();
  if (gold) { c.save(); c.rotate(t * 0.8); c.strokeStyle = "rgba(255,255,255,.8)"; c.lineWidth = R * 0.07; c.beginPath(); c.arc(0, 0, R * 1.02, 0, 0.7); c.stroke(); c.restore(); }
  c.restore();
}

/**
 * Abzeichen: Kreis in Familienfarbe mit Symbol, außen der Ablauf-Ring (left 0..1). Unter 20 % wechselt der Ring mit
 * 2 Hz nach Gelb (weniger Bewegung: bleibt gelb), in der letzten Sekunde (last) pulsiert das ganze Abzeichen weich.
 */
export function drawBadge(c, k, x, y, r, left, t, last = false) {
  c.save();
  if (last) c.globalAlpha *= endPulse(t);
  const px = typeof document !== "undefined" ? Math.min(8, Math.ceil(Math.abs(c.getTransform().a) * 4) / 4) : 0;
  if (px) { const m = r * 1.2; c.drawImage(badgeFace(k, r, px), x - m, y - m, 2 * m, 2 * m); }
  else { circ(c, x, y, r); c.fillStyle = famCol(famOf(k)); c.fill(); outline(c, Math.max(1.5, r * 0.15)); c.save(); c.translate(x, y); drawIcon(c, k, r * 0.5, t); c.restore(); }
  if (left < 1) {
    c.beginPath(); circ(c, x, y, r + r * 0.24); c.lineWidth = r * 0.22; c.strokeStyle = "rgba(8,14,40,.55)"; c.stroke();
  }
  c.beginPath(); c.arc(x, y, r + r * 0.24, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(left, 0, 1));
  c.lineWidth = r * 0.22; c.lineCap = "round"; c.strokeStyle = left < 0.2 && (reduce || Math.sin(t * TAU * 2) > 0) ? "#ffd02b" : W; c.stroke();
  c.restore();
}
// Kreis mit Symbol eines Abzeichens, je Symbol, Größe und Bildschärfe einmal vorgerendert (HUD und Köpfe zeigen oft zehn)
const faceCache = new Map();
function badgeFace(k, r, px) {
  const key = k + "|" + r + "|" + px;
  let cv = faceCache.get(key);
  if (cv) return cv;
  if (faceCache.size > 80) faceCache.clear();
  const m = r * 1.2, S = Math.ceil(2 * m * px);
  cv = document.createElement("canvas"); cv.width = cv.height = S;
  const c = cv.getContext("2d"); c.scale(S / (2 * m), S / (2 * m)); c.translate(m, m);
  circ(c, 0, 0, r); c.fillStyle = famCol(famOf(k)); c.fill(); outline(c, Math.max(1.5, r * 0.15));
  drawIcon(c, k, r * 0.5, 0);
  faceCache.set(key, cv);
  return cv;
}

/** Kleines Abzeichen ohne Ring (fliegendes Symbol beim Einsammeln) */
export function drawChip(c, k, x, y, r, t) {
  c.save(); circ(c, x, y, r); c.fillStyle = famCol(famOf(k)); c.fill(); outline(c, Math.max(1.5, r * 0.17));
  c.translate(x, y); drawIcon(c, k, r * 0.5, t); c.restore();
}
