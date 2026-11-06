// Ball-Skins: animierte Oberfläche + eigene Flugspur (Vorschau und Abnahme im Viewer kopfball-meme-koepfe/balls.html).
// Alles in lokalen Koordinaten um den Ballmittelpunkt; s = { t, a, vx, vy, hit, seed, floor? }
//   t = Zeit (s), a = Drehwinkel, hit = Sekunden seit dem letzten Aufprall, floor = Abstand Ballmitte → Boden (Slime-Tropfen).
// Spur: pts = neueste zuerst, je { x, y, id, age, k } (k = Stärke 0..1 aus Tempo; beim Super-Schuss gedämpft).
const TAU = Math.PI * 2, INK = "#14161f";
/** Länge der Spur in Sekunden */
export const TRAIL = 0.45;
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); };
const lerp = (a, b, u) => a + (b - a) * u;
const mix = (p, q, u) => `rgb(${Math.round(lerp(p[0], q[0], u))},${Math.round(lerp(p[1], q[1], u))},${Math.round(lerp(p[2], q[2], u))})`;

const texCache = new Map();
function tex(key, size, fn) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement("canvas"); c.width = c.height = size; fn(c.getContext("2d"), size);
  texCache.set(key, c); return c;
}
// Zwischenebene in Gerätepixeln (für Masken und Streifen-Versatz)
// Fläche wächst nur (in 32er-Stufen), genutzt wird der Ausschnitt n×n oben links; x.n = Kantenlänge
let scratch = null;
function layer(c, r, cap = 4096) {
  const m = c.getTransform(), sc = Math.hypot(m.a, m.b) || 1, n = Math.min(cap, Math.max(8, Math.ceil(2 * r * sc)));
  scratch ??= document.createElement("canvas");
  if (scratch.width < n) { scratch.width = scratch.height = Math.ceil(n / 32) * 32; }
  const x = scratch.getContext("2d"); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = "source-over"; x.globalAlpha = 1; x.clearRect(0, 0, n, n);
  x.save(); x.beginPath(); x.rect(0, 0, n, n); x.clip();
  x.scale(n / (2 * r), n / (2 * r)); x.translate(r, r); x.n = n;
  return x;
}
const blit = (c, L, r) => { L.restore(); c.drawImage(L.canvas, 0, 0, L.n, L.n, -r, -r, 2 * r, 2 * r); };
// Konischer Verlauf; ältere Browser ohne createConicGradient bekommen einen linearen
function conic(c, rot, r, stops) {
  const g = c.createConicGradient ? c.createConicGradient(rot, 0, 0) : c.createLinearGradient(-r * Math.cos(rot), -r * Math.sin(rot), r * Math.cos(rot), r * Math.sin(rot));
  stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col)); return g;
}
// Deckkraft des Aufrufers (Ausblenden, Klone): alle Alpha-Werte darin multiplizieren
let BA = 1;
function shade(c, r, k = 1) {
  const g = c.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.05, 0, 0, r);
  g.addColorStop(0, `rgba(255,255,255,${0.6 * k})`); g.addColorStop(0.42, "rgba(255,255,255,0)"); g.addColorStop(1, `rgba(0,0,30,${0.38 * k})`);
  circ(c, 0, 0, r); c.fillStyle = g; c.fill();
}
function shine(c, r, a = 0.85) {
  c.save(); c.translate(-r * 0.38, -r * 0.44); c.rotate(-0.7);
  c.beginPath(); c.ellipse(0, 0, r * 0.24, r * 0.12, 0, 0, TAU); c.fillStyle = `rgba(255,255,255,${a})`; c.fill(); c.restore();
  circ(c, -r * 0.05, -r * 0.66, r * 0.05); c.fillStyle = `rgba(255,255,255,${a * 0.8})`; c.fill();
}
function sparkle(c, x, y, s, col = "#fff") {
  c.beginPath(); c.moveTo(x, y - s);
  c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s);
  c.fillStyle = col; c.fill();
}
// klassisches Fußball-Muster wie im Spiel (Mitte + 5 Fünfecke am Rand)
const PENTS = [[0, 0, 0.34, 0]];
for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5 + Math.PI / 5; PENTS.push([Math.cos(a) * 0.92, Math.sin(a) * 0.92, 0.3, a]); }
function pentPath(c, r, [cx, cy, s, rot]) {
  c.beginPath();
  for (let k = 0; k < 5; k++) { const a = rot - Math.PI / 2 + k * TAU / 5; c.lineTo((cx + Math.cos(a) * s) * r, (cy + Math.sin(a) * s) * r); }
  c.closePath();
}
function seamPath(c, r) {
  c.beginPath();
  for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5; c.moveTo(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34); c.lineTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66); }
}
function eachPt(pts, step, fn) {
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], u = p.age / TRAIL;
    if (p.id % step || u >= 1 || p.k <= 0.01) continue;
    fn(p, u, i);
  }
}
// Band als lückenlose Vierecke (keine Überlappung, sonst entstehen Perlen)
function ribbon(c, pts, wFn, colFn) {
  const n = pts.length; if (n < 2) return;
  const nrm = pts.map((p, i) => { const q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)], dx = q.x - o.x, dy = q.y - o.y, d = Math.hypot(dx, dy) || 1; return [-dy / d, dx / d]; });
  const side = (i, sg) => { const p = pts[i], u = Math.min(1, p.age / TRAIL), w = wFn(u, p) / 2 * sg; return [p.x + nrm[i][0] * w, p.y + nrm[i][1] * w]; };
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i], u = p.age / TRAIL; if (u >= 1 || p.k <= 0.01) continue;
    const a1 = side(i, 1), a2 = side(i + 1, 1), b2 = side(i + 1, -1), b1 = side(i, -1);
    c.beginPath(); c.moveTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]); c.lineTo(b2[0], b2[1]); c.lineTo(b1[0], b1[1]); c.closePath();
    c.fillStyle = colFn(u, p); c.fill();
  }
}

// ---------- 1 Augapfel ----------
const VEINS = (() => {
  const out = []; let sd = 7; const R = () => hash(sd++);
  for (let i = 0; i < 7; i++) {
    let rr = 1.02, ang = i / 7 * TAU + R() * 0.5; const pts = [];
    while (rr > 0.5) { pts.push([Math.cos(ang) * rr, Math.sin(ang) * rr]); rr -= 0.08 + R() * 0.06; ang += (R() - 0.5) * 0.35; }
    out.push({ pts, w: 0.035 + R() * 0.02 });
    const bp = pts[1 + Math.floor(R() * (pts.length - 2))];
    out.push({ pts: [bp, [bp[0] * 0.88 + (R() - 0.5) * 0.14, bp[1] * 0.88 + (R() - 0.5) * 0.14], [bp[0] * 0.76 + (R() - 0.5) * 0.18, bp[1] * 0.76 + (R() - 0.5) * 0.18]], w: 0.022 });
  }
  return out;
})();
const LOOK = new WeakMap();
const eye = {
  id: "auge",
  draw(c, r, s) {
    const g = c.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.1, 0, 0, r);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.7, "#fbeeee"); g.addColorStop(1, "#efb8b8");
    c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
    c.save(); c.rotate(s.a); c.strokeStyle = "rgba(200,16,46,.75)"; c.lineCap = "round"; c.lineJoin = "round";
    VEINS.forEach(v => { c.beginPath(); v.pts.forEach(([x, y], i) => (i ? c.lineTo(x * r, y * r) : c.moveTo(x * r, y * r))); c.lineWidth = v.w * r; c.stroke(); });
    c.restore();
    // Blick: in Flugrichtung, in Ruhe schaut er sich um
    const sp = Math.hypot(s.vx, s.vy); let lx, ly;
    if (sp > 80) { const m = Math.min(1, sp / 400); lx = s.vx / sp * m; ly = s.vy / sp * m; } else { lx = Math.sin(s.t * 0.9 + s.seed) * 0.45; ly = Math.sin(s.t * 0.6 + 1) * 0.3; }
    let L = LOOK.get(s); if (!L || !Number.isFinite(L.x + L.y)) { L = { x: lx, y: ly }; LOOK.set(s, L); }
    L.x += (lx - L.x) * 0.25; L.y += (ly - L.y) * 0.25;
    const m = Math.min(1, Math.hypot(L.x, L.y)), ox = L.x * r * 0.42, oy = L.y * r * 0.42, ri = r * 0.44;
    c.save(); c.translate(ox, oy); c.rotate(Math.atan2(L.y, L.x)); c.scale(1 - 0.28 * m, 1);
    const ig = c.createRadialGradient(0, 0, 0, 0, 0, ri);
    ig.addColorStop(0, "#0d4f3c"); ig.addColorStop(0.45, "#1fbf8a"); ig.addColorStop(0.85, "#0b6e50"); ig.addColorStop(1, "#06281f");
    circ(c, 0, 0, ri); c.fillStyle = ig; c.fill();
    c.strokeStyle = "rgba(220,255,240,.22)"; c.lineWidth = ri * 0.05;
    for (let k = 0; k < 22; k++) { const a = k / 22 * TAU; c.beginPath(); c.moveTo(Math.cos(a) * ri * 0.3, Math.sin(a) * ri * 0.3); c.lineTo(Math.cos(a) * ri * 0.88, Math.sin(a) * ri * 0.88); c.stroke(); }
    circ(c, 0, 0, ri * 0.95); c.strokeStyle = "#04221a"; c.lineWidth = ri * 0.1; c.stroke();
    const pr = ri * (0.46 - 0.18 * (s.hit < 1 ? Math.exp(-s.hit * 3) : 0));
    circ(c, 0, 0, pr); c.fillStyle = "#05070a"; c.fill();
    c.restore();
    circ(c, ox - ri * 0.3, oy - ri * 0.36, ri * 0.17); c.fillStyle = "rgba(255,255,255,.92)"; c.fill();
    circ(c, ox + ri * 0.22, oy + ri * 0.2, ri * 0.07); c.fill();
    // Lid: beim Aufprall und ab und zu
    let cl = s.hit < 0.22 ? Math.sin(s.hit / 0.22 * Math.PI) : 0;
    const bt = (s.t + s.seed * 3) % 3.9; if (bt < 0.16) cl = Math.max(cl, Math.sin(bt / 0.16 * Math.PI));
    if (cl > 0.02) {
      const yy = -r * 1.1 + 2.3 * r * cl;
      c.beginPath(); c.moveTo(-r * 1.1, -r * 1.1); c.lineTo(r * 1.1, -r * 1.1); c.lineTo(r * 1.1, yy); c.quadraticCurveTo(0, yy + r * 0.45, -r * 1.1, yy); c.closePath();
      c.fillStyle = "#f2b08f"; c.fill();
      c.beginPath(); c.moveTo(r * 1.1, yy); c.quadraticCurveTo(0, yy + r * 0.45, -r * 1.1, yy); c.strokeStyle = INK; c.lineWidth = r * 0.07; c.stroke();
    }
  },
  trail(c, pts, r) {
    c.lineCap = "round";
    [-1, 1].forEach(j => {
      for (let i = 0; i < pts.length - 1; i++) {
        const p = pts[i], q = pts[i + 1], u = p.age / TRAIL; if (u >= 1 || p.k <= 0.01) continue;
        const off = (k, id) => (Math.sin(id * 0.45 + j * 2.1) * 0.22 + j * 0.28) * r * (1 - u * 0.4) * k;
        const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
        c.beginPath(); c.moveTo(p.x + nx * off(1, p.id), p.y + ny * off(1, p.id)); c.lineTo(q.x + nx * off(1, q.id), q.y + ny * off(1, q.id));
        c.strokeStyle = `rgba(214,18,52,${p.k * (1 - u)})`; c.lineWidth = r * 0.12 * (1 - u * 0.6); c.stroke();
      }
    });
  },
};

// ---------- 2 Graffiti ----------
// frei erfundene Tags aus der Gaming-/Meme-Sprache, als Bubble-Letters gesprüht
const TAGS = [
  { txt: "GG", x: -0.08, y: -0.3, z: 0.64, rot: -0.16, col: "#ff3d8b" },
  { txt: "W", x: 0.36, y: 0.36, z: 0.62, rot: 0.2, col: "#ffd23f" },
  { txt: "KO", x: -0.45, y: 0.4, z: 0.42, rot: 0.28, col: "#2bd9fe" },
];
const SPLAT = Array.from({ length: 26 }, (_, i) => [hash(i * 3.3) * 2 - 1, hash(i * 7.7) * 2 - 1, 0.015 + hash(i * 1.9) * 0.035, ["#ff3d8b", "#ffd23f", "#2bd9fe", "#7d5cff", INK][i % 5]]);
const graffiti = {
  id: "graffiti",
  draw(c, r, s) {
    c.fillStyle = "#f3efe6"; c.fillRect(-r, -r, 2 * r, 2 * r);
    c.save(); c.rotate(s.a);
    SPLAT.forEach(([x, y, z, col]) => { circ(c, x * r, y * r, z * r); c.fillStyle = col; c.fill(); });
    sparkle(c, r * 0.58, -r * 0.5, r * 0.2, "#7d5cff");
    c.textAlign = "center"; c.textBaseline = "middle"; c.lineJoin = "round";
    TAGS.forEach(tg => {
      c.save(); c.translate(tg.x * r, tg.y * r); c.rotate(tg.rot);
      c.font = `900 ${tg.z * r}px "Arial Black", "Segoe UI Black", system-ui, sans-serif`;
      c.fillStyle = INK; c.strokeStyle = INK; c.lineWidth = r * 0.13;
      c.strokeText(tg.txt, r * 0.05, r * 0.06); c.fillText(tg.txt, r * 0.05, r * 0.06);
      c.strokeText(tg.txt, 0, 0);
      c.fillStyle = tg.col; c.fillText(tg.txt, 0, 0);
      c.lineWidth = r * 0.025; c.strokeStyle = "rgba(255,255,255,.75)"; c.strokeText(tg.txt, -r * 0.02, -r * 0.03);
      c.restore();
    });
    c.restore();
    // Tropfen laufen immer nach unten, egal wie der Ball steht
    const ca = Math.cos(s.a), sa = Math.sin(s.a);
    TAGS.forEach((tg, i) => {
      const X = (tg.x * ca - tg.y * sa) * r, Y = (tg.x * sa + tg.y * ca) * r + tg.z * r * 0.28;
      const u = (s.t * 0.35 + hash(i * 5.1)) % 1, len = r * 0.4 * u, w = r * 0.045;
      c.beginPath(); c.moveTo(X - w, Y); c.lineTo(X - w * 0.8, Y + len); c.arc(X, Y + len, w * 0.8, Math.PI, 0, true); c.lineTo(X + w, Y); c.closePath();
      c.globalAlpha = BA * (1 - u * u); c.fillStyle = tg.col; c.fill(); c.globalAlpha = BA;
    });
  },
  trail(c, pts, r) {
    const pal = ["#ff3d8b", "#ffd23f", "#2bd9fe", "#7d5cff"];
    eachPt(pts, 1, (p, u) => {
      for (let j = 0; j < 5; j++) {
        const h1 = hash(p.id * 3 + j), h2 = hash(p.id * 7 + j * 11), spread = r * (0.45 + u * 1.1);
        circ(c, p.x + (h1 - 0.5) * 2 * spread, p.y + (h2 - 0.5) * 2 * spread, r * (0.06 + 0.1 * hash(p.id + j * 5)) * (1 - u * 0.4));
        c.fillStyle = pal[(p.id + j) % 4]; c.globalAlpha = BA * (p.k * (1 - u) * 0.9); c.fill();
      }
    });
    c.globalAlpha = BA;
  },
};

// ---------- 3 Slime ----------
const BUB = Array.from({ length: 6 }, (_, i) => ({ x: (hash(i * 2.7) * 1.4 - 0.7), y: (hash(i * 9.1) * 1.4 - 0.7), z: 0.08 + hash(i * 4.4) * 0.08, p: 1.4 + hash(i * 6.6) * 1.4, ph: hash(i * 8.8) * 3 }));
// Tropfen gehören zur Silhouette: Ball + Tropfen werden als eine Form umrandet und gefüllt.
// Ablauf je Tropfen: wächst mit Kugel am Ende, Hals wird dünn, reißt ab, Rest schnalzt zurück.
const DRIPS = [{ x: -0.34, w: 0.23, L: 0.6, P: 3.2, ph: 0 }, { x: 0.32, w: 0.17, L: 0.4, P: 2.6, ph: 1.4 }];
function dripState(d, r, t, fl = Infinity) {
  const u = ((t + d.ph) / d.P) % 1, w = d.w * r, x0 = d.x * r, yb = Math.sqrt(r * r - x0 * x0) - w * 0.7, Lm = Math.min(d.L * r, Math.max(0, (fl - yb - w * 0.8) / 1.12));
  let L, rb, nw, drop = null;
  if (u < 0.72) { const g = u / 0.72, e = 1 - (1 - g) * (1 - g); L = Lm * (0.12 + 0.88 * e); rb = w * (0.46 + 0.2 * g); nw = w * (0.46 - 0.14 * g); }
  else if (u < 0.8) { const v = (u - 0.72) / 0.08; L = Lm * (1 + 0.12 * v); rb = w * 0.66; nw = w * (0.32 - 0.26 * v); }
  else { const v = (u - 0.8) / 0.2, e = Math.pow(1 - v, 3); L = Lm * (0.12 + 0.6 * e); rb = w * (0.3 + 0.1 * v); nw = w * (0.24 + 0.16 * v); drop = { y: yb + Lm * 1.12 + v * v * r * 2.2, z: w * 0.55, al: 1 - v * v }; }
  return { x0, yb, w, L, rb, nw: Math.min(nw, rb * 0.92), drop };
}
function dripPath(c, q) {
  const { x0, yb, w, L, rb, nw } = q, cy = yb + L, tL = -Math.acos(-nw / rb), tR = -Math.acos(nw / rb), ny = cy + Math.sin(tL) * rb;
  c.moveTo(x0 - w, yb - w * 0.6);
  c.bezierCurveTo(x0 - w * 0.95, yb + w * 0.5, x0 - nw, ny - (ny - yb) * 0.45, x0 - nw, ny);
  c.arc(x0, cy, rb, tL, tR, true);
  c.bezierCurveTo(x0 + nw, ny - (ny - yb) * 0.45, x0 + w * 0.95, yb + w * 0.5, x0 + w, yb - w * 0.6);
  c.closePath();
}
const slime = {
  id: "slime", wobble: true, shade: 0.6,
  path(c, r, s) {
    c.moveTo(r, 0); c.arc(0, 0, r, 0, TAU, true); // gleicher Drehsinn wie die Tropfen, sonst Loch in der Vereinigung
    DRIPS.forEach(d => dripPath(c, dripState(d, r, s.t, s.floor)));
  },
  draw(c, r, s) {
    const g = c.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.05, 0, 0, r * 1.05);
    g.addColorStop(0, "#c6ff6e"); g.addColorStop(0.5, "#62e021"); g.addColorStop(1, "#2a8c0c");
    c.fillStyle = g; c.fillRect(-r * 1.1, -r * 1.1, 2.2 * r, 3.4 * r);
    c.save(); c.beginPath(); c.rect(-2 * r, -2 * r, 4 * r, 5 * r); c.arc(0, 0, r * 0.96, 0, TAU); c.clip("evenodd");
    DRIPS.forEach(d => {
      const q = dripState(d, r, s.t, s.floor), dg = c.createLinearGradient(q.x0 - q.w, 0, q.x0 + q.w, 0);
      dg.addColorStop(0, "#2a8c0c"); dg.addColorStop(0.45, "#4fcf17"); dg.addColorStop(1, "#2a8c0c");
      c.beginPath(); dripPath(c, q); c.fillStyle = dg; c.fill();
      c.beginPath(); c.moveTo(q.x0 - q.w * 0.35, q.yb + q.w * 0.6); c.quadraticCurveTo(q.x0 - q.nw * 0.5, q.yb + q.L * 0.5, q.x0 - q.nw * 0.45, q.yb + q.L - q.rb * 0.9);
      c.strokeStyle = "rgba(235,255,200,.55)"; c.lineWidth = q.w * 0.16; c.lineCap = "round"; c.stroke();
      circ(c, q.x0 - q.rb * 0.35, q.yb + q.L - q.rb * 0.3, q.rb * 0.22); c.fillStyle = "rgba(245,255,220,.85)"; c.fill();
    });
    c.restore();
    c.save(); c.rotate(s.a);
    for (let i = 0; i < 4; i++) {
      const a = s.t * (0.6 + i * 0.2) + i * 1.7, x = Math.cos(a) * r * 0.45, y = Math.sin(a * 1.3) * r * 0.45;
      const bg = c.createRadialGradient(x, y, 0, x, y, r * 0.45); bg.addColorStop(0, "rgba(20,100,0,.38)"); bg.addColorStop(1, "rgba(20,100,0,0)");
      c.fillStyle = bg; c.fillRect(-r, -r, 2 * r, 2 * r);
    }
    BUB.forEach(b => {
      const u = ((s.t + b.ph) / b.p) % 1, x = b.x * r, y = b.y * r;
      if (u < 0.88) {
        const z = b.z * r * (u / 0.88);
        circ(c, x, y, z); c.fillStyle = "rgba(225,255,170,.28)"; c.fill(); c.strokeStyle = "rgba(225,255,170,.85)"; c.lineWidth = r * 0.025; c.stroke();
        circ(c, x - z * 0.35, y - z * 0.35, z * 0.25); c.fillStyle = "rgba(255,255,255,.85)"; c.fill();
      } else {
        const v = (u - 0.88) / 0.12;
        for (let k = 0; k < 5; k++) { const a = k / 5 * TAU; circ(c, x + Math.cos(a) * b.z * r * (0.8 + v), y + Math.sin(a) * b.z * r * (0.8 + v), r * 0.02 * (1 - v)); c.fillStyle = "rgba(225,255,170,.9)"; c.fill(); }
      }
    });
    c.restore();
    shine(c, r, 0.8);
  },
  over(c, r, s) {
    const lw = Math.max(2, r * 0.14);
    DRIPS.forEach(d => {
      const q = dripState(d, r, s.t, s.floor); if (!q.drop || q.drop.y > (s.floor ?? Infinity)) return;
      const { x0 } = q, { y, z, al } = q.drop;
      c.globalAlpha = BA * (al);
      const tear = () => { c.beginPath(); c.moveTo(x0, y - z * 1.7); c.bezierCurveTo(x0 + z * 0.4, y - z * 1.2, x0 + z, y - z * 0.3, x0 + z, y); c.arc(x0, y, z, 0, Math.PI); c.bezierCurveTo(x0 - z, y - z * 0.3, x0 - z * 0.4, y - z * 1.2, x0, y - z * 1.7); c.closePath(); };
      tear(); c.lineJoin = "round"; c.lineWidth = lw * 1.1; c.strokeStyle = "#fff"; c.stroke();
      tear(); c.lineWidth = lw * 0.3; c.strokeStyle = INK; c.stroke(); c.fillStyle = "#4fcf17"; c.fill();
      circ(c, x0 - z * 0.35, y - z * 0.2, z * 0.25); c.fillStyle = "rgba(245,255,220,.9)"; c.fill();
      c.globalAlpha = BA;
    });
  },
  trail(c, pts, r) {
    eachPt(pts, 2, (p, u) => {
      const fall = u * u * r * 3, z = r * 0.22 * (1 - u * 0.5), x = p.x + (hash(p.id) - 0.5) * r * 0.6, y = p.y + fall + (hash(p.id * 3) - 0.5) * r * 0.4;
      c.globalAlpha = BA * (p.k * (1 - u));
      c.beginPath(); c.moveTo(x, y - z * 1.8); c.quadraticCurveTo(x + z, y, x, y + z); c.quadraticCurveTo(x - z, y, x, y - z * 1.8); c.fillStyle = "#4cd418"; c.fill();
      circ(c, x - z * 0.25, y, z * 0.22); c.fillStyle = "rgba(230,255,190,.9)"; c.fill();
    });
    c.globalAlpha = BA;
  },
};

// ---------- 4 Seifenblase ----------
const bubble = {
  id: "blase", wobble: true, glass: true, shade: false,
  draw(c, r, s) {
    c.fillStyle = "rgba(225,242,255,.14)"; c.fillRect(-r, -r, 2 * r, 2 * r);
    const L = layer(c, r);
    const cg = conic(L, s.a + s.t * 0.7, r, ["#ff6ad5", "#ffd36a", "#6affc1", "#6ad5ff", "#b06aff", "#ff6ad5"]);
    L.fillStyle = cg; L.fillRect(-r, -r, 2 * r, 2 * r);
    L.globalCompositeOperation = "destination-in";
    const m = L.createRadialGradient(0, 0, 0, 0, 0, r);
    m.addColorStop(0, "rgba(0,0,0,.06)"); m.addColorStop(0.6, "rgba(0,0,0,.2)"); m.addColorStop(0.88, "rgba(0,0,0,.7)"); m.addColorStop(1, "rgba(0,0,0,.95)");
    L.fillStyle = m; L.fillRect(-r, -r, 2 * r, 2 * r);
    blit(c, L, r);
    shine(c, r, 0.9);
    c.beginPath(); c.arc(0, 0, r * 0.8, 0.25, 1.25); c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = r * 0.05; c.lineCap = "round"; c.stroke();
  },
  trail(c, pts, r, t) {
    eachPt(pts, 2, (p, u) => {
      const z = r * (0.14 + hash(p.id) * 0.2), x = p.x + Math.sin(u * 9 + p.id) * r * 0.25, y = p.y - u * r * 1.4 + (hash(p.id * 5) - 0.5) * r * 0.8;
      c.globalAlpha = BA * (p.k * (1 - u));
      circ(c, x, y, z); c.fillStyle = "rgba(225,242,255,.3)"; c.fill();
      c.strokeStyle = `hsl(${(p.id * 40 + t * 120) % 360},95%,75%)`; c.lineWidth = Math.max(1.5, r * 0.05); c.stroke();
      circ(c, x - z * 0.4, y - z * 0.4, z * 0.22); c.fillStyle = "rgba(255,255,255,.9)"; c.fill();
    });
    c.globalAlpha = BA;
  },
};

// ---------- 5 Glitch ----------
const glitchOn = t => (hash(Math.floor(t * 5) * 3.1) > 0.7 ? 1 : 0);
const glitch = {
  id: "glitch",
  draw(c, r, s) {
    const ev = glitchOn(s.t + s.seed), L = layer(c, r), d = r * (0.07 + 0.13 * ev);
    L.fillStyle = "#f4f4f8"; L.fillRect(-r, -r, 2 * r, 2 * r);
    const pents = (col, dx) => { L.save(); L.translate(dx, 0); L.rotate(s.a); L.fillStyle = col; PENTS.forEach(p => { pentPath(L, r, p); L.fill(); }); L.restore(); };
    L.globalCompositeOperation = "multiply"; pents("#ff2a6d", -d); pents("#05d9e8", d);
    L.globalCompositeOperation = "source-over"; pents("#15121f", 0);
    L.save(); L.rotate(s.a); seamPath(L, r); L.strokeStyle = "#555a66"; L.lineWidth = r * 0.05; L.stroke(); L.restore();
    for (let y = -r; y < r; y += r * 0.12) { L.fillStyle = "rgba(0,0,0,.07)"; L.fillRect(-r, y, 2 * r, r * 0.04); }
    if (ev) {
      const f = Math.floor((s.t + s.seed) * 20);
      for (let i = 0; i < 3; i++) { L.fillStyle = ["#ff2a6d", "#05d9e8", "#39ff14"][i]; L.fillRect((hash(f + i) - 0.6) * 2 * r, (hash(f * 2 + i) - 0.6) * 2 * r, r * (0.2 + hash(f + i * 9) * 0.5), r * 0.12); }
    }
    L.restore();
    c.fillStyle = "#f4f4f8"; c.fillRect(-r, -r, 2 * r, 2 * r);
    const n = 10, N = L.n, fr = Math.floor((s.t + s.seed) * 24);
    for (let i = 0; i < n; i++) {
      const off = ev && hash(i * 5 + fr * 7) > 0.55 ? (hash(i * 13 + fr) - 0.5) * r * 0.55 : 0;
      c.drawImage(L.canvas, 0, i * N / n, N, N / n, -r + off, -r + i * 2 * r / n, 2 * r, 2 * r / n + 0.5);
    }
  },
  trail(c, pts, r, t) {
    const g = r * 0.2, cols = ["#ff2a6d", "#05d9e8", "#39ff14", "#ffffff"];
    eachPt(pts, 1, (p, u) => {
      if (hash(p.id + Math.floor(t * 20)) < 0.25) return;
      const x = Math.round((p.x + (hash(p.id * 3) - 0.5) * r * 1.4) / g) * g, y = Math.round((p.y + (hash(p.id * 7) - 0.5) * r * 1.4) / g) * g, z = g * (hash(p.id * 11) > 0.6 ? 1.6 : 0.9) * (1 - u * 0.5);
      c.globalAlpha = BA * (p.k * (1 - u)); c.fillStyle = cols[p.id % 4]; c.fillRect(x - z / 2, y - z / 2, z, z);
    });
    c.globalAlpha = BA;
  },
};

// ---------- 6 Vaporwave ----------
const vapor = {
  id: "vapor", shade: 0.75,
  draw(c, r, s) {
    // Szene bleibt aufrecht wie ein Bildschirm; das Rollen zeigt das Gitter, das mit dem Drehwinkel läuft
    const hy = r * 0.1, run = (((s.t * 0.6 + s.a * 0.3) % 1) + 1) % 1;
    c.save();
    const sky = c.createLinearGradient(0, -r, 0, hy);
    sky.addColorStop(0, "#3a0b6b"); sky.addColorStop(0.55, "#ff3d9a"); sky.addColorStop(1, "#ff9e3d");
    c.fillStyle = sky; c.fillRect(-r * 1.1, -r * 1.1, 2.2 * r, r * 1.1 + hy);
    c.save(); c.beginPath(); c.rect(-r * 1.1, -r * 1.1, 2.2 * r, r * 1.1 + hy); c.clip();
    const sun = c.createLinearGradient(0, -r * 0.7, 0, hy); sun.addColorStop(0, "#fff06a"); sun.addColorStop(1, "#ff4fd8");
    circ(c, 0, -r * 0.12, r * 0.56); c.fillStyle = sun; c.fill();
    c.fillStyle = sky; for (let k = 0; k < 5; k++) c.fillRect(-r, -r * 0.05 + k * r * 0.09, 2 * r, r * (0.012 + k * 0.014));
    c.restore();
    c.fillStyle = "#1b0736"; c.fillRect(-r * 1.1, hy, 2.2 * r, r * 1.1);
    c.beginPath();
    for (let k = 0; k < 6; k++) { const z = (k + run) / 6, y = hy + r * 1.05 * z * z; c.moveTo(-r * 1.1, y); c.lineTo(r * 1.1, y); }
    for (let i = -6; i <= 6; i++) { c.moveTo(i * r * 0.07, hy); c.lineTo(i * r * 0.5, r * 1.1); }
    c.strokeStyle = "rgba(255,79,216,.35)"; c.lineWidth = r * 0.09; c.stroke();
    c.strokeStyle = "#ff6ae0"; c.lineWidth = r * 0.03; c.stroke();
    c.beginPath(); c.moveTo(-r * 1.1, hy); c.lineTo(r * 1.1, hy); c.strokeStyle = "#ffd6f5"; c.lineWidth = r * 0.04; c.stroke();
    c.restore();
  },
  trail(c, pts, r) {
    ribbon(c, pts, u => r * 1.5 * (1 - u), (u, p) => { const q = [lerp(255, 34, u), lerp(79, 211, u), lerp(216, 238, u)]; return `rgba(${q.map(Math.round).join(",")},${0.45 * p.k * (1 - u)})`; });
    ribbon(c, pts, u => r * 0.35 * (1 - u), (u, p) => `rgba(255,240,255,${0.8 * p.k * (1 - u)})`);
  },
};

// ---------- 7 Chrom ----------
const DROPS = Array.from({ length: 5 }, (_, i) => [Math.cos(i * 2.1) * (0.3 + hash(i) * 0.5), Math.sin(i * 2.1) * (0.3 + hash(i) * 0.5), 0.04 + hash(i * 3) * 0.04]);
const chrome = {
  id: "chrom", shade: false,
  draw(c, r, s) {
    const sky = c.createLinearGradient(0, -r, 0, r * 0.2);
    sky.addColorStop(0, "#dceeff"); sky.addColorStop(0.55, "#ffffff"); sky.addColorStop(1, "#a9b4c6");
    c.fillStyle = sky; c.fillRect(-r, -r, 2 * r, 2 * r);
    c.beginPath(); c.moveTo(-r, r);
    for (let x = -r; x <= r + 0.1; x += r / 12) {
      const u = x / r; c.lineTo(x, r * 0.02 + u * u * r * 0.3 + Math.sin(u * 3 + s.t * 2.2 + s.a * 0.5) * r * 0.07 + Math.sin(u * 7 - s.t * 3.1) * r * 0.025);
    }
    c.lineTo(r, r); c.closePath();
    const gr = c.createLinearGradient(0, 0, 0, r);
    gr.addColorStop(0, "#232836"); gr.addColorStop(0.35, "#4b5263"); gr.addColorStop(0.7, "#9aa3b5"); gr.addColorStop(1, "#e2e8f2");
    c.fillStyle = gr; c.fill();
    [[r * 0.55, -r * 0.15, "255,140,220"], [-r * 0.6, r * 0.45, "120,230,255"]].forEach(([x, y, col]) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r * 0.65); g.addColorStop(0, `rgba(${col},.32)`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
    });
    c.save(); c.rotate(s.a);
    DROPS.forEach(([x, y, z]) => { circ(c, x * r, y * r, z * r); c.fillStyle = "rgba(40,46,60,.5)"; c.fill(); circ(c, (x - z * 0.3) * r, (y - z * 0.3) * r, z * r * 0.45); c.fillStyle = "#fff"; c.fill(); });
    c.restore();
    const rim = c.createRadialGradient(0, 0, r * 0.7, 0, 0, r); rim.addColorStop(0, "rgba(16,20,32,0)"); rim.addColorStop(1, "rgba(16,20,32,.55)");
    circ(c, 0, 0, r); c.fillStyle = rim; c.fill();
    shine(c, r, 0.95);
  },
  trail(c, pts, r) {
    eachPt(pts, 2, (p, u) => {
      const z = r * (0.12 + hash(p.id) * 0.12) * (1 - u * 0.6), x = p.x + (hash(p.id * 3) - 0.5) * r * 0.8, y = p.y + (hash(p.id * 5) - 0.5) * r * 0.6 + u * u * r * 1.2;
      c.globalAlpha = BA * (p.k * (1 - u * u));
      const g = c.createRadialGradient(x - z * 0.35, y - z * 0.4, z * 0.05, x, y, z);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#b9c3d4"); g.addColorStop(1, "#3c4456");
      circ(c, x, y, z); c.fillStyle = g; c.fill();
    });
    c.globalAlpha = BA;
  },
};

// ---------- 8 Candy ----------
const CANDY = [[255, 79, 139], [255, 246, 250], [62, 224, 180], [255, 246, 250], [255, 210, 63], [255, 246, 250], [142, 125, 255], [255, 246, 250]];
const candyTex = () => tex("candy", 256, (x, S) => {
  const im = x.createImageData(S, S);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const dx = (i + 0.5) / S * 2 - 1, dy = (j + 0.5) / S * 2 - 1, v = (Math.atan2(dy, dx) / TAU + Math.hypot(dx, dy) * 1.2) * 8;
    const k = ((Math.floor(v) % 8) + 8) % 8, f = v - Math.floor(v), e = clamp((f - 0.94) / 0.06, 0, 1), p = CANDY[k], q = CANDY[(k + 1) % 8], o = (j * S + i) * 4;
    im.data[o] = lerp(p[0], q[0], e); im.data[o + 1] = lerp(p[1], q[1], e); im.data[o + 2] = lerp(p[2], q[2], e); im.data[o + 3] = 255;
  }
  x.putImageData(im, 0, 0);
});
const candy = {
  id: "candy", shade: 0.8,
  draw(c, r, s) {
    c.save(); c.rotate(s.a + s.t * 1.3); c.drawImage(candyTex(), -r * 1.05, -r * 1.05, 2.1 * r, 2.1 * r); c.restore();
    shine(c, r, 0.75);
  },
  trail(c, pts, r) {
    const pal = ["#ff4f8b", "#3ee0b4", "#ffd23f", "#8e7dff", "#ffffff"];
    eachPt(pts, 1, (p, u) => {
      const x = p.x + (hash(p.id * 3) - 0.5) * r * 1.3, y = p.y + (hash(p.id * 5) - 0.5) * r * 1.1 + u * u * r * 1.5;
      c.save(); c.translate(x, y); c.rotate(hash(p.id) * TAU + u * 6); c.globalAlpha = BA * (p.k * (1 - u));
      c.beginPath(); c.lineCap = "round"; c.moveTo(-r * 0.1, 0); c.lineTo(r * 0.1, 0); c.strokeStyle = pal[p.id % 5]; c.lineWidth = r * 0.08; c.stroke();
      c.restore();
    });
  },
};

// ---------- 9 Galaxie ----------
const nebula = () => tex("nebula", 256, (x, S) => {
  x.fillStyle = "#06021a"; x.fillRect(0, 0, S, S); x.globalCompositeOperation = "lighter";
  const pal = ["123,47,247", "255,79,216", "47,123,255", "34,211,238"];
  for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 30; i++) {
    const th = i * 0.27 + arm * Math.PI, rad = (0.05 + i * 0.03) * S / 2, px = S / 2 + Math.cos(th) * rad, py = S / 2 + Math.sin(th) * rad, z = S * (0.05 + hash(i * 3 + arm) * 0.09);
    const g = x.createRadialGradient(px, py, 0, px, py, z); g.addColorStop(0, `rgba(${pal[(i + arm) % 4]},.22)`); g.addColorStop(1, `rgba(${pal[(i + arm) % 4]},0)`);
    x.fillStyle = g; x.fillRect(0, 0, S, S);
  }
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.17); g.addColorStop(0, "rgba(255,250,240,.95)"); g.addColorStop(0.4, "rgba(255,180,255,.45)"); g.addColorStop(1, "rgba(255,180,255,0)");
  x.fillStyle = g; x.fillRect(0, 0, S, S);
});
const STARS = Array.from({ length: 46 }, (_, i) => { const a = hash(i * 1.3) * TAU, d = Math.sqrt(hash(i * 2.9)) * 0.98; return [Math.cos(a) * d, Math.sin(a) * d, 0.5 + hash(i * 5.3) * 1.2, 2 + hash(i * 7.1) * 4]; });
const galaxy = {
  id: "galaxie", shade: 0.9,
  draw(c, r, s) {
    c.save(); c.rotate(s.a + s.t * 0.3); c.drawImage(nebula(), -r * 1.2, -r * 1.2, 2.4 * r, 2.4 * r); c.restore();
    c.save(); c.rotate(s.a);
    STARS.forEach(([x, y, z, f], i) => {
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(s.t * f + i)), sz = z * r / 24;
      c.globalAlpha = BA * (tw);
      if (z > 1.45) sparkle(c, x * r, y * r, sz * 2.6 * tw); else { circ(c, x * r, y * r, sz); c.fillStyle = "#fff"; c.fill(); }
    });
    c.globalAlpha = BA; c.restore();
  },
  trail(c, pts, r, t) {
    ribbon(c, pts, u => r * 1.1 * (1 - u), (u, p) => `rgba(123,47,247,${0.22 * p.k * (1 - u)})`);
    const cols = ["#ffffff", "#ffb3f0", "#9ae6ff"];
    eachPt(pts, 1, (p, u) => {
      const x = p.x + (hash(p.id * 3) - 0.5) * r * 1.4 * (1 + u), y = p.y + (hash(p.id * 5) - 0.5) * r * 1.4 * (1 + u), tw = 0.5 + 0.5 * Math.sin(t * 14 + p.id);
      c.globalAlpha = BA * (p.k * (1 - u) * (0.5 + 0.5 * tw));
      if (p.id % 5 === 0) sparkle(c, x, y, r * 0.22 * (1 - u * 0.5), cols[p.id % 3]); else { circ(c, x, y, r * 0.05); c.fillStyle = cols[p.id % 3]; c.fill(); }
    });
    c.globalAlpha = BA;
  },
};

// ---------- 10 Ice-Out (Brillant-Schliff von oben) ----------
const GEM = (() => {
  const P = (ang, rad) => [Math.cos(ang) * rad, Math.sin(ang) * rad], st = TAU / 8, F = [];
  const T = k => P(k * st, 0.42), S = k => P((k + 0.5) * st, 0.68), R = k => P(k * st, 1.08), M = k => P((k + 0.5) * st, 1.08);
  for (let k = 0; k < 8; k++) {
    F.push({ pts: [T(k), T(k + 1), S(k)], ang: (k + 0.5) * st, kind: 0 });
    F.push({ pts: [T(k), S(k), R(k), S(k - 1)], ang: k * st, kind: 1 });
    F.push({ pts: [S(k), R(k), M(k)], ang: (k + 0.25) * st, kind: 2 });
    F.push({ pts: [S(k), M(k), R(k + 1)], ang: (k + 0.75) * st, kind: 3 });
  }
  const table = Array.from({ length: 8 }, (_, k) => T(k)), verts = [...table, ...Array.from({ length: 8 }, (_, k) => S(k))];
  return { F, table, verts };
})();
const ICE = [[14, 60, 140], [120, 205, 255], [255, 255, 255]];
const iceCol = b => (b < 0.5 ? mix(ICE[0], ICE[1], b / 0.5) : mix(ICE[1], ICE[2], Math.min(1, (b - 0.5) / 0.5)));
const iceout = {
  id: "iceout", shade: 0.55,
  draw(c, r, s) {
    c.fillStyle = "#7fd3ff"; c.fillRect(-r, -r, 2 * r, 2 * r);
    c.save(); c.rotate(s.a);
    const L = s.t * 1.7;
    GEM.F.forEach(f => {
      let b = 0.36 + 0.3 * Math.cos(f.ang * 3 + f.kind * 1.7) + 0.75 * Math.pow(Math.max(0, Math.cos(f.ang + s.a - L)), 10);
      if (f.kind === 0) b += 0.12;
      c.beginPath(); f.pts.forEach(([x, y], i) => (i ? c.lineTo(x * r, y * r) : c.moveTo(x * r, y * r))); c.closePath();
      c.fillStyle = iceCol(clamp(b, 0, 1)); c.fill();
    });
    c.beginPath(); GEM.table.forEach(([x, y], i) => (i ? c.lineTo(x * r, y * r) : c.moveTo(x * r, y * r))); c.closePath();
    c.fillStyle = iceCol(0.72 + 0.28 * Math.sin(s.t * 2.2)); c.fill();
    c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = r * 0.025; c.lineJoin = "round";
    GEM.F.forEach(f => { c.beginPath(); f.pts.forEach(([x, y], i) => (i ? c.lineTo(x * r, y * r) : c.moveTo(x * r, y * r))); c.closePath(); c.stroke(); });
    c.restore();
  },
  over(c, r, s) {
    for (let i = 0; i < 3; i++) {
      const w = s.t * 1.1 + i / 3 + s.seed, u = w % 1; if (u > 0.22) continue;
      const v = GEM.verts[Math.floor(hash(Math.floor(w) * 7 + i) * GEM.verts.length)], ca = Math.cos(s.a), sa = Math.sin(s.a);
      const x = (v[0] * ca - v[1] * sa) * r, y = (v[0] * sa + v[1] * ca) * r, z = r * 0.5 * Math.sin(u / 0.22 * Math.PI);
      c.globalAlpha = BA * (0.6); sparkle(c, x, y, z * 1.25, "#bfefff"); c.globalAlpha = BA; sparkle(c, x, y, z);
    }
  },
  trail(c, pts, r, t) {
    eachPt(pts, 1, (p, u) => {
      const x = p.x + (hash(p.id * 3) - 0.5) * r * 1.5, y = p.y + (hash(p.id * 5) - 0.5) * r * 1.5, tw = Math.abs(Math.sin(t * 12 + p.id * 1.7));
      c.globalAlpha = BA * (p.k * (1 - u));
      sparkle(c, x, y, r * (0.1 + 0.2 * hash(p.id * 9)) * (0.4 + 0.6 * tw), p.id % 3 ? "#ffffff" : "#9fe1ff");
    });
    c.globalAlpha = BA;
  },
};

// ---------- 11 RGB-Gamer ----------
const HEX = (() => {
  const out = [], h = 0.2, w = Math.sqrt(3) * h;
  for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) { const x = i * w + (j % 2 ? w / 2 : 0), y = j * h * 1.5; if (Math.hypot(x, y) < 1.3) out.push([x, y]); }
  return { out, h };
})();
const rainbow = (c, rot, r) => conic(c, rot, r, Array.from({ length: 7 }, (_, i) => `hsl(${i * 60},100%,58%)`));
const rgb = {
  id: "rgb", shade: 0.7,
  draw(c, r, s) {
    c.fillStyle = "#0c0d14"; c.fillRect(-r, -r, 2 * r, 2 * r);
    c.save(); c.rotate(s.a);
    c.strokeStyle = "#1f2232"; c.lineWidth = r * 0.025; c.beginPath();
    HEX.out.forEach(([x, y]) => { for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * TAU / 6, px = (x + Math.cos(a) * HEX.h) * r, py = (y + Math.sin(a) * HEX.h) * r; if (k) c.lineTo(px, py); else c.moveTo(px, py); } });
    c.stroke();
    c.fillStyle = "#171a2a"; PENTS.forEach(p => { pentPath(c, r, p); c.fill(); });
    const path = () => { c.beginPath(); PENTS.forEach(p => { for (let k = 0; k <= 5; k++) { const a = p[3] - Math.PI / 2 + k * TAU / 5, x = (p[0] + Math.cos(a) * p[2]) * r, y = (p[1] + Math.sin(a) * p[2]) * r; if (k) c.lineTo(x, y); else c.moveTo(x, y); } }); for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5; c.moveTo(Math.cos(a) * r * 0.34, Math.sin(a) * r * 0.34); c.lineTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66); } };
    const g = rainbow(c, -s.t * 2.5, r); c.lineJoin = "round"; c.lineCap = "round";
    path(); c.strokeStyle = g; c.globalAlpha = BA * (0.28); c.lineWidth = r * 0.2; c.stroke();
    c.globalAlpha = BA; c.lineWidth = r * 0.075; c.stroke();
    c.strokeStyle = "rgba(255,255,255,.65)"; c.lineWidth = r * 0.022; c.stroke();
    c.restore();
  },
  trail(c, pts, r, t) {
    ribbon(c, pts, u => r * 1.3 * (1 - u * 0.8), (u, p) => `hsla(${(p.id * 24 + t * 300) % 360},100%,60%,${0.75 * p.k * (1 - u)})`);
    ribbon(c, pts, u => r * 0.3 * (1 - u), (u, p) => `rgba(255,255,255,${0.7 * p.k * (1 - u)})`);
  },
};

// ---------- 12 Orakel ----------
const oracle = {
  id: "orakel", shade: false,
  draw(c, r, s) {
    const g = c.createRadialGradient(0, r * 0.1, 0, 0, 0, r);
    g.addColorStop(0, "#d2b0ff"); g.addColorStop(0.45, "#7a3fd1"); g.addColorStop(1, "#2a0b4a");
    c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
    for (let i = 0; i < 7; i++) {
      const a = s.t * (0.4 + (i % 3) * 0.25) * (i % 2 ? 1 : -1) + i * 0.9 + s.a * 0.4, d = r * (0.15 + 0.14 * (i % 3)), x = Math.cos(a) * d, y = Math.sin(a) * d * 0.8, z = r * (0.35 + 0.1 * (i % 2));
      const f = c.createRadialGradient(x, y, 0, x, y, z); f.addColorStop(0, "rgba(238,215,255,.34)"); f.addColorStop(1, "rgba(238,215,255,0)");
      c.fillStyle = f; c.fillRect(-r, -r, 2 * r, 2 * r);
    }
    const u = ((s.t + s.seed * 2) % 5.5) / 5.5;
    if (u > 0.5 && u < 0.95) {
      const al = Math.sin((u - 0.5) / 0.45 * Math.PI), op = Math.min(1, al * 1.8), w = r * 0.62, h = r * 0.24 * op;
      c.save(); c.globalAlpha = BA * (al);
      c.beginPath(); c.moveTo(-w, 0); c.quadraticCurveTo(0, -h * 1.8, w, 0); c.quadraticCurveTo(0, h * 1.8, -w, 0); c.closePath();
      c.fillStyle = "#fff3ff"; c.fill(); c.save(); c.clip();
      const ix = Math.sin(s.t * 1.7) * w * 0.35, ig = c.createRadialGradient(ix, 0, 0, ix, 0, r * 0.24);
      ig.addColorStop(0, "#fff7b0"); ig.addColorStop(0.6, "#ffb326"); ig.addColorStop(1, "#b0420a");
      circ(c, ix, 0, r * 0.24); c.fillStyle = ig; c.fill();
      c.beginPath(); c.ellipse(ix, 0, r * 0.05, r * 0.18, 0, 0, TAU); c.fillStyle = "#14061f"; c.fill();
      c.restore();
      c.beginPath(); c.moveTo(-w, 0); c.quadraticCurveTo(0, -h * 1.8, w, 0); c.quadraticCurveTo(0, h * 1.8, -w, 0); c.closePath();
      c.strokeStyle = "#ffd6ff"; c.lineWidth = r * 0.05; c.stroke();
      c.restore();
    }
    c.beginPath(); c.arc(0, 0, r * 0.84, 0.35, 1.9); c.strokeStyle = "rgba(230,190,255,.6)"; c.lineWidth = r * 0.07; c.lineCap = "round"; c.stroke();
    const rim = c.createRadialGradient(0, 0, r * 0.72, 0, 0, r); rim.addColorStop(0, "rgba(20,0,40,0)"); rim.addColorStop(1, "rgba(20,0,40,.5)");
    circ(c, 0, 0, r); c.fillStyle = rim; c.fill();
    shine(c, r, 0.85);
  },
  trail(c, pts, r, t) {
    eachPt(pts, 2, (p, u) => {
      const x = p.x + (hash(p.id * 3) - 0.5) * r * 0.5, y = p.y - u * r * 0.8, z = r * (0.45 + u * 0.9);
      const g = c.createRadialGradient(x, y, 0, x, y, z); g.addColorStop(0, `rgba(170,110,255,${0.45 * p.k * (1 - u)})`); g.addColorStop(1, "rgba(170,110,255,0)");
      c.fillStyle = g; circ(c, x, y, z); c.fill();
    });
    eachPt(pts, 5, (p, u) => { c.globalAlpha = BA * (p.k * (1 - u) * (0.5 + 0.5 * Math.sin(t * 15 + p.id))); sparkle(c, p.x + (hash(p.id * 7) - 0.5) * r * 1.4, p.y + (hash(p.id * 9) - 0.5) * r * 1.4 - u * r, r * 0.15, "#ffd6ff"); });
    c.globalAlpha = BA;
  },
};

// =====================================================================
// Rework des Bestands: gleiche IDs und Preise wie im Spiel, neu gezeichnet
// =====================================================================

// ---------- 3D-Helfer ----------
const PHI = (1 + Math.sqrt(5)) / 2;
const nrm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const dot3 = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const cross3 = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const lerp3 = (p, q, u) => [lerp(p[0], q[0], u), lerp(p[1], q[1], u), lerp(p[2], q[2], u)];
// Fußball = abgestumpfter Ikosaeder: 12 Fünfecke, 20 Sechsecke
const TI = (() => {
  const V = [];
  for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) V.push([0, s1, s2 * PHI], [s1, s2 * PHI, 0], [s2 * PHI, 0, s1]);
  const N = V.map((v, i) => V.map((w, j) => j).filter(j => j !== i && Math.abs(Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]) - 2) < 1e-6));
  const tw = (i, j) => nrm3(lerp3(V[i], V[j], 1 / 3)), faces = [];
  V.forEach((v, i) => {
    const c = nrm3(v), u = nrm3(cross3(c, Math.abs(c[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), w = cross3(c, u);
    const pts = N[i].map(j => tw(i, j)).sort((p, q) => Math.atan2(dot3(p, w), dot3(p, u)) - Math.atan2(dot3(q, w), dot3(q, u)));
    faces.push({ pts, c, pent: true });
  });
  for (let i = 0; i < 12; i++) for (const j of N[i]) for (const k of N[j]) if (i < j && j < k && N[k].includes(i)) {
    faces.push({ pts: [tw(i, j), tw(j, i), tw(j, k), tw(k, j), tw(k, i), tw(i, k)], c: nrm3([V[i][0] + V[j][0] + V[k][0], V[i][1] + V[j][1] + V[k][1], V[i][2] + V[j][2] + V[k][2]]), pent: false });
  }
  faces.forEach((f, id) => {
    f.id = id; f.arc = [];
    f.pts.forEach((p, n) => { const q = f.pts[(n + 1) % f.pts.length]; for (let k = 0; k < 4; k++) f.arc.push(nrm3(lerp3(p, q, k / 4))); });
  });
  return faces;
})();
// Körper → Welt: erst um die Drehachse (z) rollen, dann die Achse zum Betrachter kippen
function rotM(a, tilt = 0.55) {
  const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tilt), st = Math.sin(tilt);
  return p => { const x = p[0] * ca - p[1] * sa, y = p[0] * sa + p[1] * ca; return [x, y * ct - p[2] * st, y * st + p[2] * ct]; };
}
function invM(a, tilt = 0.55) {
  const ca = Math.cos(a), sa = Math.sin(a), ct = Math.cos(tilt), st = Math.sin(tilt);
  return (x, y, z) => { const y1 = y * ct + z * st, z1 = -y * st + z * ct; return [x * ca + y1 * sa, -x * sa + y1 * ca, z1]; };
}
// Rückseite wird auf den Rand gedrückt, so schließen Flächen am Rand sauber ab
const proj = (p, r) => { if (p[2] >= 0) return [p[0] * r, p[1] * r]; const l = Math.hypot(p[0], p[1]) || 1; return [p[0] / l * r, p[1] / l * r]; };
function facePath(c, f, R, r) { c.beginPath(); f.arc.forEach((p, n) => { const [x, y] = proj(R(p), r); if (n) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath(); }
const imgs = new Map(), imgOf = (L, n) => { if (!imgs.has(n)) imgs.set(n, L.createImageData(n, n)); return imgs.get(n); };
// Pro-Pixel-Kugel: fn(Weltnormale) → [r,g,b]
function sphereImg(c, r, fn) {
  const L = layer(c, r, 96), n = L.n, im = imgOf(L, n), d = im.data; d.fill(0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n * 2 - 1, y = (j + 0.5) / n * 2 - 1, q = x * x + y * y; if (q > 1.06) continue;
    const z = Math.sqrt(Math.max(0, 1 - q)), col = fn(x, y, z), o = (j * n + i) * 4;
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  L.putImageData(im, 0, 0); blit(c, L, r);
}
const LIGHT = nrm3([-0.55, -0.6, 0.6]);
const rampN = (stops, u) => { u = clamp(u, 0, 0.9999) * (stops.length - 1); const k = Math.floor(u), f = u - k; return stops[k].map((v, n) => lerp(v, stops[k + 1][n], f)); };
const ramp = (stops, u) => { const q = rampN(stops, u); return `rgb(${Math.round(q[0])},${Math.round(q[1])},${Math.round(q[2])})`; };
function offsetLines(c, pts, r, offs, colFn, wFn) {
  c.lineCap = "round";
  offs.forEach((o, j) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], u = p.age / TRAIL; if (u >= 1 || p.k <= 0.01) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, nx = -dy / d * o * r, ny = dx / d * o * r;
      c.beginPath(); c.moveTo(p.x + nx, p.y + ny); c.lineTo(q.x + nx, q.y + ny); c.strokeStyle = colFn(u, p, j); c.lineWidth = wFn(u, p, j); c.stroke();
    }
  });
}
function glints(c, r, s, R, n, speed, col = "#fff") {
  for (let i = 0; i < n; i++) {
    const w = s.t * speed + i / n + s.seed, u = w % 1; if (u > 0.2) continue;
    const f = TI[Math.floor(hash(Math.floor(w) * 7 + i) * TI.length)], p = R(f.pts[0]); if (p[2] < 0.2) continue;
    const [x, y] = proj(p, r), z = r * 0.42 * Math.sin(u / 0.2 * Math.PI);
    c.globalAlpha = BA * (0.55); sparkle(c, x, y, z * 1.3, col); c.globalAlpha = BA; sparkle(c, x, y, z);
  }
}

// ---------- Klassik ----------
const klassik = {
  id: "klassik",
  draw(c, r, s) {
    const R = rotM(s.a);
    TI.forEach(f => {
      const z = R(f.c)[2]; if (z < -0.3) return;
      facePath(c, f, R, r);
      c.fillStyle = f.pent ? mix([10, 12, 20], [44, 48, 64], clamp(z, 0, 1)) : mix([196, 200, 212], [255, 255, 255], clamp(0.3 + z * 0.7, 0, 1));
      c.fill();
    });
    c.strokeStyle = "#8d93a3"; c.lineWidth = r * 0.03; c.lineJoin = "round";
    TI.forEach(f => { if (!f.pent && R(f.c)[2] > -0.3) { facePath(c, f, R, r); c.stroke(); } });
  },
  trail(c, pts, r) {
    offsetLines(c, pts, r, [-0.55, 0, 0.55], (u, p, j) => `rgba(255,255,255,${(j === 1 ? 0.55 : 0.35) * p.k * (1 - u)})`, (u, p, j) => r * (j === 1 ? 0.07 : 0.045) * (1 - u * 0.5));
  },
};

// ---------- Leder (retro) ----------
const LACE = TI.filter(f => !f.pent).reduce((p, q) => (q.c[2] > p.c[2] ? q : p)); // Sechseck nahe der Drehachse: fast immer sichtbar
const leder = {
  id: "retro",
  draw(c, r, s) {
    const R = rotM(s.a);
    TI.forEach(f => {
      const z = R(f.c)[2]; if (z < -0.3) return;
      const h = hash(f.id * 3.7), k = clamp(0.35 + z * 0.65, 0, 1);
      facePath(c, f, R, r); c.fillStyle = mix([70, 36, 14], [170 + 40 * h, 100 + 28 * h, 46 + 18 * h], k); c.fill();
    });
    c.lineJoin = "round";
    TI.forEach(f => { if (!f.pent && R(f.c)[2] > -0.3) { facePath(c, f, R, r); c.strokeStyle = "#3b1d08"; c.lineWidth = r * 0.06; c.stroke(); } });
    c.setLineDash([r * 0.05, r * 0.05]);
    TI.forEach(f => { if (!f.pent && R(f.c)[2] > 0) { facePath(c, f, R, r); c.strokeStyle = "rgba(243,225,192,.75)"; c.lineWidth = r * 0.02; c.stroke(); } });
    c.setLineDash([]);
    // Schnürung auf einem Sechseck
    const f = LACE, cz = R(f.c)[2];
    if (cz > 0.15) {
      const u = nrm3(lerp3(f.pts[0], f.pts[1], 0.5)), dir = nrm3([u[0] - f.c[0], u[1] - f.c[1], u[2] - f.c[2]]), side = cross3(f.c, dir);
      const P = (a, b) => proj(R(nrm3([f.c[0] + dir[0] * a + side[0] * b, f.c[1] + dir[1] * a + side[1] * b, f.c[2] + dir[2] * a + side[2] * b])), r);
      c.globalAlpha = BA * (clamp(cz * 2, 0, 1));
      let [x0, y0] = P(-0.2, 0), [x1, y1] = P(0.2, 0);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = "#2a1305"; c.lineWidth = r * 0.07; c.stroke();
      c.strokeStyle = "#f3e1c0"; c.lineWidth = r * 0.03; c.lineCap = "round";
      for (let k = -2; k <= 2; k++) { [x0, y0] = P(k * 0.08, -0.07); [x1, y1] = P(k * 0.08 + 0.04, 0.07); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
      c.globalAlpha = BA;
    }
  },
  trail(c, pts, r) {
    eachPt(pts, 2, (p, u) => {
      const x = p.x + (hash(p.id * 3) - 0.5) * r * 0.8, y = p.y + r * 0.2 + u * r * 0.5, z = r * (0.35 + u * 1.0);
      const g = c.createRadialGradient(x, y, 0, x, y, z); g.addColorStop(0, `rgba(210,172,120,${0.6 * p.k * (1 - u)})`); g.addColorStop(1, "rgba(196,160,112,0)");
      c.fillStyle = g; circ(c, x, y, z); c.fill();
    });
  },
};

// ---------- Wasserball (beach) ----------
const BEACH = [[255, 61, 110], [255, 255, 255], [255, 212, 59], [255, 255, 255], [34, 168, 238], [255, 255, 255]];
const wasserball = {
  id: "beach", wobble: true, shade: false,
  draw(c, r, s) {
    const B = invM(s.a, 0.7);
    sphereImg(c, r, (x, y, z) => {
      const b = B(x, y, z), lam = Math.max(0, x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
      // Bahnen laufen um die Drehachse, so wirbeln beim Rollen alle Farben durchs Bild
      let col = Math.abs(b[2]) > 0.93 ? [255, 255, 255] : BEACH[Math.floor(((Math.atan2(b[1], b[0]) / TAU) + 1) * 6) % 6];
      if (b[2] > 0.985) col = [225, 228, 236];
      const k = 0.45 + 0.6 * lam;
      return [Math.min(255, col[0] * k), Math.min(255, col[1] * k), Math.min(255, col[2] * k)];
    });
    shine(c, r, 0.95);
    c.beginPath(); c.arc(0, 0, r * 0.82, 0.3, 1.2); c.strokeStyle = "rgba(255,255,255,.4)"; c.lineWidth = r * 0.06; c.lineCap = "round"; c.stroke();
  },
  trail(c, pts, r) {
    eachPt(pts, 2, (p, u) => {
      const z = r * (0.1 + hash(p.id) * 0.1) * (1 - u * 0.4), x = p.x + (hash(p.id * 3) - 0.5) * r * 1.1, y = p.y + (hash(p.id * 5) - 0.5) * r * 0.8 + u * u * r * 2;
      c.globalAlpha = BA * (p.k * (1 - u));
      c.beginPath(); c.moveTo(x, y - z * 1.8); c.quadraticCurveTo(x + z, y, x, y + z); c.quadraticCurveTo(x - z, y, x, y - z * 1.8); c.fillStyle = "#7fd6ff"; c.fill();
      circ(c, x - z * 0.3, y, z * 0.25); c.fillStyle = "#fff"; c.fill();
    });
    c.globalAlpha = BA;
  },
};

// ---------- Neon ----------
const neon = {
  id: "neon", shade: 0.55,
  draw(c, r, s) {
    const R = rotM(s.a), beat = 0.55 + 0.45 * Math.pow(0.5 + 0.5 * Math.sin(s.t * TAU * 2), 3), fl = hash(Math.floor((s.t + s.seed) * 9)) > 0.93 ? 0.25 : 1, k = beat * fl;
    c.fillStyle = "#0b0716"; c.fillRect(-r, -r, 2 * r, 2 * r);
    TI.forEach(f => { const z = R(f.c)[2]; if (z < -0.3) return; facePath(c, f, R, r); c.fillStyle = f.pent ? "#1a0f33" : mix([10, 6, 20], [24, 16, 44], clamp(z, 0, 1)); c.fill(); });
    c.lineJoin = "round";
    const pass = (pent, col, glow) => {
      TI.forEach(f => { if (f.pent !== pent || R(f.c)[2] < -0.3) return; facePath(c, f, R, r); c.globalAlpha = BA * (0.28 * k); c.strokeStyle = glow; c.lineWidth = r * 0.17; c.stroke(); });
      TI.forEach(f => { if (f.pent !== pent || R(f.c)[2] < -0.3) return; facePath(c, f, R, r); c.globalAlpha = BA * (0.4 + 0.6 * k); c.strokeStyle = col; c.lineWidth = r * 0.06; c.stroke(); });
    };
    pass(false, "#ff6ae0", "#ff4fd8"); pass(true, "#7ff3ff", "#22d3ee");
    c.globalAlpha = BA;
  },
  trail(c, pts, r) {
    offsetLines(c, pts, r, [-0.3, 0.3, -0.3, 0.3], (u, p, j) => (j < 2 ? `rgba(${j ? "34,211,238" : "255,79,216"},${0.3 * p.k * (1 - u)})` : `rgba(${j === 3 ? "190,250,255" : "255,190,245"},${0.9 * p.k * (1 - u)})`), (u, p, j) => r * (j < 2 ? 0.3 : 0.08) * (1 - u * 0.5));
  },
};

// ---------- Pixel ----------
// 24 Drehstufen werden einmal gerendert und danach nur noch skaliert
const PIXF = [];
function pixFrame(st) {
  const N = 16, hr = N / 2, cv = document.createElement("canvas"); cv.width = cv.height = N;
  const x = cv.getContext("2d", { willReadFrequently: true }), R = rotM(st * TAU / 24);
  x.setTransform(1, 0, 0, 1, hr, hr); x.fillStyle = "#fff"; x.fillRect(-hr, -hr, N, N);
  TI.forEach(f => { if (!f.pent || R(f.c)[2] < -0.2) return; facePath(x, f, R, hr); x.fillStyle = f.id % 4 === 1 ? "#0f0" : "#000"; x.fill(); });
  const im = x.getImageData(0, 0, N, N), d = im.data;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const o = (j * N + i) * 4, px = (i + 0.5) / hr - 1, py = (j + 0.5) / hr - 1, rr = Math.hypot(px, py);
    let col = d[o + 1] > 160 && d[o] < 100 ? PIX.green : d[o] > 128 ? PIX.white : PIX.black;
    if (rr > 0.78 && col !== PIX.black) col = col === PIX.green ? [37, 163, 95] : [190, 194, 206];
    if (Math.hypot(px + 0.42, py + 0.42) < 0.2) col = [255, 255, 255];
    d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  return cv;
}
const PIX = { white: [247, 245, 239], black: [20, 22, 31], green: [61, 220, 132] };
const pixel = {
  id: "pixel", shade: false,
  draw(c, r, s) {
    const st = ((Math.round(s.a / (TAU / 24)) % 24) + 24) % 24;
    if (!PIXF[st]) PIXF[st] = pixFrame(st);
    c.imageSmoothingEnabled = false; c.drawImage(PIXF[st], -r, -r, 2 * r, 2 * r); c.imageSmoothingEnabled = true;
  },
  trail(c, pts, r) {
    const g = r * 0.25;
    eachPt(pts, 3, (p, u) => {
      const al = Math.ceil((1 - u) * 4) / 4 * p.k;
      [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([i, j], n) => {
        const x = Math.round(p.x / g) * g + i * g, y = Math.round(p.y / g) * g + j * g;
        c.globalAlpha = BA * (al * (n ? 0.6 : 1)); c.fillStyle = n ? "#3ddc84" : "#f7f5ef"; c.fillRect(x - g / 2, y - g / 2, g, g);
      });
    });
    c.globalAlpha = BA;
  },
};

// ---------- Planet ----------
const PW = 256, PH = 128;
const vnoise = (x, y, z, sd) => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const sm = t => t * t * (3 - 2 * t), u = sm(xf), v = sm(yf), w = sm(zf), H = (a, b, c2) => hash(a * 157.3 + b * 113.1 + c2 * 71.7 + sd);
  const l = (a, b) => lerp(a, b, u);
  return lerp(lerp(l(H(xi, yi, zi), H(xi + 1, yi, zi)), l(H(xi, yi + 1, zi), H(xi + 1, yi + 1, zi)), v), lerp(l(H(xi, yi, zi + 1), H(xi + 1, yi, zi + 1)), l(H(xi, yi + 1, zi + 1), H(xi + 1, yi + 1, zi + 1)), v), w);
};
const fbm = (x, y, z, sd) => vnoise(x * 2, y * 2, z * 2, sd) * 0.55 + vnoise(x * 4, y * 4, z * 4, sd) * 0.3 + vnoise(x * 8, y * 8, z * 8, sd) * 0.15;
let PLANET = null;
function planetMap() {
  if (PLANET) return PLANET;
  const col = new Uint8ClampedArray(PW * PH * 3), cloud = new Float32Array(PW * PH), land = new Uint8Array(PW * PH);
  for (let j = 0; j < PH; j++) for (let i = 0; i < PW; i++) {
    const lon = i / PW * TAU, lat = (j / PH - 0.5) * Math.PI, x = Math.cos(lat) * Math.cos(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.sin(lon);
    const e = fbm(x + 3, y + 3, z + 3, 1), o = j * PW + i, cap = Math.abs(lat) > 1.2 + (e - 0.5) * 0.4;
    let c3;
    if (cap) c3 = [240, 246, 255];
    else if (e < 0.5) c3 = rampN([[12, 50, 140], [30, 110, 215], [70, 170, 240]], clamp((e - 0.3) / 0.2, 0, 1));
    else { c3 = rampN([[80, 200, 90], [46, 150, 64], [40, 130, 58], [150, 130, 74], [230, 226, 210]], clamp((e - 0.5) / 0.3, 0, 1)); land[o] = 1; }
    col.set(c3, o * 3);
    cloud[o] = clamp((fbm(x + 9, y * 1.6 + 9, z + 9, 5) - 0.6) * 4, 0, 0.75);
  }
  PLANET = { col, cloud, land }; return PLANET;
}
const moon = (c, r, s, front) => {
  const m = s.t * 1.1, sn = Math.sin(m); if ((sn >= 0) !== front) return;
  const x = Math.cos(m) * r * 1.5, y = sn * r * 0.38 - r * 0.15, z = r * 0.2 * (0.85 + 0.15 * sn);
  circ(c, x, y, z + Math.max(1, r * 0.03)); c.fillStyle = "#fff"; c.fill();
  const g = c.createRadialGradient(x - z * 0.4, y - z * 0.4, 0, x, y, z); g.addColorStop(0, "#f2f2f5"); g.addColorStop(1, "#8b8fa0");
  circ(c, x, y, z); c.fillStyle = g; c.fill();
  [[0.3, -0.2, 0.25], [-0.25, 0.3, 0.2], [0.1, 0.4, 0.14]].forEach(([a, b, q]) => { circ(c, x + a * z, y + b * z, q * z); c.fillStyle = "rgba(90,94,110,.45)"; c.fill(); });
};
const planet = {
  id: "planet", shade: false,
  under(c, r, s) { moon(c, r, s, false); },
  draw(c, r, s) {
    const P = planetMap(), B = invM(s.a, 0.45), cs = s.t * 0.15;
    sphereImg(c, r, (x, y, z) => {
      const b = B(x, y, z), lat = Math.asin(clamp(b[1], -1, 1)), lon = Math.atan2(b[2], b[0]);
      const j = clamp(Math.floor((lat / Math.PI + 0.5) * PH), 0, PH - 1), i = ((Math.floor(lon / TAU * PW) % PW) + PW) % PW, ic = ((Math.floor((lon + cs) / TAU * PW) % PW) + PW) % PW, o = j * PW + i;
      const lam = x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2], k = 0.12 + 1.0 * Math.max(0, lam), cl = P.cloud[j * PW + ic];
      const r0 = P.col[o * 3] * k, g0 = P.col[o * 3 + 1] * k, b0 = P.col[o * 3 + 2] * k;
      const ck = 255 * (0.2 + 0.85 * Math.max(0, lam));
      return [lerp(r0, ck, cl), lerp(g0, ck, cl), lerp(b0, ck * 1.04, cl)];
    });
    const at = c.createRadialGradient(0, 0, r * 0.7, 0, 0, r); at.addColorStop(0, "rgba(90,180,255,0)"); at.addColorStop(1, "rgba(120,200,255,.55)");
    circ(c, 0, 0, r); c.fillStyle = at; c.fill();
  },
  over(c, r, s) { moon(c, r, s, true); },
  trail(c, pts, r) {
    ribbon(c, pts, u => r * 1.6 * (1 - u * 0.7), (u, p) => `rgba(90,175,255,${0.32 * p.k * (1 - u)})`);
    ribbon(c, pts, u => r * 0.5 * (1 - u), (u, p) => `rgba(210,240,255,${0.5 * p.k * (1 - u)})`);
  },
};

// ---------- Disco ----------
const TILES = (() => {
  const out = [], B = 12;
  for (let j = 0; j < B; j++) {
    const a0 = -Math.PI / 2 + j * Math.PI / B, a1 = a0 + Math.PI / B, n = Math.max(6, Math.round(26 * Math.cos((a0 + a1) / 2)));
    for (let i = 0; i < n; i++) {
      const l0 = i / n * TAU, l1 = (i + 1) / n * TAU, P = (la, lo) => [Math.cos(la) * Math.cos(lo), Math.sin(la), Math.cos(la) * Math.sin(lo)];
      out.push({ pts: [P(a0, l0), P(a0, l1), P(a1, l1), P(a1, l0)], c: P((a0 + a1) / 2, (l0 + l1) / 2), id: out.length });
    }
  }
  return out;
})();
let discoGlint = null; // Glanzpunkt von draw an over, nicht im Ballzustand speichern
const disco = {
  id: "disco", shade: 0.5,
  draw(c, r, s) {
    const R = rotM(s.a + s.t * 0.5, 0.35), L2 = nrm3([Math.cos(s.t * 1.4) * 0.8, 0.25, 0.6]), hue = (s.t * 70) % 360;
    c.fillStyle = "#1c1e28"; c.fillRect(-r, -r, 2 * r, 2 * r);
    let best = null, bestS = 0.5;
    TILES.forEach(tl => {
      const n = R(tl.c); if (n[2] < 0.02) return;
      const rf = [2 * n[2] * n[0], 2 * n[2] * n[1], 2 * n[2] * n[2] - 1], s1 = Math.pow(Math.max(0, dot3(rf, LIGHT)), 24), s2 = Math.pow(Math.max(0, dot3(rf, L2)), 10);
      const base = 0.28 + 0.38 * n[2] + 0.18 * hash(tl.id * 1.7);
      c.beginPath(); tl.pts.forEach((p, k) => { const [x, y] = proj(R(p), r * 0.985); if (k) c.lineTo(x, y); else c.moveTo(x, y); }); c.closePath();
      const v = Math.round(clamp((base + s1) * 255, 0, 255));
      c.fillStyle = hash(tl.id * 4.1) > 0.82 ? `hsl(${(hue + tl.id * 23) % 360},90%,${Math.round(45 + 30 * base)}%)` : `rgb(${v},${v},${Math.min(255, v + 12)})`;
      c.fill();
      if (s2 > 0.05) { c.globalAlpha = BA * (s2); c.fillStyle = `hsl(${hue},100%,65%)`; c.fill(); c.globalAlpha = BA; }
      c.strokeStyle = "rgba(20,22,32,.55)"; c.lineWidth = r * 0.018; c.stroke();
      if (s1 > bestS) { bestS = s1; best = proj(R(tl.c), r); }
    });
    discoGlint = best ? [best[0], best[1], bestS] : null;
  },
  over(c, r, s) {
    if (!discoGlint) return;
    const [x, y, k] = discoGlint, z = r * 0.55 * k * (0.75 + 0.25 * Math.sin(s.t * 9));
    c.globalAlpha = BA * (0.6); sparkle(c, x, y, z * 1.3, "#ffe6ff"); c.globalAlpha = BA; sparkle(c, x, y, z * 0.9);
  },
  trail(c, pts, r, t) {
    eachPt(pts, 1, (p, u) => {
      const x = p.x + (hash(p.id * 3) - 0.5) * r * 2, y = p.y + (hash(p.id * 5) - 0.5) * r * 2, z = r * (0.08 + 0.1 * hash(p.id * 7));
      const g = c.createRadialGradient(x, y, 0, x, y, z * 2); const h = (p.id * 47 + t * 90) % 360;
      g.addColorStop(0, `hsla(${h},100%,75%,${p.k * (1 - u)})`); g.addColorStop(1, `hsla(${h},100%,60%,0)`);
      c.fillStyle = g; circ(c, x, y, z * 2); c.fill();
    });
  },
};

// ---------- Gold ----------
const GOLD = [[90, 58, 0], [190, 135, 15], [255, 214, 80], [255, 248, 205]];
const gold = {
  id: "gold", shade: 0.45,
  draw(c, r, s) {
    const R = rotM(s.a), Ls = nrm3([Math.cos(s.t * 1.3) * 0.8, -0.45, 0.55]);
    TI.forEach(f => {
      const n = R(f.c); if (n[2] < -0.3) return;
      const sp = Math.pow(Math.max(0, dot3(n, Ls)), 10), b = clamp(0.2 + 0.45 * Math.max(0, dot3(n, LIGHT)) + 0.2 * n[2] + 0.5 * sp, 0, 1);
      facePath(c, f, R, r); c.fillStyle = ramp(GOLD, f.pent ? b * 0.55 : b); c.fill();
    });
    c.lineJoin = "round";
    TI.forEach(f => { if (R(f.c)[2] < -0.3) return; facePath(c, f, R, r); c.strokeStyle = f.pent ? "rgba(255,226,120,.85)" : "#7a5200"; c.lineWidth = r * (f.pent ? 0.035 : 0.03); c.stroke(); });
  },
  over(c, r, s) { glints(c, r, s, rotM(s.a), 3, 0.9, "#fff1b0"); },
  trail(c, pts, r, t) {
    eachPt(pts, 1, (p, u) => {
      const x = p.x + (hash(p.id * 3) - 0.5) * r * 1.4, y = p.y + (hash(p.id * 5) - 0.5) * r * 1.2 + u * u * r;
      c.globalAlpha = BA * (p.k * (1 - u));
      if (p.id % 4 === 0) {
        const fl = Math.cos(t * 12 + p.id), w = r * 0.3 * Math.max(0.15, Math.abs(fl)), h = r * 0.3;
        c.globalAlpha = BA * (p.k * Math.min(1, (1 - u) * 1.8));
        c.beginPath(); c.ellipse(x, y, w, h, 0, 0, TAU); c.fillStyle = fl > 0 ? "#ffe066" : "#f5c518"; c.fill(); c.strokeStyle = "#b07d00"; c.lineWidth = Math.max(1, r * 0.035); c.stroke();
        c.beginPath(); c.ellipse(x - w * 0.25, y - h * 0.3, w * 0.25, h * 0.2, 0, 0, TAU); c.fillStyle = "rgba(255,255,240,.8)"; c.fill();
      } else sparkle(c, x, y, r * 0.12 * (0.5 + 0.5 * Math.abs(Math.sin(t * 10 + p.id))), "#ffe27a");
    });
    c.globalAlpha = BA;
  },
};


/** Alle Ball-Skins nach ID (IDs wie BALLS in content/config.js) */
export const BALL_SKINS = Object.fromEntries([klassik, leder, wasserball, neon, pixel, planet, disco, gold, eye, graffiti, slime, bubble, glitch, vapor, chrome, candy, galaxy, iceout, rgb, oracle].map(b => [b.id, b]));

/** Ball zeichnen. stretch = { ang, k } (Flug-Dehnung/Aufprall-Stauchung aus dem Spiel) wirkt nur auf den Ballkörper;
 *  Skins mit eigenem Wabbeln (wobble) ignorieren sie. Unbekannte ID → Klassik. */
export function drawBallSkin(c, id, x, y, r, s, stretch = null) {
  const b = BALL_SKINS[id] || BALL_SKINS.klassik;
  if (s.seed === undefined) s = { ...s, seed: 0 };
  BA = c.globalAlpha;
  c.save();
  try {
    c.translate(x, y);
    if (b.under) b.under(c, r, s);
    c.save();
    if (b.wobble) { if (s.hit < 0.6) { const k = 1 + 0.16 * Math.exp(-s.hit * 7) * Math.sin(s.hit * 38); c.scale(k, 1 / k); } }
    else if (stretch && Math.abs(stretch.k - 1) > 0.01) { c.rotate(stretch.ang); c.scale(stretch.k, 1 / Math.sqrt(stretch.k)); c.rotate(-stretch.ang); }
    body(c, b, r, s);
    c.restore();
    if (b.over) b.over(c, r, s);
  } finally { c.restore(); }
}
function body(c, b, r, s) {
  const lw = Math.max(2, r * 0.14);
  if (b.path) {
    const sil = () => { c.beginPath(); b.path(c, r, s); };
    c.lineJoin = "round";
    sil(); c.lineWidth = lw * 1.8; c.strokeStyle = "#fff"; c.stroke(); c.fillStyle = "#fff"; c.fill();
    sil(); c.lineWidth = lw * 0.3; c.strokeStyle = INK; c.stroke(); c.fillStyle = INK; c.fill();
    c.save(); sil(); c.clip(); b.draw(c, r, s);
    if (b.shade !== false) { c.save(); circ(c, 0, 0, r); c.clip(); shade(c, r, b.shade ?? 1); c.restore(); }
    c.restore();
    return;
  }
  if (b.glass) {
    circ(c, 0, 0, r + lw * 0.5); c.lineWidth = lw * 0.8; c.strokeStyle = "#fff"; c.stroke();
    circ(c, 0, 0, r + lw * 0.07); c.lineWidth = lw * 0.15; c.strokeStyle = INK; c.stroke();
  } else {
    circ(c, 0, 0, r + lw * 0.9); c.fillStyle = "#fff"; c.fill();
    circ(c, 0, 0, r + lw * 0.15); c.fillStyle = INK; c.fill();
  }
  c.save(); circ(c, 0, 0, r); c.clip(); b.draw(c, r, s); if (b.shade !== false) shade(c, r, b.shade ?? 1); c.restore();
}
/** Flugspur des Skins zeichnen (vor dem Ball) */
export function drawBallTrail(c, id, pts, r, t) {
  const b = BALL_SKINS[id] || BALL_SKINS.klassik;
  BA = c.globalAlpha; c.save();
  try { b.trail(c, pts, r, t); } finally { c.restore(); }
}

