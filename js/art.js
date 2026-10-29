// Prozedurale Grafik: Köpfe, Bälle, Icons. Wird im Spiel und in den Menüs benutzt.
import { charById, COL } from "./config.js";

const INK = COL.ink;
const TAU = Math.PI * 2;

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export { shade };

function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }

// o: { dir, look (Winkel), mood, blink, effort, frozen, t }
export function drawHead(ctx, chId, x, y, r, o = {}) {
  const c = charById(chId), dir = o.dir || 1, lw = Math.max(2, r * 0.085);
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  // Hinterkopf-Elemente
  back(ctx, c, x, y, r, dir, lw, o);
  // Sticker-Rand
  circ(ctx, x, y, r + lw * 1.4); ctx.fillStyle = "#fff"; ctx.fill();
  circ(ctx, x, y, r); ctx.fillStyle = INK; ctx.fill();
  // Haut mit Schattierung
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, shade(c.skin, 0.25)); g.addColorStop(0.7, c.skin); g.addColorStop(1, shade(c.skin, -0.22));
  circ(ctx, x, y, r - lw); ctx.fillStyle = g; ctx.fill();
  // Gesicht
  face(ctx, c, x, y, r, dir, lw, o);
  // Haare / Accessoires vorne
  front(ctx, c, x, y, r, dir, lw, o);
  if (o.frozen) {
    ctx.globalAlpha = 0.55; circ(ctx, x, y, r + lw); ctx.fillStyle = "#bdf3ff"; ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = "#fff"; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.55); ctx.lineTo(x - r * 0.2, y - r * 0.75); ctx.stroke();
  }
  ctx.restore();
}

function stroke(ctx, lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }

function face(ctx, c, x, y, r, dir, lw, o) {
  const fx = x + dir * r * 0.14;
  const ey = y - r * 0.02, es = r * 0.22;
  const look = o.look ?? (dir > 0 ? 0 : Math.PI);
  const mood = o.mood || (o.effort ? "angry" : "");
  // Wangen
  ctx.globalAlpha = 0.35; ctx.fillStyle = "#ff7a8a";
  circ(ctx, fx - r * 0.42, y + r * 0.28, r * 0.12); ctx.fill(); circ(ctx, fx + r * 0.42, y + r * 0.28, r * 0.12); ctx.fill();
  ctx.globalAlpha = 1;
  if (c.style === "slick") { // Brille hinter Augen? nein: vorne gezeichnet
  }
  [-1, 1].forEach(s => {
    const ex = fx + s * r * 0.27;
    if (o.blink || mood === "happy") {
      ctx.beginPath();
      if (mood === "happy") ctx.arc(ex, ey + es * 0.3, es * 0.7, Math.PI * 1.1, Math.PI * 1.9);
      else { ctx.moveTo(ex - es * 0.7, ey); ctx.lineTo(ex + es * 0.7, ey); }
      stroke(ctx, lw * 0.9);
      return;
    }
    ctx.beginPath(); ctx.ellipse(ex, ey, es * 0.82, es, 0, 0, TAU);
    ctx.fillStyle = "#fff"; ctx.fill(); stroke(ctx, lw * 0.6);
    const px = ex + Math.cos(look) * es * 0.32, py = ey + Math.sin(look) * es * 0.38;
    circ(ctx, px, py, es * (mood === "sad" ? 0.38 : 0.46)); ctx.fillStyle = INK; ctx.fill();
    circ(ctx, px - es * 0.15, py - es * 0.18, es * 0.14); ctx.fillStyle = "#fff"; ctx.fill();
  });
  // Augenbrauen
  ctx.beginPath();
  [-1, 1].forEach(s => {
    const ex = fx + s * r * 0.27, by = ey - es * 1.35;
    const tilt = mood === "angry" ? 0.32 : mood === "sad" ? -0.3 : 0.05;
    ctx.moveTo(ex - es * 0.75, by - s * tilt * es * -1 * 1);
    ctx.lineTo(ex + es * 0.75, by + s * tilt * es * -1 * -1);
  });
  ctx.strokeStyle = shade(c.hair, -0.3); ctx.lineWidth = lw * 1.1; ctx.stroke();
  // Mund
  const mx = fx, my = y + r * 0.42;
  ctx.beginPath();
  if (mood === "happy") {
    ctx.moveTo(mx - r * 0.3, my - r * 0.06); ctx.quadraticCurveTo(mx, my + r * 0.42, mx + r * 0.3, my - r * 0.06); ctx.closePath();
    ctx.fillStyle = "#7a1f2b"; ctx.fill(); stroke(ctx, lw * 0.8);
    ctx.beginPath(); ctx.moveTo(mx - r * 0.22, my - r * 0.02); ctx.lineTo(mx + r * 0.22, my - r * 0.02); ctx.strokeStyle = "#fff"; ctx.lineWidth = lw * 0.9; ctx.stroke();
  } else if (mood === "sad") {
    ctx.arc(mx, my + r * 0.16, r * 0.18, Math.PI * 1.15, Math.PI * 1.85); stroke(ctx, lw);
  } else if (mood === "angry") {
    ctx.rect(mx - r * 0.2, my - r * 0.06, r * 0.4, r * 0.14); ctx.fillStyle = "#fff"; ctx.fill(); stroke(ctx, lw * 0.8);
    ctx.beginPath(); ctx.moveTo(mx, my - r * 0.06); ctx.lineTo(mx, my + r * 0.08); stroke(ctx, lw * 0.5);
  } else {
    ctx.moveTo(mx - r * 0.18, my); ctx.quadraticCurveTo(mx + dir * r * 0.02, my + r * 0.14, mx + r * 0.2, my - r * 0.04); stroke(ctx, lw);
  }
  if (c.style === "ponytail" && !mood && o.t !== undefined && Math.sin(o.t * 0.9) > 0.6) {
    const s = (Math.sin(o.t * 0.9) - 0.6) / 0.4;
    circ(ctx, mx + dir * r * 0.12, my + r * 0.05, r * 0.25 * s); ctx.fillStyle = "rgba(255,139,209,.85)"; ctx.fill(); stroke(ctx, lw * 0.5);
  }
}

function back(ctx, c, x, y, r, dir, lw, o) {
  ctx.fillStyle = c.hair;
  switch (c.style) {
    case "ponytail": {
      const sw = Math.sin((o.t || 0) * 6) * 0.15;
      ctx.save(); ctx.translate(x - dir * r * 0.8, y - r * 0.45); ctx.rotate(-dir * (0.5 + sw));
      ctx.beginPath(); ctx.ellipse(-dir * r * 0.3, 0, r * 0.45, r * 0.22, 0, 0, TAU); ctx.fillStyle = c.hair; ctx.fill(); stroke(ctx, lw);
      ctx.restore(); break;
    }
    case "hood":
      circ(ctx, x, y - r * 0.06, r * 1.22); ctx.fillStyle = "#fff"; ctx.fill();
      circ(ctx, x, y - r * 0.06, r * 1.14); ctx.fillStyle = INK; ctx.fill();
      circ(ctx, x, y - r * 0.06, r * 1.14 - lw); ctx.fillStyle = c.hair; ctx.fill();
      break;
    case "puffs":
      [-1, 1].forEach(s => { circ(ctx, x + s * r * 0.72, y - r * 0.82, r * 0.48 + lw * 1.4); ctx.fillStyle = "#fff"; ctx.fill(); circ(ctx, x + s * r * 0.72, y - r * 0.82, r * 0.48); ctx.fillStyle = c.hair; ctx.fill(); stroke(ctx, lw); });
      break;
    case "curly":
      for (let k = 0; k < 9; k++) { const a = Math.PI * (1.0 + k / 8); const px = x + Math.cos(a) * r * 0.95, py = y + Math.sin(a) * r * 0.95; circ(ctx, px, py, r * 0.3 + lw * 1.4); ctx.fillStyle = "#fff"; ctx.fill(); }
      for (let k = 0; k < 9; k++) { const a = Math.PI * (1.0 + k / 8); const px = x + Math.cos(a) * r * 0.95, py = y + Math.sin(a) * r * 0.95; circ(ctx, px, py, r * 0.3); ctx.fillStyle = c.hair; ctx.fill(); stroke(ctx, lw * 0.8); }
      break;
  }
}

function capPath(ctx, x, y, r, from, to, inset) {
  ctx.beginPath(); ctx.arc(x, y, r - inset, from, to); ctx.closePath();
}

function front(ctx, c, x, y, r, dir, lw, o) {
  const H = c.hair, A = c.acc;
  switch (c.style) {
    case "spikes": {
      ctx.beginPath();
      ctx.moveTo(x - r * 0.98, y - r * 0.1);
      const n = 6;
      for (let k = 0; k <= n; k++) {
        const a = Math.PI + (k / n) * Math.PI;
        const ox = x + Math.cos(a) * r * 1.0, oy = y + Math.sin(a) * r * 1.0;
        const sx = x + Math.cos(a + 0.12) * r * 1.4 - dir * r * 0.18, sy = y + Math.sin(a + 0.12) * r * 1.38;
        ctx.lineTo(ox, oy); if (k < n) ctx.lineTo(sx, sy);
      }
      ctx.lineTo(x + r * 0.98, y - r * 0.1);
      ctx.quadraticCurveTo(x, y - r * 0.55, x - r * 0.98, y - r * 0.1);
      ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      band(ctx, x, y - r * 0.42, r, A, lw, dir);
      break;
    }
    case "bob": {
      ctx.beginPath(); ctx.arc(x, y - r * 0.05, r * 1.04, Math.PI * 0.92, Math.PI * 2.08);
      ctx.lineTo(x + r * 0.95, y + r * 0.25); ctx.lineTo(x + r * 0.7, y + r * 0.2);
      ctx.lineTo(x + r * 0.72, y - r * 0.38); ctx.lineTo(x - r * 0.72, y - r * 0.38); ctx.lineTo(x - r * 0.7, y + r * 0.2); ctx.lineTo(x - r * 0.95, y + r * 0.25); ctx.closePath();
      ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      star(ctx, x + dir * r * 0.55, y - r * 0.6, r * 0.18, A, lw);
      break;
    }
    case "mohawk": {
      ctx.beginPath(); ctx.arc(x, y, r - lw, Math.PI * 1.12, Math.PI * 1.88); ctx.closePath(); ctx.fillStyle = shade(c.skin, -0.18); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - r * 0.3, y - r * 0.85);
      for (let k = 0; k < 5; k++) { const px = x - r * 0.3 + k * r * 0.15; ctx.lineTo(px - dir * r * 0.15, y - r * (1.55 - Math.abs(k - 2) * 0.1)); ctx.lineTo(px + r * 0.08, y - r * 0.9); }
      ctx.lineTo(x + r * 0.3, y - r * 0.85); ctx.closePath(); ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      // Blitz an der Seite
      ctx.beginPath(); const bx = x - dir * r * 0.62, by = y - r * 0.35;
      ctx.moveTo(bx, by - r * 0.2); ctx.lineTo(bx - r * 0.1, by + r * 0.02); ctx.lineTo(bx + r * 0.04, by); ctx.lineTo(bx - r * 0.04, by + r * 0.22); ctx.lineTo(bx + r * 0.12, by - r * 0.05); ctx.lineTo(bx - r * 0.02, by - r * 0.03); ctx.closePath();
      ctx.fillStyle = A; ctx.fill(); stroke(ctx, lw * 0.5);
      break;
    }
    case "goggles": {
      capPath(ctx, x, y, r, Math.PI * 1.02, Math.PI * 1.98, lw * 0.5); ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.45); ctx.lineTo(x + r, y - r * 0.45); ctx.strokeStyle = INK; ctx.lineWidth = r * 0.16; ctx.stroke();
      [-1, 1].forEach(s => { circ(ctx, x + dir * r * 0.14 + s * r * 0.3, y - r * 0.47, r * 0.2); ctx.fillStyle = A; ctx.fill(); stroke(ctx, lw); circ(ctx, x + dir * r * 0.14 + s * r * 0.3 - r * 0.06, y - r * 0.53, r * 0.06); ctx.fillStyle = "#fff"; ctx.fill(); });
      break;
    }
    case "puffs": capPath(ctx, x, y, r, Math.PI * 1.08, Math.PI * 1.92, lw); ctx.fillStyle = H; ctx.fill(); band(ctx, x, y - r * 0.62, r, A, lw, dir); break;
    case "ponytail": {
      capPath(ctx, x, y, r, Math.PI * 1.0, Math.PI * 2.0, lw * 0.4); ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      ctx.beginPath(); ctx.moveTo(x + dir * r * 0.95, y); ctx.quadraticCurveTo(x + dir * r * 0.2, y - r * 0.2, x - dir * r * 0.3, y - r * 0.9); ctx.lineTo(x - dir * r * 0.7, y - r * 0.6); ctx.quadraticCurveTo(x, y - r * 0.5, x + dir * r * 0.95, y); ctx.fillStyle = H; ctx.fill();
      circ(ctx, x - dir * r * 0.75, y - r * 0.62, r * 0.14); ctx.fillStyle = A; ctx.fill(); stroke(ctx, lw * 0.6);
      break;
    }
    case "hood": {
      ctx.beginPath(); ctx.moveTo(x - r * 1.05, y + r * 0.6); ctx.quadraticCurveTo(x - r * 0.9, y - r * 1.1, x, y - r * 1.12); ctx.quadraticCurveTo(x + r * 0.9, y - r * 1.1, x + r * 1.05, y + r * 0.6);
      ctx.quadraticCurveTo(x + r * 0.8, y - r * 0.6, x, y - r * 0.7); ctx.quadraticCurveTo(x - r * 0.8, y - r * 0.6, x - r * 1.05, y + r * 0.6);
      ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      break;
    }
    case "beard": {
      capPath(ctx, x, y, r, Math.PI * 1.05, Math.PI * 1.95, lw * 0.5); ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      band(ctx, x, y - r * 0.5, r, A, lw, dir);
      ctx.beginPath(); ctx.moveTo(x - r * 0.82, y + r * 0.15); ctx.quadraticCurveTo(x - r * 0.75, y + r * 1.15, x + dir * r * 0.1, y + r * 1.1); ctx.quadraticCurveTo(x + r * 0.75, y + r * 1.15, x + r * 0.82, y + r * 0.15);
      ctx.quadraticCurveTo(x + r * 0.4, y + r * 0.62, x + dir * r * 0.14, y + r * 0.3); ctx.quadraticCurveTo(x - r * 0.4, y + r * 0.62, x - r * 0.82, y + r * 0.15);
      ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      break;
    }
    case "curly": capPath(ctx, x, y, r, Math.PI * 1.1, Math.PI * 1.9, lw); ctx.fillStyle = H; ctx.fill(); break;
    case "slick": {
      ctx.beginPath(); ctx.moveTo(x - r * 0.97, y - r * 0.05); ctx.quadraticCurveTo(x - r * 0.9, y - r * 1.15, x + dir * r * 0.2, y - r * 1.08);
      ctx.quadraticCurveTo(x + r * 0.95, y - r * 1.0, x + r * 0.97, y - r * 0.1); ctx.quadraticCurveTo(x + dir * r * 0.4, y - r * 0.75, x - r * 0.97, y - r * 0.05);
      ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      [-1, 1].forEach(s => { circ(ctx, x + dir * r * 0.14 + s * r * 0.27, y - r * 0.02, r * 0.27); ctx.lineWidth = lw * 0.9; ctx.strokeStyle = A; ctx.stroke(); });
      ctx.beginPath(); ctx.moveTo(x + dir * r * 0.14 - r * 0.02, y - r * 0.04); ctx.lineTo(x + dir * r * 0.14 + r * 0.02, y - r * 0.04); ctx.strokeStyle = A; ctx.stroke();
      break;
    }
    case "helmet": {
      capPath(ctx, x, y, r, Math.PI * 1.05, Math.PI * 1.95, lw); ctx.fillStyle = H; ctx.fill();
      circ(ctx, x, y - r * 0.08, r * 1.3); ctx.fillStyle = "rgba(160,220,255,.14)"; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - r * 0.08, r * 1.12, Math.PI * 1.15, Math.PI * 1.45); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = lw * 1.4; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y - r * 0.08, r * 1.3, Math.PI * 0.2, Math.PI * 0.8); ctx.strokeStyle = A; ctx.lineWidth = lw * 2.2; ctx.stroke();
      break;
    }
    case "crown": {
      capPath(ctx, x, y, r, Math.PI * 1.05, Math.PI * 1.95, lw * 0.5); ctx.fillStyle = H; ctx.fill(); stroke(ctx, lw);
      const cy = y - r * 0.78, cw = r * 0.8;
      ctx.beginPath(); ctx.moveTo(x - cw, cy + r * 0.22); ctx.lineTo(x - cw, cy - r * 0.32); ctx.lineTo(x - cw * 0.5, cy - r * 0.05); ctx.lineTo(x, cy - r * 0.48); ctx.lineTo(x + cw * 0.5, cy - r * 0.05); ctx.lineTo(x + cw, cy - r * 0.32); ctx.lineTo(x + cw, cy + r * 0.22); ctx.closePath();
      const g = ctx.createLinearGradient(0, cy - r * 0.5, 0, cy + r * 0.2); g.addColorStop(0, "#fff3a0"); g.addColorStop(1, "#e0a800");
      ctx.fillStyle = g; ctx.fill(); stroke(ctx, lw);
      [[-0.5, "#ff3d6e"], [0, "#22d3ee"], [0.5, "#3ddc84"]].forEach(([k, col]) => { circ(ctx, x + cw * k, cy + r * 0.06, r * 0.08); ctx.fillStyle = col; ctx.fill(); });
      break;
    }
  }
}

function band(ctx, x, y, r, col, lw, dir) {
  ctx.save(); ctx.beginPath(); ctx.arc(x, y + r * 0.42, r * 0.99, 0, TAU); ctx.clip();
  ctx.fillStyle = col; ctx.fillRect(x - r * 1.1, y - r * 0.1, r * 2.2, r * 0.22);
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(x - r * 0.97, y - r * 0.1); ctx.lineTo(x + r * 0.97, y - r * 0.1); ctx.moveTo(x - r * 0.97, y + r * 0.12); ctx.lineTo(x + r * 0.97, y + r * 0.12);
  ctx.lineWidth = lw * 0.6; ctx.strokeStyle = INK; ctx.stroke();
  // Bandenden
  ctx.beginPath(); ctx.moveTo(x - dir * r * 0.95, y); ctx.lineTo(x - dir * r * 1.35, y - r * 0.12); ctx.lineTo(x - dir * r * 1.3, y + r * 0.14); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.stroke();
}
function star(ctx, x, y, r, col, lw) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = INK; ctx.stroke();
}

// Schuh
export function drawShoe(ctx, x, y, r, dir, col, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  const lw = Math.max(1.5, r * 0.18);
  ctx.beginPath(); ctx.ellipse(dir * r * 0.35, 0, r * 1.45, r * 0.9, 0, 0, TAU);
  ctx.fillStyle = "#fff"; ctx.lineWidth = lw * 2.2; ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-r * 0.9 + dir * r * 0.35, r * 0.55); ctx.lineTo(r * 1.6 * dir + dir * r * 0.0, r * 0.55); ctx.strokeStyle = "#fff"; ctx.lineWidth = lw * 1.2; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-dir * r * 0.2, -r * 0.5); ctx.lineTo(dir * r * 0.5, -r * 0.1); ctx.strokeStyle = "rgba(255,255,255,.8)"; ctx.lineWidth = lw * 0.8; ctx.stroke();
  ctx.restore();
}

// ---------- Bälle ----------
const ballCache = new Map();
export function ballSprite(skin, size) {
  const key = skin + "@" + size;
  if (ballCache.has(key)) return ballCache.get(key);
  const c = document.createElement("canvas"); c.width = c.height = size;
  const x = c.getContext("2d"), r = size / 2;
  x.save(); circ(x, r, r, r); x.clip();
  const pent = (cx, cy, s, col, rot = 0) => { x.beginPath(); for (let k = 0; k < 5; k++) { const a = rot - Math.PI / 2 + k * TAU / 5; x.lineTo(cx + Math.cos(a) * s, cy + Math.sin(a) * s); } x.closePath(); x.fillStyle = col; x.fill(); };
  const classic = (base, dark, line) => {
    x.fillStyle = base; x.fillRect(0, 0, size, size);
    pent(r, r, r * 0.34, dark);
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5 + Math.PI / 5; pent(r + Math.cos(a) * r * 0.92, r + Math.sin(a) * r * 0.92, r * 0.3, dark, a); }
    x.strokeStyle = line; x.lineWidth = size * 0.025;
    for (let k = 0; k < 5; k++) { const a = -Math.PI / 2 + k * TAU / 5; x.beginPath(); x.moveTo(r + Math.cos(a) * r * 0.34, r + Math.sin(a) * r * 0.34); x.lineTo(r + Math.cos(a) * r * 0.66, r + Math.sin(a) * r * 0.66); x.stroke(); }
  };
  switch (skin) {
    case "retro":
      x.fillStyle = "#a0622d"; x.fillRect(0, 0, size, size);
      x.strokeStyle = "#5a3212"; x.lineWidth = size * 0.04;
      [-0.35, 0.35].forEach(k => { x.beginPath(); x.ellipse(r + k * r, r, r * 0.35, r * 1.1, 0, 0, TAU); x.stroke(); });
      x.strokeStyle = "#f3e1c0"; x.lineWidth = size * 0.02; x.setLineDash([size * 0.04, size * 0.04]);
      x.beginPath(); x.moveTo(r * 0.85, r * 0.6); x.lineTo(r * 1.15, r * 0.6); x.moveTo(r * 0.85, r * 1.0); x.lineTo(r * 1.15, r * 1.0); x.moveTo(r * 0.85, r * 1.4); x.lineTo(r * 1.15, r * 1.4); x.stroke(); x.setLineDash([]);
      break;
    case "beach": {
      const cols = ["#ff3d6e", "#fff", "#ffd43b", "#fff", "#22d3ee", "#fff", "#3ddc84", "#fff"];
      cols.forEach((col, k) => { x.beginPath(); x.moveTo(r, r); x.arc(r, r, r, k * TAU / 8, (k + 1) * TAU / 8); x.fillStyle = col; x.fill(); });
      circ(x, r, r, r * 0.16); x.fillStyle = "#fff"; x.fill();
      break;
    }
    case "neon":
      x.fillStyle = "#120a2e"; x.fillRect(0, 0, size, size);
      x.shadowColor = "#ff4fd8"; x.shadowBlur = size * 0.12; x.strokeStyle = "#ff4fd8"; x.lineWidth = size * 0.05;
      x.beginPath(); x.arc(r, r, r * 0.55, 0, TAU); x.stroke();
      x.shadowColor = "#22d3ee"; x.strokeStyle = "#22d3ee";
      x.beginPath(); x.moveTo(0, r); x.lineTo(size, r); x.moveTo(r, 0); x.lineTo(r, size); x.stroke();
      x.shadowBlur = 0; break;
    case "pixel": {
      const n = 8, s = size / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { x.fillStyle = (i + j) % 2 ? "#14161f" : "#f7f5ef"; if ((i * 7 + j * 3) % 5 === 0) x.fillStyle = "#3ddc84"; x.fillRect(i * s, j * s, s + 0.5, s + 0.5); }
      break;
    }
    case "planet":
      x.fillStyle = "#1e6fd9"; x.fillRect(0, 0, size, size);
      x.fillStyle = "#3ddc84";
      [[0.3, 0.35, 0.28], [0.7, 0.6, 0.3], [0.45, 0.8, 0.18], [0.85, 0.2, 0.15]].forEach(([a, b, s]) => { x.beginPath(); x.ellipse(a * size, b * size, s * size, s * size * 0.7, a * 3, 0, TAU); x.fill(); });
      x.fillStyle = "rgba(255,255,255,.7)"; x.fillRect(0, size * 0.04, size, size * 0.08); x.fillRect(0, size * 0.88, size, size * 0.1);
      break;
    case "disco": {
      const n = 9, s = size / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const v = 150 + ((i * 37 + j * 91) % 100); x.fillStyle = `rgb(${v},${v},${v + 20})`; x.fillRect(i * s + 0.5, j * s + 0.5, s - 1, s - 1); }
      x.fillStyle = "rgba(255,79,216,.35)"; x.fillRect(size * 0.55, size * 0.2, s * 2, s * 2);
      x.fillStyle = "rgba(34,211,238,.35)"; x.fillRect(size * 0.2, size * 0.6, s * 2, s * 2);
      break;
    }
    case "gold": classic("#ffd84d", "#b07d00", "#8a6200"); break;
    default: classic("#f7f5ef", "#14161f", "#555a66");
  }
  x.restore();
  ballCache.set(key, c);
  return c;
}

// stretch: { ang, k } – Ball wird entlang ang um k gedehnt (k < 1 = gestaucht), Fläche bleibt gleich
export function drawBall(ctx, skin, x, y, r, a, alpha = 1, stretch = null) {
  const spr = ballSprite(skin, 128);
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  if (stretch && Math.abs(stretch.k - 1) > 0.01) { ctx.rotate(stretch.ang); ctx.scale(stretch.k, 1 / Math.sqrt(stretch.k)); ctx.rotate(-stretch.ang); }
  const lw = Math.max(2, r * 0.14);
  circ(ctx, 0, 0, r + lw * 0.9); ctx.fillStyle = "#fff"; ctx.fill();
  circ(ctx, 0, 0, r + lw * 0.15); ctx.fillStyle = INK; ctx.fill();
  ctx.save(); ctx.rotate(a); ctx.drawImage(spr, -r, -r, r * 2, r * 2); ctx.restore();
  const g = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.05, 0, 0, r);
  g.addColorStop(0, "rgba(255,255,255,.6)"); g.addColorStop(0.42, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(0,0,30,.38)");
  circ(ctx, 0, 0, r); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
}

// ---------- Power-up Icons ----------
export function drawPuIcon(ctx, k, x, y, s, col) {
  ctx.save(); ctx.translate(x, y); ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.fillStyle = "#fff"; ctx.strokeStyle = INK; ctx.lineWidth = s * 0.12;
  const P = (pts) => { ctx.beginPath(); pts.forEach(([a, b], n) => n ? ctx.lineTo(a * s, b * s) : ctx.moveTo(a * s, b * s)); ctx.closePath(); ctx.fill(); ctx.stroke(); };
  switch (k) {
    case "bighead": circ(ctx, 0, 0, s * 0.62); ctx.fill(); ctx.stroke(); P([[-0.95, -0.95], [-0.55, -0.95], [-0.95, -0.55]]); P([[0.95, 0.95], [0.55, 0.95], [0.95, 0.55]]); break;
    case "mini": circ(ctx, 0, 0, s * 0.3); ctx.fill(); ctx.stroke(); P([[-0.9, 0], [-0.55, -0.2], [-0.55, 0.2]]); P([[0.9, 0], [0.55, -0.2], [0.55, 0.2]]); break;
    case "freeze": for (let a = 0; a < 3; a++) { ctx.save(); ctx.rotate(a * Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, -s * 0.85); ctx.lineTo(0, s * 0.85); ctx.lineWidth = s * 0.22; ctx.stroke(); ctx.lineWidth = s * 0.1; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.restore(); } break;
    case "speed": P([[0.15, -0.95], [-0.55, 0.1], [-0.05, 0.1], [-0.2, 0.95], [0.6, -0.15], [0.08, -0.15]]); break;
    case "jump": P([[0, -0.95], [0.7, -0.15], [0.25, -0.15], [0.25, 0.85], [-0.25, 0.85], [-0.25, -0.15], [-0.7, -0.15]]); break;
    case "fire": ctx.beginPath(); ctx.moveTo(0, -s * 0.95); ctx.quadraticCurveTo(s * 0.85, -s * 0.1, s * 0.5, s * 0.6); ctx.quadraticCurveTo(0, s * 1.05, -s * 0.5, s * 0.6); ctx.quadraticCurveTo(-s * 0.8, 0, -s * 0.2, -s * 0.4); ctx.quadraticCurveTo(-s * 0.1, -s * 0.1, 0, -s * 0.95); ctx.fill(); ctx.stroke(); break;
    case "wall": for (let r = 0; r < 3; r++) for (let c = 0; c < 2; c++) { const ox = (c - 1 + (r % 2) * 0.5) * s * 0.7 + s * 0.12, oy = (r - 1) * s * 0.55; ctx.beginPath(); ctx.rect(ox - s * 0.15, oy - s * 0.24, s * 0.62, s * 0.46); ctx.fill(); ctx.stroke(); } break;
    case "biggoal": ctx.beginPath(); ctx.moveTo(-s * 0.85, s * 0.8); ctx.lineTo(-s * 0.85, -s * 0.6); ctx.lineTo(s * 0.85, -s * 0.6); ctx.lineTo(s * 0.85, s * 0.8); ctx.lineWidth = s * 0.26; ctx.stroke(); ctx.lineWidth = s * 0.12; ctx.strokeStyle = "#fff"; ctx.stroke(); P([[0, -0.15], [0.3, 0.25], [-0.3, 0.25]]); break;
    case "meter": P([[-0.15, -0.95], [0.55, -0.95], [0.15, -0.15], [0.6, -0.15], [-0.3, 0.95], [-0.05, 0.1], [-0.5, 0.1]]); break;
    case "confuse": ctx.beginPath(); for (let k = 0; k < 40; k++) { const t = k / 40 * Math.PI * 4, rr = s * 0.12 + k / 40 * s * 0.75; ctx.lineTo(Math.cos(t) * rr, Math.sin(t) * rr); } ctx.lineWidth = s * 0.28; ctx.stroke(); ctx.lineWidth = s * 0.13; ctx.strokeStyle = "#fff"; ctx.stroke(); break;
    case "dbljump": P([[0, -1], [0.6, -0.45], [0.22, -0.45], [0.22, -0.1], [-0.22, -0.1], [-0.22, -0.45], [-0.6, -0.45]]); P([[0, 0.05], [0.6, 0.6], [0.22, 0.6], [0.22, 0.95], [-0.22, 0.95], [-0.22, 0.6], [-0.6, 0.6]]); break;
    case "wind": [[-0.45, -0.5, 0.9], [-0.8, 0, 1.4], [-0.55, 0.5, 1]].forEach(([x0, y, w]) => { ctx.beginPath(); ctx.moveTo(x0 * s, y * s); ctx.lineTo((x0 + w) * s, y * s); ctx.quadraticCurveTo((x0 + w + 0.35) * s, (y - 0.05) * s, (x0 + w + 0.2) * s, (y - 0.32) * s); ctx.lineWidth = s * 0.3; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = s * 0.15; ctx.strokeStyle = "#fff"; ctx.stroke(); }); break;
  }
  ctx.restore();
}

// Kleines Avatar-Bild für Menüs
export function avatarCanvas(chId, px, opts = {}) {
  const c = document.createElement("canvas");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(px * dpr); c.style.width = c.style.height = px + "px";
  const x = c.getContext("2d"); x.scale(dpr, dpr);
  drawHead(x, chId, px / 2, px * 0.56, px * 0.3, { dir: opts.dir || 1, mood: opts.mood || "", look: opts.look });
  return c;
}
