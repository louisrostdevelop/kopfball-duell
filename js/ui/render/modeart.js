// Kleine Szenen auf den Kacheln der Modus-Wahl. Gezeichnet in einer Fläche von 120 x 90, mittig eingepasst.
// Köpfe und Ball kommen aus dem Spiel (drawHead, drawBall): der eigene Kopf, der eigene Ball, die echten Gegner.
// d: { you, opp, mate, ball, tier, record, day, code }
import { drawBall, drawHead } from "./art.js";
import { INK } from "./paint.js";

const W = 120, H = 90;
const DISPLAY = '"Lilita One", "Arial Black", sans-serif';

/** Szene `id` in die Leinwand malen (Größe in CSS-Pixeln, dpr = Pixeldichte) */
export function drawModeScene(cv, id, d, dpr = Math.min(2, window.devicePixelRatio || 1)) {
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w || !h) return false;
  const pw = Math.round(w * dpr), ph = Math.round(h * dpr);
  if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
  const x = cv.getContext("2d");
  x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, pw, ph);
  const fn = SCENES[id]; if (!fn) return false;
  const s = Math.min(pw / W, ph / H);
  x.setTransform(s, 0, 0, s, (pw - W * s) / 2, (ph - H * s) / 2);
  x.lineJoin = "round"; x.lineCap = "round";
  fn(x, d, s);
  return true;
}

// ---------- Bausteine ----------
const P = (x, path, fill, lw = 3, stroke = INK) => {
  const p = new Path2D(path);
  if (fill) { x.fillStyle = fill; x.fill(p); }
  if (lw) { x.lineWidth = lw; x.strokeStyle = stroke; x.stroke(p); }
};
const rr = (x, l, t, w, h, r) => { x.beginPath(); x.roundRect(l, t, w, h, r); };
const circle = (x, cx, cy, r) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); };
const lin = (x, x0, y0, x1, y1, stops) => { const g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
// weicher Schatten nach unten (in Pixeln, deshalb mit s)
const shadow = (x, s, on = true) => {
  if (!on) { x.shadowColor = "transparent"; return; }
  x.shadowColor = "rgba(21,17,46,.38)"; x.shadowBlur = 0; x.shadowOffsetX = 0; x.shadowOffsetY = 2.5 * s;
};
const head = (x, ch, cx, cy, r, o = {}) => { if (ch) drawHead(x, ch, cx, cy, r, { dir: 1, t: 0, ...o }); };
const ball = (x, d, cx, cy, r, a = 0.6) => drawBall(x, d.ball, cx, cy, r, a, 1, null, { t: 0 });
function star(x, cx, cy, r, fill = "#ffd02b") {
  x.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? r * 0.46 : r; x.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
  x.closePath(); x.fillStyle = fill; x.fill(); x.lineWidth = Math.max(1.6, r * 0.22); x.strokeStyle = INK; x.stroke();
}
function sparkle(x, cx, cy, r, c = "#fff") {
  x.beginPath(); x.moveTo(cx, cy - r); x.quadraticCurveTo(cx, cy, cx + r, cy); x.quadraticCurveTo(cx, cy, cx, cy + r); x.quadraticCurveTo(cx, cy, cx - r, cy); x.quadraticCurveTo(cx, cy, cx, cy - r);
  x.fillStyle = c; x.fill();
}
function dots(x, path) {   // gepunktete Flugbahn
  x.save(); x.setLineDash([0.1, 6]); x.lineWidth = 3.2; x.strokeStyle = "rgba(255,255,255,.9)"; x.stroke(new Path2D(path)); x.restore();
}
function speed(x, cx, cy) {
  x.save(); x.strokeStyle = "rgba(255,255,255,.85)"; x.lineWidth = 3;
  for (const [dx, dy, l] of [[0, -7, 14], [-4, 0, 19], [0, 7, 12]]) { x.beginPath(); x.moveTo(cx + dx, cy + dy); x.lineTo(cx + dx - l, cy + dy); x.stroke(); }
  x.restore();
}
function text(x, str, cx, cy, size, fill = INK) {
  x.font = `${size}px ${DISPLAY}`; x.textAlign = "center"; x.textBaseline = "alphabetic"; x.fillStyle = fill; x.fillText(str, cx, cy);
}
function trophy(x, s, cx, cy, k) {
  x.save(); x.translate(cx, cy); x.scale(k, k);
  shadow(x, s);
  P(x, "M-16 -15 H-24 Q-27 0 -11 4 M16 -15 H24 Q27 0 11 4", null, 3.2);
  P(x, "M-17 -22 H17 V-9 Q17 9 0 13 Q-17 9 -17 -9 Z", lin(x, -17, 0, 17, 0, [[0, "#fff1a0"], [0.45, "#ffd02b"], [1, "#e08a00"]]), 3);
  P(x, "M-6 13 H6 V20 H-6 Z", "#f3a400", 2.6);
  P(x, "M-14 20 H14 Q15 20 15 22 V28 H-15 V22 Q-15 20 -14 20 Z", lin(x, 0, 20, 0, 28, [[0, "#6b4bd8"], [1, "#3a2391"]]), 2.6);
  shadow(x, s, false);
  P(x, "M-10 -17 V-7", null, 3.4, "rgba(255,255,255,.75)");
  star(x, 0, -5, 5.2, "#fff6c8");
  x.restore();
}
function coins(x, s, cx, cy, n) {
  shadow(x, s);
  for (let i = 0; i < n; i++) {
    const y = cy - i * 6.5;
    x.beginPath(); x.ellipse(cx, y + 3, 11, 4.4, 0, 0, Math.PI); x.lineTo(cx - 11, y); x.fillStyle = "#e59a00"; x.fill(); x.lineWidth = 2.2; x.strokeStyle = INK; x.stroke();
    x.beginPath(); x.ellipse(cx, y, 11, 4.4, 0, 0, Math.PI * 2); x.fillStyle = "#ffd42a"; x.fill(); x.stroke();
    if (i === n - 1) { x.beginPath(); x.ellipse(cx, y, 6, 2.2, 0, 0, Math.PI * 2); x.lineWidth = 1.5; x.strokeStyle = "rgba(160,90,0,.6)"; x.stroke(); }
  }
  shadow(x, s, false);
}

// Liga-Farben für das Wappen (Ranked)
const TIER = {
  bronze: ["#f6c08f", "#b5652f", "#7a3a14"], silver: ["#ffffff", "#aab6d8", "#64709c"], gold: ["#fff1a0", "#ffc531", "#c47a00"],
  platinum: ["#e3fffa", "#6fd6c6", "#258c80"], diamond: ["#e3f1ff", "#79b2ff", "#2d5fd6"], legend: ["#ffe1f6", "#d68bff", "#7a2fc9"],
};

// ---------- Szenen ----------
const SCENES = {
  ranked(x, d, s) {
    const [a, b, c] = TIER[d.tier] || TIER.bronze;
    // Lorbeer
    const leaf = (cx, cy, rot, flip) => { x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(flip, 1); x.beginPath(); x.ellipse(0, 0, 7.5, 3.6, 0, 0, Math.PI * 2); x.fillStyle = "#7be08f"; x.fill(); x.lineWidth = 2; x.strokeStyle = INK; x.stroke(); x.beginPath(); x.moveTo(-5, 0); x.lineTo(4, 0); x.lineWidth = 1.2; x.strokeStyle = "#2f9a4c"; x.stroke(); x.restore(); };
    P(x, "M27 22 Q12 46 34 74 M93 22 Q108 46 86 74", null, 3);
    [[22, 30, -1.1], [17, 42, -1.35], [18, 55, -1.75], [24, 66, -2.1]].forEach(([lx, ly, r]) => { leaf(lx, ly, r, 1); leaf(W - lx, ly, -r, 1); });
    // Wappen
    shadow(x, s);
    P(x, "M60 12 L90 21 L87 52 Q82 72 60 82 Q38 72 33 52 L30 21 Z", lin(x, 0, 12, 0, 82, [[0, a], [0.55, b], [1, c]]), 3.4);
    shadow(x, s, false);
    P(x, "M60 20 L81 27 L79 51 Q75 65 60 73 Q45 65 41 51 L39 27 Z", "rgba(255,255,255,.22)", 0);
    P(x, "M45 26 L60 21 L60 72 Q47 64 43 50 Z", "rgba(255,255,255,.18)", 0);
    star(x, 60, 46, 14, "#fff");
    // Krone
    shadow(x, s);
    P(x, "M45 5 L51 13 L60 2 L69 13 L75 5 L73 17 H47 Z", lin(x, 0, 2, 0, 17, [[0, "#fff1a0"], [1, "#f39c00"]]), 2.6);
    shadow(x, s, false);
    sparkle(x, 101, 14, 5); sparkle(x, 16, 80, 3.5); sparkle(x, 106, 78, 3);
  },

  casual(x, d) {
    dots(x, "M34 44 Q60 0 86 44");
    head(x, d.you, 25, 62, 17, { look: -0.6 });
    head(x, d.opp, 95, 62, 17, { dir: -1, look: -2.5 });
    ball(x, d, 60, 21, 8.5);
  },

  online(x, d, s) {
    shadow(x, s);
    P(x, "M33 5 H87 Q94 5 94 12 V27 Q94 34 87 34 H67 L60 42 L53 34 H33 Q26 34 26 27 V12 Q26 5 33 5 Z", "#fff", 3);
    shadow(x, s, false);
    text(x, d.code || "K7Q2", 60, 27.5, 17);
    head(x, d.you, 29, 66, 17);
    head(x, d.mate, 91, 66, 17, { dir: -1, mood: "happy" });
  },

  career(x, d, s) {
    const step = (l, t, h) => { shadow(x, s); rr(x, l, t, 28, h, 5); x.fillStyle = lin(x, 0, t, 0, t + h, [[0, "rgba(255,255,255,.55)"], [1, "rgba(255,255,255,.2)"]]); x.fill(); shadow(x, s, false); x.lineWidth = 3; x.strokeStyle = INK; x.stroke(); };
    step(12, 64, 24); step(46, 50, 38); step(80, 36, 52);
    star(x, 26, 52, 9);
    head(x, d.you, 60, 36, 13, { look: -0.4 });
    head(x, d.opp, 94, 22, 13, { dir: -1, mood: "angry" });
    sparkle(x, 110, 6, 4);
  },

  daily(x, d, s) {
    shadow(x, s);
    rr(x, 10, 12, 58, 66, 9); x.fillStyle = "#fff"; x.fill();
    shadow(x, s, false); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    P(x, "M10 31 V21 Q10 12 19 12 H59 Q68 12 68 21 V31 Z", "#ff5ca8", 3);
    P(x, "M24 6 V18 M54 6 V18", null, 4.2);
    text(x, String(d.day || 1), 39, 69, 33);
    coins(x, s, 21, 74, 2);
    head(x, d.opp, 92, 52, 21, { dir: -1, mood: "angry" });
  },

  cup(x, d, s) {
    x.save(); x.strokeStyle = "rgba(255,255,255,.85)"; x.lineWidth = 3.6;
    x.stroke(new Path2D("M4 20 H18 V45 H30 M4 70 H18 V45 M116 20 H102 V45 H90 M116 70 H102 V45")); x.restore();
    trophy(x, s, 60, 45, 1.32);
    sparkle(x, 36, 12, 4.5); sparkle(x, 88, 10, 3.5); sparkle(x, 92, 80, 3);
  },

  endless(x, d, s) {
    P(x, "M28 82 Q4 60 20 32 Q24 50 34 50 Q26 24 48 6 Q48 30 62 36 Q66 22 60 12 Q88 32 78 64 Q73 80 56 86 Z", lin(x, 0, 6, 0, 86, [[0, "#ffcf3a"], [0.5, "#ff8a2b"], [1, "#e8344a"]]), 3);
    P(x, "M40 82 Q29 66 37 54 Q44 64 52 62 Q50 49 58 41 Q71 60 63 79 Z", "#ffe27a", 0);
    head(x, d.you, 51, 62, 18, { mood: "happy" });
    shadow(x, s);
    circle(x, 97, 27, 17); x.fillStyle = "#fff"; x.fill();
    shadow(x, s, false); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    const r = String(d.record || "∞");
    text(x, r, 97, 34.5, r.length > 2 ? 15 : 20);
  },

  quick(x, d, s) {
    // Tor rechts
    shadow(x, s);
    P(x, "M88 26 H114 V86", null, 4.5, "#fff");
    shadow(x, s, false);
    x.save(); x.strokeStyle = "rgba(255,255,255,.55)"; x.lineWidth = 1.4;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(91 + i * 5.2, 26); x.lineTo(91 + i * 5.2, 86); x.stroke(); }
    for (let i = 0; i < 6; i++) { x.beginPath(); x.moveTo(88, 34 + i * 9.5); x.lineTo(114, 34 + i * 9.5); x.stroke(); }
    x.restore();
    P(x, "M88 26 H114 V86 M88 26 V86", null, 3);
    head(x, d.you, 30, 58, 22, { look: -0.2 });
    speed(x, 66, 48);
    ball(x, d, 78, 48, 10);
  },

  local(x, d, s) {
    shadow(x, s);
    rr(x, 8, 18, 104, 60, 11); x.fillStyle = INK; x.fill();
    shadow(x, s, false);
    rr(x, 16, 25, 88, 46, 6); x.fillStyle = lin(x, 0, 25, 0, 71, [[0, "#7fdcff"], [1, "#3a8dff"]]); x.fill();
    x.save(); x.beginPath(); x.roundRect(16, 25, 88, 46, 6); x.clip();
    x.fillStyle = "#3ed46f"; x.fillRect(16, 61, 88, 10); x.fillStyle = "#2fb35a"; x.fillRect(16, 61, 88, 2);
    x.strokeStyle = "rgba(255,255,255,.9)"; x.lineWidth = 1.8; x.strokeRect(17, 40, 7, 21); x.strokeRect(96, 40, 7, 21);
    x.restore();
    head(x, d.you, 41, 52, 9);
    head(x, d.mate, 79, 52, 9, { dir: -1 });
    ball(x, d, 60, 37, 4.6);
  },

  train(x, d, s) {
    shadow(x, s);
    circle(x, 82, 42, 29); x.fillStyle = "#fff"; x.fill();
    shadow(x, s, false); x.lineWidth = 3; x.strokeStyle = INK; x.stroke();
    circle(x, 82, 42, 20); x.fillStyle = "#e8344a"; x.fill(); x.lineWidth = 2.5; x.stroke();
    circle(x, 82, 42, 11); x.fillStyle = "#fff"; x.fill(); x.stroke();
    circle(x, 82, 42, 4); x.fillStyle = "#e8344a"; x.fill();
    P(x, "M8 86 L15 64 L22 86 Z", "#ff8a2b", 2.5);
    P(x, "M10.5 79 H19.5", null, 3, "#fff");
    head(x, d.you, 31, 68, 13, { look: -0.5 });
    speed(x, 54, 34);
    ball(x, d, 62, 34, 7.5);
  },
};

/** Gibt es eine Szene für diesen Modus? */
export const hasModeScene = id => !!SCENES[id];
