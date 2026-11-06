// Rahmen für die Spieler-Karte (Kosmetik "frame"): jeder Stil zeichnet seine eigene Form um den runden Avatar.
// drawFrame(ctx, frame, cx, cy, r, t, layer): r = Radius des Avatars samt Sticker-Rand, t = Zeit für Animationen
// (ohne t: Standbild). layer "back" vor dem Kopf (Ring, Strahlen, Flügel), "front" danach (Wappen, Krone,
// Edelsteine, Funken über Haaren und Hüten). Die Daten (welcher Rahmen, woher) stehen in content/cosmetics.js.
// Die Leucht-Effekte sind teuer: im Spiel ist höchstens ein Rahmen gleichzeitig animiert.
import { INK, TAU, circ, shade } from "./paint.js";

function ringPath(ctx, x, y, r0, r1) { ctx.beginPath(); ctx.arc(x, y, r1, 0, TAU); ctx.arc(x, y, r0, TAU, 0, true); ctx.closePath(); }
function inkStroke(ctx, lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }
const T = t => (t === undefined ? 0 : t);

// ---------- Bausteine ----------
/** Breiter Metallring mit Fase: Glanzkante oben links, Schatten unten rechts, Rille in der Mitte */
function bevelRing(ctx, x, y, r0, r1, [a, b, c], lw) {
  const w = r1 - r0;
  circ(ctx, x, y, r1 + lw * 1.7); ctx.fillStyle = "#fff"; ctx.fill();
  circ(ctx, x, y, r1 + lw * 0.5); ctx.fillStyle = INK; ctx.fill();
  const g = ctx.createLinearGradient(x - r1, y - r1, x + r1, y + r1); g.addColorStop(0, a); g.addColorStop(0.45, b); g.addColorStop(1, c);
  ringPath(ctx, x, y, r0, r1); ctx.fillStyle = g; ctx.fill();
  ctx.save(); ringPath(ctx, x, y, r0, r1); ctx.clip();
  ctx.globalAlpha = 0.55; ctx.lineWidth = w * 0.22; ctx.strokeStyle = "#fff";
  ctx.beginPath(); ctx.arc(x, y, r1 - w * 0.22, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
  ctx.globalAlpha = 0.3; ctx.strokeStyle = "#000";
  ctx.beginPath(); ctx.arc(x, y, r0 + w * 0.2, Math.PI * 0.05, Math.PI * 0.75); ctx.stroke();
  ctx.globalAlpha = 0.35; ctx.lineWidth = lw * 0.5; ctx.strokeStyle = INK; circ(ctx, x, y, r0 + w * 0.5); ctx.stroke();
  ctx.restore();
  ctx.lineWidth = lw; ctx.strokeStyle = INK; circ(ctx, x, y, r0); ctx.stroke();
}
/** Glanzstreifen, der um den Ring läuft */
function sweep(ctx, x, y, r0, r1, t, speed, alpha = 0.6) {
  if (t === undefined || !ctx.createConicGradient) return;
  const a = (t * speed) % TAU;
  ctx.save(); ringPath(ctx, x, y, r0, r1); ctx.clip(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha;
  const g = ctx.createConicGradient(a, x, y);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.03, "rgba(255,255,255,1)"); g.addColorStop(0.08, "rgba(255,255,255,0)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(x - r1, y - r1, r1 * 2, r1 * 2); ctx.restore();
}
/** Rotierende Strahlen hinter dem Rahmen */
function rays(ctx, x, y, r0, r1, n, col, t, speed, alpha = 0.5) {
  const rot = T(t) * speed;
  ctx.save(); ctx.globalAlpha = alpha; ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  for (let k = 0; k < n; k++) { const a = rot + k * TAU / n, d = Math.PI / n * 0.55; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r1, a - d, a + d); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
/** Weiches Leuchten */
function aura(ctx, x, y, r0, r1, col, alpha) {
  ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, r0, x, y, r1); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g; circ(ctx, x, y, r1); ctx.fill(); ctx.restore();
}
function star(ctx, x, y, s, col, lw, pts = 5) {
  ctx.beginPath(); for (let k = 0; k < pts * 2; k++) { const a = -Math.PI / 2 + k * Math.PI / pts, rr = k % 2 ? s * 0.45 : s; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath();
  ctx.fillStyle = col; ctx.fill(); if (lw) inkStroke(ctx, lw);
}
/** Funkeln: 4-zackige Lichtsterne, die um den Rahmen kreisen und aufblitzen */
function sparkles(ctx, x, y, R, n, t, col, size) {
  if (t === undefined) return;
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  for (let k = 0; k < n; k++) {
    const a = t * 0.4 + k * TAU / n, tw = Math.max(0, Math.sin(t * 3 + k * 2.1)), s = size * tw;
    if (s < 0.5) continue;
    const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
    ctx.globalAlpha = tw; ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(px, py - s); ctx.quadraticCurveTo(px, py, px + s, py); ctx.quadraticCurveTo(px, py, px, py + s); ctx.quadraticCurveTo(px, py, px - s, py); ctx.quadraticCurveTo(px, py, px, py - s); ctx.fill();
  }
  ctx.restore();
}
/** Facettierter Edelstein */
function gem(ctx, x, y, s, col, lw) {
  const pts = [[0, -1], [0.75, -0.45], [0.75, 0.35], [0, 1], [-0.75, 0.35], [-0.75, -0.45]];
  ctx.beginPath(); pts.forEach(([u, v]) => ctx.lineTo(x + u * s, y + v * s)); ctx.closePath();
  ctx.lineWidth = lw * 2.6; ctx.strokeStyle = "#fff"; ctx.stroke();
  const g = ctx.createLinearGradient(x - s, y - s, x + s, y + s); g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.45));
  ctx.fillStyle = g; ctx.fill(); inkStroke(ctx, lw);
  ctx.beginPath(); ctx.moveTo(x - 0.75 * s, y - 0.45 * s); ctx.lineTo(x, y - 0.1 * s); ctx.lineTo(x + 0.75 * s, y - 0.45 * s); ctx.moveTo(x, y - 0.1 * s); ctx.lineTo(x, y + s);
  ctx.lineWidth = lw * 0.5; ctx.strokeStyle = "rgba(10,18,48,.5)"; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 0.45 * s, y - 0.55 * s); ctx.lineTo(x - 0.15 * s, y - 0.75 * s); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.stroke();
}
/** Flügel aus Federn links und rechts, Ansatz seitlich oben am Ring; flap: leichtes Schlagen */
function wings(ctx, x, y, r, size, [a, b, c], lw, flap) {
  // Ansatz außen am Ring, Federn fächern nach außen und oben (die oberste zuerst, die unteren liegen darüber)
  [-1, 1].forEach(s => {
    for (let k = 5; k >= 0; k--) {
      const ang = 0.05 + k * 0.19 + flap, len = size * (0.62 + k * 0.09), fw = size * (0.2 - k * 0.012);
      const bx = x + s * (r + size * 0.08), by = y + r * 0.1 - k * r * 0.07;
      const ex = bx + s * Math.cos(ang) * len, ey = by - Math.sin(ang) * len;
      const dx = ex - bx, dy = ey - by, d = Math.hypot(dx, dy) || 1, nx = -dy / d * fw, ny = dx / d * fw;
      ctx.beginPath(); ctx.moveTo(bx - nx * 0.5, by - ny * 0.5);
      ctx.quadraticCurveTo(bx + dx * 0.55 - nx * 1.1, by + dy * 0.55 - ny * 1.1, ex, ey);
      ctx.quadraticCurveTo(bx + dx * 0.6 + nx * 0.9, by + dy * 0.6 + ny * 0.9, bx + nx * 0.5, by + ny * 0.5); ctx.closePath();
      ctx.lineWidth = lw * 2.4; ctx.strokeStyle = "#fff"; ctx.stroke();
      const g = ctx.createLinearGradient(bx, by, ex, ey); g.addColorStop(0, c); g.addColorStop(0.45, b); g.addColorStop(1, a);
      ctx.fillStyle = g; ctx.fill(); inkStroke(ctx, lw * 0.8);
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx * 0.8, by + dy * 0.8); ctx.lineWidth = lw * 0.45; ctx.strokeStyle = "rgba(10,18,48,.35)"; ctx.stroke();
    }
  });
}
/** Wappenschild */
function shieldPath(ctx, x, y, w, h) {
  ctx.beginPath(); ctx.moveTo(x - w, y - h * 0.5); ctx.quadraticCurveTo(x, y - h * 0.72, x + w, y - h * 0.5); ctx.lineTo(x + w, y + h * 0.05);
  ctx.quadraticCurveTo(x + w, y + h * 0.6, x, y + h * 0.85); ctx.quadraticCurveTo(x - w, y + h * 0.6, x - w, y + h * 0.05); ctx.closePath();
}
/** Lorbeerkranz um den unteren Teil, mit Schleife unten */
function laurel(ctx, x, y, R, s, col, lw, ribbon) {
  [-1, 1].forEach(sd => {
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 2 + sd * (0.42 + k * 0.27);
      [1, -1].forEach(side => {
        const px = x + Math.cos(a) * (R + side * s * 0.45), py = y + Math.sin(a) * (R + side * s * 0.45), rot = a + sd * (Math.PI / 2) + side * 0.55 * sd;
        ctx.save(); ctx.translate(px, py); ctx.rotate(rot);
        ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.42, 0, 0, TAU);
        const g = ctx.createLinearGradient(-s, -s, s, s); g.addColorStop(0, shade(col, 0.45)); g.addColorStop(1, shade(col, -0.2));
        ctx.fillStyle = g; ctx.fill(); inkStroke(ctx, lw * 0.6); ctx.restore();
      });
    }
  });
  if (ribbon) {
    const by = y + R + s * 0.2;
    [-1, 1].forEach(sd => { ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + sd * s * 1.6, by + s * 1.5); ctx.lineTo(x + sd * s * 1.0, by + s * 1.4); ctx.lineTo(x + sd * s * 0.8, by + s * 1.9); ctx.closePath(); ctx.fillStyle = ribbon; ctx.fill(); inkStroke(ctx, lw * 0.7); });
    ctx.beginPath(); ctx.ellipse(x, by, s * 0.7, s * 0.5, 0, 0, TAU); ctx.fillStyle = ribbon; ctx.fill(); inkStroke(ctx, lw * 0.7);
  }
}
/** Flammenkranz: drei Schichten runder Flammenzungen, flackert über t */
function flames(ctx, x, y, R, h, t, [a, b, c], lw) {
  const P = (ang, rr) => [x + Math.cos(ang) * rr, y + Math.sin(ang) * rr];
  [[1, c, 0], [0.72, b, 1.3], [0.45, a, 2.6]].forEach(([k, col, off], layer) => {
    const n = 14, step = TAU / n;
    ctx.beginPath(); ctx.moveTo(...P(-Math.PI / 2, R));
    for (let i = 0; i < n; i++) {
      const a0 = -Math.PI / 2 + i * step, fl = t === undefined ? 0.6 : (Math.sin(t * (6 + layer) + i * 1.9 + off) + 1) / 2;
      const hh = h * k * (0.55 + 0.45 * fl), sway = t === undefined ? 0 : Math.sin(t * 4 + i) * step * 0.12;
      const tip = P(a0 + step * 0.5 + sway, R + hh);
      ctx.quadraticCurveTo(...P(a0 + step * 0.08, R + hh * 0.75), ...tip);
      ctx.quadraticCurveTo(...P(a0 + step * 0.92, R + hh * 0.75), ...P(a0 + step, R));
    }
    ctx.closePath();
    if (layer === 0) { ctx.lineWidth = lw * 2.6; ctx.strokeStyle = "#fff"; ctx.stroke(); }
    ctx.fillStyle = col; ctx.fill(); if (layer === 0) inkStroke(ctx, lw);
  });
}

const MET = {
  bronze: ["#ffc999", "#c47a3f", "#6e3a18"], silver: ["#ffffff", "#c9d2e3", "#6c778c"], gold: ["#fff6b0", "#ffcb2b", "#b87800"],
  platinum: ["#f0ffff", "#9ef0ea", "#2f8f8a"], diamond: ["#eef6ff", "#8cc2ff", "#2a52b8"], legend: ["#f6ecff", "#b98cff", "#5a2fc0"],
  steel: ["#8a96c8", "#3a4470", "#121a3a"], dark: ["#4b4f6b", "#232741", "#0b0e22"], fire: ["#ffe66b", "#ff8a1c", "#c2300c"],
};

const DRAW = {
  // Meisterschaft: Ring in Kopffarbe mit Lorbeerkranz, Krone mit Edelstein in der Super-Farbe, Strahlen und Funkeln
  mastery(ctx, f, x, y, r, t, lw, L) {
    const c = f.col, w = r * 0.3, M = [shade(c, 0.55), c, shade(c, -0.45)];
    if (L === "back") {
      aura(ctx, x, y, r, r * 1.9, c, 0.45);
      rays(ctx, x, y, r, r * 1.85, 12, shade(c, 0.3), t, 0.25, 0.35);
      bevelRing(ctx, x, y, r, r + w, M, lw);
      sweep(ctx, x, y, r, r + w, t, 1.1);
      laurel(ctx, x, y, r + w * 1.12, r * 0.17, "#ffcb2b", lw, f.badge || "#ff3d6e");
      return;
    }
    const cy = y - r - w * 0.95, cw = r * 0.52;
    ctx.beginPath(); ctx.moveTo(x - cw, cy + r * 0.2); ctx.lineTo(x - cw * 1.05, cy - r * 0.22); ctx.lineTo(x - cw * 0.5, cy + r * 0.02); ctx.lineTo(x, cy - r * 0.36); ctx.lineTo(x + cw * 0.5, cy + r * 0.02); ctx.lineTo(x + cw * 1.05, cy - r * 0.22); ctx.lineTo(x + cw, cy + r * 0.2); ctx.closePath();
    ctx.lineWidth = lw * 2.8; ctx.strokeStyle = "#fff"; ctx.stroke();
    const g = ctx.createLinearGradient(0, cy - r * 0.4, 0, cy + r * 0.2); g.addColorStop(0, "#fff6b0"); g.addColorStop(1, "#d99a00");
    ctx.fillStyle = g; ctx.fill(); inkStroke(ctx, lw);
    gem(ctx, x, cy - r * 0.02, r * 0.13, f.badge || "#ff3d6e", lw * 0.7);
    [-1, 1].forEach(s => { circ(ctx, x + s * cw * 1.05, cy - r * 0.24, r * 0.05); ctx.fillStyle = "#fff6b0"; ctx.fill(); inkStroke(ctx, lw * 0.5); });
    sparkles(ctx, x, y, r + w * 1.4, 6, t, "#fff6b0", r * 0.14);
  },

  // Erfolge: Bronze schlicht mit Nieten, Silber mit Flügelchen und Edelstein, Gold mit großen Flügeln, Strahlenkranz und Sternenkrone
  medal(ctx, f, x, y, r, t, lw, L) {
    const tier = { bronze: 0, silver: 1, gold: 2 }[f.metal], M = MET[f.metal], w = r * (0.28 + tier * 0.03);
    if (L === "back") {
      if (tier === 2) { aura(ctx, x, y, r, r * 2.1, "#ffcb2b", 0.55); rays(ctx, x, y, r, r * 2.05, 16, "#fff1a8", t, 0.35, 0.55); }
      if (tier >= 1) wings(ctx, x, y, r + w * 0.4, r * (0.4 + tier * 0.16), tier === 2 ? MET.gold : MET.silver, lw, Math.sin(T(t) * 2) * 0.05);
      bevelRing(ctx, x, y, r, r + w, M, lw);
      for (let k = 0; k < 12; k++) { const a = k * TAU / 12 + 0.26, px = x + Math.cos(a) * (r + w / 2), py = y + Math.sin(a) * (r + w / 2); circ(ctx, px, py, w * 0.13); ctx.fillStyle = M[2]; ctx.fill(); circ(ctx, px - w * 0.04, py - w * 0.04, w * 0.06); ctx.fillStyle = M[0]; ctx.fill(); }
      if (tier >= 1) sweep(ctx, x, y, r, r + w, t, 0.9, tier === 2 ? 0.75 : 0.45);
      return;
    }
    if (tier === 0) star(ctx, x, y - r - w * 0.5, r * 0.22, "#ffc999", lw);
    if (tier === 1) gem(ctx, x, y - r - w * 0.5, r * 0.2, "#8cc2ff", lw);
    if (tier === 2) {
      [-0.62, -0.31, 0, 0.31, 0.62].forEach((d, i) => star(ctx, x + Math.sin(d) * (r + w * 1.05), y - Math.cos(d) * (r + w * 1.05), r * (i === 2 ? 0.26 : i % 2 ? 0.17 : 0.13), "#fff6b0", lw * 0.7));
      gem(ctx, x, y + r + w * 0.5, r * 0.18, "#ff3d6e", lw);
      sparkles(ctx, x, y, r + w * 1.5, 8, t, "#fff6b0", r * 0.17);
    }
  },

  // Liga: Wappen oben; je höher, desto mehr: Flügel ab Silber, Edelsteine ab Gold, Kristallspitzen ab Platin,
  // kreisende Diamanten bei Diamant, Flammen-Aura und Krone bei Legende
  league(ctx, f, x, y, r, t, lw, L) {
    const tier = ["bronze", "silver", "gold", "platinum", "diamond", "legend"].indexOf(f.league), M = MET[f.league], w = r * 0.3;
    if (L === "back") {
      if (tier === 5) flames(ctx, x, y, r + w * 0.9, r * 0.34, t, ["#ffe9ff", "#b98cff", "#5a2fc0"], lw);
      if (tier >= 3) { aura(ctx, x, y, r, r * 2.1, M[1], 0.5); rays(ctx, x, y, r, r * 2, 14, M[0], t, 0.3, 0.45); }
      if (tier >= 1) wings(ctx, x, y, r + w * 0.4, r * (0.34 + tier * 0.07), M, lw, Math.sin(T(t) * 2.2) * 0.06);
      if (tier >= 3) for (let k = 0; k < 8; k++) {
        const a = k * TAU / 8 + Math.PI / 8, b0 = r + w * 0.85, len = r * (k % 2 ? 0.14 : 0.22);
        ctx.beginPath(); ctx.moveTo(x + Math.cos(a - 0.12) * b0, y + Math.sin(a - 0.12) * b0); ctx.lineTo(x + Math.cos(a) * (b0 + len), y + Math.sin(a) * (b0 + len)); ctx.lineTo(x + Math.cos(a + 0.12) * b0, y + Math.sin(a + 0.12) * b0); ctx.closePath();
        ctx.lineWidth = lw * 2.4; ctx.strokeStyle = "#fff"; ctx.stroke();
        const g = ctx.createLinearGradient(x, y, x + Math.cos(a) * (b0 + len), y + Math.sin(a) * (b0 + len)); g.addColorStop(0, M[2]); g.addColorStop(1, M[0]);
        ctx.fillStyle = g; ctx.fill(); inkStroke(ctx, lw * 0.8);
      }
      bevelRing(ctx, x, y, r, r + w, M, lw);
      if (tier === 4) { ctx.save(); ringPath(ctx, x, y, r, r + w); ctx.clip(); ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.lineWidth = lw * 0.5; for (let k = 0; k < 18; k++) { const a = k * TAU / 18; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a + 0.18) * (r + w), y + Math.sin(a + 0.18) * (r + w)); ctx.stroke(); } ctx.restore(); }
      if (tier >= 2) sweep(ctx, x, y, r, r + w, t, 1, 0.6);
      if (tier >= 2) for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; gem(ctx, x + Math.cos(a) * (r + w / 2), y + Math.sin(a) * (r + w / 2), w * 0.3, tier >= 4 ? "#8cc2ff" : "#ff3d6e", lw * 0.6); }
      return;
    }
    const sy = y - r - w * 0.75, sw = r * 0.4, sh = r * 0.56;
    shieldPath(ctx, x, sy, sw, sh); ctx.lineWidth = lw * 2.8; ctx.strokeStyle = "#fff"; ctx.stroke();
    const g = ctx.createLinearGradient(x - sw, sy - sh, x + sw, sy + sh); g.addColorStop(0, M[0]); g.addColorStop(0.5, M[1]); g.addColorStop(1, M[2]);
    ctx.fillStyle = g; ctx.fill(); inkStroke(ctx, lw);
    shieldPath(ctx, x, sy, sw * 0.72, sh * 0.72); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.stroke();
    if (tier === 5) {
      const cy = sy - sh * 0.62, cw = sw * 0.9;
      ctx.beginPath(); ctx.moveTo(x - cw, cy + r * 0.12); ctx.lineTo(x - cw, cy - r * 0.16); ctx.lineTo(x - cw * 0.5, cy); ctx.lineTo(x, cy - r * 0.26); ctx.lineTo(x + cw * 0.5, cy); ctx.lineTo(x + cw, cy - r * 0.16); ctx.lineTo(x + cw, cy + r * 0.12); ctx.closePath();
      ctx.lineWidth = lw * 2.4; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.fillStyle = "#ffd23f"; ctx.fill(); inkStroke(ctx, lw * 0.8);
      star(ctx, x, sy + sh * 0.05, sw * 0.5, "#fff6b0", lw * 0.6);
    } else {
      ctx.lineWidth = lw * 1.1; ctx.strokeStyle = INK;
      for (let k = 0; k < Math.min(3, tier + 1); k++) { const yy = sy - sh * 0.22 + k * sh * 0.24; ctx.beginPath(); ctx.moveTo(x - sw * 0.5, yy); ctx.lineTo(x, yy + sh * 0.18); ctx.lineTo(x + sw * 0.5, yy); ctx.stroke(); }
      if (tier >= 3) gem(ctx, x, sy + sh * 0.55, sw * 0.32, tier === 4 ? "#8cc2ff" : "#9ef0ea", lw * 0.6);
    }
    if (tier === 4 && t !== undefined) for (let k = 0; k < 3; k++) { const a = t * 0.9 + k * TAU / 3; gem(ctx, x + Math.cos(a) * r * 1.75, y + Math.sin(a) * r * 1.75 * 0.85, r * 0.12, "#8cc2ff", lw * 0.6); }
    if (tier >= 3) sparkles(ctx, x, y, r + w * 1.5, 7, t, "#ffffff", r * 0.16);
  },

  // Pass: Flutlicht – Stahlring, vier Masten mit schwenkenden Lichtkegeln, Zuschauer-Lichter auf dem Ring
  flood(ctx, f, x, y, r, t, lw, L) {
    const w = r * 0.28, A = [-2.36, -0.79, 0.79, 2.36];
    if (L === "back") {
      A.forEach((a, k) => {
        const sw = Math.sin(T(t) * 1.3 + k) * 0.35, px = x + Math.cos(a) * (r + w * 1.6), py = y + Math.sin(a) * (r + w * 1.6);
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.5;
        const dirA = a + Math.PI + sw, g = ctx.createRadialGradient(px, py, 2, px, py, r * 2.2); g.addColorStop(0, "rgba(255,252,220,.9)"); g.addColorStop(1, "rgba(255,252,220,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, r * 2.2, dirA - 0.28, dirA + 0.28); ctx.closePath(); ctx.fill(); ctx.restore();
      });
      bevelRing(ctx, x, y, r, r + w, MET.steel, lw);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      for (let k = 0; k < 36; k++) { const a = k * TAU / 36, on = t === undefined ? 0.6 : (Math.sin(t * 6 + k * 1.9) + 1) / 2; ctx.globalAlpha = 0.25 + on * 0.75; circ(ctx, x + Math.cos(a) * (r + w * 0.5), y + Math.sin(a) * (r + w * 0.5), w * 0.07); ctx.fillStyle = ["#ff6b1a", "#22d3ee", "#fff"][k % 3]; ctx.fill(); }
      ctx.restore();
      return;
    }
    A.forEach(a => {
      const px = x + Math.cos(a) * (r + w * 1.6), py = y + Math.sin(a) * (r + w * 1.6);
      ctx.save(); ctx.translate(px, py); ctx.rotate(a + Math.PI / 2);
      ctx.beginPath(); ctx.roundRect(-r * 0.27, -r * 0.14, r * 0.54, r * 0.28, r * 0.07); ctx.lineWidth = lw * 2.4; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.fillStyle = "#2b3352"; ctx.fill(); inkStroke(ctx, lw * 0.8);
      ctx.shadowColor = "#fffbe0"; ctx.shadowBlur = r * 0.3; ctx.fillStyle = "#fffbe0";
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { circ(ctx, (i - 1) * r * 0.16, (j - 0.5) * r * 0.12, r * 0.045); ctx.fill(); }
      ctx.restore();
    });
  },

  // Pass: Neon – zwei Röhren mit Lauflichtern, Zickzack-Blitze und Farbwechsel
  neon(ctx, f, x, y, r, t, lw, L) {
    const w = r * 0.3, hue = T(t) * 40;
    if (L === "back") {
      circ(ctx, x, y, r + w + lw * 1.7); ctx.fillStyle = "#fff"; ctx.fill();
      circ(ctx, x, y, r + w + lw * 0.5); ctx.fillStyle = INK; ctx.fill();
      ringPath(ctx, x, y, r, r + w); ctx.fillStyle = "#11142e"; ctx.fill();
      aura(ctx, x, y, r, r * 2, `hsl(${(hue + 300) % 360},100%,60%)`, 0.5);
      [[r + w * 0.3, 300], [r + w * 0.72, 190]].forEach(([rr, h0], i) => {
        const col = `hsl(${(h0 + hue) % 360},100%,62%)`;
        ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.shadowColor = col; ctx.shadowBlur = r * 0.35;
        circ(ctx, x, y, rr); ctx.lineWidth = w * 0.17; ctx.strokeStyle = col; ctx.stroke();
        for (let k = 0; k < 10; k++) { const a = (i ? -1 : 1) * T(t) * 1.6 + k * TAU / 10; circ(ctx, x + Math.cos(a) * rr, y + Math.sin(a) * rr, w * 0.1); ctx.fillStyle = "#fff"; ctx.fill(); }
        ctx.restore();
      });
      ctx.lineWidth = lw; ctx.strokeStyle = INK; circ(ctx, x, y, r); ctx.stroke();
      return;
    }
    if (t !== undefined) for (let k = 0; k < 4; k++) {
      if (Math.sin(t * 5 + k * 2.4) < 0.75) continue;
      const a = k * TAU / 4 + 0.6 + Math.sin(t) * 0.2, col = `hsl(${(hue + k * 70) % 360},100%,70%)`;
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.shadowColor = col; ctx.shadowBlur = r * 0.3; ctx.strokeStyle = col; ctx.lineWidth = lw * 1.2;
      ctx.beginPath(); for (let j = 0; j <= 3; j++) { const rr = r + w * 0.85 + j * r * 0.08, aa = a + (j % 2 ? 0.06 : -0.06); ctx.lineTo(x + Math.cos(aa) * rr, y + Math.sin(aa) * rr); } ctx.stroke(); ctx.restore();
    }
  },

  // Pass: Rasen – Ring mit Mähstreifen, Eckfahnen, Kreide und ein Ball, der unten hin und her rollt
  turf(ctx, f, x, y, r, t, lw, L) {
    const w = r * 0.3;
    if (L === "back") {
      circ(ctx, x, y, r + w + lw * 1.7); ctx.fillStyle = "#fff"; ctx.fill();
      circ(ctx, x, y, r + w + lw * 0.5); ctx.fillStyle = INK; ctx.fill();
      for (let k = 0; k < 16; k++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r + w, k * TAU / 16, (k + 1) * TAU / 16); ctx.closePath(); ctx.fillStyle = k % 2 ? "#2fc463" : "#1f9e4c"; ctx.fill(); }
      ctx.strokeStyle = "#f7f5ef"; ctx.lineWidth = lw * 0.9; circ(ctx, x, y, r + w * 0.55); ctx.stroke();
      // Grasbüschel: kurze, weiche Halme in drei Grüntönen auf dem Außenrand
      for (let k = 0; k < 64; k++) {
        const a = k * TAU / 64, sway = Math.sin(T(t) * 2.5 + k * 0.7) * 0.06, h = r * (0.07 + (k % 3) * 0.025);
        const R0 = r + w - lw * 0.2, bx = x + Math.cos(a) * R0, by = y + Math.sin(a) * R0, tx = x + Math.cos(a + sway) * (R0 + h), ty = y + Math.sin(a + sway) * (R0 + h), nx = -Math.sin(a) * r * 0.028, ny = Math.cos(a) * r * 0.028;
        ctx.beginPath(); ctx.moveTo(bx - nx, by - ny); ctx.quadraticCurveTo(tx - nx * 0.3, ty - ny * 0.3, tx, ty); ctx.quadraticCurveTo(tx + nx * 0.3, ty + ny * 0.3, bx + nx, by + ny); ctx.closePath();
        ctx.fillStyle = ["#2fc463", "#4fdc7c", "#1f9e4c"][k % 3]; ctx.fill();
      }
      ctx.lineWidth = lw; ctx.strokeStyle = INK; circ(ctx, x, y, r); ctx.stroke();
      return;
    }
    [-2.2, -0.94].forEach((a, k) => {
      const px = x + Math.cos(a) * (r + w * 0.9), py = y + Math.sin(a) * (r + w * 0.9), wave = Math.sin(T(t) * 5 + k) * r * 0.05;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py - r * 0.7); ctx.lineWidth = lw * 2.6; ctx.strokeStyle = "#fff"; ctx.stroke(); ctx.lineWidth = lw * 1.1; ctx.strokeStyle = INK; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(px, py - r * 0.7); ctx.quadraticCurveTo(px + r * 0.2, py - r * 0.66 + wave, px + r * 0.36, py - r * 0.58 + wave); ctx.lineTo(px, py - r * 0.42); ctx.closePath();
      ctx.fillStyle = k ? "#22d3ee" : "#ff6b1a"; ctx.fill(); inkStroke(ctx, lw * 0.8);
    });
    const ba = Math.PI / 2 + Math.sin(T(t) * 1.2) * 0.9, bx = x + Math.cos(ba) * (r + w * 0.55), by = y + Math.sin(ba) * (r + w * 0.55), br = w * 0.42;
    circ(ctx, bx, by, br + lw * 1.4); ctx.fillStyle = "#fff"; ctx.fill(); circ(ctx, bx, by, br); ctx.fillStyle = "#f7f5ef"; ctx.fill(); inkStroke(ctx, lw * 0.8);
    ctx.save(); ctx.translate(bx, by); ctx.rotate(T(t) * 4); ctx.fillStyle = INK;
    for (let k = 0; k < 5; k++) { const a = k * TAU / 5; circ(ctx, Math.cos(a) * br * 0.62, Math.sin(a) * br * 0.62, br * 0.18); ctx.fill(); }
    circ(ctx, 0, 0, br * 0.22); ctx.fill(); ctx.restore();
  },

  // Pass: Tornetz – Netz zwischen zwei Pfosten-Ringen, das bei jedem "Treffer" ausbeult, mit Wucht-Strichen
  net(ctx, f, x, y, r, t, lw, L) {
    const w = r * 0.32, hit = t === undefined ? 0 : Math.max(0, 1 - ((t * 0.7) % 1) * 3), bulge = hit * r * 0.12;
    if (L === "back") {
      circ(ctx, x, y, r + w + bulge + lw * 1.7); ctx.fillStyle = "#fff"; ctx.fill();
      circ(ctx, x, y, r + w + bulge + lw * 0.5); ctx.fillStyle = INK; ctx.fill();
      ringPath(ctx, x, y, r, r + w + bulge); ctx.fillStyle = "#1b2c63"; ctx.fill();
      ctx.save(); ringPath(ctx, x, y, r, r + w + bulge); ctx.clip();
      ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.lineWidth = lw * 0.55;
      const step = r * 0.13;
      for (let d = -3 * r; d < 3 * r; d += step) { ctx.beginPath(); ctx.moveTo(x + d - r * 3, y - r * 3); ctx.lineTo(x + d + r * 3, y + r * 3); ctx.moveTo(x + d + r * 3, y - r * 3); ctx.lineTo(x + d - r * 3, y + r * 3); ctx.stroke(); }
      ctx.restore();
      circ(ctx, x, y, r + w * 0.14); ctx.lineWidth = w * 0.3; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = w * 0.2; ctx.strokeStyle = "#f7f5ef"; ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, r + w * 0.14, Math.PI * 1.1, Math.PI * 1.6); ctx.lineWidth = w * 0.06; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.lineWidth = lw; ctx.strokeStyle = INK; circ(ctx, x, y, r); ctx.stroke();
      return;
    }
    if (hit > 0.05) { ctx.save(); ctx.globalAlpha = hit; ctx.strokeStyle = "#fff"; ctx.lineWidth = lw; for (let k = 0; k < 3; k++) { const a = -0.7 + k * 0.2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * (r + w * 1.3), y + Math.sin(a) * (r + w * 1.3)); ctx.lineTo(x + Math.cos(a) * (r + w * 1.9), y + Math.sin(a) * (r + w * 1.9)); ctx.stroke(); } ctx.restore(); }
  },

  // Pass Premium: Flammen – drei Flammenschichten, Glutfunken steigen auf, Lava-Risse im Ring
  flame(ctx, f, x, y, r, t, lw, L) {
    const w = r * 0.26;
    if (L === "back") {
      aura(ctx, x, y, r, r * 2.1, "#ff7a1a", 0.6);
      flames(ctx, x, y, r + w * 0.85, r * 0.48, t, MET.fire, lw);
      bevelRing(ctx, x, y, r, r + w, MET.dark, lw);
      ctx.save(); ringPath(ctx, x, y, r, r + w); ctx.clip(); ctx.globalCompositeOperation = "lighter";
      const glow = t === undefined ? 0.8 : 0.6 + 0.4 * Math.sin(t * 4);
      ctx.strokeStyle = `rgba(255,140,30,${glow})`; ctx.lineWidth = lw * 0.9; ctx.shadowColor = "#ff7a1a"; ctx.shadowBlur = r * 0.2;
      for (let k = 0; k < 9; k++) { const a = k * TAU / 9; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); ctx.lineTo(x + Math.cos(a + 0.12) * (r + w * 0.5), y + Math.sin(a + 0.12) * (r + w * 0.5)); ctx.lineTo(x + Math.cos(a + 0.05) * (r + w), y + Math.sin(a + 0.05) * (r + w)); ctx.stroke(); }
      ctx.restore();
      return;
    }
    if (t !== undefined) { ctx.save(); ctx.globalCompositeOperation = "lighter"; for (let k = 0; k < 10; k++) { const ph = (t * 0.7 + k * 0.137) % 1, a = -Math.PI / 2 + (k - 4.5) * 0.28 + Math.sin(t + k) * 0.1, rr = r + w + ph * r * 1.1; ctx.globalAlpha = 1 - ph; circ(ctx, x + Math.cos(a) * rr, y + Math.sin(a) * rr, r * 0.05 * (1 - ph * 0.5)); ctx.fillStyle = "#ffd43b"; ctx.fill(); } ctx.restore(); }
  },

  // Pass Premium: Pixel – 8-Bit-Treppenring in Regenbogenfarben, Münzen und Herzen kreisen
  pixel(ctx, f, x, y, r, t, lw, L) {
    const s = r * 0.14, R0 = r, R1 = r + s * 2.2, cols = ["#ff3d6e", "#ff9f1c", "#ffe14d", "#3ddc84", "#22d3ee", "#b28cff"];
    if (L === "back") {
      ctx.fillStyle = "#fff";
      for (let gx = -R1 - s * 2; gx < R1 + s * 2; gx += s) for (let gy = -R1 - s * 2; gy < R1 + s * 2; gy += s) { const d = Math.hypot(gx + s / 2, gy + s / 2); if (d >= R0 && d <= R1 + s * 0.55) ctx.fillRect(x + gx - lw, y + gy - lw, s + lw * 2, s + lw * 2); }
      for (let gx = -R1 - s; gx < R1 + s; gx += s) for (let gy = -R1 - s; gy < R1 + s; gy += s) {
        const d = Math.hypot(gx + s / 2, gy + s / 2); if (d < R0 || d > R1) continue;
        const k = Math.floor((Math.atan2(gy, gx) + Math.PI) / TAU * 12 + T(t) * 3) % cols.length, edge = d > R1 - s || d < R0 + s;
        ctx.fillStyle = edge ? shade(cols[k], -0.25) : cols[k]; ctx.fillRect(x + gx, y + gy, s, s);
        ctx.fillStyle = "rgba(255,255,255,.35)"; ctx.fillRect(x + gx, y + gy, s, s * 0.25);
        ctx.lineWidth = lw * 0.45; ctx.strokeStyle = INK; ctx.strokeRect(x + gx, y + gy, s, s);
      }
      return;
    }
    if (t === undefined) return;
    const px = (cx, cy, map, col) => map.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== "#") return; ctx.fillStyle = col; ctx.fillRect(cx + (i - row.length / 2) * s * 0.42, cy + (j - map.length / 2) * s * 0.42, s * 0.42, s * 0.42); }));
    for (let k = 0; k < 4; k++) {
      const a = t * 0.8 + k * TAU / 4, cx = x + Math.cos(a) * (R1 + s * 1.6), cy = y + Math.sin(a) * (R1 + s * 1.6);
      if (k % 2) px(cx, cy, [".##.##.", "#######", "#######", ".#####.", "..###..", "...#..."], "#ff3d6e");
      else px(cx, cy, ["..###..", ".#####.", "##.#.##", "##.#.##", ".#####.", "..###.."], "#ffe14d");
    }
  },
};


/** Rahmen um einen runden Avatar mit Radius r; layer "back" vor dem Kopf, "front" danach */
export function drawFrame(ctx, f, x, y, r, t, layer = "back") {
  const lw = Math.max(1.4, r * 0.055);
  ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
  const draw = DRAW[f.style];
  if (draw) draw(ctx, f, x, y, r, t, lw, layer);
  ctx.restore();
}

/** Stile, die drawFrame kennt (für Tests) */
export const FRAME_STYLES = Object.keys(DRAW);
