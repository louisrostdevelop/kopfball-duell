// Darstellung: Kamera, Arenen, Spieler, Ball, Partikel, HUD, Wiederholung
import { W, H, G, GOAL_W, BAR_T, HR, BR, SR, FOOT, COL, SUPERS, POWERUPS, charById, clamp, rand } from "./config.js";
import { drawHead, drawShoe, drawBall, drawPuIcon, shade } from "./art.js";
import { barY, shoePos, pr } from "./physics.js";

const TAU = Math.PI * 2;
const INK = COL.ink;
const TEAM = [COL.p1, COL.p2];
const FT = 330; // obere (hintere) Kante des Spielfelds

let cv, ctx, cw = 0, ch = 0, dpr = 1, band = 0;
const base = { s: 1, ox: 0, oy: 0 };
let quality = "high";
const cam = { z: 1, x: W / 2, y: H / 2, shake: 0, sx: 0, sy: 0, flash: 0, flashCol: "#fff", punch: 0 };
let bgCanvas = null, crowdCanvas = null, bgKey = "", crowdRect = null;
const parts = [];
const callouts = [];
const trail = [];
const netHit = [{ t: 9, y: 0, p: 0 }, { t: 9, y: 0, p: 0 }];
const barWob = [9, 9];
const headSq = [0, 0];
const swoosh = [];
const ballSq = { t: 9, ang: 0, p: 0 };
let crowdHype = 0, flashes = [];

export function initRender(canvas) {
  cv = canvas; ctx = cv.getContext("2d", { alpha: false });
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("orientationchange", () => setTimeout(resize, 200));
}
export function setQuality(q) { quality = q; bgKey = ""; resize(); }
// Platz unten für die Touch-Steuerung (in Bildschirmpixeln)
export function setBand(px) { if (px !== band) { band = px; resize(); } }
export function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  dpr = Math.min(window.devicePixelRatio || 1, quality === "high" ? 2 : 1.25);
  if (vw * vh * dpr * dpr > 3.4e6) dpr = Math.sqrt(3.4e6 / (vw * vh));
  cw = vw; ch = vh;
  cv.width = Math.round(vw * dpr); cv.height = Math.round(vh * dpr);
  cv.style.width = vw + "px"; cv.style.height = vh + "px";
  // Volle Breite fürs Feld. Oben darf Himmel/Tribüne wegfallen; der Ball zeigt dann einen Pfeil.
  const s0 = Math.min(vw / W, vh / (H * 0.6));
  const extra = Math.max(0, band - (H - G) * s0); // unter dem Feld zusätzlich Platz für Buttons
  const s = Math.min(vw / W, (vh - extra) / (H * 0.6));
  base.s = s;
  base.ox = (vw - W * s) / 2;
  base.oy = vh - extra - H * s;
  bgKey = "";
}
export function viewInfo() { return { cw, ch, s: base.s, ox: base.ox, oy: base.oy }; }
const visTop = () => Math.max(-40, -base.oy / base.s);

// ---------- Effekte-API ----------
export const fx = {
  shake(a) { cam.shake = Math.min(26, cam.shake + a); },
  flash(col = "#fff", a = 0.6) { cam.flash = a; cam.flashCol = col; },
  punch(z) { cam.punch = Math.max(cam.punch, z); },
  callout(text, col = COL.gold, sub = "", dur = 1.6, size = 1) { callouts.push({ text, col, sub, t: 0, dur, size }); if (callouts.length > 3) callouts.shift(); },
  hype(v) { crowdHype = Math.max(crowdHype, v); },
  net(side, y, p) { netHit[side] = { t: 0, y, p }; },
  bar(side) { barWob[side] = 0; },
  squash(i) { headSq[i] = 0.18; },
  ballHit(ang, p) { ballSq.t = 0; ballSq.ang = ang; ballSq.p = clamp(p, 0.2, 1); },
  swoosh(x, y, dir, pow) { swoosh.push({ x, y, dir, pow, t: 0 }); },
  clearTrail() { trail.length = 0; },
  clear() { parts.length = 0; callouts.length = 0; trail.length = 0; swoosh.length = 0; },
  burst(type, x, y, o = {}) { burst(type, x, y, o); },
};

function P(o) { if (parts.length > (quality === "high" ? 900 : 350)) parts.shift(); parts.push(Object.assign({ vx: 0, vy: 0, life: 1, max: 1, size: 4, col: "#fff", g: 0, rot: 0, vr: 0, add: false, drag: 0 }, o)); }

function burst(type, x, y, o) {
  const n = (k) => quality === "high" ? k : Math.ceil(k / 2);
  switch (type) {
    case "dust": for (let i = 0; i < n(o.n || 8); i++) P({ type: "smoke", x: x + rand(-14, 14), y: y - 4, vx: rand(-90, 90) + (o.vx || 0), vy: rand(-80, -10), life: rand(0.35, 0.6), size: rand(5, 10), col: o.col || "rgba(255,255,255,.45)", drag: 3 }); break;
    case "kick": {
      const pow = o.pow || 1, dir = o.dir || 1;
      P({ type: "flash", x, y, life: 0.09, max: 0.09, size: 34 * pow, col: "#fff", add: true });
      P({ type: "ring", x, y, life: 0.28, max: 0.28, size: 8, grow: 150 + 160 * (pow - 1), col: pow > 1.5 ? COL.gold : "#fff", add: true, w: 5 + 4 * (pow - 1) });
      for (let i = 0; i < n(8 + 10 * (pow - 1)); i++) { const a = (dir > 0 ? 0 : Math.PI) + rand(-0.9, 0.9) - 0.3 * dir, sp = rand(250, 650) * pow; P({ type: "spark", x, y, vx: Math.cos(a) * sp * dir * dir, vy: Math.sin(a) * sp, life: rand(0.12, 0.3), size: rand(2, 4), col: pow > 1.5 ? COL.gold : "#fff", add: true, drag: 5 }); }
      break;
    }
    case "head":
      P({ type: "ring", x, y, life: 0.22, max: 0.22, size: 6, grow: 90, col: "#fff", add: true, w: 4 });
      for (let i = 0; i < n(5); i++) { const a = rand(0, TAU); P({ type: "star", x, y, vx: Math.cos(a) * 200, vy: Math.sin(a) * 200 - 60, life: 0.4, size: rand(4, 7), col: COL.gold, vr: rand(-8, 8), drag: 3 }); }
      break;
    case "goal": {
      const cols = [o.col || COL.gold, "#fff", COL.gold, "#ff4fd8", "#3ddc84"];
      for (let i = 0; i < n(150); i++) P({ type: "conf", x: x + rand(-40, 40), y: y + rand(-40, 40), vx: rand(-750, 750), vy: rand(-1150, -200), life: rand(1.4, 2.6), size: rand(6, 12), col: cols[i % cols.length], g: 1400, rot: rand(0, TAU), vr: rand(-14, 14), drag: 1.6 });
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
      P({ type: "flash", x, y, life: 0.12, max: 0.12, size: 90, col: o.col, add: true });
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
      for (let i = 0; i < n(12); i++) { const a = rand(0, TAU); P({ type: "spark", x, y, vx: Math.cos(a) * 420, vy: Math.sin(a) * 420, life: 0.25, size: 3, col: "#fff", add: true, drag: 4 }); }
      P({ type: "flash", x, y, life: 0.08, max: 0.08, size: 40, col: "#fff", add: true });
      break;
    case "charge": P({ type: "dot", x: x + rand(-20, 20), y: y + rand(-6, 10), vx: rand(-30, 30), vy: rand(-140, -60), life: 0.35, max: 0.35, size: rand(2, 4), col: o.col || COL.gold, add: true }); break;
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
  for (let i = swoosh.length - 1; i >= 0; i--) { swoosh[i].t += dt; if (swoosh[i].t > 0.16) swoosh.splice(i, 1); }
  for (let i = 0; i < 2; i++) { headSq[i] = Math.max(0, headSq[i] - dt); barWob[i] += dt; }
  ballSq.t += dt;
}
function drawParts(addPass) {
  for (const p of parts) {
    if (!!p.add !== addPass) continue;
    const a = clamp(p.max ? p.life / p.max : p.life, 0, 1);
    ctx.globalAlpha = Math.min(1, a * 1.4);
    switch (p.type) {
      case "smoke": ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - a), 0, TAU); ctx.fill(); break;
      case "spark": ctx.strokeStyle = p.col; ctx.lineWidth = p.size; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); ctx.stroke(); break;
      case "dot": ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, TAU); ctx.fill(); break;
      case "flash": { const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size); g.addColorStop(0, p.col); g.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill(); break; }
      case "ring": ctx.strokeStyle = p.col; ctx.lineWidth = (p.w || 5) * a; ctx.beginPath(); if (p.flat) ctx.ellipse(p.x, p.y, p.size + (1 - a) * p.grow, (p.size + (1 - a) * p.grow) * 0.18, 0, 0, TAU); else ctx.arc(p.x, p.y, p.size + (1 - a) * p.grow, 0, TAU); ctx.stroke(); break;
      case "star": starShape(p.x, p.y, p.size, p.rot); ctx.fillStyle = p.col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); break;
      case "conf": ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 1.7)); ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); ctx.restore(); break;
      case "shard": case "rock": ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.6, p.size * 0.5); ctx.lineTo(-p.size * 0.6, p.size * 0.5); ctx.closePath(); ctx.fillStyle = p.col; ctx.fill(); if (p.type === "shard") { ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke(); } ctx.restore(); break;
      case "flame": { const r = p.size * (0.4 + a * 0.8); const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); g.addColorStop(0, "rgba(255,240,180,.95)"); g.addColorStop(0.4, p.col); g.addColorStop(1, "rgba(255,60,0,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill(); break; }
      case "bolt": ctx.strokeStyle = p.col; ctx.lineWidth = 5; ctx.beginPath(); p.pts.forEach(([x, y], n) => n ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke(); break;
      case "text": ctx.font = `${p.size}px 'Lilita One', Impact, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic"; ctx.lineJoin = "round"; ctx.lineWidth = 6; ctx.strokeStyle = INK; ctx.strokeText(p.text, p.x, p.y); ctx.fillStyle = p.col; ctx.fillText(p.text, p.x, p.y); break;
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
let seedN = 1;
const srand = () => { seedN = (seedN * 16807) % 2147483647; return seedN / 2147483647; };
const persp = x => W / 2 + (x - W / 2) * 0.82; // x an der hinteren Feldkante

function buildBg(arena) {
  const key = arena + "|" + cw + "x" + ch + "|" + dpr + "|" + base.s + "|" + base.oy;
  if (key === bgKey && bgCanvas) return;
  bgKey = key;
  const pad = 60;
  bgCanvas = bgCanvas || document.createElement("canvas");
  bgCanvas.width = Math.round((cw + pad * 2) * dpr); bgCanvas.height = Math.round((ch + pad * 2) * dpr);
  const b = bgCanvas.getContext("2d");
  b.setTransform(dpr * base.s, 0, 0, dpr * base.s, (base.ox + pad) * dpr, (base.oy + pad) * dpr);
  const R = { x0: (-base.ox - pad) / base.s, x1: (cw - base.ox + pad) / base.s, y0: (-base.oy - pad) / base.s, y1: (ch - base.oy + pad) / base.s };
  seedN = 12345;
  ARENA_BG[arena](b, R);
  // Publikum als eigene Ebene (hüpft bei Toren als Ganzes)
  crowdCanvas = null; crowdRect = null;
  const cr = CROWD[arena];
  if (cr) {
    crowdRect = { x0: R.x0, x1: R.x1, y0: cr.top - 20, y1: cr.bot + 4 };
    const c = document.createElement("canvas");
    const sc = base.s * dpr;
    c.width = Math.max(1, Math.round((crowdRect.x1 - crowdRect.x0) * sc)); c.height = Math.max(1, Math.round((crowdRect.y1 - crowdRect.y0) * sc));
    const x = c.getContext("2d"); x.setTransform(sc, 0, 0, sc, -crowdRect.x0 * sc, -crowdRect.y0 * sc);
    seedN = 777; paintCrowd(x, crowdRect, cr);
    crowdCanvas = c;
  }
}

function paintCrowd(b, R, cr) {
  const rows = cr.rows, h = (cr.bot - cr.top) / rows;
  for (let r = 0; r < rows; r++) {
    const y = cr.top + r * h + h * 0.62, s = 0.8 + r * 0.05;
    for (let x = R.x0 + (r % 2) * 10; x < R.x1; x += 17 * s + srand() * 5) {
      if (srand() < cr.gaps) continue;
      const side = x < W / 2 ? 0 : 1, t = srand();
      const shirt = t < 0.42 ? shade(TEAM[side], -0.25 - srand() * 0.2) : t < 0.6 ? cr.alt : shade(cr.base, srand() * 0.25);
      const yy = y + srand() * 3;
      b.fillStyle = shirt; b.beginPath(); b.ellipse(x, yy + 6 * s, 7.5 * s, 7 * s, 0, Math.PI, TAU); b.fill();
      b.fillRect(x - 7.5 * s, yy + 6 * s, 15 * s, 6 * s);
      b.fillStyle = cr.skin[Math.floor(srand() * cr.skin.length)]; b.beginPath(); b.arc(x, yy - 3 * s, 5 * s, 0, TAU); b.fill();
      if (srand() < 0.07) { b.fillStyle = TEAM[side]; b.fillRect(x - 1, yy - 22 * s, 2, 16 * s); b.fillRect(x - 1, yy - 22 * s, 14 * s * (side ? -1 : 1), 8 * s); }
    }
    // Reihen-Schatten für Tiefe
    b.fillStyle = "rgba(0,0,20,.18)"; b.fillRect(R.x0, cr.top + r * h + h - 3, R.x1 - R.x0, 3);
  }
  const g = b.createLinearGradient(0, cr.top, 0, cr.bot);
  g.addColorStop(0, "rgba(4,8,26,.55)"); g.addColorStop(1, "rgba(4,8,26,.12)");
  b.fillStyle = g; b.fillRect(R.x0, cr.top - 20, R.x1 - R.x0, cr.bot - cr.top + 24);
}

const SKIN = ["#e9b98f", "#c98b5e", "#8d5a3b", "#f3d2b3", "#a86f4a"];
const CROWD = {
  stadion: { top: 104, bot: FT - 52, rows: 7, gaps: 0.06, base: "#2a3d6e", alt: "#d9dfef", skin: SKIN },
  eis: { top: 112, bot: FT - 52, rows: 6, gaps: 0.1, base: "#24485e", alt: "#e9f7ff", skin: SKIN },
};

function grassTex(b, R, dark, n = 900) {
  for (let i = 0; i < n; i++) { const x = R.x0 + srand() * (R.x1 - R.x0), y = FT + Math.pow(srand(), 0.7) * (G - FT); b.fillStyle = srand() > 0.5 ? dark : "rgba(255,255,255,.05)"; b.fillRect(x, y, 2 + srand() * 3, 1.5); }
}
function pitch(b, R, c1, c2, lines = "rgba(255,255,255,.6)") {
  // Mähstreifen in Perspektive
  const n = 16;
  for (let i = -6; i < n + 6; i++) {
    const xa = i * W / n, xb = (i + 1) * W / n;
    b.beginPath(); b.moveTo(persp(xa), FT); b.lineTo(persp(xb), FT); b.lineTo(xb, G); b.lineTo(xa, G); b.closePath();
    b.fillStyle = i % 2 ? c1 : c2; b.fill();
  }
  // Licht von oben, hinten dunkler
  const g = b.createLinearGradient(0, FT, 0, G);
  g.addColorStop(0, "rgba(0,10,30,.38)"); g.addColorStop(0.4, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(255,255,255,.05)");
  b.fillStyle = g; b.fillRect(R.x0, FT, R.x1 - R.x0, G - FT);
  const rg = b.createRadialGradient(W / 2, FT + 60, 40, W / 2, FT + 60, W * 0.6);
  rg.addColorStop(0, "rgba(255,255,230,.10)"); rg.addColorStop(1, "rgba(255,255,230,0)");
  b.fillStyle = rg; b.fillRect(R.x0, FT, R.x1 - R.x0, G - FT);
  if (!lines) return;
  b.strokeStyle = lines; b.lineWidth = 3.5; b.lineJoin = "round";
  const yb = FT + 14;
  b.beginPath(); b.moveTo(persp(-20), yb); b.lineTo(persp(W + 20), yb); b.stroke();
  b.beginPath(); b.moveTo(W / 2, yb); b.lineTo(W / 2, G); b.stroke();
  b.beginPath(); b.ellipse(W / 2, (yb + G) / 2 + 6, 170, 58, 0, 0, TAU); b.stroke();
  b.fillStyle = lines; b.beginPath(); b.ellipse(W / 2, (yb + G) / 2 + 6, 7, 3, 0, 0, TAU); b.fill();
  // Strafräume
  [0, 1].forEach(s => {
    const d = s ? -1 : 1, gx = s ? W : 0, bx = gx + d * 300;
    const by = yb + 46;
    b.beginPath(); b.moveTo(persp(gx) + d * 20, by); b.lineTo(persp(bx), by); b.lineTo(bx, G); b.stroke();
    b.beginPath(); b.arc(gx + d * 230, G - 70, 5, 0, TAU); b.fill();
  });
}
function front(b, R, turfCol, boardCol, glow) {
  // Vordere Kante des Felds und Bande unten (dort liegt auf dem Handy die Steuerung)
  b.fillStyle = turfCol; b.fillRect(R.x0, G, R.x1 - R.x0, 34);
  b.fillStyle = "rgba(255,255,255,.55)"; b.fillRect(R.x0, G - 1, R.x1 - R.x0, 3);
  const g = b.createLinearGradient(0, G + 34, 0, R.y1);
  g.addColorStop(0, shade(boardCol, 0.1)); g.addColorStop(1, shade(boardCol, -0.5));
  b.fillStyle = g; b.fillRect(R.x0, G + 34, R.x1 - R.x0, R.y1 - G - 34);
  b.fillStyle = glow; b.fillRect(R.x0, G + 34, R.x1 - R.x0, 2);
}
function standsBlock(b, R, top, c1, c2) {
  const h = FT - 40 - top;
  const g = b.createLinearGradient(0, top, 0, FT - 40); g.addColorStop(0, c1); g.addColorStop(1, c2);
  b.fillStyle = g; b.fillRect(R.x0, top, R.x1 - R.x0, h);
  // Stufen
  for (let i = 1; i < 7; i++) { b.fillStyle = "rgba(0,0,0,.12)"; b.fillRect(R.x0, top + h * i / 7, R.x1 - R.x0, 2); }
  // Bande hinter dem Feld
  b.fillStyle = "#08102a"; b.fillRect(R.x0, FT - 40, R.x1 - R.x0, 40);
}

function bgStadion(b, R) {
  const sky = b.createLinearGradient(0, R.y0, 0, FT);
  sky.addColorStop(0, "#040817"); sky.addColorStop(0.5, "#0c1d48"); sky.addColorStop(1, "#1a3270");
  b.fillStyle = sky; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
  for (let i = 0; i < 70; i++) { b.fillStyle = `rgba(255,255,255,${0.15 + srand() * 0.4})`; b.fillRect(R.x0 + srand() * (R.x1 - R.x0), R.y0 + srand() * (90 - R.y0), 2, 2); }
  // Dach
  b.fillStyle = "#060c22"; b.beginPath(); b.moveTo(R.x0, 96); b.quadraticCurveTo(W / 2, 60, R.x1, 96); b.lineTo(R.x1, 128); b.quadraticCurveTo(W / 2, 98, R.x0, 128); b.fill();
  b.fillStyle = "rgba(255,255,255,.08)"; for (let x = R.x0; x < R.x1; x += 60) b.fillRect(x, 108, 30, 3);
  standsBlock(b, R, 96, "#14234f", "#1d3166");
  // Flutlichtmasten
  [-30, W + 30].forEach(x => {
    b.fillStyle = "#060c22"; b.fillRect(x - 6, -60, 12, 180);
    b.fillStyle = "#14204a"; b.fillRect(x - 74, -150, 148, 86);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { b.fillStyle = "#fffbe0"; b.beginPath(); b.arc(x - 54 + i * 36, -128 + j * 40, 12, 0, TAU); b.fill(); }
  });
  pitch(b, R, "#25a552", "#1f964a");
  grassTex(b, R, "rgba(0,40,10,.12)");
  front(b, R, "#1d8a44", "#0a1433", "rgba(34,211,238,.35)");
}
function bgStrand(b, R) {
  const sky = b.createLinearGradient(0, R.y0, 0, FT);
  sky.addColorStop(0, "#2d1760"); sky.addColorStop(0.45, "#ff5f8f"); sky.addColorStop(0.85, "#ffb35c"); sky.addColorStop(1, "#ffd27a");
  b.fillStyle = sky; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
  const sy = 300;
  const sg = b.createRadialGradient(W / 2, sy, 10, W / 2, sy, 300); sg.addColorStop(0, "rgba(255,240,160,.85)"); sg.addColorStop(1, "rgba(255,200,120,0)");
  b.fillStyle = sg; b.fillRect(W / 2 - 300, 0, 600, sy + 10);
  b.fillStyle = "#ffe98a"; b.beginPath(); b.arc(W / 2, sy, 120, Math.PI, TAU); b.fill();
  b.fillStyle = "rgba(255,120,150,.55)"; for (let i = 0; i < 5; i++) b.fillRect(W / 2 - 130, sy - 70 + i * 15, 260, 4 + i);
  const sea = b.createLinearGradient(0, sy, 0, FT); sea.addColorStop(0, "#5e3fa0"); sea.addColorStop(1, "#2a7fc0");
  b.fillStyle = sea; b.fillRect(R.x0, sy, R.x1 - R.x0, FT - sy);
  b.strokeStyle = "rgba(255,220,150,.5)"; b.lineWidth = 3;
  for (let i = 0; i < 6; i++) { const y = sy + 14 + i * 12, w = 30 + i * 14; for (let k = 0; k < 6; k++) { const x = W / 2 + (srand() - 0.5) * (220 + i * 120); b.beginPath(); b.moveTo(x - w / 2, y); b.lineTo(x + w / 2, y); b.stroke(); } }
  [[-70, 1, 1], [90, 1, 0.8], [W - 90, -1, 0.8], [W + 70, -1, 1]].forEach(([x, d, s]) => palm(b, x, FT + 6, d, s));
  // Strandbesucher
  for (let i = 0; i < 22; i++) { const x = R.x0 + srand() * (R.x1 - R.x0); if (Math.abs(x - W / 2) < 140) continue; const c = srand() > 0.5 ? COL.p1 : COL.p2; b.fillStyle = shade(c, -0.2); b.fillRect(x - 5, FT - 22, 10, 14); b.fillStyle = SKIN[i % SKIN.length]; b.beginPath(); b.arc(x, FT - 27, 5, 0, TAU); b.fill(); }
  const sand = b.createLinearGradient(0, FT, 0, G); sand.addColorStop(0, "#d9a45f"); sand.addColorStop(1, "#f3cf8e");
  b.fillStyle = sand; b.fillRect(R.x0, FT - 8, R.x1 - R.x0, G - FT + 8);
  for (let i = 0; i < 500; i++) { b.fillStyle = srand() > 0.5 ? "rgba(150,100,40,.18)" : "rgba(255,255,255,.22)"; b.fillRect(R.x0 + srand() * (R.x1 - R.x0), FT + srand() * (G - FT), 3, 2); }
  b.strokeStyle = "rgba(255,255,255,.75)"; b.lineWidth = 4; b.setLineDash([18, 12]);
  b.beginPath(); b.moveTo(W / 2, FT + 10); b.lineTo(W / 2, G); b.stroke(); b.setLineDash([]);
  b.beginPath(); b.moveTo(persp(-20), FT + 14); b.lineTo(persp(W + 20), FT + 14); b.strokeStyle = "rgba(255,255,255,.55)"; b.stroke();
  front(b, R, "#e8bd78", "#3a1d52", "rgba(255,111,165,.4)");
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
  sky.addColorStop(0, "#06011a"); sky.addColorStop(0.6, "#250a49"); sky.addColorStop(1, "#4c1068");
  b.fillStyle = sky; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
  b.fillStyle = "rgba(255,79,216,.16)"; b.beginPath(); b.arc(W * 0.72, 150, 96, 0, TAU); b.fill();
  b.fillStyle = "#ff8be8"; b.beginPath(); b.arc(W * 0.72, 150, 56, 0, TAU); b.fill();
  [[0.55, "#170935", 230], [1, "#0d0524", 130]].forEach(([depth, col, hy]) => {
    let x = R.x0;
    while (x < R.x1) {
      const w = 44 + srand() * 90, h = hy + srand() * 190 * depth;
      b.fillStyle = col; b.fillRect(x, FT - 40 - h, w, h + 40);
      for (let yy = FT - 30 - h; yy < FT - 50; yy += 16) for (let xx = x + 6; xx < x + w - 8; xx += 12) if (srand() > 0.65) { b.fillStyle = srand() > 0.5 ? "rgba(255,79,216,.6)" : "rgba(34,211,238,.5)"; b.fillRect(xx, yy, 5, 7); }
      x += w + 6;
    }
  });
  b.font = "34px 'Lilita One', Impact"; b.textAlign = "center";
  [["KOPFBALL", 260, 200, "#22d3ee"], ["DUELL", W - 260, 180, "#ff4fd8"]].forEach(([t, x, y, c]) => { b.shadowColor = c; b.shadowBlur = 24; b.fillStyle = c; b.fillText(t, x, y); });
  b.shadowBlur = 0;
  b.fillStyle = "#120828"; b.fillRect(R.x0, FT - 10, R.x1 - R.x0, G - FT + 10);
  b.strokeStyle = "rgba(255,79,216,.45)"; b.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const t = i / 8, y = FT + (G - FT) * t * t; b.beginPath(); b.moveTo(R.x0, y); b.lineTo(R.x1, y); b.stroke(); }
  for (let i = -24; i <= 24; i++) { b.beginPath(); b.moveTo(W / 2 + i * 44, FT); b.lineTo(W / 2 + i * 150, G); b.stroke(); }
  b.strokeStyle = "#22d3ee"; b.lineWidth = 4; b.shadowColor = "#22d3ee"; b.shadowBlur = 12;
  b.beginPath(); b.moveTo(W / 2, FT); b.lineTo(W / 2, G); b.stroke(); b.shadowBlur = 0;
  front(b, R, "#1c0c3a", "#0b0420", "rgba(255,79,216,.6)");
}
function bgEis(b, R) {
  const sky = b.createLinearGradient(0, R.y0, 0, FT);
  sky.addColorStop(0, "#03101b"); sky.addColorStop(1, "#0e2f42");
  b.fillStyle = sky; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0);
  b.strokeStyle = "#0a2433"; b.lineWidth = 10;
  for (let x = R.x0; x < R.x1; x += 150) { b.beginPath(); b.moveTo(x, R.y0); b.lineTo(x + 75, 100); b.lineTo(x + 150, R.y0); b.stroke(); }
  standsBlock(b, R, 104, "#11293a", "#17394f");
  b.fillStyle = "#dff3fb"; b.fillRect(R.x0, FT - 40, R.x1 - R.x0, 34);
  b.fillStyle = "#22d3ee"; b.fillRect(R.x0, FT - 8, R.x1 - R.x0, 3);
  const ice = b.createLinearGradient(0, FT, 0, G); ice.addColorStop(0, "#8fcfe6"); ice.addColorStop(1, "#e3f8ff");
  b.fillStyle = ice; b.fillRect(R.x0, FT - 5, R.x1 - R.x0, G - FT + 5);
  b.strokeStyle = "rgba(255,255,255,.6)"; b.lineWidth = 2;
  for (let i = 0; i < 40; i++) { const x = R.x0 + srand() * (R.x1 - R.x0), y = FT + srand() * (G - FT); b.beginPath(); b.moveTo(x, y); b.lineTo(x + 40 + srand() * 60, y + srand() * 8); b.stroke(); }
  b.strokeStyle = "rgba(220,40,60,.65)"; b.lineWidth = 6; b.beginPath(); b.moveTo(W / 2, FT); b.lineTo(W / 2, G); b.stroke();
  b.strokeStyle = "rgba(34,120,220,.55)"; [W * 0.3, W * 0.7].forEach(x => { b.beginPath(); b.moveTo(persp(x), FT); b.lineTo(x, G); b.stroke(); });
  b.strokeStyle = "rgba(220,40,60,.65)"; b.lineWidth = 4; b.beginPath(); b.ellipse(W / 2, (FT + G) / 2, 120, 44, 0, 0, TAU); b.stroke();
  front(b, R, "#cdeefa", "#0d2b3c", "rgba(34,211,238,.5)");
}
function bgMond(b, R) {
  b.fillStyle = "#03030a"; b.fillRect(R.x0, R.y0, R.x1 - R.x0, FT - R.y0 + 40);
  for (let i = 0; i < 260; i++) { const s = srand() * 2.5 + 0.5; b.fillStyle = `rgba(255,255,255,${0.3 + srand() * 0.7})`; b.fillRect(R.x0 + srand() * (R.x1 - R.x0), R.y0 + srand() * (FT - R.y0), s, s); }
  const ex = W * 0.76, ey = 190;
  const eg = b.createRadialGradient(ex - 30, ey - 30, 10, ex, ey, 90); eg.addColorStop(0, "#5ab0ff"); eg.addColorStop(1, "#103a8a");
  b.fillStyle = "rgba(90,176,255,.18)"; b.beginPath(); b.arc(ex, ey, 104, 0, TAU); b.fill();
  b.fillStyle = eg; b.beginPath(); b.arc(ex, ey, 88, 0, TAU); b.fill();
  b.fillStyle = "#3ddc84"; [[-30, -20, 30], [25, 20, 26], [-5, 45, 16]].forEach(([dx, dy, r]) => { b.beginPath(); b.ellipse(ex + dx, ey + dy, r, r * 0.6, dx, 0, TAU); b.fill(); });
  b.fillStyle = "rgba(255,255,255,.6)"; b.beginPath(); b.ellipse(ex + 10, ey - 40, 40, 8, 0.2, 0, TAU); b.fill();
  b.fillStyle = "#353745"; b.beginPath(); b.moveTo(R.x0, FT); for (let x = R.x0; x <= R.x1; x += 60) b.lineTo(x, FT - 30 - Math.abs(Math.sin(x * 0.007)) * 80); b.lineTo(R.x1, FT); b.fill();
  const gr = b.createLinearGradient(0, FT, 0, G); gr.addColorStop(0, "#6a6c7c"); gr.addColorStop(1, "#a5a7b4");
  b.fillStyle = gr; b.fillRect(R.x0, FT - 4, R.x1 - R.x0, G - FT + 4);
  for (let i = 0; i < 26; i++) { const x = R.x0 + srand() * (R.x1 - R.x0), y = FT + 20 + srand() * (G - FT - 30), r = 10 + srand() * 34; b.fillStyle = "rgba(0,0,0,.16)"; b.beginPath(); b.ellipse(x, y, r, r * 0.3, 0, 0, TAU); b.fill(); b.fillStyle = "rgba(255,255,255,.12)"; b.beginPath(); b.ellipse(x, y + 3, r * 0.8, r * 0.2, 0, 0, Math.PI); b.fill(); }
  b.strokeStyle = "rgba(255,255,255,.4)"; b.lineWidth = 3; b.setLineDash([10, 10]); b.beginPath(); b.moveTo(W / 2, FT); b.lineTo(W / 2, G); b.stroke(); b.setLineDash([]);
  b.fillStyle = "#ddd"; b.fillRect(W / 2 - 2, FT - 110, 4, 110); b.fillStyle = COL.p1; b.fillRect(W / 2 + 2, FT - 110, 50, 16); b.fillStyle = COL.p2; b.fillRect(W / 2 + 2, FT - 94, 50, 16);
  front(b, R, "#8a8c99", "#1d1e28", "rgba(255,255,255,.25)");
}
const ARENA_BG = { stadion: bgStadion, strand: bgStrand, neon: bgNeon, eis: bgEis, mond: bgMond };

function drawCrowd(t) {
  if (!crowdCanvas) return;
  const hype = crowdHype;
  // ganze Tribüne hüpft leicht im Takt
  const j = quality === "high" ? -Math.abs(Math.sin(t * (4 + hype * 8))) * (0.6 + hype * 5) : 0;
  ctx.drawImage(crowdCanvas, crowdRect.x0, crowdRect.y0 + j, crowdRect.x1 - crowdRect.x0, crowdRect.y1 - crowdRect.y0);
  if (hype > 0.3 && quality === "high") {
    // Arme hoch: helle Punkte zucken über die Tribüne
    ctx.fillStyle = `rgba(255,255,255,${hype * 0.25})`;
    for (let i = 0; i < 40; i++) { const x = ((i * 97.3 + t * 40) % (W + 200)) - 100, y = CROWD.stadion.top + ((i * 37) % (CROWD.stadion.bot - CROWD.stadion.top)); ctx.fillRect(x, y - Math.abs(Math.sin(t * 9 + i)) * 6, 3, 8); }
  }
  // Kamerablitze
  if (Math.random() < 0.05 + hype * 0.5) flashes.push({ x: rand(-200, W + 200), y: rand(crowdRect.y0 + 20, crowdRect.y1 - 10), t: 0.1 });
  ctx.globalCompositeOperation = "lighter";
  for (let i = flashes.length - 1; i >= 0; i--) {
    const f = flashes[i]; f.t -= 1 / 60; if (f.t <= 0) { flashes.splice(i, 1); continue; }
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 18); g.addColorStop(0, "rgba(255,255,255,.9)"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.fillRect(f.x - 18, f.y - 18, 36, 36);
  }
  ctx.globalCompositeOperation = "source-over";
}

function boards(st, t) {
  if (!["stadion", "eis"].includes(st.arena)) return;
  const y = FT - 38, h = 28;
  ctx.save(); ctx.beginPath(); ctx.rect(-900, y, W + 1800, h); ctx.clip();
  ctx.fillStyle = st.arena === "eis" ? "#0b2533" : "#08102a"; ctx.fillRect(-900, y, W + 1800, h);
  ctx.font = "17px 'Lilita One', Impact"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  const msg = "KOPFBALL DUELL  •  ", off = (t * 50) % 290;
  ctx.fillStyle = st.arena === "eis" ? "rgba(140,220,255,.7)" : "rgba(160,190,255,.55)";
  for (let i = -6; i < 12; i++) ctx.fillText(msg, i * 290 - off, y + h / 2 + 1);
  ctx.restore();
}

function lights(st, t) {
  if (quality !== "high") return;
  if (st.arena === "stadion") {
    ctx.globalCompositeOperation = "lighter";
    [[-30, -110], [W + 30, -110]].forEach(([x, y], n) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(n ? 0.6 : -0.6);
      const g = ctx.createLinearGradient(0, 0, 0, 820); g.addColorStop(0, "rgba(255,250,220,.16)"); g.addColorStop(1, "rgba(255,250,220,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-60, 0); ctx.lineTo(60, 0); ctx.lineTo(280, 820); ctx.lineTo(-280, 820); ctx.fill(); ctx.restore();
    });
    ctx.globalCompositeOperation = "source-over";
  }
  if (st.arena === "neon") {
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createLinearGradient(0, FT - 60, 0, G); g.addColorStop(0, "rgba(255,79,216,0)"); g.addColorStop(1, `rgba(255,79,216,${0.07 + Math.sin(t * 2) * 0.03})`);
    ctx.fillStyle = g; ctx.fillRect(-900, FT - 60, W + 1800, G - FT + 60);
    ctx.globalCompositeOperation = "source-over";
  }
  if (st.arena === "strand") {
    ctx.fillStyle = "rgba(255,240,200,.5)";
    for (let i = 0; i < 6; i++) { const x = W / 2 + Math.sin(t * 0.8 + i * 2) * 330, y = 316 + i * 11; ctx.fillRect(x, y, 20 + i * 4, 2); }
  }
}

// ---------- Tore ----------
const DEPTH = 34; // Tiefe des Tors (nach hinten oben versetzt)
function netOffset(side, x, y) {
  // Netz beult sich am Einschlagpunkt nach außen und schwingt aus
  const nh = netHit[side];
  if (nh.t > 1.4) return 0;
  const d = Math.abs(y - nh.y);
  return Math.max(0, Math.sin(nh.t * 16 + 0.6) * Math.exp(-nh.t * 3.5)) * 26 * nh.p * Math.exp(-(d * d) / 9000) * x;
}
function goalBack(st, side, t) {
  const by = barY(st, side), d = side ? -1 : 1, gl = side ? W - GOAL_W : GOAL_W; // Torlinie (vorne)
  const xb = side ? W : 0;
  netHit[side].t += 1 / 60;
  ctx.save();
  // Innenraum
  ctx.fillStyle = "rgba(0,0,0,.22)";
  ctx.beginPath(); ctx.moveTo(gl, by); ctx.lineTo(gl - d * 8, by - DEPTH * 0.6); ctx.lineTo(xb - d * 0, by - DEPTH * 0.6); ctx.lineTo(xb, G); ctx.lineTo(gl, G); ctx.closePath(); ctx.fill();
  // Netz: senkrechte Fäden (von vorne nach hinten), waagerechte Fäden
  ctx.strokeStyle = "rgba(255,255,255,.42)"; ctx.lineWidth = 1.4;
  const cols = 9;
  for (let k = 0; k <= cols; k++) {
    const f = k / cols, x = gl - d * f * GOAL_W;
    ctx.beginPath();
    for (let y = by - DEPTH * 0.6 * f; y <= G; y += 10) ctx.lineTo(x - d * netOffset(side, f, y), y);
    ctx.stroke();
  }
  for (let y = by + 8; y <= G; y += 12) {
    ctx.beginPath();
    for (let k = 0; k <= cols; k++) { const f = k / cols, x = gl - d * f * GOAL_W; ctx.lineTo(x - d * netOffset(side, f, y), y); }
    ctx.stroke();
  }
  // Dachnetz
  for (let k = 0; k <= 4; k++) { const yy = by - DEPTH * 0.6 * (k / 4); ctx.beginPath(); ctx.moveTo(gl - d * 8 * (k / 4), yy); ctx.lineTo(xb, yy); ctx.stroke(); }
  // hintere Stange
  ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(gl - d * 8, by - DEPTH * 0.6); ctx.lineTo(xb, by - DEPTH * 0.6); ctx.stroke();
  ctx.restore();
}
function goalFront(st, side, t) {
  const by = barY(st, side), x0 = side ? W - GOAL_W : 0;
  const big = st.bigGoal[side] > 0;
  const w = barWob[side] < 0.6 ? Math.sin(barWob[side] * 60) * Math.exp(-barWob[side] * 8) * 4 : 0;
  ctx.save();
  ctx.lineJoin = "round";
  // Latte
  ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.rect(x0 - 2, by - BAR_T / 2 + w, GOAL_W + 4, BAR_T); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(0,0,40,.18)"; ctx.fillRect(x0, by + w + 1, GOAL_W, BAR_T / 2 - 2);
  // Pfosten vorne
  const px = side ? W - GOAL_W - 5 : GOAL_W - 5;
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.rect(px, by - BAR_T / 2 + w, 10, G - by + BAR_T / 2 - w); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(0,0,40,.18)"; ctx.fillRect(px + (side ? 1 : 6), by + 6, 3, G - by - 6);
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
function drawPlayerBase(p) {
  const r = pr(p), col = TEAM[p.i];
  const foot = p.y + (FOOT + SR) * p.sc;
  const sh = clamp(1 - (G - foot) / 420, 0.25, 1);
  ctx.fillStyle = `rgba(0,0,20,${0.32 * sh})`; ctx.beginPath(); ctx.ellipse(p.x, G + 3, r * 0.95 * sh, 9 * sh, 0, 0, TAU); ctx.fill();
  // dünner Team-Ring am Boden
  ctx.strokeStyle = col; ctx.globalAlpha = 0.75 * sh; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(p.x, G + 3, r * 1.05, 11, 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
  // Aufladen: Bogen am Boden + glühender Fuß
  if (p.kHeld && p.charge > 0) {
    ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.ellipse(p.x, G + 3, r * 1.05, 11, 0, Math.PI * 0.05, Math.PI * 0.95); ctx.stroke();
    ctx.strokeStyle = p.charge >= 1 ? COL.gold : "#fff"; ctx.lineWidth = 5;
    const a0 = p.dir > 0 ? Math.PI * 0.95 : Math.PI * 0.05, a1 = a0 - p.dir * Math.PI * 0.9 * p.charge;
    ctx.beginPath(); ctx.ellipse(p.x, G + 3, r * 1.05, 11, 0, Math.min(a0, a1), Math.max(a0, a1)); ctx.stroke();
  }
}
function drawPlayer(st, p, t, label) {
  const c = charById(p.ch), r = pr(p), col = TEAM[p.i];
  const s = shoePos(p);
  // Super bereit: Aura hinter dem Kopf
  if (p.armed > 0 || p.fireNext) {
    const sc = p.fireNext ? SUPERS.fire.col : SUPERS[c.super].col;
    ctx.globalCompositeOperation = "lighter";
    const rr = r * (1.55 + Math.sin(t * 10) * 0.08);
    const g = ctx.createRadialGradient(p.x, p.y, r * 0.8, p.x, p.y, rr);
    g.addColorStop(0, sc + "cc"); g.addColorStop(1, sc + "00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.fill();
    for (let k = 0; k < 6; k++) { const a = t * 3 + k * TAU / 6; ctx.fillStyle = sc; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * r * 1.25, p.y + Math.sin(a) * r * 1.25, 3.5, 0, TAU); ctx.fill(); }
    ctx.globalCompositeOperation = "source-over";
  }
  // Kopf staucht sich bei Kopfball / Landung
  const hq = headSq[p.i] > 0 ? Math.sin((1 - headSq[p.i] / 0.18) * Math.PI) * 0.16 : 0;
  const lq = p.land > 0 ? p.land * 0.9 : 0;
  const sqY = 1 - Math.max(hq, lq), sqX = 1 + Math.max(hq, lq) * 0.7;
  // Schuh (glüht beim Aufladen)
  if (p.kHeld && p.charge > 0.1) {
    ctx.globalCompositeOperation = "lighter";
    const gr = SR * p.sc * (2.2 + p.charge * 1.6);
    const g = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, gr);
    g.addColorStop(0, (p.charge >= 1 ? COL.gold : "#ffffff") + "cc"); g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(s.x, s.y, gr, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }
  drawShoe(ctx, s.x, s.y, SR * p.sc, p.dir, col, p.kick > 0 ? -p.dir * 0.6 * s.k : p.kHeld && p.charge > 0 ? p.dir * p.charge * 0.55 : 0);
  ctx.save();
  ctx.translate(p.x, p.y + r); ctx.scale(sqX, sqY); ctx.translate(-p.x, -p.y - r);
  const b = st.b;
  const look = Math.atan2(b.y - p.y, b.x - p.x);
  const blink = Math.sin(t * 1.3 + p.i * 2) > 0.985;
  drawHead(ctx, p.ch, p.x, p.y, r, { dir: p.dir, look, mood: p.stun > 0 ? "sad" : p.mood, blink, effort: (p.kHeld && p.charge > 0.2) || p.kick > 0.1, frozen: p.frz > 0, t: t + p.i * 3 });
  ctx.restore();
  if (p.frz > 0) drawIce(p, r, s, t);
  if (p.confT > 0) {
    ctx.save(); ctx.strokeStyle = "#b28cff"; ctx.lineWidth = 3;
    for (let k = 0; k < 2; k++) { ctx.beginPath(); for (let n = 0; n < 24; n++) { const a = t * 8 + k * Math.PI + n * 0.3, rr = 4 + n * 0.6; ctx.lineTo(p.x + (k ? 18 : -18) + Math.cos(a) * rr, p.y - r * 1.2 + Math.sin(a) * rr * 0.6); } ctx.stroke(); }
    ctx.restore();
  }
  if (p.stun > 0) {
    for (let k = 0; k < 3; k++) { const a = t * 6 + k * TAU / 3; starShape(p.x + Math.cos(a) * r * 0.8, p.y - r * 1.15 + Math.sin(a) * 8, 8, a); ctx.fillStyle = COL.gold; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  // Marker nur am Anfang (main blendet ihn aus)
  if (label && label.a > 0) {
    const my = p.y - r - 30 - (p.stun > 0 ? 14 : 0);
    ctx.save(); ctx.globalAlpha = label.a;
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(p.x - 9, my + 6); ctx.lineTo(p.x + 9, my + 6); ctx.lineTo(p.x, my + 16); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.font = "15px 'Lilita One', Impact"; ctx.textAlign = "center"; ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 5; ctx.strokeText(label.t, p.x, my + 2); ctx.fillText(label.t, p.x, my + 2);
    ctx.restore();
  }
  if (p.emo && p.emoT > 0) {
    const a = Math.min(1, p.emoT * 3), pop = 1 + Math.max(0, p.emoT - 1.9) * 2;
    const ex = p.x + p.dir * r * 0.7, ey = p.y - r - 62;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(ex, ey); ctx.scale(pop, pop);
    ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = "round";
    roundRect(-34, -26, 68, 48, 18); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-p.dir * 4, 21); ctx.lineTo(-p.dir * 16, 36); ctx.lineTo(p.dir * 8, 21); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.fillRect(-p.dir * 6 - 6, 17, 16, 6);
    ctx.font = p.emo.length > 2 ? "22px 'Lilita One', Impact" : "30px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji'"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = INK; ctx.fillText(p.emo, 0, 0);
    ctx.restore();
  }
}
// Eisschale um Kopf und Fuß: Kristall-Facetten, Glanz, Eiszapfen, Risse kurz vorm Auftauen
const ICE_SHAPE = [0, 1].map(i => { seedN = 4242 + i * 99; return Array.from({ length: 11 }, (_, k) => ({ a: k / 11 * TAU + (srand() - 0.5) * 0.35, r: 1.16 + srand() * 0.22 })); });
function drawIce(p, r, s, t) {
  const pts = ICE_SHAPE[p.i], cy = p.y + r * 0.18, a = clamp(p.frz / 0.25, 0, 1);
  ctx.save(); ctx.globalAlpha = 0.35 + 0.65 * a; ctx.lineJoin = "round";
  // Kopf bläulich einfärben
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalCompositeOperation = "source-over";
  ctx.beginPath(); pts.forEach((q, n) => { const x = p.x + Math.cos(q.a) * r * q.r, y = cy + Math.sin(q.a) * r * q.r * 1.12; n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath();
  const g = ctx.createLinearGradient(p.x - r, cy - r, p.x + r, cy + r);
  g.addColorStop(0, "rgba(225,248,255,.72)"); g.addColorStop(0.5, "rgba(150,215,245,.45)"); g.addColorStop(1, "rgba(90,170,230,.6)");
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 3; ctx.stroke();
  ctx.strokeStyle = "rgba(40,110,170,.55)"; ctx.lineWidth = 1.5; ctx.stroke();
  // Facetten
  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1.6; ctx.beginPath();
  for (let k = 0; k < pts.length; k += 2) { const q = pts[k]; ctx.moveTo(p.x + Math.cos(q.a) * r * q.r, cy + Math.sin(q.a) * r * q.r * 1.12); ctx.lineTo(p.x + Math.cos(q.a + 0.4) * r * 0.45, cy + Math.sin(q.a + 0.4) * r * 0.5); }
  ctx.stroke();
  // Glanzstreifen
  ctx.fillStyle = "rgba(255,255,255,.75)";
  ctx.beginPath(); ctx.ellipse(p.x - r * 0.55, cy - r * 0.7, r * 0.12, r * 0.42, 0.6, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(p.x - r * 0.3, cy - r * 0.95, r * 0.06, r * 0.16, 0.6, 0, TAU); ctx.fill();
  // Eiszapfen
  ctx.fillStyle = "rgba(200,240,255,.85)"; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 1.5;
  [-0.45, -0.1, 0.3].forEach((k, n) => { const x = p.x + k * r * 1.6, y = cy + r * 1.08; ctx.beginPath(); ctx.moveTo(x - 7, y - 4); ctx.lineTo(x + 7, y - 4); ctx.lineTo(x + 1, y + 14 + n * 5); ctx.closePath(); ctx.fill(); ctx.stroke(); });
  // Fuß im Eisklotz
  ctx.fillStyle = "rgba(190,235,255,.6)"; ctx.strokeStyle = "rgba(255,255,255,.9)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.ellipse(s.x, s.y + 2, SR * p.sc * 2.1, SR * p.sc * 1.4, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // Risse kurz vorm Auftauen
  if (p.frz < 0.45) {
    ctx.strokeStyle = "rgba(255,255,255,.95)"; ctx.lineWidth = 2; ctx.beginPath();
    ctx.moveTo(p.x - r * 0.1, cy - r * 1.1); ctx.lineTo(p.x + r * 0.1, cy - r * 0.5); ctx.lineTo(p.x - r * 0.15, cy - r * 0.1); ctx.lineTo(p.x + r * 0.2, cy + r * 0.4);
    ctx.moveTo(p.x + r * 0.1, cy - r * 0.5); ctx.lineTo(p.x + r * 0.6, cy - r * 0.6);
    ctx.stroke();
    if (Math.random() < 0.3) P({ type: "shard", x: p.x + rand(-r, r), y: cy + rand(-r, r), vx: rand(-60, 60), vy: rand(-80, 20), life: 0.4, size: 4, col: "#dff6ff", g: 600, rot: rand(0, 6), vr: 5 });
  }
  ctx.restore();
}
function drawSwooshes() {
  for (const w of swoosh) {
    const k = w.t / 0.16, a = 1 - k;
    ctx.save(); ctx.translate(w.x, w.y); ctx.scale(w.dir, 1);
    ctx.globalAlpha = a * 0.9; ctx.strokeStyle = w.pow > 1.5 ? COL.gold : "#fff"; ctx.lineCap = "round";
    ctx.lineWidth = 6 + 6 * (w.pow - 1);
    const r = 40 + 30 * (w.pow - 1);
    ctx.beginPath(); ctx.arc(-6, -r * 0.55, r, Math.PI * (0.25 + k * 0.2), Math.PI * (0.75 - k * 0.1)); ctx.stroke();
    ctx.globalAlpha = a * 0.4; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-6, -r * 0.55, r + 10, Math.PI * 0.3, Math.PI * 0.7); ctx.stroke();
    ctx.restore();
  }
}
function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ---------- Ball ----------
function drawBallShadow(b) {
  const h = clamp((G - b.y - b.r) / 450, 0, 1);
  ctx.fillStyle = `rgba(0,0,20,${0.3 * (1 - h) * (b.alpha ?? 1)})`;
  ctx.beginPath(); ctx.ellipse(b.x, G + 3, b.r * (1.1 - h * 0.5), 6 * (1 - h * 0.6), 0, 0, TAU); ctx.fill();
}
function drawBallFx(st, b, t, skin, replay) {
  const sp = Math.hypot(b.vx || 0, b.vy || 0);
  const col = b.fx ? SUPERS[b.fx].col : "#fff";
  if (!replay) { trail.push({ x: b.x, y: b.y, r: b.r, fx: b.fx, sp }); if (trail.length > 12) trail.shift(); }
  const tr = replay ? replay : trail;
  // Tempo-Streifen bei harten Schüssen, Farbschweif bei Spezialschüssen
  if (tr.length > 2) {
    ctx.globalCompositeOperation = "lighter"; ctx.lineCap = "round";
    for (let i = 1; i < tr.length; i++) {
      const p0 = tr[i - 1], p1 = tr[i], k = i / tr.length;
      if (p1.sp < 700 && !p1.fx) continue;
      ctx.globalAlpha = k * (p1.fx ? 0.6 : clamp((p1.sp - 700) / 900, 0, 0.5)) * (b.alpha ?? 1);
      ctx.strokeStyle = p1.fx ? SUPERS[p1.fx].col : "#ffffff";
      ctx.lineWidth = p1.r * (p1.fx ? 1.6 : 1.1) * k;
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
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
  if (b.fx) {
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(b.x, b.y, b.r * 0.5, b.x, b.y, b.r * 2.6);
    g.addColorStop(0, col + "cc"); g.addColorStop(1, col + "00");
    ctx.globalAlpha = b.alpha ?? 1;
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.6, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  }
  if (b.fx === "clone") {
    const amp = 95 * Math.sin(Math.min(1, b.fxT / 0.35) * Math.PI / 2);
    const d = Math.hypot(b.fxDX, b.fxDY) || 1, px = -b.fxDY / d, py = b.fxDX / d;
    [-1, 0, 1].forEach(k => { if (k === b.fxK) return; drawBall(ctx, skin, b.fxBX + px * amp * k, b.fxBY + py * amp * k, b.r, b.a, 0.95); });
  }
  // Ziel-Warnung, damit man Meteor und Rakete abwehren kann
  if ((b.fx === "meteor" && b.fxP !== 2) || (b.fx === "rocket" && b.fxP === 0)) {
    const tx = b.fxTX, ty = b.fx === "meteor" ? G - 6 : b.fxTY, pulse = 0.6 + Math.sin(t * 22) * 0.4;
    ctx.save(); ctx.strokeStyle = `rgba(255,70,70,${pulse})`; ctx.lineWidth = 4; ctx.setLineDash([10, 8]);
    if (b.fx === "meteor") { ctx.beginPath(); ctx.ellipse(tx, ty, 70, 14, 0, 0, TAU); ctx.stroke(); }
    else { ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(tx, ty, 26, 0, TAU); ctx.stroke(); }
    ctx.restore();
  }
  // Ball über dem Bildrand: Pfeil mit Höhe
  const top = visTop();
  if (b.y < top - 6) {
    const ay = top + 26;
    ctx.save(); ctx.globalAlpha = 0.95;
    ctx.fillStyle = col === "#fff" ? COL.gold : col; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(b.x, ay - 18); ctx.lineTo(b.x + 15, ay + 6); ctx.lineTo(b.x - 15, ay + 6); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  // Dehnen in Flugrichtung, Stauchen beim Aufprall
  let stretch = null;
  if (ballSq.t < 0.12 && !replay) {
    const k = Math.sin((ballSq.t / 0.12) * Math.PI);
    stretch = { ang: ballSq.ang, k: 1 - 0.32 * ballSq.p * k };
  } else if (sp > 800) stretch = { ang: Math.atan2(b.vy, b.vx), k: 1 + Math.min(0.22, (sp - 800) / 3500) };
  drawBall(ctx, skin, b.x, b.y, b.r, b.a, b.alpha ?? 1, stretch);
}

function drawPowerups(st, t) {
  for (const u of st.pu) {
    const y = u.y + Math.sin(u.t * 3) * 8, col = POWERUPS[u.k].col;
    const pop = Math.min(1, u.t * 4) * (u.t > 11 ? (Math.sin(u.t * 20) > 0 ? 1 : 0.4) : 1);
    const sc = 0.6 + 0.4 * Math.min(1, u.t * 5);
    ctx.save(); ctx.globalAlpha = pop; ctx.translate(u.x, y); ctx.scale(sc, sc);
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(0, 0, 6, 0, 0, 58); g.addColorStop(0, col + "99"); g.addColorStop(1, col + "00");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 58, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    ctx.rotate(Math.sin(u.t * 2) * 0.15);
    ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 27, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 29.5, 0, TAU); ctx.stroke();
    drawPuIcon(ctx, u.k, 0, 0, 14);
    ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.ellipse(-11, -15, 8, 4, -0.6, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

// ---------- HUD ----------
const avCache = new Map();
function avatar(chId, size, mood) {
  const k = chId + size + mood + dpr + base.s;
  if (avCache.has(k)) return avCache.get(k);
  const c = document.createElement("canvas"); const px = Math.max(40, Math.round(size * base.s * dpr * 1.2));
  c.width = c.height = px; const x = c.getContext("2d");
  drawHead(x, chId, px / 2, px * 0.56, px * 0.3, { mood });
  avCache.set(k, c); return c;
}
function pill(x, y, w, h, r, fill) { roundRect(x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); }
function hud(st, t, names, opts) {
  const y = visTop() + 12, cx = W / 2, Wd = 600, Hh = 56;
  ctx.save();
  ctx.textBaseline = "middle";
  // Hauptleiste
  ctx.globalAlpha = 0.35; pill(cx - Wd / 2 + 3, y + 5, Wd, Hh, 16, "#000"); ctx.globalAlpha = 1;
  pill(cx - Wd / 2, y, Wd, Hh, 16, "rgba(8,14,40,.92)");
  [0, 1].forEach(i => {
    const d = i ? 1 : -1, p = st.p[i];
    // Team-Kante
    ctx.save(); roundRect(cx - Wd / 2, y, Wd, Hh, 16); ctx.clip();
    ctx.fillStyle = TEAM[i]; ctx.fillRect(i ? cx + Wd / 2 - 8 : cx - Wd / 2, y, 8, Hh);
    const g = ctx.createLinearGradient(cx + d * Wd / 2, 0, cx + d * 60, 0); g.addColorStop(0, TEAM[i] + "40"); g.addColorStop(1, TEAM[i] + "00");
    ctx.fillStyle = g; ctx.fillRect(i ? cx + 60 : cx - Wd / 2, y, Wd / 2 - 60, Hh);
    ctx.restore();
    // Avatar
    const ax = cx + d * (Wd / 2 - 40);
    ctx.drawImage(avatar(p.ch, 50, ""), ax - 27, y + 1, 54, 54);
    // Name
    ctx.font = "900 18px Nunito, sans-serif"; ctx.fillStyle = "#fff"; ctx.textAlign = i ? "right" : "left";
    ctx.fillText((names[i] || "").toUpperCase().slice(0, 12), cx + d * (Wd / 2 - 76), y + 19);
    // Super-Leiste
    if (st.rules && !st.rules.supers) { /* Spezialschüsse aus */ } else {
    const mw = 150, mx = i ? cx + Wd / 2 - 76 - mw : cx - Wd / 2 + 76, my = y + 35;
    pill(mx, my, mw, 9, 4.5, "rgba(255,255,255,.14)");
    const fill = p.armed > 0 ? 1 : p.meter / 100;
    if (fill > 0) {
      const full = p.full || p.armed > 0;
      const fw = Math.max(9, mw * fill);
      pill(i ? mx + mw - fw : mx, my, fw, 9, 4.5, full ? (Math.sin(t * 12) > 0 ? COL.gold : "#fff8c0") : TEAM[i]);
    }
    if (p.full || p.armed > 0) {
      ctx.font = "12px 'Lilita One', Impact"; ctx.textAlign = i ? "right" : "left"; ctx.fillStyle = COL.gold;
      ctx.fillText(p.armed > 0 ? "BEREIT!" : "SUPER", i ? mx - 6 : mx + mw + 6, my + 5);
    }
    }
    // aktive Power-ups als kleine Symbole unter der Leiste
    const buffs = [];
    if (p.bigT > 0) buffs.push(["bighead", p.bigT / 6]); if (p.miniT > 0) buffs.push(["mini", p.miniT / 6]);
    if (p.spdT > 0) buffs.push(["speed", p.spdT / 6]); if (p.jmpT > 0) buffs.push(["jump", p.jmpT / 6]);
    if (p.fireNext) buffs.push(["fire", 1]); if (st.wall[i] > 0) buffs.push(["wall", st.wall[i] / 5]);
    if (p.frz > 0) buffs.push(["freeze", p.frz / 1.5]); if (st.bigGoal[i] > 0) buffs.push(["biggoal", st.bigGoal[i] / 6]);
    if (p.confT > 0) buffs.push(["confuse", p.confT / 3.5]); if (p.djT > 0) buffs.push(["dbljump", p.djT / 7]);
    if (st.wind && st.wind.t > 0 && st.wind.dir === p.dir) buffs.push(["wind", st.wind.t / 5]);
    buffs.forEach(([k, v], n) => {
      const bx = cx + d * (Wd / 2 - 24 - n * 34), by = y + Hh + 20;
      ctx.fillStyle = POWERUPS[k].col; ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(bx, by, 13, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(bx, by, 16, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(v, 0, 1)); ctx.stroke();
      drawPuIcon(ctx, k, bx, by, 7.5);
    });
  });
  // Spielstand und Zeit
  ctx.textAlign = "center";
  pill(cx - 70, y + 4, 140, Hh - 8, 12, "rgba(255,255,255,.06)");
  ctx.font = "34px 'Lilita One', Impact, sans-serif";
  ctx.fillStyle = COL.p1; ctx.fillText(st.s[0], cx - 40, y + 25);
  ctx.fillStyle = COL.p2; ctx.fillText(st.s[1], cx + 40, y + 25);
  ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.font = "22px 'Lilita One', Impact"; ctx.fillText("–", cx, y + 23);
  let tt;
  if (st.gold) { tt = "GOLDEN GOAL"; ctx.fillStyle = Math.sin(t * 6) > 0 ? COL.gold : "#fff"; ctx.font = "11px 'Lilita One', Impact"; }
  else if (st.train) { tt = "TRAINING"; ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = "13px 'Lilita One', Impact"; }
  else if (st.rules && st.rules.win) { tt = "BIS " + st.rules.win; ctx.fillStyle = COL.gold; ctx.font = "15px 'Lilita One', Impact"; }
  else { const sec = Math.ceil(st.t); tt = Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); ctx.fillStyle = sec <= 10 && st.ph === "play" ? (Math.sin(t * 10) > 0 ? "#ff6a6a" : "#fff") : "rgba(255,255,255,.85)"; ctx.font = "15px 'Lilita One', Impact"; }
  ctx.fillText(tt, cx, y + 44);
  const sub = [opts.series, st.mod && opts.modName ? "⚡ " + opts.modName : ""].filter(Boolean).join("   ");
  if (sub) { ctx.font = "800 15px Nunito, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillText(sub, cx, y + Hh + 16); }
  ctx.restore();
}

function drawCallouts(dt) {
  for (let i = callouts.length - 1; i >= 0; i--) {
    const c = callouts[i]; c.t += dt;
    if (c.t > c.dur) { callouts.splice(i, 1); continue; }
    const k = c.t / c.dur;
    const pop = c.t < 0.16 ? 0.4 + (c.t / 0.16) * 0.8 : c.t < 0.28 ? 1.2 - (c.t - 0.16) / 0.12 * 0.2 : 1;
    const a = k > 0.8 ? (1 - k) / 0.2 : 1;
    const y = visTop() + 190;
    ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, y); ctx.scale(pop * c.size, pop * c.size); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.font = "88px 'Lilita One', Impact, sans-serif";
    ctx.lineWidth = 24; ctx.strokeStyle = "#fff"; ctx.strokeText(c.text, 0, 0);
    ctx.lineWidth = 13; ctx.strokeStyle = INK; ctx.strokeText(c.text, 0, 0);
    ctx.fillStyle = INK; ctx.fillText(c.text, 6, 6);
    ctx.fillStyle = c.col; ctx.fillText(c.text, 0, 0);
    if (c.sub) { ctx.font = "30px 'Lilita One', Impact"; ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.strokeText(c.sub, 0, 74); ctx.fillStyle = "#fff"; ctx.fillText(c.sub, 0, 74); }
    ctx.restore();
  }
}

function vsIntro(st, names, e) {
  const slide = k => 1 - Math.pow(1 - clamp(k, 0, 1), 3);
  const out = clamp((e - 1.6) / 0.5, 0, 1);
  const y = visTop() + 170;
  [0, 1].forEach(i => {
    const k = slide(e / 0.4) - out * 1.3, d = i ? 1 : -1;
    const x = W / 2 + d * (250 + (1 - k) * 900);
    ctx.save(); ctx.globalAlpha = clamp(1 - out, 0, 1);
    ctx.save(); ctx.translate(x, y); ctx.transform(1, 0, -0.18, 1, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(-186, -46, 372, 92);
    const g = ctx.createLinearGradient(0, -40, 0, 40); g.addColorStop(0, shade(TEAM[i], 0.15)); g.addColorStop(1, shade(TEAM[i], -0.3));
    ctx.fillStyle = g; ctx.fillRect(-180, -40, 360, 80);
    ctx.font = "34px 'Lilita One', Impact"; ctx.textAlign = i ? "left" : "right"; ctx.textBaseline = "middle"; ctx.fillStyle = INK;
    ctx.fillText((names[i] || "").toUpperCase().slice(0, 10), i ? -100 : 100, 3);
    ctx.restore();
    ctx.drawImage(avatar(st.p[i].ch, 90, ""), x + (i ? 70 : -190), y - 64, 116, 116);
    ctx.restore();
  });
  const vk = clamp((e - 0.3) / 0.25, 0, 1) * (1 - out);
  if (vk > 0) {
    ctx.save(); ctx.translate(W / 2, y + 4); ctx.scale(0.6 + vk * 0.4, 0.6 + vk * 0.4); ctx.globalAlpha = vk;
    ctx.font = "76px 'Lilita One', Impact"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    ctx.lineWidth = 22; ctx.strokeStyle = "#fff"; ctx.strokeText("VS", 0, 0); ctx.lineWidth = 12; ctx.strokeStyle = INK; ctx.strokeText("VS", 0, 0);
    ctx.fillStyle = COL.gold; ctx.fillText("VS", 0, 0); ctx.restore();
  }
}
function weather(st, t) {
  if (quality !== "high") return;
  if (st.arena === "eis") {
    ctx.fillStyle = "rgba(255,255,255,.75)";
    for (let i = 0; i < 70; i++) {
      const sx = (i * 137.5) % 1, sy = (i * 71.3) % 1, sp = 30 + (i % 7) * 9;
      const x = -200 + sx * (W + 400) + Math.sin(t * 0.8 + i) * 24, y = ((sy * (H + 80) + t * sp) % (H + 80)) - 40;
      ctx.beginPath(); ctx.arc(x, y, 1.5 + (i % 3), 0, TAU); ctx.fill();
    }
  } else if (st.arena === "neon") {
    ctx.strokeStyle = "rgba(180,140,255,.22)"; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < 60; i++) {
      const sx = (i * 137.5) % 1, sy = (i * 71.3) % 1;
      const x = -200 + sx * (W + 400) - ((t * 120) % 200), y = ((sy * (H + 80) + t * 900) % (H + 80)) - 40;
      ctx.moveTo(x, y); ctx.lineTo(x - 6, y + 22);
    }
    ctx.stroke();
  } else if (st.arena === "mond") {
    for (let i = 0; i < 18; i++) { const a = 0.4 + 0.6 * Math.abs(Math.sin(t * (1 + i % 4) + i)); ctx.fillStyle = `rgba(255,255,255,${a})`; const x = (i * 211) % W, y = 40 + (i * 97) % 300; ctx.fillRect(x, y, 3, 3); }
  }
}

// ---------- Haupt-Zeichnung ----------
// opts: { names, labels [{t,a}|null], ballSkin, dt, replay, replayFrac, series, modName, noHud, canSkip }
export function render(st, t, opts) {
  const dt = opts.dt || 1 / 60;
  buildBg(st.arena);
  tickParts(dt);
  crowdHype = Math.max(0, crowdHype - dt * 0.35);
  let view = st, rep = null;
  if (opts.replay && opts.replay.length > 2) {
    const idx = clamp(Math.floor(opts.replayFrac * (opts.replay.length - 1)), 0, opts.replay.length - 1);
    view = opts.replay[idx]; rep = opts.replay.slice(Math.max(0, idx - 10), idx + 1).map(s => ({ x: s.b.x, y: s.b.y, r: s.b.r, fx: s.b.fx, sp: Math.hypot(s.b.vx, s.b.vy) }));
  }
  let tz = 1, tx = W / 2, ty = H / 2;
  if (rep) {
    const top = Math.min(view.b.y, view.p[0].y - 90, view.p[1].y - 90) - 70, bot = G + 50;
    tz = clamp((H * 0.62) / (bot - top), 1, 1.5); tx = view.b.x; ty = (top + bot) / 2;
  } else if (st.ph === "goal" && st.pt > 3.0) { tz = 1.1; tx = st.b.x; ty = Math.min(st.b.y, G - 160); }
  const k = Math.min(1, dt * (rep ? 6 : 3));
  cam.z += (tz - cam.z) * k; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
  cam.punch = Math.max(0, cam.punch - dt * 0.5);
  cam.shake *= Math.max(0, 1 - dt * 7);
  cam.sx = (Math.random() - 0.5) * cam.shake; cam.sy = (Math.random() - 0.5) * cam.shake;
  const z = cam.z + cam.punch;
  const s = base.s * z;
  const ox0 = base.ox + W / 2 * base.s, oy0 = base.oy + H / 2 * base.s;
  const X1a = -base.ox / base.s, X1b = (cw - base.ox) / base.s, Y1a = -base.oy / base.s, Y1b = (ch - base.oy) / base.s;
  const cx = z > 1.001 ? clamp(cam.x, X1a + ox0 / s, X1b - (cw - ox0) / s) : W / 2;
  const cy = z > 1.001 ? clamp(cam.y, Y1a + oy0 / s, Y1b - (ch - oy0) / s) : H / 2;
  const ox = ox0 - cx * s + cam.sx, oy = oy0 - cy * s + cam.sy;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, ch);
  const pad = 60;
  ctx.save();
  ctx.translate(ox0 + cam.sx, oy0 + cam.sy); ctx.scale(z, z); ctx.translate(-(cx - W / 2) * base.s - ox0, -(cy - H / 2) * base.s - oy0);
  ctx.drawImage(bgCanvas, -pad, -pad, cw + pad * 2, ch + pad * 2);
  ctx.restore();
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
  drawCrowd(t);
  boards(st, t);
  lights(st, t);
  goalBack(view, 0, t); goalBack(view, 1, t);
  drawPowerups(view, t);
  view.p.forEach(p => drawPlayerBase(p));
  drawBallShadow(view.b);
  const labels = opts.labels || [];
  view.p.forEach(p => drawPlayer(view, p, t, rep ? null : labels[p.i]));
  drawParts(false);
  weather(view, t);
  drawBallFx(view, view.b, t, opts.ballSkin || "klassik", rep);
  if (!rep) drawSwooshes();
  goalFront(view, 0, t); goalFront(view, 1, t);
  ctx.globalCompositeOperation = "lighter"; drawParts(true); ctx.globalCompositeOperation = "source-over";
  // Aufladen: Funken am Fuß
  if (!rep) view.p.forEach(p => { if (p.kHeld && p.charge > 0.15 && Math.random() < p.charge) { const sp = shoePos(p); burst("charge", sp.x, sp.y, { col: p.charge >= 1 ? COL.gold : "#fff" }); } });
  // Overlays in Basiskoordinaten
  ctx.setTransform(dpr * base.s, 0, 0, dpr * base.s, dpr * base.ox, dpr * base.oy);
  if (!opts.noHud && !rep) hud(st, t, opts.names || ["", ""], opts);
  if ((st.ph === "cd" || st.ph === "ko") && !opts.noHud) {
    const n = st.ph === "ko" ? "" : st.pt > 2 ? "3" : st.pt > 1 ? "2" : st.pt > 0.25 ? "1" : "";
    const lab = st.ph === "ko" ? "WEITER!" : st.gold && st.pt > 0.25 ? "GOLDEN GOAL" : n;
    if (lab) {
      const f = st.ph === "ko" ? 1 : (st.pt % 1);
      ctx.save(); ctx.translate(W / 2, visTop() + 220); const sc = 0.8 + f * 0.45; ctx.scale(sc, sc); ctx.transform(1, 0, -0.15, 1, 0, 0);
      ctx.font = (lab.length > 2 ? 66 : 130) + "px 'Lilita One', Impact"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
      ctx.lineWidth = 26; ctx.strokeStyle = "#fff"; ctx.strokeText(lab, 0, 0); ctx.lineWidth = 15; ctx.strokeStyle = INK; ctx.strokeText(lab, 0, 0);
      ctx.fillStyle = st.gold ? COL.gold : "#fff"; ctx.fillText(lab, 0, 0);
      if (st.gold && st.ph === "cd") { ctx.font = "28px 'Lilita One', Impact"; ctx.lineWidth = 9; ctx.strokeStyle = INK; ctx.strokeText("NÄCHSTES TOR GEWINNT", 0, 66); ctx.fillStyle = "#fff"; ctx.fillText("NÄCHSTES TOR GEWINNT", 0, 66); }
      ctx.restore();
    }
  }
  if (!rep) drawCallouts(dt);
  if (st.ph === "cd" && !st.gold && st.s[0] + st.s[1] === 0 && st.pt > 0.9 && !opts.noHud) vsIntro(st, opts.names || ["", ""], 3 - st.pt);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (rep) {
    const bar = Math.min(cw, ch) * 0.07;
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, cw, bar); ctx.fillRect(0, ch - bar, cw, bar);
    ctx.font = `${Math.round(bar * 0.42)}px 'Lilita One', Impact`; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillStyle = Math.sin(t * 6) > 0 ? "#ff3b30" : "#661010"; ctx.beginPath(); ctx.arc(24 + bar * 0.2, bar / 2, bar * 0.16, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.fillText("WIEDERHOLUNG", 30 + bar * 0.45, bar / 2 + 1);
    ctx.textAlign = "right"; ctx.font = `800 ${Math.round(bar * 0.36)}px Nunito, sans-serif`; ctx.fillStyle = "rgba(255,255,255,.7)";
    if (opts.canSkip) ctx.fillText("Tippen zum Überspringen", cw - 20, ch - bar / 2);
  }
  if (quality === "high") {
    const vg = ctx.createRadialGradient(cw / 2, ch * 0.55, Math.min(cw, ch) * 0.5, cw / 2, ch * 0.55, Math.max(cw, ch) * 0.8);
    vg.addColorStop(0, "rgba(0,0,20,0)"); vg.addColorStop(1, "rgba(0,0,20,.32)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
  }
  if (cam.flash > 0) { ctx.globalAlpha = cam.flash; ctx.fillStyle = cam.flashCol; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; cam.flash = Math.max(0, cam.flash - dt * 2.5); }
}

// Vorschaubild einer Arena (für Menüs)
const thumbCache = new Map();
export function arenaThumb(arena, w, h) {
  const k = arena + w + "x" + h;
  const copy = c => { const d = document.createElement("canvas"); d.width = c.width; d.height = c.height; d.getContext("2d").drawImage(c, 0, 0); return d; };
  if (thumbCache.has(k)) return copy(thumbCache.get(k));
  const c = document.createElement("canvas"), r = Math.min(2, window.devicePixelRatio || 1);
  c.width = w * r; c.height = h * r;
  const b = c.getContext("2d");
  const s = (w * r) / (W * 0.9), ox = -(W * 0.05) * s, oy = (h * r) - (H - 10) * s;
  b.setTransform(s, 0, 0, s, ox, oy);
  seedN = 12345;
  const R = { x0: -ox / s, x1: (w * r - ox) / s, y0: -oy / s, y1: (h * r - oy) / s };
  ARENA_BG[arena](b, R);
  const cr = CROWD[arena];
  if (cr) { seedN = 777; paintCrowd(b, R, cr); }
  b.fillStyle = "#fff"; b.fillRect(0, G - 205 - 6, GOAL_W, 12); b.fillRect(W - GOAL_W, G - 205 - 6, GOAL_W, 12);
  b.fillRect(GOAL_W - 5, G - 211, 10, 211); b.fillRect(W - GOAL_W - 5, G - 211, 10, 211);
  thumbCache.set(k, c);
  return copy(c);
}

export function toWorld(x, y) { return { x: (x - base.ox) / base.s, y: (y - base.oy) / base.s }; }
