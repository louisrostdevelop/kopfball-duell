// Darstellung: Kamera, Arenen, Spieler, Ball, Partikel, HUD, Wiederholung
import { W, H, G, GOAL_W, BAR_T, HR, BR, SR, FOOT, COL, SUPERS, POWERUPS, charById, clamp, rand } from "./config.js";
import { drawHead, drawShoe, drawBall, drawPuIcon, shade } from "./art.js";
import { barY, shoePos, pr } from "./physics.js";

const TAU = Math.PI * 2;
const INK = COL.ink;
const TEAM = [COL.p1, COL.p2];

let cv, ctx, cw = 0, ch = 0, dpr = 1, base = { s: 1, ox: 0, oy: 0 };
let quality = "high";
const cam = { z: 1, x: W / 2, y: H / 2, shake: 0, sx: 0, sy: 0, flash: 0, flashCol: "#fff" };
let bgCanvas = null, bgKey = "";
const parts = [];
const callouts = [];
const trail = [];
let netHit = [{ t: 9, y: 0, p: 0 }, { t: 9, y: 0, p: 0 }];
let crowdHype = 0, crowdPeople = null, flashes = [];

export function initRender(canvas) {
  cv = canvas; ctx = cv.getContext("2d", { alpha: false });
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));
}
export function setQuality(q) { quality = q; bgKey = ""; resize(); }
export function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.25);
  if (vw * vh * dpr * dpr > 3.2e6) dpr = Math.sqrt(3.2e6 / (vw * vh));
  cw = vw; ch = vh;
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  cv.style.width = vw + "px"; cv.style.height = vh + "px";
  // Feld so groß wie möglich: Breite füllen, notfalls etwas vom Himmel abschneiden
  const sFit = Math.min(vw / W, vh / H);
  const sW = vw / W;
  // Auf flachen Handybildschirmen: Feld nutzt die volle Breite, oben wird Himmel abgeschnitten (bis 22 %)
  let s = sFit;
  if (sW > sFit && vh / (sW * H) > 0.78) s = sW;
  base.s = s;
  base.ox = (vw - W * s) / 2;
  // Boden unten verankern
  base.oy = vh - H * s;
  if (base.oy > 0) base.oy = (vh - H * s) * 0.55;
  bgKey = "";
}
export function viewInfo() { return { cw, ch, s: base.s, ox: base.ox, oy: base.oy }; }

// ---------- Effekte-API ----------
export const fx = {
  shake(a) { cam.shake = Math.min(26, cam.shake + a); },
  flash(col = "#fff", a = 0.6) { cam.flash = a; cam.flashCol = col; },
  callout(text, col = COL.gold, sub = "", dur = 1.6, size = 1) { callouts.push({ text, col, sub, t: 0, dur, size }); if (callouts.length > 3) callouts.shift(); },
  hype(v) { crowdHype = Math.max(crowdHype, v); },
  net(side, y, p) { netHit[side] = { t: 0, y, p }; },
  clearTrail() { trail.length = 0; },
  clear() { parts.length = 0; callouts.length = 0; trail.length = 0; },
  burst(type, x, y, o = {}) { burst(type, x, y, o); },
};

function P(o) { if (parts.length > (quality === "high" ? 900 : 350)) parts.shift(); parts.push(Object.assign({ vx: 0, vy: 0, life: 1, max: 1, size: 4, col: "#fff", g: 0, rot: 0, vr: 0, add: false, drag: 0 }, o)); }

function burst(type, x, y, o) {
  const n = (k) => quality === "high" ? k : Math.ceil(k / 2);
  switch (type) {
    case "dust": for (let i = 0; i < n(o.n || 8); i++) P({ type: "smoke", x: x + rand(-14, 14), y: y - 4, vx: rand(-90, 90) + (o.vx || 0), vy: rand(-80, -10), life: rand(0.35, 0.6), size: rand(6, 12), col: o.col || "rgba(255,255,255,.5)", drag: 3 }); break;
    case "kick": {
      const pow = o.pow || 1;
      P({ type: "ring", x, y, life: 0.3, max: 0.3, size: 10, grow: 260 * pow, col: "#fff", add: true });
      for (let i = 0; i < n(10 * pow); i++) { const a = rand(0, TAU), sp = rand(200, 600) * pow; P({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.15, 0.35), size: rand(2, 4), col: pow > 1.4 ? COL.gold : "#fff", add: true, drag: 4 }); }
      break;
    }
    case "head":
      for (let i = 0; i < n(6); i++) { const a = rand(0, TAU); P({ type: "star", x, y, vx: Math.cos(a) * 220, vy: Math.sin(a) * 220 - 60, life: 0.45, size: rand(5, 9), col: COL.gold, vr: rand(-8, 8), drag: 3 }); }
      break;
    case "goal": {
      const cols = [o.col || COL.gold, "#fff", COL.gold, "#ff4fd8", "#3ddc84"];
      for (let i = 0; i < n(140); i++) P({ type: "conf", x: x + rand(-40, 40), y: y + rand(-40, 40), vx: rand(-700, 700), vy: rand(-1100, -200), life: rand(1.4, 2.6), size: rand(6, 12), col: cols[i % cols.length], g: 1400, rot: rand(0, TAU), vr: rand(-14, 14), drag: 1.6 });
      for (let i = 0; i < 3; i++) P({ type: "ring", x, y, life: 0.6 + i * 0.15, max: 0.6 + i * 0.15, size: 20, grow: 900, col: o.col || "#fff", add: true, w: 10 });
      break;
    }
    case "pu":
      for (let i = 0; i < n(18); i++) { const a = i / 18 * TAU; P({ type: "spark", x, y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, life: 0.4, size: 3, col: o.col, add: true, drag: 3 }); }
      P({ type: "ring", x, y, life: 0.4, max: 0.4, size: 20, grow: 300, col: o.col, add: true, w: 6 });
      break;
    case "super":
      for (let i = 0; i < n(30); i++) { const a = rand(0, TAU), sp = rand(300, 900); P({ type: "spark", x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rand(0.25, 0.5), size: rand(3, 6), col: o.col, add: true, drag: 3 }); }
      P({ type: "ring", x, y, life: 0.5, max: 0.5, size: 30, grow: 700, col: o.col, add: true, w: 14 });
      break;
    case "stomp":
      for (let i = 0; i < n(8); i++) { const a = rand(Math.PI, TAU); P({ type: "star", x, y, vx: Math.cos(a) * 260, vy: Math.sin(a) * 260, life: 0.5, size: rand(6, 10), col: "#fff", vr: 6, drag: 3 }); }
      break;
    case "freeze":
      for (let i = 0; i < n(16); i++) { const a = rand(0, TAU); P({ type: "shard", x, y, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, life: 0.6, size: rand(5, 10), col: "#bdf3ff", rot: a, vr: 5, g: 600, drag: 2 }); }
      break;
    case "quake":
      for (let i = 0; i < n(30); i++) P({ type: "rock", x: x + rand(-60, 60), y, vx: rand(-500, 500), vy: rand(-900, -300), life: rand(0.6, 1.1), size: rand(5, 11), col: "#7a5a40", g: 1800, rot: rand(0, TAU), vr: rand(-10, 10) });
      P({ type: "ring", x, y, life: 0.5, max: 0.5, size: 20, grow: 900, col: "#ffb366", add: true, w: 16, flat: true });
      break;
    case "zap": bolt(x, y, o.col || COL.gold); break;
    case "post":
      for (let i = 0; i < n(10); i++) { const a = rand(0, TAU); P({ type: "spark", x, y, vx: Math.cos(a) * 400, vy: Math.sin(a) * 400, life: 0.25, size: 3, col: "#fff", add: true, drag: 4 }); }
      break;
    case "text": P({ type: "text", x, y, vy: -80, life: 0.9, max: 0.9, text: o.text, col: o.col || "#fff", size: o.size || 26 }); break;
  }
}
function bolt(x, y, col) {
  const pts = []; let px = x, py = y - 160;
  for (let i = 0; i < 7; i++) { pts.push([px, py]); px += rand(-30, 30); py += 30; }
  P({ type: "bolt", x, y, pts, life: 0.18, max: 0.18, col, add: true });
}

function tickParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vy += p.g * dt; if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    if (p.type === "conf" && p.y > G - 4) { p.y = G - 4; p.vy *= -0.2; p.vx *= 0.6; p.vr *= 0.5; }
    if (p.type === "rock" && p.y > G) { p.y = G; p.vy *= -0.3; p.vx *= 0.6; }
  }
}
function drawParts(addPass) {
  for (const p of parts) {
    if (!!p.add !== addPass) continue;
    const k = p.life / (p.max || 1), a = clamp(p.max ? p.life / p.max : p.life, 0, 1);
    ctx.globalAlpha = Math.min(1, a * 1.4);
    switch (p.type) {
      case "smoke": ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - a), 0, TAU); ctx.fill(); break;
      case "spark": ctx.strokeStyle = p.col; ctx.lineWidth = p.size; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); break;
      case "dot": ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU); ctx.fill(); break;
      case "ring": ctx.strokeStyle = p.col; ctx.lineWidth = (p.w || 5) * a; ctx.beginPath(); if (p.flat) ctx.ellipse(p.x, p.y, p.size + (1 - a) * p.grow, (p.size + (1 - a) * p.grow) * 0.18, 0, 0, TAU); else ctx.arc(p.x, p.y, p.size + (1 - a) * p.grow, 0, TAU); ctx.stroke(); break;
      case "star": starShape(p.x, p.y, p.size, p.rot); ctx.fillStyle = p.col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); break;
      case "conf": ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7)); ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); break;
      case "shard": case "rock": ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, p.size * 0.5); ctx.lineTo(-p.size * 0.6, p.size * 0.5); ctx.closePath(); ctx.fillStyle = p.col; ctx.fill(); if (p.type === "shard") { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); } ctx.restore(); break;
      case "flame": { const r = p.size * (0.4 + a * 0.8); const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, "rgba(255,240,180,.95)"); g.addColorStop(0.4, p.col); g.addColorStop(1, "rgba(255,60,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); break; }
      case "bolt": ctx.strokeStyle = p.col; ctx.lineWidth = 5; ctx.beginPath(); p.pts.forEach(([x, y], n) => n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); break;
      case "text": ctx.font = `${p.size}px Bungee, Impact, sans-serif`; ctx.textAlign = "center"; ctx.lineWidth = 5; ctx.strokeStyle = INK; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y); break;
    }
  }
  ctx.globalAlpha = 1;
}
function starShape(x, y, r, rot) {
  ctx.beginPath();
  for (let k = 0; k < 8; k++) { const a = rot + k * Math.PI / 4, rr = k % 2 ? r * 0.4 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}

// ---------- Hintergründe ----------
const FT = 425; // obere Kante des Rasens (Tiefe)
let seedN = 1;
const srand = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };

function buildBg(arena) {
  const key = arena + "|" + cw + "x" + ch + "|" + dpr + "|" + base.s;
  if (key === bgKey && bgCanvas) return;
  bgKey = key;
  const pad = 60;
  bgCanvas = bgCanvas || document.createElement("canvas");
  bgCanvas.width = Math.round((cw + pad * 2) * dpr); bgCanvas.height = Math.round((ch + pad * 2) * dpr);
  const b = bgCanvas.getContext("2d");
  b.setTransform(dpr * base.s, 0, 0, dpr * base.s, (base.ox + pad) * dpr, (base.oy + pad) * dpr);
  const x0 = (-base.ox - pad) / base.s, x1 = (cw - base.ox + pad) / base.s;
  const y0 = (-base.oy - pad) / base.s, y1 = (ch - base.oy + pad) / base.s;
  seedN = 12345;
  const R = { x0, x1, y0, y1 };
  ({ stadion: bgStadion, strand: bgStrand, neon: bgNeon, eis: bgEis, mond: bgMond }[arena] || bgStadion)(b, R);
  crowdPeople = makeCrowd(arena, R);
}

function turf(b, R, c1, c2, lines = true) {
  // Rasen mit Mähstreifen in leichter Perspektive
  const n = 14;
  for (let i = -4; i < n + 4; i++) {
    const xa = i * W / n, xb = (i + 1) * W / n;
    const pa = (x) => W / 2 + (x - W / 2) * 0.86;
    b.beginPath(); b.moveTo(pa(xa), FT); b.lineTo(pa(xb), FT); b.lineTo(xb, G); b.lineTo(xa, G); b.closePath();
    b.fillStyle = i % 2 ? c1 : c2; b.fill();
  }
  const g = b.createLinearGradient(0, FT, 0, G);
  g.addColorStop(0, "rgba(0,0,0,.35)"); g.addColorStop(0.35, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(255,255,255,.06)");
  b.fillStyle = g; b.fillRect(R.x0, FT, R.x1 - R.x0, G - FT);
  if (lines) {
    b.strokeStyle = "rgba(255,255,255,.65)"; b.lineWidth = 4;
    b.beginPath(); b.moveTo(W / 2, FT + 4); b.lineTo(W / 2, G); b.stroke();
    b.beginPath(); b.ellipse(W / 2, (FT + G) / 2 + 8, 150, 52, 0, 0, TAU); b.stroke();
    b.beginPath(); b.moveTo(W / 2 - W * 0.43, FT + 4); b.lineTo(W / 2 + W * 0.43, FT + 4); b.stroke();
    [0, 1].forEach(s => { const x = s ? W - GOAL_W - 120 : GOAL_W + 120; b.beginPath(); b.moveTo(s ? W : 0, FT + 40); b.lineTo(x + (s ? 20 : -20), FT + 40); b.lineTo(x, G); b.stroke(); });
  }
}
function ground(b, R, top, bot) {
  const g = b.createLinearGradient(0, G, 0, R.y1); g.addColorStop(0, top); g.addColorStop(1, bot);
  b.fillStyle = g; b.fillRect(R.x0, G, R.x1 - R.x0, R.y1 - G);
  b.fillStyle = "rgba(255,255,255,.5)"; b.fillRect(R.x0, G, R.x1 - R.x0, 3);
}
function stands(b, R, c1, c2, topY) {
  // Tribünenränge
  for (let i = 0; i < 6; i++) {
    const y = topY + i * ((FT - 40 - topY) / 6);
    b.fillStyle = i % 2 ? c1 : c2; b.fillRect(R.x0, y, R.x1 - R.x0, (FT - 40 - topY) / 6 + 1);
  }
  b.fillStyle = shade(c1, -0.4); b.fillRect(R.x0, FT - 40, R.x1 - R.x0, 40);
}
function bgStadion(b, R) {
  const sky = b.createLinearGradient(0, R.y0, 0, FT);
  sky.addColorStop(0, "#050a1f"); sky.addColorStop(0.6, "#11265a"); sky.addColorStop(1, "#23408a");
  b.fillStyle = sky; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
  for (let i = 0; i < 90; i++) { b.fillStyle = `rgba(255,255,255,${0.2 + srand() * 0.5})`; b.fillRect(R.x0 + srand() * (R.x1 - R.x0), R.y0 + srand() * (60 - R.y0), 2, 2); }
  // Dachkante
  b.fillStyle = "#0a1433"; b.beginPath(); b.moveTo(R.x0, 70); b.quadraticCurveTo(W / 2, 30, R.x1, 70); b.lineTo(R.x1, 110); b.quadraticCurveTo(W / 2, 75, R.x0, 110); b.fill();
  stands(b, R, "#16285c", "#1b3170", 105);
  // Flutlichtmasten
  [[-40, 0], [W + 40, 0]].forEach(([x]) => {
    b.fillStyle = "#0a1433"; b.fillRect(x - 6, -40, 12, 160);
    b.fillStyle = "#1d2c55"; b.fillRect(x - 70, -120, 140, 80);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { b.fillStyle = "#fffbe0"; b.beginPath(); b.arc(x - 52 + i * 35, -100 + j * 38, 12, 0, TAU); b.fill(); }
  });
  // Werbebanden
  b.fillStyle = "#0a1433"; b.fillRect(R.x0, FT - 46, R.x1 - R.x0, 40);
  turf(b, R, "#22a04c", "#1d9144");
  ground(b, R, "#16753a", "#0b3d1f");
}
function bgStrand(b, R) {
  const sky = b.createLinearGradient(0, R.y0, 0, FT);
  sky.addColorStop(0, "#3b1c6e"); sky.addColorStop(0.45, "#ff5f8f"); sky.addColorStop(0.85, "#ffb35c"); sky.addColorStop(1, "#ffd27a");
  b.fillStyle = sky; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
  // Sonne
  const sg = b.createRadialGradient(W / 2, 330, 10, W / 2, 330, 260); sg.addColorStop(0, "rgba(255,240,160,.9)"); sg.addColorStop(1, "rgba(255,200,120,0)");
  b.fillStyle = sg; b.fillRect(W / 2 - 260, 70, 520, 330);
  b.fillStyle = "#ffe98a"; b.beginPath(); b.arc(W / 2, 330, 110, Math.PI, TAU); b.fill();
  b.fillStyle = "rgba(255,120,150,.6)"; for (let i = 0; i < 5; i++) b.fillRect(W / 2 - 120, 250 + i * 16, 240, 5 + i);
  // Meer
  const sea = b.createLinearGradient(0, 330, 0, FT); sea.addColorStop(0, "#5e3fa0"); sea.addColorStop(1, "#2a7fc0");
  b.fillStyle = sea; b.fillRect(R.x0, 330, R.x1 - R.x0, FT - 330);
  b.strokeStyle = "rgba(255,220,150,.55)"; b.lineWidth = 3;
  for (let i = 0; i < 9; i++) { const y = 345 + i * 13, w = 30 + i * 12; for (let k = 0; k < 6; k++) { const x = W / 2 + (srand() - 0.5) * (200 + i * 100); b.beginPath(); b.moveTo(x - w / 2, y); b.lineTo(x + w / 2, y); b.stroke(); } }
  // Palmen
  [[-60, 1], [70, 1], [W - 70, -1], [W + 70, -1]].forEach(([x, d], n) => palm(b, x, FT + 10, d, n % 2 ? 0.8 : 1));
  // Sand
  const sand = b.createLinearGradient(0, FT, 0, G); sand.addColorStop(0, "#e8b56e"); sand.addColorStop(1, "#f6d394");
  b.fillStyle = sand; b.fillRect(R.x0, FT, R.x1 - R.x0, G - FT);
  for (let i = 0; i < 400; i++) { b.fillStyle = srand() > 0.5 ? "rgba(160,110,50,.25)" : "rgba(255,255,255,.3)"; b.fillRect(R.x0 + srand() * (R.x1 - R.x0), FT + srand() * (G - FT), 3, 2); }
  b.strokeStyle = "rgba(255,255,255,.75)"; b.lineWidth = 4; b.setLineDash([18, 12]);
  b.beginPath(); b.moveTo(W / 2, FT + 10); b.lineTo(W / 2, G); b.stroke(); b.setLineDash([]);
  ground(b, R, "#d9a85f", "#8a5a26");
}
function palm(b, x, y, d, s) {
  b.save(); b.translate(x, y); b.scale(s, s);
  b.strokeStyle = "#2a1236"; b.lineWidth = 16; b.lineCap = "round";
  b.beginPath(); b.moveTo(0, 0); b.quadraticCurveTo(d * 40, -150, d * 20, -300); b.stroke();
  b.fillStyle = "#2a1236";
  for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + (k - 2.5) * 0.55; b.beginPath(); b.moveTo(d * 20, -300); b.quadraticCurveTo(d * 20 + Math.cos(a) * 90, -300 + Math.sin(a) * 90 - 30, d * 20 + Math.cos(a) * 160, -300 + Math.sin(a) * 160 + 40); b.quadraticCurveTo(d * 20 + Math.cos(a) * 80, -300 + Math.sin(a) * 60, d * 20, -300); b.fill(); }
  b.restore();
}
function bgNeon(b, R) {
  const sky = b.createLinearGradient(0, R.y0, 0, FT);
  sky.addColorStop(0, "#07021a"); sky.addColorStop(0.6, "#2a0b4f"); sky.addColorStop(1, "#5a1270");
  b.fillStyle = sky; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
  // Mond
  b.fillStyle = "rgba(255,79,216,.18)"; b.beginPath(); b.arc(W * 0.7, 120, 90, 0, TAU); b.fill();
  b.fillStyle = "#ff8be8"; b.beginPath(); b.arc(W * 0.7, 120, 52, 0, TAU); b.fill();
  // Skyline in zwei Ebenen
  [[0.55, "#1a0b38", 220], [1, "#0e0626", 120]].forEach(([depth, col, hy]) => {
    let x = R.x0;
    while (x < R.x1) {
      const w = 40 + srand() * 90, h = hy + srand() * 200 * depth;
      b.fillStyle = col; b.fillRect(x, FT - 40 - h, w, h + 40);
      for (let yy = FT - 30 - h; yy < FT - 50; yy += 16) for (let xx = x + 6; xx < x + w - 8; xx += 12) if (srand() > 0.6) { b.fillStyle = srand() > 0.5 ? "rgba(255,79,216,.7)" : "rgba(34,211,238,.6)"; b.fillRect(xx, yy, 5, 7); }
      x += w + 6;
    }
  });
  // Neon-Schilder
  b.font = "34px Bungee, Impact"; b.textAlign = "center";
  [["KOPFBALL", 230, 190, "#22d3ee"], ["DUELL", W - 230, 170, "#ff4fd8"]].forEach(([t, x, y, c]) => { b.shadowColor = c; b.shadowBlur = 24; b.fillStyle = c; b.fillText(t, x, y); });
  b.shadowBlur = 0;
  // Dachboden mit Raster
  b.fillStyle = "#140a2e"; b.fillRect(R.x0, FT - 10, R.x1 - R.x0, G - FT + 10);
  b.strokeStyle = "rgba(255,79,216,.55)"; b.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const t = i / 8, y = FT + (G - FT) * t * t; b.beginPath(); b.moveTo(R.x0, y); b.lineTo(R.x1, y); b.stroke(); }
  for (let i = -20; i <= 20; i++) { b.beginPath(); b.moveTo(W / 2 + i * 40, FT); b.lineTo(W / 2 + i * 140, G); b.stroke(); }
  b.strokeStyle = "#22d3ee"; b.lineWidth = 4; b.shadowColor = "#22d3ee"; b.shadowBlur = 12;
  b.beginPath(); b.moveTo(W / 2, FT); b.lineTo(W / 2, G); b.stroke(); b.shadowBlur = 0;
  ground(b, R, "#2a0f4a", "#0a0418");
}
function bgEis(b, R) {
  const sky = b.createLinearGradient(0, R.y0, 0, FT);
  sky.addColorStop(0, "#04131f"); sky.addColorStop(1, "#0f3346");
  b.fillStyle = sky; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
  // Hallendach-Träger
  b.strokeStyle = "#0a2433"; b.lineWidth = 10;
  for (let x = R.x0; x < R.x1; x += 140) { b.beginPath(); b.moveTo(x, R.y0); b.lineTo(x + 70, 80); b.lineTo(x + 140, R.y0); b.stroke(); }
  // Videowürfel
  b.fillStyle = "#081a26"; b.fillRect(W / 2 - 110, -40, 220, 110); b.strokeStyle = "#22d3ee"; b.lineWidth = 3; b.strokeRect(W / 2 - 110, -40, 220, 110);
  stands(b, R, "#123447", "#16405a", 110);
  b.fillStyle = "#e9f7ff"; b.fillRect(R.x0, FT - 46, R.x1 - R.x0, 40);
  b.fillStyle = "#22d3ee"; b.fillRect(R.x0, FT - 10, R.x1 - R.x0, 4);
  const ice = b.createLinearGradient(0, FT, 0, G); ice.addColorStop(0, "#9fdcf0"); ice.addColorStop(1, "#e6fbff");
  b.fillStyle = ice; b.fillRect(R.x0, FT - 6, R.x1 - R.x0, G - FT + 6);
  b.strokeStyle = "rgba(255,255,255,.7)"; b.lineWidth = 2;
  for (let i = 0; i < 40; i++) { const x = R.x0 + srand() * (R.x1 - R.x0), y = FT + srand() * (G - FT); b.beginPath(); b.moveTo(x, y); b.lineTo(x + 40 + srand() * 60, y + srand() * 8); b.stroke(); }
  b.strokeStyle = "rgba(230,40,60,.7)"; b.lineWidth = 6; b.beginPath(); b.moveTo(W / 2, FT); b.lineTo(W / 2, G); b.stroke();
  b.strokeStyle = "rgba(34,120,220,.6)"; [W * 0.3, W * 0.7].forEach(x => { b.beginPath(); b.moveTo(x, FT); b.lineTo(x, G); b.stroke(); });
  b.strokeStyle = "rgba(230,40,60,.7)"; b.lineWidth = 4; b.beginPath(); b.ellipse(W / 2, (FT + G) / 2, 110, 40, 0, 0, TAU); b.stroke();
  ground(b, R, "#bfe9f7", "#5aa5c4");
}
function bgMond(b, R) {
  b.fillStyle = "#03030a"; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0 + 40);
  for (let i = 0; i < 260; i++) { const s = srand() * 2.5 + 0.5; b.fillStyle = `rgba(255,255,255,${0.3 + srand() * 0.7})`; b.fillRect(R.x0 + srand() * (R.x1 - R.x0), R.y0 + srand() * (FT - R.y0), s, s); }
  // Erde
  const ex = W * 0.78, ey = 150;
  const eg = b.createRadialGradient(ex - 30, ey - 30, 10, ex, ey, 90); eg.addColorStop(0, "#5ab0ff"); eg.addColorStop(1, "#103a8a");
  b.fillStyle = "rgba(90,176,255,.2)"; b.beginPath(); b.arc(ex, ey, 104, 0, TAU); b.fill();
  b.fillStyle = eg; b.beginPath(); b.arc(ex, ey, 88, 0, TAU); b.fill();
  b.fillStyle = "#3ddc84"; [[-30, -20, 30], [25, 20, 26], [-5, 45, 16]].forEach(([dx, dy, r]) => { b.beginPath(); b.ellipse(ex + dx, ey + dy, r, r * 0.6, dx, 0, TAU); b.fill(); });
  b.fillStyle = "rgba(255,255,255,.6)"; b.beginPath(); b.ellipse(ex + 10, ey - 40, 40, 8, 0.2, 0, TAU); b.fill();
  // Hügel
  b.fillStyle = "#3a3c4a"; b.beginPath(); b.moveTo(R.x0, FT); for (let x = R.x0; x <= R.x1; x += 60) b.lineTo(x, FT - 30 - Math.abs(Math.sin(x * 0.007)) * 80); b.lineTo(R.x1, FT); b.fill();
  const gr = b.createLinearGradient(0, FT, 0, G); gr.addColorStop(0, "#6e7080"); gr.addColorStop(1, "#a9abb8");
  b.fillStyle = gr; b.fillRect(R.x0, FT - 4, R.x1 - R.x0, G - FT + 4);
  for (let i = 0; i < 24; i++) { const x = R.x0 + srand() * (R.x1 - R.x0), y = FT + 20 + srand() * (G - FT - 30), r = 10 + srand() * 34; b.fillStyle = "rgba(0,0,0,.18)"; b.beginPath(); b.ellipse(x, y, r, r * 0.3, 0, 0, TAU); b.fill(); b.fillStyle = "rgba(255,255,255,.12)"; b.beginPath(); b.ellipse(x, y + 3, r * 0.8, r * 0.2, 0, 0, Math.PI); b.fill(); }
  b.strokeStyle = "rgba(255,255,255,.4)"; b.lineWidth = 3; b.setLineDash([10, 10]); b.beginPath(); b.moveTo(W / 2, FT); b.lineTo(W / 2, G); b.stroke(); b.setLineDash([]);
  // Flagge
  b.fillStyle = "#ddd"; b.fillRect(W / 2 - 2, FT - 110, 4, 110); b.fillStyle = COL.p1; b.fillRect(W / 2 + 2, FT - 110, 50, 16); b.fillStyle = COL.p2; b.fillRect(W / 2 + 2, FT - 94, 50, 16);
  ground(b, R, "#8d8f9c", "#3a3c48");
}

// Publikum: einfache Figuren, die bei Toren hüpfen
function makeCrowd(arena, R) {
  if (arena === "mond" || arena === "neon") return [];
  const out = [];
  if (arena === "strand") {
    for (let i = 0; i < 26; i++) out.push({ x: R.x0 + srand() * (R.x1 - R.x0), y: FT - 8 - srand() * 30, c: srand() > 0.5 ? COL.p1 : COL.p2, s: 0.9 + srand() * 0.3, ph: srand() * 7 });
    return out;
  }
  const rows = 7, top = 118;
  for (let r = 0; r < rows; r++) {
    const y = top + r * ((FT - 60 - top) / rows) + 20;
    for (let x = R.x0 + (r % 2) * 11; x < R.x1; x += 21 + srand() * 7) {
      if (srand() < 0.08) continue;
      const side = x < W / 2 ? 0 : 1, t = srand();
      out.push({ x, y, c: t < 0.7 ? TEAM[side] : t < 0.85 ? "#f7f5ef" : COL.gold, s: 0.75 + r * 0.04, ph: srand() * 7, skin: ["#f2c79b", "#c98b5e", "#8d5a3b", "#ffe0c4"][Math.floor(srand() * 4)] });
    }
  }
  return out;
}
function drawCrowd(t) {
  if (!crowdPeople) return;
  const hype = crowdHype;
  for (const p of crowdPeople) {
    const j = Math.max(0, Math.sin(t * (6 + hype * 6) + p.ph)) * (1.5 + hype * 9) * p.s;
    const y = p.y - j;
    ctx.fillStyle = p.c; ctx.fillRect(p.x - 6 * p.s, y - 2, 12 * p.s, 14 * p.s);
    ctx.fillStyle = p.skin || "#f2c79b"; ctx.beginPath(); ctx.arc(p.x, y - 7 * p.s, 5.5 * p.s, 0, TAU); ctx.fill();
    if (hype > 0.4 && Math.sin(p.ph * 3) > 0.2) { ctx.fillStyle = p.c; ctx.fillRect(p.x - 9 * p.s, y - 16 * p.s - j * 0.5, 3 * p.s, 10 * p.s); ctx.fillRect(p.x + 6 * p.s, y - 16 * p.s - j * 0.5, 3 * p.s, 10 * p.s); }
  }
  // Tribüne abdunkeln, damit das Feld heraussticht
  const dk = ctx.createLinearGradient(0, 60, 0, FT - 40);
  dk.addColorStop(0, "rgba(5,10,30,.55)"); dk.addColorStop(1, "rgba(5,10,30,.18)");
  ctx.fillStyle = dk; ctx.fillRect(-900, 60, W + 1800, FT - 100);
  // Kamerablitze
  if (Math.random() < 0.08 + hype * 0.6) flashes.push({ x: rand(-200, W + 200), y: rand(120, FT - 60), t: 0.12 });
  ctx.globalCompositeOperation = "lighter";
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.t -= 1 / 60; if (f.t <= 0) { flashes.splice(i, 1); continue; }
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 22); g.addColorStop(0, "rgba(255,255,255,.95)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(f.x - 22, f.y - 22, 44, 44);
  }
  ctx.globalCompositeOperation = "source-over";
}

function boards(st, t) {
  if (!["stadion", "eis"].includes(st.arena)) return;
  const y = FT - 44, h = 36;
  const msgs = ["KOPFBALL DUELL", "⚽ TOR TOR TOR", "SUPERSCHUSS", "REVANCHE?"];
  ctx.save(); ctx.beginPath(); ctx.rect(-900, y, W + 1800, h); ctx.clip();
  ctx.fillStyle = st.arena === "eis" ? "#0c2a3a" : "#0a1433"; ctx.fillRect(-900, y, W + 1800, h);
  ctx.font = "24px Bungee, Impact"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  const off = (t * 90) % 420;
  for (let i = -4; i < 10; i++) { const m = msgs[(i + 40) % msgs.length]; ctx.fillStyle = i % 2 ? COL.p1 : (st.arena === "eis" ? "#e9f7ff" : COL.gold); ctx.fillText(m, i * 420 - off - 300, y + h / 2 + 1); }
  ctx.restore();
}

function lights(st, t) {
  if (st.arena === "stadion") {
    ctx.globalCompositeOperation = "lighter";
    [[-40, -80], [W + 40, -80]].forEach(([x, y], n) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(n ? 0.55 : -0.55);
      const g = ctx.createLinearGradient(0, 0, 0, 800); g.addColorStop(0, "rgba(255,250,220,.22)"); g.addColorStop(1, "rgba(255,250,220,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(60, 0); ctx.lineTo(260, 800); ctx.lineTo(-260, 800); ctx.fill(); ctx.restore();
    });
    ctx.globalCompositeOperation = "source-over";
  }
  if (st.arena === "neon") {
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, FT - 60, 0, G); g.addColorStop(0, "rgba(255,79,216,0)"); g.addColorStop(1, `rgba(255,79,216,${0.08 + Math.sin(t * 2) * 0.03})`);
    ctx.fillStyle = g; ctx.fillRect(-900, FT - 60, W + 1800, G - FT + 60);
    ctx.globalCompositeOperation = "source-over";
  }
  if (st.arena === "strand") {
    // Wellen glitzern
    ctx.fillStyle = "rgba(255,240,200,.5)";
    for (let i = 0; i < 6; i++) { const x = W / 2 + Math.sin(t * 0.8 + i * 2) * 300, y = 360 + i * 14; ctx.fillRect(x, y, 20 + i * 4, 2); }
  }
}

// ---------- Tore ----------
function goalBack(st, side, t) {
  const by = barY(st, side), x0 = side ? W - GOAL_W : 0, d = side ? -1 : 1;
  const xb = side ? W : 0; // Rückwand
  const nh = netHit[side]; nh.t += 1 / 60;
  ctx.save();
  // Netz-Hintergrund
  ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(Math.min(x0, xb), by, GOAL_W, G - by);
  ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1.5;
  const wob = (y) => nh.t < 1.2 ? Math.sin(nh.t * 18 - Math.abs(y - nh.y) * 0.04) * Math.exp(-nh.t * 3) * 22 * nh.p * Math.exp(-Math.abs(y - nh.y) / 120) : 0;
  for (let k = 0; k <= GOAL_W; k += 12) {
    ctx.beginPath();
    for (let y = by; y <= G; y += 12) { const off = wob(y) * (1 - k / GOAL_W); ctx.lineTo(xb + d * (k + off * -1), y); }
    ctx.stroke();
  }
  for (let y = by; y <= G; y += 12) { ctx.beginPath(); ctx.moveTo(xb, y); ctx.lineTo(xb + d * (GOAL_W + wob(y) * 0), y); ctx.stroke(); }
  ctx.restore();
}
function goalFront(st, side, t) {
  const by = barY(st, side), x0 = side ? W - GOAL_W : 0;
  const big = st.bigGoal[side] > 0;
  ctx.save();
  ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.rect(x0 - 2, by - BAR_T / 2, GOAL_W + 4, BAR_T); ctx.fill(); ctx.stroke();
  const px = side ? W - GOAL_W - 5 : GOAL_W - 5;
  ctx.beginPath(); ctx.rect(px, by - BAR_T / 2, 10, G - by + BAR_T / 2); ctx.fill(); ctx.stroke();
  if (big) { ctx.globalCompositeOperation = "lighter"; ctx.fillStyle = `rgba(255,79,216,${0.4 + Math.sin(t * 10) * 0.2})`; ctx.fillRect(x0, by - 8, GOAL_W, 16); ctx.globalCompositeOperation = "source-over"; }
  if (st.wall[side] > 0) {
    const wx = side ? W - GOAL_W - 10 : GOAL_W + 10, a = Math.min(1, st.wall[side]) * (0.6 + Math.sin(t * 12) * 0.15);
    ctx.globalAlpha = a; ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(wx - 14, 0, wx + 14, 0); g.addColorStop(0, "rgba(120,200,255,0)"); g.addColorStop(0.5, "rgba(170,230,255,.9)"); g.addColorStop(1, "rgba(120,200,255,0)");
    ctx.fillStyle = g; ctx.fillRect(wx - 14, by + BAR_T / 2, 28, G - by);
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "#e6f7ff"; ctx.lineWidth = 2;
    for (let y = by + 20; y < G; y += 26) { ctx.beginPath(); ctx.moveTo(wx - 7, y); ctx.lineTo(wx + 7, y + 13); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// ---------- Spieler ----------
function drawPlayer(st, p, t, label) {
  const c = charById(p.ch), r = pr(p), col = TEAM[p.i];
  const s = shoePos(p);
  // Schatten
  const sh = clamp(1 - (G - (p.y + (FOOT + SR) * p.sc)) / 500, 0.3, 1);
  ctx.fillStyle = "rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(p.x, G + 2, r * 0.95 * sh, 9 * sh, 0, 0, TAU); ctx.fill();
  // Team-Glow
  ctx.globalCompositeOperation = "lighter";
  const gg = ctx.createRadialGradient(p.x, G, 2, p.x, G, r * 1.4); gg.addColorStop(0, col + "66"); gg.addColorStop(1, col + "00");
  ctx.fillStyle = gg; ctx.beginPath(); ctx.ellipse(p.x, G, r * 1.4, 16, 0, 0, TAU); ctx.fill();
  ctx.globalCompositeOperation = "source-over";
  // Super-Aura
  if (p.armed > 0 || p.fireNext) {
    const sc = p.fireNext ? SUPERS.fire.col : SUPERS[c.super].col;
    ctx.globalCompositeOperation = "lighter";
    for (let k = 0; k < 3; k++) {
      const rr = r * (1.25 + k * 0.14 + Math.sin(t * 9 + k) * 0.05);
      ctx.strokeStyle = sc; ctx.globalAlpha = 0.5 - k * 0.14; ctx.lineWidth = 6 - k;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr, t * 5 + k, t * 5 + k + 4.5); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  // Lade-Ring
  if (p.kHeld && p.charge > 0) {
    ctx.strokeStyle = "rgba(0,0,0,.4)"; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(p.x, p.y, r + 16, 0, TAU); ctx.stroke();
    ctx.strokeStyle = p.charge >= 1 ? (Math.sin(t * 30) > 0 ? COL.gold : "#fff") : col; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 16, -Math.PI / 2, -Math.PI / 2 + TAU * p.charge); ctx.stroke();
  }
  // Squash beim Landen
  const sq = p.land > 0 ? 1 - p.land * 0.9 : 1;
  ctx.save();
  ctx.translate(p.x, p.y + r); ctx.scale(1 + (1 - sq) * 0.6, sq); ctx.translate(-p.x, -p.y - r);
  // Schuh
  drawShoe(ctx, s.x, s.y, SR * p.sc, p.dir, col, p.kick > 0 ? -p.dir * 0.6 * s.k : p.kHeld && p.charge > 0 ? p.dir * p.charge * 0.5 : 0);
  const b = st.b;
  const look = Math.atan2(b.y - p.y, b.x - p.x);
  const blink = Math.sin(t * 1.3 + p.i * 2) > 0.985;
  drawHead(ctx, p.ch, p.x, p.y, r, { dir: p.dir, look, mood: p.stun > 0 ? "sad" : p.mood, blink, effort: (p.kHeld && p.charge > 0.2) || p.kick > 0.1, frozen: p.frz > 0, t: t + p.i * 3 });
  ctx.restore();
  // Eisblock
  if (p.frz > 0) {
    ctx.save(); ctx.globalAlpha = 0.55; ctx.fillStyle = "#bdf3ff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.rect(p.x - r * 1.2, p.y - r * 1.25, r * 2.4, r * 2.2 + FOOT * p.sc); ctx.fill(); ctx.globalAlpha = 0.9; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(p.x - r, p.y - r); ctx.lineTo(p.x - r * 0.3, p.y - r * 1.15); ctx.stroke(); ctx.restore();
  }
  // Betäubt: Sterne
  if (p.stun > 0) {
    for (let k = 0; k < 3; k++) { const a = t * 6 + k * TAU / 3; starShape(p.x + Math.cos(a) * r * 0.8, p.y - r * 1.15 + Math.sin(a) * 8, 8, a); ctx.fillStyle = COL.gold; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  // Marker + Buffs
  if (label) {
    const my = p.y - r - 34 - (p.stun > 0 ? 14 : 0);
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x - 9, my + 8); ctx.lineTo(p.x + 9, my + 8); ctx.lineTo(p.x, my + 18); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = "15px Bungee, Impact"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 4; ctx.strokeText(label, p.x, my + 4); ctx.fillText(label, p.x, my + 4);
  }
  const buffs = [];
  if (p.bigT > 0) buffs.push(["bighead", p.bigT, 8]); if (p.miniT > 0) buffs.push(["mini", p.miniT, 8]);
  if (p.spdT > 0) buffs.push(["speed", p.spdT, 8]); if (p.jmpT > 0) buffs.push(["jump", p.jmpT, 8]);
  if (p.fireNext) buffs.push(["fire", 1, 1]);
  buffs.forEach(([k, v, m], n) => {
    const bx = p.x + (n - (buffs.length - 1) / 2) * 30, by = p.y + r + FOOT * p.sc + 40;
    ctx.fillStyle = POWERUPS[k].col; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, by, 12, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, 15, -Math.PI / 2, -Math.PI / 2 + TAU * (v / m)); ctx.stroke();
    drawPuIcon(ctx, k, bx, by, 7);
  });
  // Emote
  if (p.emo && p.emoT > 0) {
    const a = Math.min(1, p.emoT * 3), pop = 1 + Math.max(0, p.emoT - 1.9) * 2;
    const ex = p.x + p.dir * r * 0.6, ey = p.y - r - 70;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(ex, ey); ctx.scale(pop, pop);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    roundRect(-38, -28, 76, 52, 18); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-p.dir * 6, 24); ctx.lineTo(-p.dir * 18, 40); ctx.lineTo(p.dir * 8, 23); ctx.fill(); ctx.stroke();
    ctx.font = p.emo.length > 2 ? "24px Bungee, Impact" : "34px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = INK; ctx.fillText(p.emo, 0, 0);
    ctx.restore();
  }
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ---------- Ball ----------
function drawBallFx(st, b, t, skin, replay) {
  const sp = Math.hypot(b.vx || 0, b.vy || 0);
  const col = b.fx ? SUPERS[b.fx].col : "#fff";
  // Spur
  if (!replay) {
    trail.push({ x: b.x, y: b.y, r: b.r, fx: b.fx, sp });
    if (trail.length > 14) trail.shift();
  }
  const tr = replay ? replay : trail;
  if (tr.length > 2) {
    ctx.globalCompositeOperation = "lighter";
    for (let i = 1; i < tr.length; i++) {
      const p = tr[i], k = i / tr.length;
      if (p.sp < 650 && !p.fx) continue;
      const c = p.fx ? SUPERS[p.fx].col : "#ffffff";
      ctx.globalAlpha = k * (p.fx ? 0.55 : 0.25) * (b.alpha ?? 1);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.4 + k * 0.6), 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  // Effekt-Partikel
  if (b.fx && !replay) {
    switch (b.fx) {
      case "fire": case "meteor": case "rocket":
        if (b.fx !== "rocket" || b.fxP === 1) for (let i = 0; i < 3; i++) P({ type: "flame", x: b.x + rand(-6, 6), y: b.y + rand(-6, 6), vx: -b.vx * 0.1 + rand(-40, 40), vy: -b.vy * 0.1 + rand(-60, 0), life: 0.35, max: 0.35, size: b.r * 1.3, col: b.fx === "rocket" ? "rgba(255,61,110,.8)" : "rgba(255,110,20,.8)", add: true });
        else P({ type: "spark", x: b.x + rand(-b.r, b.r), y: b.y + b.r, vx: rand(-60, 60), vy: rand(100, 300), life: 0.2, size: 3, col: "#ff3d6e", add: true });
        break;
      case "ice": P({ type: "shard", x: b.x, y: b.y, vx: rand(-80, 80), vy: rand(-80, 80), life: 0.4, size: 6, col: "#bdf3ff", rot: rand(0, 6), vr: 6 }); break;
      case "thunder": if (Math.random() < 0.5) P({ type: "spark", x: b.x, y: b.y, vx: rand(-300, 300), vy: rand(-300, 300), life: 0.15, size: 3, col: COL.gold, add: true }); break;
      case "tornado": for (let i = 0; i < 2; i++) { const a = t * 20 + i * Math.PI; P({ type: "dot", x: b.x + Math.cos(a) * b.r * 1.8, y: b.y + Math.sin(a) * b.r * 0.8, life: 0.3, max: 0.3, size: 5, col: "#5effc8", add: true }); } break;
      case "magnet": if (Math.random() < 0.6) { const a = rand(0, TAU); P({ type: "dot", x: b.x + Math.cos(a) * 50, y: b.y + Math.sin(a) * 50, vx: -Math.cos(a) * 200, vy: -Math.sin(a) * 200, life: 0.25, max: 0.25, size: 4, col: "#ff4fd8", add: true }); } break;
      case "bouncy": if (Math.random() < 0.5) P({ type: "star", x: b.x, y: b.y, vx: rand(-80, 80), vy: rand(-80, 80), life: 0.4, size: 6, col: "#ff8bd1", vr: 5 }); break;
      case "banana": P({ type: "dot", x: b.x, y: b.y, life: 0.4, max: 0.4, size: 7, col: "rgba(255,212,59,.8)", add: true }); break;
    }
  }
  // Glühen
  if (b.fx) {
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 2.6);
    g.addColorStop(0, col + "cc"); g.addColorStop(1, col + "00");
    ctx.globalAlpha = b.alpha ?? 1;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  // Klone
  if (b.fx === "clone") {
    const amp = 95 * Math.sin(Math.min(1, b.fxT / 0.35) * Math.PI / 2);
    const d = Math.hypot(b.fxDX, b.fxDY) || 1, px = -b.fxDY / d, py = b.fxDX / d;
    [-1, 0, 1].forEach(k => { if (k === b.fxK) return; drawBall(ctx, skin, b.fxBX + px * amp * k, b.fxBY + py * amp * k, b.r, b.a, 0.95); });
  }
  // Wenn der Ball über dem Bild ist: Pfeil
  if (b.y < -base.oy / base.s - 10) {
    const ay = -base.oy / base.s + 30;
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(b.x, ay - 16); ctx.lineTo(b.x + 14, ay + 6); ctx.lineTo(b.x - 14, ay + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  drawBall(ctx, skin, b.x, b.y, b.r, b.a, b.alpha ?? 1);
}

function drawPowerups(st, t) {
  for (const u of st.pu) {
    const y = u.y + Math.sin(u.t * 3) * 10, col = POWERUPS[u.k].col;
    const pop = Math.min(1, u.t * 4) * (u.t > 11 ? (Math.sin(u.t * 20) > 0 ? 1 : 0.4) : 1);
    ctx.save(); ctx.globalAlpha = pop;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(u.x, y, 6, u.x, y, 64); g.addColorStop(0, col + "aa"); g.addColorStop(1, col + "00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(u.x, y, 64, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(u.x, y, 36, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(u.x, y, 28, 0, TAU); ctx.fill(); ctx.stroke();
    drawPuIcon(ctx, u.k, u.x, y, 16);
    ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.beginPath(); ctx.ellipse(u.x - 13, y - 17, 9, 5, -0.6, 0, TAU); ctx.fill();
    ctx.font = "600 17px 'Barlow Condensed', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(POWERUPS[u.k].name, u.x, y + 56); ctx.fillStyle = "#fff"; ctx.fillText(POWERUPS[u.k].name, u.x, y + 56);
    ctx.restore();
  }
}

// ---------- HUD ----------
const avCache = new Map();
function avatar(chId, size, mood) {
  const k = chId + size + mood + dpr;
  if (avCache.has(k)) return avCache.get(k);
  const c = document.createElement("canvas"); const px = Math.round(size * base.s * dpr * 1.2) || 60;
  c.width = c.height = px; const x = c.getContext("2d");
  drawHead(x, chId, px / 2, px * 0.56, px * 0.3, { mood });
  avCache.set(k, c); return c;
}
function skewPanel(x, y, w, h, fill, sk = 12) {
  ctx.beginPath(); ctx.moveTo(x + sk, y); ctx.lineTo(x + w + sk, y); ctx.lineTo(x + w - sk, y + h); ctx.lineTo(x - sk, y + h); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}
function hud(st, t, names, opts) {
  const top = Math.max(10, -base.oy / base.s + 10);
  const cx = W / 2, y = top;
  ctx.save();
  ctx.textBaseline = "middle"; ctx.textAlign = "center";
  // Schatten
  ctx.globalAlpha = 0.35; skewPanel(cx - 316 + 6, y + 6, 632, 62, "#000"); ctx.globalAlpha = 1;
  // Seiten
  [0, 1].forEach(i => {
    const x = i ? cx + 86 : cx - 316;
    const g = ctx.createLinearGradient(x, y, x, y + 62); g.addColorStop(0, shade(TEAM[i], 0.15)); g.addColorStop(1, shade(TEAM[i], -0.25));
    skewPanel(x, y, 230, 62, g);
    const ax = i ? cx + 292 : cx - 292;
    const av = avatar(st.p[i].ch, 56, "");
    ctx.drawImage(av, ax - 30, y + 1, 60, 60);
    ctx.fillStyle = INK; ctx.font = "600 20px 'Barlow Condensed', 'Arial Narrow', sans-serif";
    ctx.textAlign = i ? "right" : "left";
    const nm = (names[i] || "").slice(0, 12);
    ctx.fillText(nm.toUpperCase(), i ? cx + 252 : cx - 252, y + 20);
    // Super-Leiste
    const p = st.p[i], mx = i ? cx + 252 - 150 : cx - 252, mw = 150, my = y + 40;
    ctx.fillStyle = "rgba(10,18,48,.55)"; skewPanel(mx, my, mw, 12, "rgba(10,18,48,.6)", 5);
    const fill = p.armed > 0 ? 1 : p.meter / 100;
    if (fill > 0) {
      ctx.save(); skewPanel(mx, my, mw, 12, "#000", 5); ctx.clip();
      const full = p.full || p.armed > 0;
      ctx.fillStyle = full ? (Math.sin(t * 12) > 0 ? COL.gold : "#fff") : "#fff";
      if (i) ctx.fillRect(mx + mw * (1 - fill) - 6, my, mw * fill + 12, 12); else ctx.fillRect(mx - 6, my, mw * fill + 6, 12);
      ctx.restore();
    }
    if (p.full) { ctx.font = "13px Bungee, Impact"; ctx.fillStyle = INK; ctx.textAlign = "center"; ctx.fillText("SUPER", mx + mw / 2, my + 7); }
    ctx.textAlign = "center";
  });
  // Mitte
  skewPanel(cx - 96, y, 192, 62, INK);
  ctx.font = "38px Bungee, Impact, sans-serif";
  ctx.fillStyle = COL.p1; ctx.fillText(st.s[0], cx - 50, y + 27);
  ctx.fillStyle = COL.p2; ctx.fillText(st.s[1], cx + 50, y + 27);
  ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.font = "26px Bungee, Impact"; ctx.fillText(":", cx, y + 25);
  let tt;
  if (st.gold) { tt = "GOLDEN GOAL"; ctx.fillStyle = Math.sin(t * 6) > 0 ? COL.gold : "#fff"; ctx.font = "14px Bungee, Impact"; }
  else { const sec = Math.ceil(st.t); tt = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); ctx.fillStyle = sec <= 10 && st.ph === "play" ? (Math.sin(t * 10) > 0 ? "#ff5a5a" : COL.gold) : COL.gold; ctx.font = "17px Bungee, Impact"; }
  ctx.fillText(tt, cx, y + 52);
  if (opts.series) { ctx.font = "600 16px 'Barlow Condensed', sans-serif"; ctx.fillStyle = "rgba(255,255,255,.8)"; ctx.fillText(opts.series, cx, y + 80); }
  if (st.mod && opts.modName) { ctx.font = "600 16px 'Barlow Condensed', sans-serif"; ctx.fillStyle = COL.gold; ctx.fillText("⚡ " + opts.modName, cx, y + (opts.series ? 98 : 80)); }
  ctx.restore();
}

function drawCallouts(dt) {
  for (let i = callouts.length - 1; i >= 0; i--) {
    const c = callouts[i]; c.t += dt;
    if (c.t > c.dur) { callouts.splice(i, 1); continue; }
    const k = c.t / c.dur;
    const pop = c.t < 0.18 ? 0.4 + (c.t / 0.18) * 0.8 : c.t < 0.3 ? 1.2 - (c.t - 0.18) / 0.12 * 0.2 : 1;
    const a = k > 0.8 ? (1 - k) / 0.2 : 1;
    const y = 250 - i * 0;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, y); ctx.scale(pop * c.size, pop * c.size); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "92px Bungee, Impact, sans-serif";
    ctx.lineJoin = "round";
    ctx.lineWidth = 26; ctx.strokeStyle = "#fff"; ctx.strokeText(c.text, 0, 0);
    ctx.lineWidth = 14; ctx.strokeStyle = INK; ctx.strokeText(c.text, 0, 0);
    ctx.fillStyle = INK; ctx.fillText(c.text, 7, 7);
    ctx.fillStyle = c.col; ctx.fillText(c.text, 0, 0);
    if (c.sub) {
      ctx.font = "32px Bungee, Impact"; ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.strokeText(c.sub, 0, 78); ctx.fillStyle = "#fff"; ctx.fillText(c.sub, 0, 78);
    }
    ctx.restore();
  }
}

// ---------- Haupt-Zeichnung ----------
// opts: { names, labels, ballSkin, dt, replay (Snapshot-Liste), replayFrac, series, modName, countdown }
export function render(st, t, opts) {
  const dt = opts.dt || 1 / 60;
  buildBg(st.arena);
  tickParts(dt);
  crowdHype = Math.max(0, crowdHype - dt * 0.35);
  // Kamera
  let view = st, rep = null;
  if (opts.replay && opts.replay.length > 2) {
    const idx = clamp(Math.floor(opts.replayFrac * (opts.replay.length - 1)), 0, opts.replay.length - 1);
    view = opts.replay[idx]; rep = opts.replay.slice(Math.max(0, idx - 12), idx + 1).map(s => ({ x: s.b.x, y: s.b.y, r: s.b.r, fx: s.b.fx, sp: Math.hypot(s.b.vx, s.b.vy) }));
  }
  let tz = 1, tx = W / 2, ty = H / 2;
  if (rep) { tz = 1.55; tx = view.b.x; ty = Math.min(view.b.y, G - 140); }
  else if (st.ph === "goal" && st.pt > 3.4) { tz = 1.12; tx = st.b.x; ty = Math.min(st.b.y, G - 200); }
  const k = Math.min(1, dt * (rep ? 6 : 3));
  cam.z += (tz - cam.z) * k; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  cam.shake *= Math.max(0, 1 - dt * 7);
  cam.sx = (Math.random() - 0.5) * cam.shake; cam.sy = (Math.random() - 0.5) * cam.shake;
  const s = base.s * cam.z;
  // Kameraposition so begrenzen, dass kein Rand sichtbar wird
  const ox0 = base.ox + W / 2 * base.s, oy0 = base.oy + H / 2 * base.s; // Bildschirmpunkt der Weltmitte bei Zoom 1
  const X1a = -base.ox / base.s, X1b = (cw - base.ox) / base.s, Y1a = -base.oy / base.s, Y1b = (ch - base.oy) / base.s;
  const cx = clamp(cam.x, X1a + ox0 / s, X1b - (cw - ox0) / s);
  const cy = clamp(cam.y, Y1a + oy0 / s, Y1b - (ch - oy0) / s);
  // Welt -> Bildschirm
  const ox = ox0 - (cx - W / 2) * s - W / 2 * s + cam.sx, oy = oy0 - (cy - H / 2) * s - H / 2 * s + cam.sy;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
  // Hintergrund (vorgerendert bei Zoom 1)
  const bz = cam.z, pad = 60;
  ctx.save();
  ctx.translate(ox0 + cam.sx, oy0 + cam.sy); ctx.scale(bz, bz); ctx.translate(-(cx - W / 2) * base.s - ox0, -(cy - H / 2) * base.s - oy0);
  ctx.drawImage(bgCanvas, -pad, -pad, cw + pad * 2, ch + pad * 2);
  ctx.restore();
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  drawCrowd(t);
  boards(st, t);
  lights(st, t);
  goalBack(view, 0, t); goalBack(view, 1, t);
  drawPowerups(view, t);
  const labels = opts.labels || [];
  view.p.forEach(p => drawPlayer(view, p, t, rep ? null : labels[p.i]));
  drawParts(false);
  drawBallFx(view, view.b, t, opts.ballSkin || "klassik", rep);
  goalFront(view, 0, t); goalFront(view, 1, t);
  ctx.globalCompositeOperation = "lighter"; drawParts(true); ctx.globalCompositeOperation = "source-over";
  // HUD in Basiskoordinaten
  ctx.setTransform(dpr * base.s, 0, 0, dpr * base.s, dpr * base.ox, dpr * base.oy);
  if (!opts.noHud) hud(st, t, opts.names || ["", ""], opts);
  // Countdown
  if ((st.ph === "cd" || st.ph === "ko") && !opts.noHud) {
    const n = st.ph === "ko" ? "" : st.pt > 2 ? "3" : st.pt > 1 ? "2" : st.pt > 0.25 ? "1" : "";
    const lab = st.ph === "ko" ? "WEITER!" : st.gold && st.pt > 0.25 ? "GOLDEN GOAL" : n;
    if (lab) {
      const f = st.ph === "ko" ? 1 : (st.pt % 1);
      ctx.save(); ctx.translate(W / 2, 300); const sc = 0.8 + f * 0.5; ctx.scale(sc, sc); ctx.transform(1, 0, -0.15, 1, 0, 0);
      ctx.font = (lab.length > 2 ? 70 : 140) + "px Bungee, Impact"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      ctx.lineWidth = 28; ctx.strokeStyle = "#fff"; ctx.strokeText(lab, 0, 0); ctx.lineWidth = 16; ctx.strokeStyle = INK; ctx.strokeText(lab, 0, 0);
      ctx.fillStyle = st.gold ? COL.gold : "#fff"; ctx.fillText(lab, 0, 0); ctx.restore();
    }
  }
  if (!rep) drawCallouts(dt);
  // Wiederholung
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (rep) {
    const bar = Math.min(cw, ch) * 0.07;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, bar); ctx.fillRect(0, ch - bar, cw, bar);
    ctx.font = `${Math.round(bar * 0.42)}px Bungee, Impact`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = Math.sin(t * 6) > 0 ? "#ff3b30" : "#661010"; ctx.beginPath(); ctx.arc(24 + bar * 0.2, bar / 2, bar * 0.16, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText("WIEDERHOLUNG", 30 + bar * 0.45, bar / 2 + 1);
    ctx.textAlign = "right"; ctx.font = `600 ${Math.round(bar * 0.36)}px 'Barlow Condensed', sans-serif`; ctx.fillStyle = "rgba(255,255,255,.7)";
    if (opts.canSkip) ctx.fillText("Tippen zum Überspringen", cw - 20, ch - bar / 2);
  }
  // Vignette + Blitz
  if (quality === "high") {
    const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    vg.addColorStop(0, "rgba(0,0,20,0)"); vg.addColorStop(1, "rgba(0,0,20,.45)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
  }
  if (cam.flash > 0) { ctx.globalAlpha = cam.flash; ctx.fillStyle = cam.flashCol; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; cam.flash = Math.max(0, cam.flash - dt * 2.5); }
}

// Vorschaubild einer Arena (für Menüs)
const thumbCache = new Map();
export function arenaThumb(arena, w, h) {
  const k = arena + w + "x" + h;
  if (thumbCache.has(k)) { const c = thumbCache.get(k); const d = document.createElement("canvas"); d.width = c.width; d.height = c.height; d.getContext("2d").drawImage(c, 0, 0); return d; }
  const c = document.createElement("canvas"), r = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * r; c.height = h * r;
  const b = c.getContext("2d");
  const s = (w * r) / (W * 0.82), ox = -(W * 0.09) * s, oy = (h * r) - (H - 20) * s;
  b.setTransform(s, 0, 0, s, ox, oy);
  seedN = 12345;
  const R = { x0: -ox / s, x1: (w * r - ox) / s, y0: -oy / s, y1: (h * r - oy) / s };
  ({ stadion: bgStadion, strand: bgStrand, neon: bgNeon, eis: bgEis, mond: bgMond }[arena] || bgStadion)(b, R);
  // Tore andeuten
  b.fillStyle = "#fff"; b.fillRect(0, G - 240 - 6, GOAL_W, 12); b.fillRect(W - GOAL_W, G - 240 - 6, GOAL_W, 12);
  thumbCache.set(k, c);
  const d = document.createElement("canvas"); d.width = c.width; d.height = c.height; d.getContext("2d").drawImage(c, 0, 0); return d;
}

// Bildschirm -> Welt (für Debug/Klicks)
export function toWorld(x, y) { return { x: (x - base.ox) / base.s, y: (y - base.oy) / base.s }; }
