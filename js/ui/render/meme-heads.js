// Meme- und Szene-Köpfe (Emo, Rapper, Raver, Gamer, NPC, Steinkopf, Krypto-Bro, Sigma, Kinn-Chad, Brezelini).
// Gleicher Aufbau wie drawHead in art.js (Hinterkopf -> Sticker-Rand -> Haut -> Gesicht -> Vorderteil), aber jeder
// Stil bringt eine eigene Gesichts-Beschreibung mit (face), weil der Witz dieser Köpfe im Blick steckt.
// Die alten Köpfe zeichnet weiter art.js; drawHead leitet nur Stile aus MEME_STYLES hierher um.
import { INK, TAU, circ, shade, stroke } from "./paint.js";

function capPath(ctx, x, y, r, from, to, inset) { ctx.beginPath(); ctx.arc(x, y, r - inset, from, to); ctx.closePath(); }
function star(ctx, x, y, r, col, lw) {
  ctx.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = INK; ctx.stroke();
}
// Form mit optionalem weißem Sticker-Rand (für Teile, die über den Kopf hinausragen)
function blob(ctx, build, fill, lw, white) {
  build();
  if (white) { ctx.lineWidth = lw * 2.8; ctx.strokeStyle = "#fff"; ctx.stroke(); }
  ctx.fillStyle = fill; ctx.fill(); stroke(ctx, lw);
}
// Weißer Sticker-Rand nur außerhalb des Kopfes (für Haare/Teile, die über den Kopfrand ragen)
function whiteOutside(ctx, x, y, r, build, lw) {
  ctx.save(); ctx.beginPath(); ctx.rect(x - r * 3, y - r * 3, r * 6, r * 6); ctx.arc(x, y, r, 0, TAU); ctx.clip("evenodd");
  build(); ctx.lineWidth = lw * 2.8; ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.restore();
}
function blobOut(ctx, x, y, r, build, fill, lw) {
  whiteOutside(ctx, x, y, r, build, lw);
  build(); ctx.fillStyle = fill; ctx.fill(); stroke(ctx, lw);
}
function headClip(ctx, x, y, r, lw) { ctx.save(); circ(ctx, x, y, r - lw); ctx.clip(); }
function skinGrad(ctx, c, x, y, r) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  g.addColorStop(0, shade(c.skin, 0.25)); g.addColorStop(0.7, c.skin); g.addColorStop(1, shade(c.skin, -0.22));
  return g;
}
// Kinn, das nahtlos aus dem Kopf wächst: hinten mit Sticker-Rand vorzeichnen, im Gesicht mit derselben Haut übermalen.
// outer() zeichnet nur die Außenkante (Start und Ende auf dem Kopfrand).
function jawBack(ctx, outer, lw) {
  ctx.beginPath(); outer(); ctx.closePath();
  ctx.lineWidth = lw * 2.8; ctx.strokeStyle = "#fff"; ctx.stroke();
  ctx.fillStyle = INK; ctx.fill();
}
function jawCover(ctx, c, x, y, r, outer, lw) {
  ctx.beginPath(); outer(); ctx.closePath(); ctx.fillStyle = skinGrad(ctx, c, x, y, r); ctx.fill();
  ctx.beginPath(); outer(); stroke(ctx, lw);
}

// ---------- Kopf ----------
// o: { dir, look (Winkel), mood: "" | happy | sad | angry, blink, effort, frozen, t }
export function drawMemeHead(ctx, c, x, y, r, o = {}) {
  const S = MEME_STYLES[c.style], dir = o.dir || 1, lw = Math.max(2, r * 0.085);
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (S.back) S.back(ctx, c, x, y, r, dir, lw, o);
  circ(ctx, x, y, r + lw * 1.4); ctx.fillStyle = "#fff"; ctx.fill();
  circ(ctx, x, y, r); ctx.fillStyle = INK; ctx.fill();
  circ(ctx, x, y, r - lw); ctx.fillStyle = skinGrad(ctx, c, x, y, r); ctx.fill();
  face(ctx, c, S.face || {}, x, y, r, dir, lw, o);
  if (S.front) S.front(ctx, c, x, y, r, dir, lw, o);
  if (o.frozen) {
    ctx.globalAlpha = 0.55; circ(ctx, x, y, r + lw); ctx.fillStyle = "#bdf3ff"; ctx.fill();
    ctx.globalAlpha = 0.9; ctx.strokeStyle = "#fff"; ctx.lineWidth = lw * 0.8;
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 0.55); ctx.lineTo(x - r * 0.2, y - r * 0.75); ctx.stroke();
  }
  ctx.restore();
}

// ---------- Gesicht ----------
// F: { eye: std|side|dot|socket|shades|slim, lid (0..1), eyeY, eyeS, eyeGap, brow: std|heavy|dots|flat|none, browCol,
//      blush (Standard an), under(ctx,…) vor den Augen, mouth(ctx,…) statt Standard-Mund }
function face(ctx, c, F, x, y, r, dir, lw, o) {
  const fx = x + dir * r * 0.14;
  const ey = y - r * 0.02 + (F.eyeY || 0) * r, es = r * 0.22 * (F.eyeS || 1);
  const kind = F.eye || "std";
  const look = o.look ?? (kind === "side" ? (dir > 0 ? Math.PI * 0.92 : Math.PI * 0.08) : (dir > 0 ? 0 : Math.PI));
  const mood = o.mood || (o.effort ? "angry" : "");
  const P = { fx, ey, es, look, mood, gap: r * 0.27 * (F.eyeGap || 1) };
  if (F.under) F.under(ctx, c, x, y, r, dir, lw, o, P);
  if (F.blush !== false) {
    ctx.globalAlpha = 0.35; ctx.fillStyle = F.blushCol || "#ff7a8a";
    circ(ctx, fx - r * 0.42, y + r * 0.28, r * 0.12); ctx.fill(); circ(ctx, fx + r * 0.42, y + r * 0.28, r * 0.12); ctx.fill();
    ctx.globalAlpha = 1;
  }
  eyes(ctx, c, F, kind, r, dir, lw, o, P);
  brows(ctx, c, F, r, lw, P);
  if (F.mouth) F.mouth(ctx, c, x, y, r, dir, lw, o, P);
  else mouthStd(ctx, fx, y + r * 0.42, r, dir, lw, mood, 1);
}

function eyes(ctx, c, F, kind, r, dir, lw, o, P) {
  const { fx, ey, es, look, mood, gap } = P;
  if (kind === "shades" || kind === "slim") return; // Brille zeichnet der Stil selbst
  [-1, 1].forEach(s => {
    const ex = fx + s * gap;
    if (o.blink || mood === "happy") {
      ctx.beginPath();
      if (mood === "happy") ctx.arc(ex, ey + es * 0.3, es * 0.7, Math.PI * 1.1, Math.PI * 1.9);
      else { ctx.moveTo(ex - es * 0.7, ey); ctx.lineTo(ex + es * 0.7, ey); }
      stroke(ctx, lw * 0.9);
      return;
    }
    if (kind === "dot") {
      circ(ctx, ex + Math.cos(look) * es * 0.12, ey + Math.sin(look) * es * 0.1, es * (mood === "sad" ? 0.26 : 0.32)); ctx.fillStyle = INK; ctx.fill();
      return;
    }
    if (kind === "socket") {
      ctx.beginPath(); ctx.ellipse(ex, ey, es * 0.9, es * (mood === "sad" ? 0.45 : 0.62), 0, 0, TAU);
      ctx.fillStyle = shade(c.skin, -0.5); ctx.fill();
      circ(ctx, ex + Math.cos(look) * es * 0.35, ey + Math.sin(look) * es * 0.18, es * 0.17); ctx.fillStyle = mood === "angry" ? "#ff6b4a" : "#eaf2ff"; ctx.fill();
      return;
    }
    ctx.beginPath(); ctx.ellipse(ex, ey, es * 0.82, es, 0, 0, TAU);
    ctx.fillStyle = "#fff"; ctx.fill();
    const reach = kind === "side" ? 0.48 : 0.32;
    const px = ex + Math.cos(look) * es * reach, py = ey + Math.sin(look) * es * 0.38;
    circ(ctx, px, py, es * (mood === "sad" ? 0.38 : 0.46)); ctx.fillStyle = INK; ctx.fill();
    circ(ctx, px - es * 0.15, py - es * 0.18, es * 0.14); ctx.fillStyle = "#fff"; ctx.fill();
    const lid = Math.min(0.75, (F.lid ?? (kind === "side" ? 0.4 : 0)) + (mood === "sad" ? 0.15 : 0) + (mood === "angry" ? 0.1 : 0));
    if (lid > 0) {
      ctx.save(); ctx.beginPath(); ctx.ellipse(ex, ey, es * 0.82, es, 0, 0, TAU); ctx.clip();
      const ly = ey - es + es * 2 * lid;
      ctx.fillStyle = F.lidCol ? F.lidCol(c) : shade(c.skin, -0.08); ctx.fillRect(ex - es, ey - es - 2, es * 2, ly - (ey - es) + 2);
      ctx.beginPath(); ctx.moveTo(ex - es, ly); ctx.lineTo(ex + es, ly); stroke(ctx, lw * 1.1);
      ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(ex, ey, es * 0.82, es, 0, 0, TAU); stroke(ctx, lw * (F.liner ? 1.3 : 0.6));
    if (F.liner) { ctx.beginPath(); ctx.moveTo(ex + s * es * 0.72, ey - es * 0.35); ctx.lineTo(ex + s * es * 1.2, ey - es * 0.75); stroke(ctx, lw * 1.1); }
  });
}

function brows(ctx, c, F, r, lw, P) {
  const { fx, ey, es, mood, gap } = P, kind = F.brow || "std";
  if (kind === "none" || (F.browMoods && !F.browMoods.includes(mood))) return;
  if (kind === "dots") { // Shiba-Punkte
    [-1, 1].forEach(s => {
      const ex = fx + s * gap;
      const dx = mood === "angry" ? -s * es * 0.25 : mood === "sad" ? s * es * 0.15 : 0;
      const dy = mood === "angry" ? es * 0.25 : mood === "sad" ? -es * 0.1 : 0;
      ctx.beginPath(); ctx.ellipse(ex + dx, ey - es * 1.55 + dy, es * 0.36, es * 0.27, 0, 0, TAU);
      ctx.fillStyle = F.browCol ? F.browCol(c) : c.hair; ctx.fill(); stroke(ctx, lw * 0.45);
    });
    return;
  }
  const heavy = kind === "heavy", flat = kind === "flat";
  const tilt = (mood === "angry" ? 0.32 : mood === "sad" ? -0.3 : 0.05) * (flat ? 0.5 : 1);
  const len = flat ? 0.55 : heavy ? 0.85 : 0.75, by0 = ey - es * (heavy ? 1.25 : 1.35);
  ctx.beginPath();
  [-1, 1].forEach(s => {
    const ex = fx + s * gap;
    ctx.moveTo(ex - es * len, by0 + s * tilt * es);
    ctx.lineTo(ex + es * len, by0 - s * tilt * es);
  });
  ctx.strokeStyle = F.browCol ? F.browCol(c) : shade(c.hair, -0.3);
  ctx.lineWidth = lw * (heavy ? 1.9 : flat ? 0.9 : 1.1) * (F.browW || 1); ctx.stroke();
}

function mouthStd(ctx, mx, my, r, dir, lw, mood, k) {
  ctx.beginPath();
  if (mood === "happy") {
    ctx.moveTo(mx - r * 0.3 * k, my - r * 0.06 * k); ctx.quadraticCurveTo(mx, my + r * 0.42 * k, mx + r * 0.3 * k, my - r * 0.06 * k); ctx.closePath();
    ctx.fillStyle = "#7a1f2b"; ctx.fill(); stroke(ctx, lw * 0.8);
    ctx.beginPath(); ctx.moveTo(mx - r * 0.22 * k, my - r * 0.02 * k); ctx.lineTo(mx + r * 0.22 * k, my - r * 0.02 * k); ctx.strokeStyle = "#fff"; ctx.lineWidth = lw * 0.9; ctx.stroke();
  } else if (mood === "sad") {
    ctx.arc(mx, my + r * 0.16 * k, r * 0.18 * k, Math.PI * 1.15, Math.PI * 1.85); stroke(ctx, lw);
  } else if (mood === "angry") {
    ctx.rect(mx - r * 0.2 * k, my - r * 0.06 * k, r * 0.4 * k, r * 0.14 * k); ctx.fillStyle = "#fff"; ctx.fill(); stroke(ctx, lw * 0.8);
    ctx.beginPath(); ctx.moveTo(mx, my - r * 0.06 * k); ctx.lineTo(mx, my + r * 0.08 * k); stroke(ctx, lw * 0.5);
  } else {
    ctx.moveTo(mx - r * 0.18 * k, my); ctx.quadraticCurveTo(mx + dir * r * 0.02 * k, my + r * 0.14 * k, mx + r * 0.2 * k, my - r * 0.04 * k); stroke(ctx, lw);
  }
}

// Selbstsicheres Grinsen (Chad, Krypto-Bro, Sigma)
function smirk(ctx, mx, my, r, dir, lw, mood, teeth) {
  if (mood === "sad") { ctx.beginPath(); ctx.moveTo(mx - r * 0.2, my + r * 0.04); ctx.lineTo(mx + r * 0.2, my + r * 0.04); stroke(ctx, lw); return; }
  if (mood === "angry" || (teeth && mood === "happy")) {
    const w = mood === "happy" ? 0.3 : 0.24;
    ctx.beginPath(); ctx.moveTo(mx - r * w, my - r * 0.04); ctx.quadraticCurveTo(mx, my + r * (mood === "happy" ? 0.26 : 0.14), mx + r * w, my - r * 0.04 - dir * r * 0.04); ctx.closePath();
    ctx.fillStyle = "#fff"; ctx.fill(); stroke(ctx, lw * 0.8);
    ctx.beginPath(); ctx.moveTo(mx - r * w * 0.85, my + r * 0.02); ctx.lineTo(mx + r * w * 0.85, my + r * 0.02); stroke(ctx, lw * 0.4);
    return;
  }
  const lift = mood === "happy" ? 0.14 : 0.09;
  ctx.beginPath(); ctx.moveTo(mx - dir * r * 0.22, my + r * 0.03);
  ctx.quadraticCurveTo(mx + dir * r * 0.05, my + r * 0.08, mx + dir * r * 0.24, my - r * lift); stroke(ctx, lw);
  ctx.beginPath(); ctx.moveTo(mx + dir * r * 0.24, my - r * lift); ctx.lineTo(mx + dir * r * 0.28, my - r * (lift - 0.05)); stroke(ctx, lw * 0.7);
}

// ---------- Stile ----------
export const MEME_STYLES = {
  // Emo: schwarzer Seitenpony über einem Auge, pinke Strähne, Kajal, Lippenpiercing
  emo: {
    face: {
      eye: "std", lid: 0.22, eyeY: -0.02, liner: true, blush: false,
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        const mx = P.fx, my = y + r * 0.46, m = P.mood;
        if (m === "") { ctx.beginPath(); ctx.moveTo(mx - r * 0.15, my + r * 0.04); ctx.quadraticCurveTo(mx, my - r * 0.03, mx + r * 0.15, my + r * 0.04); stroke(ctx, lw); }
        else mouthStd(ctx, mx, my, r, dir, lw, m, m === "happy" ? 0.7 : 0.9);
        const wide = m === "angry" || m === "happy"; ctx.beginPath(); ctx.arc(mx + dir * r * (wide ? 0.3 : 0.2), my + r * (wide ? 0.12 : 0.09), r * 0.065, 0, TAU); ctx.lineWidth = lw * 0.9; ctx.strokeStyle = "#cfd6e0"; ctx.stroke();
      },
    },
    front(ctx, c, x, y, r, dir, lw) {
      // Haarkappe + Pony, der das vordere Auge verdeckt
      const pony = () => {
        ctx.beginPath(); ctx.moveTo(x - dir * r * 0.97, y + r * 0.12);
        ctx.lineTo(x - dir * r * 1.18, y - r * 0.1); ctx.lineTo(x - dir * r * 0.99, y - r * 0.3);
        ctx.lineTo(x - dir * r * 1.24, y - r * 0.52); ctx.lineTo(x - dir * r * 0.93, y - r * 0.7);
        ctx.quadraticCurveTo(x - dir * r * 0.75, y - r * 1.12, x + dir * r * 0.15, y - r * 1.1);
        ctx.quadraticCurveTo(x + dir * r * 0.95, y - r * 1.0, x + dir * r * 0.98, y - r * 0.15);
        ctx.lineTo(x + dir * r * 0.86, y + r * 0.3); ctx.lineTo(x + dir * r * 0.72, y + r * 0.08);
        ctx.lineTo(x + dir * r * 0.58, y + r * 0.26); ctx.lineTo(x + dir * r * 0.44, y + r * 0.02);
        ctx.quadraticCurveTo(x + dir * r * 0.15, y - r * 0.32, x - dir * r * 0.3, y - r * 0.55);
        ctx.quadraticCurveTo(x - dir * r * 0.75, y - r * 0.45, x - dir * r * 0.97, y + r * 0.12);
      };
      whiteOutside(ctx, x, y, r, pony, lw);
      ctx.fillStyle = c.hair; ctx.fill(); stroke(ctx, lw);
      ctx.save(); pony(); ctx.clip();
      ctx.beginPath(); ctx.moveTo(x - dir * r * 0.05, y - r * 0.98); ctx.quadraticCurveTo(x + dir * r * 0.55, y - r * 0.72, x + dir * r * 0.66, y + r * 0.05);
      ctx.strokeStyle = c.acc; ctx.lineWidth = r * 0.11; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - dir * r * 0.45, y - r * 0.85); ctx.quadraticCurveTo(x + dir * r * 0.1, y - r * 0.8, x + dir * r * 0.3, y - r * 0.3);
      ctx.strokeStyle = shade(c.hair, 0.25); ctx.lineWidth = lw * 0.6; ctx.stroke();
      ctx.restore();
      pony(); stroke(ctx, lw);
    },
  },

  // Rapper: Snapback mit flachem Schirm, Bartschatten, Ziegenbart, Brauen-Schlitze, Goldzähne, dicke Goldkette
  rapper: {
    face: {
      eye: "std", lid: 0.3, eyeY: 0.02, brow: "heavy", browW: 1.15, blush: false,
      browCol: () => "#1a1210",
      under(ctx, c, x, y, r, dir, lw, o, P) {
        headClip(ctx, x, y, r, lw);
        ctx.globalAlpha = 0.22; ctx.fillStyle = shade(c.skin, -0.5);
        ctx.beginPath(); ctx.moveTo(x - r, y + r * 0.1); ctx.quadraticCurveTo(x - r * 0.7, y + r * 0.42, P.fx - r * 0.25, y + r * 0.3);
        ctx.quadraticCurveTo(P.fx, y + r * 0.27, P.fx + r * 0.25, y + r * 0.3); ctx.quadraticCurveTo(x + r * 0.7, y + r * 0.42, x + r, y + r * 0.1);
        ctx.lineTo(x + r, y + r * 1.1); ctx.lineTo(x - r, y + r * 1.1); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      },
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        const mx = P.fx, my = y + r * 0.5, m = P.mood, beard = "#1a1210";
        // Schnurrbart + Kinnbart
        ctx.beginPath(); ctx.moveTo(mx - r * 0.28, my - r * 0.04); ctx.quadraticCurveTo(mx, my - r * 0.2, mx + r * 0.28, my - r * 0.04 - dir * r * 0.03);
        ctx.quadraticCurveTo(mx, my - r * 0.11, mx - r * 0.28, my - r * 0.04); ctx.fillStyle = beard; ctx.fill();
        ctx.beginPath(); ctx.moveTo(mx - r * 0.14, my + r * 0.2); ctx.quadraticCurveTo(mx, my + r * 0.16, mx + r * 0.14, my + r * 0.2); ctx.lineTo(mx + r * 0.1, my + r * 0.38); ctx.quadraticCurveTo(mx, my + r * 0.42, mx - r * 0.1, my + r * 0.38); ctx.closePath(); ctx.fillStyle = beard; ctx.fill();
        if (m === "sad") { ctx.beginPath(); ctx.moveTo(mx - r * 0.18, my + r * 0.07); ctx.quadraticCurveTo(mx, my, mx + r * 0.18, my + r * 0.07); stroke(ctx, lw); return; }
        const w = m === "happy" ? 0.28 : 0.24, d = m === "happy" ? 0.36 : m === "angry" ? 0.22 : 0.3;
        ctx.beginPath(); ctx.moveTo(mx - r * w, my); ctx.quadraticCurveTo(mx, my + r * d, mx + r * w, my - dir * r * 0.05); ctx.closePath();
        ctx.fillStyle = c.acc; ctx.fill(); stroke(ctx, lw * 0.8);
        ctx.save(); ctx.clip();
        ctx.beginPath(); for (let k = -2; k <= 2; k++) { ctx.moveTo(mx + k * r * w * 0.38, my - r * 0.04); ctx.lineTo(mx + k * r * w * 0.38, my + r * 0.3); }
        ctx.moveTo(mx - r * w, my + r * 0.06); ctx.lineTo(mx + r * w, my + r * 0.06); stroke(ctx, lw * 0.4);
        ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillRect(mx - r * w * 0.55, my + r * 0.01, r * 0.07, r * 0.03);
        ctx.restore();
      },
    },
    front(ctx, c, x, y, r, dir, lw) {
      // Schlitze in der vorderen Braue
      const fx = x + dir * r * 0.14, bx = fx + dir * r * 0.27, by = y + r * 0.02 - r * 0.22 * 1.25;
      ctx.strokeStyle = c.skin; ctx.lineWidth = lw * 0.55;
      [0.02, 0.1].forEach(k => { ctx.beginPath(); ctx.moveTo(bx + dir * r * k - r * 0.02, by - r * 0.06); ctx.lineTo(bx + dir * r * k + r * 0.02, by + r * 0.06); ctx.stroke(); });
      // Diamant-Ohrstecker hinten
      const ex = x - dir * r * 0.92, ey = y + r * 0.22;
      ctx.beginPath(); ctx.moveTo(ex, ey - r * 0.09); ctx.lineTo(ex + r * 0.07, ey); ctx.lineTo(ex, ey + r * 0.09); ctx.lineTo(ex - r * 0.07, ey); ctx.closePath();
      ctx.fillStyle = "#e8fbff"; ctx.fill(); stroke(ctx, lw * 0.6);
      // Kappe
      ctx.beginPath(); ctx.arc(x, y - r * 0.04, r * 1.0, Math.PI * 1.1, Math.PI * 1.9); ctx.closePath();
      ctx.fillStyle = c.hair; ctx.fill(); stroke(ctx, lw);
      ctx.strokeStyle = shade(c.hair, 0.28); ctx.lineWidth = lw * 0.55;
      ctx.beginPath(); ctx.moveTo(x + dir * r * 0.08, y - r * 1.02); ctx.quadraticCurveTo(x + dir * r * 0.32, y - r * 0.7, x + dir * r * 0.3, y - r * 0.38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - dir * r * 0.1, y - r * 1.02); ctx.quadraticCurveTo(x - dir * r * 0.55, y - r * 0.75, x - dir * r * 0.68, y - r * 0.38); ctx.stroke();
      circ(ctx, x, y - r * 1.02, r * 0.06); ctx.fillStyle = shade(c.hair, 0.12); ctx.fill(); stroke(ctx, lw * 0.5);
      // Schirm nach vorn: leicht gewölbt, zur Spitze dünner, abgerundet (wirkt wie eine Kappe in Dreiviertel-Ansicht)
      blob(ctx, () => {
        ctx.beginPath(); ctx.moveTo(x + dir * r * 0.1, y - r * 0.5);
        ctx.quadraticCurveTo(x + dir * r * 0.72, y - r * 0.6, x + dir * r * 1.12, y - r * 0.45);
        ctx.quadraticCurveTo(x + dir * r * 1.22, y - r * 0.39, x + dir * r * 1.1, y - r * 0.34);
        ctx.quadraticCurveTo(x + dir * r * 0.68, y - r * 0.36, x + dir * r * 0.1, y - r * 0.27); ctx.closePath();
      }, shade(c.hair, -0.15), lw, false);
      ctx.beginPath(); ctx.moveTo(x + dir * r * 0.18, y - r * 0.33); ctx.quadraticCurveTo(x + dir * r * 0.68, y - r * 0.4, x + dir * r * 1.06, y - r * 0.37); ctx.strokeStyle = shade(c.hair, 0.22); ctx.lineWidth = lw * 0.5; ctx.stroke();
      // Panzerkette mit Medaillon
      const m = chain(ctx, x, y, r, dir, lw, r * 0.12, c.acc, true);
      blob(ctx, () => circ(ctx, m.px, m.py, r * 0.13), c.acc, lw * 0.7, true);
      ctx.fillStyle = shade(c.acc, -0.45); ctx.font = `900 ${Math.round(r * 0.17)}px system-ui, sans-serif`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", m.px, m.py + r * 0.01);
    },
  },

  // Raver: Space Buns in Neon, Leuchtband am Haaransatz, Glitzer
  raver: {
    back(ctx, c, x, y, r, dir, lw) {
      [-1, 1].forEach(s => {
        const bx = x + s * r * 0.5, by = y - r * 1.1, br = r * 0.28;
        const g = ctx.createRadialGradient(bx - r * 0.08, by - r * 0.1, r * 0.03, bx, by, br * 1.1);
        g.addColorStop(0, shade(c.hair, 0.35)); g.addColorStop(1, c.hair);
        blob(ctx, () => circ(ctx, bx, by, br), g, lw, true);
        ctx.strokeStyle = shade(c.hair, -0.25); ctx.lineWidth = lw * 0.6;
        ctx.beginPath(); ctx.arc(bx, by + br * 0.35, br * 0.75, Math.PI * 1.2, Math.PI * 1.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx, by + br * 0.75, br * 0.85, Math.PI * 1.25, Math.PI * 1.75); ctx.stroke();
      });
    },
    face: {
      eye: "std", eyeY: 0.04, blushCol: "#ff6fd1",
      under(ctx, c, x, y, r, dir, lw, o, P) {
        [-1, 1].forEach(s => star(ctx, P.fx + s * r * 0.52, y + r * 0.34, r * 0.075, "#fff", lw * 0.6));
      },
    },
    front(ctx, c, x, y, r, dir, lw, o) {
      capPath(ctx, x, y, r, Math.PI * 1.1, Math.PI * 1.9, lw * 0.5); ctx.fillStyle = c.hair; ctx.fill(); stroke(ctx, lw);
      ctx.beginPath(); ctx.arc(x, y, r * 0.78, Math.PI * 1.22, Math.PI * 1.42); ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = lw * 1.1; ctx.stroke();
      [-1, 1].forEach(s => { ctx.beginPath(); ctx.ellipse(x + s * r * 0.45, y - r * 0.88, r * 0.15, r * 0.07, s * 0.45, 0, TAU); ctx.fillStyle = c.acc; ctx.fill(); stroke(ctx, lw * 0.6); });
      // Leuchtband am Haaransatz
      const top = y - r * 0.36, h = r * 0.11, pulse = 0.7 + 0.3 * Math.sin((o.t || 0) * 5);
      headClip(ctx, x, y, r, lw);
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.35 * pulse; ctx.fillStyle = c.acc; ctx.fillRect(x - r, top - h * 0.8, r * 2, h * 2.6); ctx.restore();
      ctx.fillStyle = c.acc; ctx.fillRect(x - r, top, r * 2, h);
      ctx.fillStyle = "rgba(255,255,255,.75)"; ctx.fillRect(x - r, top + h * 0.2, r * 2, h * 0.25);
      ctx.beginPath(); ctx.moveTo(x - r, top); ctx.lineTo(x + r, top); ctx.moveTo(x - r, top + h); ctx.lineTo(x + r, top + h); stroke(ctx, lw * 0.6);
      ctx.restore();
    },
  },

  // Gamer: Headset mit RGB-Ring und Mikro, Augenringe, wild beim Schuss
  gamer: {
    face: {
      eye: "std", lid: 0.18, eyeY: 0.0, blush: false,
      under(ctx, c, x, y, r, dir, lw, o, P) {
        [-1, 1].forEach(s => { ctx.beginPath(); ctx.arc(P.fx + s * P.gap, P.ey + P.es * 0.55, P.es * 0.75, Math.PI * 0.2, Math.PI * 0.8); ctx.strokeStyle = "rgba(122,80,170,.55)"; ctx.lineWidth = lw * 1.2; ctx.stroke(); });
      },
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        const mx = P.fx, my = y + r * 0.46;
        if (P.mood === "angry") { // Rage
          ctx.beginPath(); ctx.ellipse(mx, my + r * 0.04, r * 0.17, r * 0.13, 0, 0, TAU); ctx.fillStyle = "#7a1f2b"; ctx.fill(); stroke(ctx, lw * 0.8);
          ctx.beginPath(); ctx.ellipse(mx, my - r * 0.05, r * 0.11, r * 0.035, 0, 0, TAU); ctx.fillStyle = "#fff"; ctx.fill();
        } else mouthStd(ctx, mx, my, r, dir, lw, P.mood, 0.85);
      },
    },
    front(ctx, c, x, y, r, dir, lw, o) {
      // Haarbüschel
      blob(ctx, () => { ctx.beginPath(); ctx.moveTo(x - r * 0.95, y - r * 0.25); ctx.quadraticCurveTo(x - r * 0.95, y - r * 1.0, x - r * 0.3, y - r * 1.02);
        ctx.quadraticCurveTo(x, y - r * 1.06, x + r * 0.42, y - r * 0.92);
        ctx.quadraticCurveTo(x + r * 0.95, y - r * 0.85, x + r * 0.95, y - r * 0.25); ctx.quadraticCurveTo(x + dir * r * 0.5, y - r * 0.62, x + dir * r * 0.05, y - r * 0.5);
        ctx.quadraticCurveTo(x - dir * r * 0.5, y - r * 0.6, x - r * 0.95, y - r * 0.25); }, c.hair, lw, false);
      // Bügel
      ctx.beginPath(); ctx.arc(x, y + r * 0.02, r * 1.08, Math.PI * 1.08, Math.PI * 1.92);
      ctx.lineWidth = r * 0.16 + lw * 2.8; ctx.strokeStyle = "#fff"; ctx.stroke();
      ctx.lineWidth = r * 0.16 + lw * 1.6; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = r * 0.16; ctx.strokeStyle = "#2a2e45"; ctx.stroke();
      // Mikro vom vorderen Ohr zum Mund
      ctx.beginPath(); ctx.moveTo(x + dir * r * 0.98, y + r * 0.2); ctx.quadraticCurveTo(x + dir * r * 0.95, y + r * 0.62, x + dir * r * 0.55, y + r * 0.6);
      ctx.lineWidth = lw * 2.4; ctx.strokeStyle = INK; ctx.stroke(); ctx.lineWidth = lw * 1.1; ctx.strokeStyle = "#2a2e45"; ctx.stroke();
      blob(ctx, () => { ctx.beginPath(); ctx.ellipse(x + dir * r * 0.5, y + r * 0.6, r * 0.1, r * 0.08, 0, 0, TAU); }, "#2a2e45", lw * 0.8, false);
      // Ohrmuscheln mit RGB-Ring
      const t = o.t || 0;
      [-1, 1].forEach(s => {
        const cx = x + s * r * 1.0, cy = y + r * 0.02;
        blobOut(ctx, x, y, r, () => { ctx.beginPath(); ctx.roundRect(cx - r * 0.2, cy - r * 0.34, r * 0.4, r * 0.66, r * 0.18); }, "#2a2e45", lw);
        ctx.beginPath(); ctx.roundRect(cx - r * 0.11, cy - r * 0.24, r * 0.22, r * 0.46, r * 0.1);
        ctx.strokeStyle = o.t === undefined ? c.acc : `hsl(${(t * 140 + s * 90) % 360},95%,62%)`; ctx.lineWidth = lw * 1.1; ctx.stroke();
      });
    },
  },

  // NPC: grau, Punktaugen, flacher Mund, Tipp-Blase „…“ am Hinterkopf
  npc: {
    face: {
      eye: "dot", brow: "flat", browMoods: ["angry"], blush: false, browCol: c => shade(c.hair, -0.35),
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        const mx = P.fx, my = y + r * 0.45, m = P.mood;
        ctx.beginPath(); ctx.moveTo(P.fx + dir * r * 0.05, y + r * 0.02); ctx.lineTo(P.fx + dir * r * 0.1, y + r * 0.2); ctx.lineTo(P.fx, y + r * 0.21); stroke(ctx, lw * 0.6);
        const tilt = m === "happy" ? 0.04 : m === "sad" ? -0.04 : 0;
        ctx.beginPath(); ctx.moveTo(mx - r * 0.2, my + r * tilt); ctx.lineTo(mx + r * 0.2, my - r * tilt);
        if (m === "angry") { ctx.moveTo(mx - r * 0.2, my + r * 0.05); ctx.lineTo(mx + r * 0.2, my + r * 0.05); }
        stroke(ctx, lw * 0.9);
      },
    },
    front(ctx, c, x, y, r, dir, lw, o) {
      ctx.beginPath(); ctx.arc(x, y, r * 0.78, Math.PI * 1.2, Math.PI * 1.45); ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = lw * 1.3; ctx.stroke();
      // Tipp-Blase „…“ seitlich am Hinterkopf, die Punkte pulsieren nacheinander
      const bx = x - dir * r * 1.02, by = y - r * 0.62, bw = r * 0.62, bh = r * 0.36;
      // eine geschlossene Form: Pille mit Spitze unten Richtung Kopf (lokal gespiegelt, +x zeigt zum Kopf)
      ctx.save(); ctx.translate(bx, by); ctx.scale(dir, 1);
      const hw = bw / 2, hh = bh / 2, e = hw - hh;
      blob(ctx, () => {
        ctx.beginPath(); ctx.moveTo(-e, -hh); ctx.lineTo(e, -hh);
        ctx.arc(e, 0, hh, -Math.PI / 2, Math.PI / 2);
        ctx.quadraticCurveTo(e + r * 0.01, hh + r * 0.08, e + r * 0.11, hh + r * 0.15);
        ctx.quadraticCurveTo(e - r * 0.06, hh + r * 0.12, e - r * 0.14, hh);
        ctx.lineTo(-e, hh);
        ctx.arc(-e, 0, hh, Math.PI / 2, Math.PI * 1.5);
        ctx.closePath();
      }, "#fff", lw * 0.7, true);
      ctx.restore();
      const t = o.t;
      [-1, 0, 1].forEach(k => {
        // weiche Welle: jeder Punkt hebt sich nacheinander (Kosinus-Buckel, 1,3 s Zyklus), Größe bleibt gleich
        const f = t === undefined ? 0.25 : (((t / 1.3 - (k + 1) * 0.16) % 1) + 1) % 1;
        const ph = f < 0.5 ? (1 - Math.cos(f / 0.5 * TAU)) / 2 : 0;
        ctx.globalAlpha = 0.4 + 0.6 * ph;
        circ(ctx, bx + k * bw * 0.26, by + r * 0.015 - ph * r * 0.05, r * 0.055); ctx.fillStyle = shade(c.skin, -0.5); ctx.fill();
      });
      ctx.globalAlpha = 1;
    },
  },

  // Steinkopf: Moai mit Augenhöhlen, langer Nase, langem Kinn
  moai: {
    back(ctx, c, x, y, r, dir, lw) {
      jawBack(ctx, moaiJaw(ctx, x, y, r), lw);
    },
    face: {
      eye: "socket", eyeY: -0.06, eyeGap: 0.95, brow: "heavy", browW: 1.5, blush: false,
      browCol: c => shade(c.skin, -0.4),
      under(ctx, c, x, y, r, dir, lw) { jawCover(ctx, c, x, y, r, moaiJaw(ctx, x, y, r), lw); },
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        const fx = P.fx, by = P.ey - P.es * 0.6, ny = y + r * 0.34, off = dir * r * 0.1;
        ctx.beginPath(); ctx.moveTo(fx - r * 0.07, by); ctx.lineTo(fx + r * 0.07, by); ctx.lineTo(fx + r * 0.19 + off, ny); ctx.lineTo(fx - r * 0.17 + off, ny); ctx.closePath();
        ctx.fillStyle = shade(c.skin, 0.12); ctx.fill(); stroke(ctx, lw * 0.7);
        const mx = fx + off * 0.5, my = y + r * 0.6, m = P.mood;
        const bend = m === "happy" ? 0.1 : m === "sad" ? -0.1 : 0;
        ctx.beginPath(); ctx.moveTo(mx - r * 0.3, my - r * bend); ctx.quadraticCurveTo(mx, my + r * bend, mx + r * 0.3, my - r * bend);
        if (m === "angry") { ctx.moveTo(mx - r * 0.24, my + r * 0.07); ctx.lineTo(mx + r * 0.24, my + r * 0.07); }
        stroke(ctx, lw * 1.1);
        ctx.beginPath(); ctx.moveTo(mx - r * 0.2, my + r * 0.14); ctx.lineTo(mx + r * 0.2, my + r * 0.14); ctx.strokeStyle = shade(c.skin, -0.3); ctx.lineWidth = lw * 0.7; ctx.stroke();
      },
    },
    front(ctx, c, x, y, r, dir, lw) {
      ctx.fillStyle = shade(c.skin, -0.25);
      [[-0.55, -0.55, 0.05], [0.5, -0.7, 0.04], [-0.7, 0.2, 0.045], [0.62, 0.05, 0.05], [-0.25, -0.82, 0.035], [-0.5, 0.8, 0.04]].forEach(([dx, dy, s]) => { circ(ctx, x + dx * r, y + dy * r, s * r); ctx.fill(); });
      ctx.beginPath(); ctx.moveTo(x - dir * r * 0.75, y - r * 0.35); ctx.lineTo(x - dir * r * 0.6, y - r * 0.2); ctx.lineTo(x - dir * r * 0.66, y - r * 0.02);
      ctx.strokeStyle = shade(c.skin, -0.35); ctx.lineWidth = lw * 0.6; ctx.stroke();
    },
  },

  // Krypto-Bro: Föhnwelle, Sonnenbrille mit Laser-Augen beim Schuss, Goldkette mit Pfeil nach oben
  crypto: {
    face: {
      eye: "shades", eyeY: -0.04,
      mouth(ctx, c, x, y, r, dir, lw, o, P) { smirk(ctx, P.fx, y + r * 0.44, r, dir, lw, P.mood, true); },
    },
    front(ctx, c, x, y, r, dir, lw, o) {
      ctx.beginPath(); ctx.moveTo(x - dir * r * 0.97, y - r * 0.15);
      ctx.quadraticCurveTo(x - dir * r * 1.0, y - r * 1.05, x - dir * r * 0.1, y - r * 1.12);
      ctx.quadraticCurveTo(x + dir * r * 0.75, y - r * 1.45, x + dir * r * 1.02, y - r * 0.82);
      ctx.quadraticCurveTo(x + dir * r * 0.5, y - r * 0.95, x + dir * r * 0.35, y - r * 0.62);
      ctx.quadraticCurveTo(x - dir * r * 0.1, y - r * 0.7, x - dir * r * 0.97, y - r * 0.15);
      ctx.fillStyle = c.hair; ctx.fill(); stroke(ctx, lw);
      ctx.beginPath(); ctx.moveTo(x - dir * r * 0.2, y - r * 1.0); ctx.quadraticCurveTo(x + dir * r * 0.4, y - r * 1.2, x + dir * r * 0.8, y - r * 0.92); ctx.strokeStyle = shade(c.hair, 0.4); ctx.lineWidth = lw * 0.8; ctx.stroke();
      const fx = x + dir * r * 0.14, ey = y - r * 0.06, gap = r * 0.27, mood = o.mood || (o.effort ? "angry" : "");
      ctx.beginPath(); ctx.moveTo(fx - gap - r * 0.32, ey - r * 0.12); ctx.lineTo(fx + gap + r * 0.32, ey - r * 0.12); stroke(ctx, lw * 1.2);
      [-1, 1].forEach(s => {
        const ex = fx + s * gap;
        ctx.beginPath(); ctx.moveTo(ex - r * 0.25, ey - r * 0.13); ctx.lineTo(ex + r * 0.25, ey - r * 0.13); ctx.quadraticCurveTo(ex + r * 0.24, ey + r * 0.2, ex, ey + r * 0.18); ctx.quadraticCurveTo(ex - r * 0.24, ey + r * 0.2, ex - r * 0.25, ey - r * 0.13);
        const g = ctx.createLinearGradient(0, ey - r * 0.13, 0, ey + r * 0.2); g.addColorStop(0, "#2a2350"); g.addColorStop(1, "#7b3fe4");
        ctx.fillStyle = g; ctx.fill(); stroke(ctx, lw * 0.8);
        ctx.beginPath(); ctx.moveTo(ex - r * 0.14, ey - r * 0.05); ctx.lineTo(ex - r * 0.02, ey - r * 0.08); ctx.strokeStyle = c.acc; ctx.lineWidth = lw * 0.8; ctx.stroke();
        if (mood === "angry") { // Laser-Augen
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const gg = ctx.createRadialGradient(ex, ey + r * 0.03, 1, ex, ey + r * 0.03, r * 0.3); gg.addColorStop(0, "rgba(255,80,60,1)"); gg.addColorStop(1, "rgba(255,40,40,0)");
          ctx.fillStyle = gg; circ(ctx, ex, ey + r * 0.03, r * 0.3); ctx.fill();
          ctx.beginPath(); ctx.moveTo(ex, ey + r * 0.03); ctx.lineTo(ex + dir * r * 1.6, ey + r * 0.03 - r * 0.08); ctx.strokeStyle = "rgba(255,70,50,.85)"; ctx.lineWidth = r * 0.07; ctx.stroke();
          ctx.restore();
        }
      });
      const m = chain(ctx, x, y, r, dir, lw, r * 0.075, "#ffd43b", false);
      blob(ctx, () => circ(ctx, m.px, m.py, r * 0.11), "#ffd43b", lw * 0.6, true);
      ctx.beginPath(); ctx.moveTo(m.px, m.py + r * 0.05); ctx.lineTo(m.px, m.py - r * 0.055); ctx.moveTo(m.px - r * 0.04, m.py - r * 0.01); ctx.lineTo(m.px, m.py - r * 0.055); ctx.lineTo(m.px + r * 0.04, m.py - r * 0.01);
      stroke(ctx, lw * 0.55);
    },
  },

  // Sigma: nach hinten gegelt, schmale schwarze Brille, Grinsen nur auf einer Seite, lächelt nie richtig
  sigma: {
    face: {
      eye: "slim", brow: "heavy", blush: false,
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        ctx.beginPath(); ctx.arc(x, y + r * 0.05, r * 0.78, Math.PI * 0.22, Math.PI * 0.78); ctx.strokeStyle = shade(c.skin, -0.18); ctx.lineWidth = lw * 0.7; ctx.stroke();
        smirk(ctx, P.fx, y + r * 0.44, r, dir, lw, P.mood === "sad" ? "" : P.mood === "happy" ? "happy" : P.mood === "angry" ? "sad" : "", false);
      },
    },
    front(ctx, c, x, y, r, dir, lw) {
      ctx.beginPath(); ctx.moveTo(x - dir * r * 0.97, y - r * 0.05);
      ctx.quadraticCurveTo(x - dir * r * 1.05, y - r * 1.12, x + dir * r * 0.15, y - r * 1.12);
      ctx.quadraticCurveTo(x + dir * r * 0.85, y - r * 1.08, x + dir * r * 0.9, y - r * 0.5);
      ctx.quadraticCurveTo(x + dir * r * 0.3, y - r * 0.68, x - dir * r * 0.55, y - r * 0.45);
      ctx.quadraticCurveTo(x - dir * r * 0.8, y - r * 0.3, x - dir * r * 0.97, y - r * 0.05);
      ctx.fillStyle = c.hair; ctx.fill(); stroke(ctx, lw);
      ctx.strokeStyle = shade(c.hair, 0.3); ctx.lineWidth = lw * 0.5;
      [0, 0.16].forEach(k => { ctx.beginPath(); ctx.moveTo(x + dir * r * (0.55 - k), y - r * (0.72 - k * 0.15)); ctx.quadraticCurveTo(x - dir * r * (0.05 + k), y - r * (1.0 - k * 0.2), x - dir * r * (0.7 - k * 0.3), y - r * (0.45 - k * 0.6)); ctx.stroke(); });
      const fx = x + dir * r * 0.14, ey = y - r * 0.02, gap = r * 0.27;
      ctx.beginPath(); ctx.moveTo(fx - gap - r * 0.26, ey - r * 0.06); ctx.lineTo(fx + gap + r * 0.26, ey - r * 0.06); stroke(ctx, lw);
      [-1, 1].forEach(s => {
        const ex = fx + s * gap;
        ctx.beginPath(); ctx.roundRect(ex - r * 0.21, ey - r * 0.08, r * 0.42, r * 0.17, r * 0.05); ctx.fillStyle = "#101014"; ctx.fill(); stroke(ctx, lw * 0.7);
        ctx.beginPath(); ctx.moveTo(ex - r * 0.12, ey - r * 0.03); ctx.lineTo(ex - r * 0.04, ey - r * 0.03); ctx.strokeStyle = "rgba(255,255,255,.7)"; ctx.lineWidth = lw * 0.6; ctx.stroke();
      });
      // Rollkragen: schmaler Strickbund auf dem weißen Rand unten am Kopf
      const cy = y + r * 0.06, cr = r * 1.04, w = r * 0.075;
      ctx.beginPath(); ctx.arc(x, cy, cr, Math.PI * 0.36, Math.PI * 0.64);
      ctx.lineWidth = w + lw * 1.4; ctx.strokeStyle = INK; ctx.stroke();
      ctx.lineWidth = w; ctx.strokeStyle = c.acc; ctx.stroke();
      ctx.strokeStyle = shade(c.acc, 0.22); ctx.lineWidth = lw * 0.45;
      for (let k = 0; k <= 5; k++) {
        const a = Math.PI * (0.38 + 0.24 * k / 5), ca = Math.cos(a), sa = Math.sin(a);
        ctx.beginPath(); ctx.moveTo(x + ca * (cr - w * 0.32), cy + sa * (cr - w * 0.32)); ctx.lineTo(x + ca * (cr + w * 0.32), cy + sa * (cr + w * 0.32)); ctx.stroke();
      }
    },
  },

  // Kinn-Chad: V-Kiefer mit kantigem Kinn, kurzer Bart, Wangenknochen, hoch gegelte Haare, breites Zahngrinsen
  chad: {
    back(ctx, c, x, y, r, dir, lw) { jawBack(ctx, chadJaw(ctx, x, y, r, dir), lw); },
    face: {
      eye: "std", lid: 0.36, eyeY: -0.1, eyeS: 0.92, brow: "heavy", browW: 1.25, blush: false,
      browCol: c => shade(c.hair, -0.2),
      under(ctx, c, x, y, r, dir, lw, o, P) {
        const jaw = chadJaw(ctx, x, y, r, dir);
        jawCover(ctx, c, x, y, r, jaw, lw);
        // Bart: dunkler Schatten im Kieferbereich, Mund und Wangen frei
        ctx.save(); ctx.beginPath(); jaw(); ctx.closePath(); ctx.clip();
        ctx.beginPath(); ctx.moveTo(x - r * 1.1, y + r * 0.18);
        ctx.quadraticCurveTo(x - r * 0.62, y + r * 0.62, P.fx - r * 0.3, y + r * 0.46);
        ctx.quadraticCurveTo(P.fx, y + r * 0.38, P.fx + r * 0.3, y + r * 0.46);
        ctx.quadraticCurveTo(x + r * 0.62, y + r * 0.62, x + r * 1.1, y + r * 0.18);
        ctx.lineTo(x + r * 1.1, y + r * 1.3); ctx.lineTo(x - r * 1.1, y + r * 1.3); ctx.closePath();
        ctx.fillStyle = shade(c.hair, 0.08); ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
        ctx.restore();
        ctx.beginPath(); jaw(); stroke(ctx, lw);
        // Wangenknochen + Nasenrücken
        ctx.strokeStyle = shade(c.skin, -0.25); ctx.lineWidth = lw * 0.65;
        [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(P.fx + s * r * 0.66, y + r * 0.12); ctx.quadraticCurveTo(P.fx + s * r * 0.58, y + r * 0.28, P.fx + s * r * 0.46, y + r * 0.32); ctx.stroke(); });
        ctx.beginPath(); ctx.moveTo(P.fx + dir * r * 0.04, P.ey + r * 0.04); ctx.lineTo(P.fx + dir * r * 0.1, y + r * 0.26); ctx.lineTo(P.fx - dir * r * 0.02, y + r * 0.28); ctx.stroke();
      },
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        // Schnurrbart
        ctx.beginPath(); ctx.moveTo(P.fx - r * 0.3, y + r * 0.5); ctx.quadraticCurveTo(P.fx, y + r * 0.34, P.fx + r * 0.3, y + r * 0.47);
        ctx.quadraticCurveTo(P.fx, y + r * 0.44, P.fx - r * 0.3, y + r * 0.5); ctx.fillStyle = shade(c.hair, 0.08); ctx.fill();
        smirk(ctx, P.fx, y + r * 0.56, r, dir, lw, P.mood === "" ? "happy" : P.mood, true);
        ctx.beginPath(); ctx.moveTo(x + dir * r * 0.08, y + r * 1.02); ctx.lineTo(x + dir * r * 0.08, y + r * 0.91); stroke(ctx, lw * 0.6);
      },
    },
    front(ctx, c, x, y, r, dir, lw) {
      // hoch gegelt, Haaransatz mit Geheimratsecke, kurze Seiten
      blobOut(ctx, x, y, r, () => {
        ctx.beginPath(); ctx.moveTo(x - dir * r * 0.96, y - r * 0.12);
        ctx.quadraticCurveTo(x - dir * r * 1.1, y - r * 1.25, x + dir * r * 0.2, y - r * 1.32);
        ctx.quadraticCurveTo(x + dir * r * 1.0, y - r * 1.3, x + dir * r * 0.82, y - r * 0.68);
        ctx.quadraticCurveTo(x + dir * r * 0.62, y - r * 0.78, x + dir * r * 0.4, y - r * 0.68);
        ctx.quadraticCurveTo(x + dir * r * 0.1, y - r * 0.8, x - dir * r * 0.3, y - r * 0.64);
        ctx.quadraticCurveTo(x - dir * r * 0.62, y - r * 0.5, x - dir * r * 0.96, y - r * 0.12);
      }, c.hair, lw);
      ctx.strokeStyle = shade(c.hair, 0.4); ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(x + dir * r * 0.62, y - r * 0.82); ctx.quadraticCurveTo(x + dir * r * 0.1, y - r * 1.3, x - dir * r * 0.75, y - r * 0.7); ctx.stroke();
      ctx.lineWidth = lw * 0.5; ctx.strokeStyle = shade(c.hair, 0.25);
      ctx.beginPath(); ctx.moveTo(x + dir * r * 0.3, y - r * 0.76); ctx.quadraticCurveTo(x - dir * r * 0.2, y - r * 1.1, x - dir * r * 0.82, y - r * 0.42); ctx.stroke();
    },
  },

  // Brezelini Kickerini: Brezel-Krone, Salzkörner, Schnurrbart
  brezel: {
    back(ctx, c, x, y, r, dir, lw) {
      const k = 0.66, X = dx => x + dx * r * k, Y = dy => y - r * 1.16 + (dy + 0.78) * r * k;
      const path = () => {
        ctx.beginPath(); ctx.moveTo(X(-0.35), Y(-0.78));
        ctx.bezierCurveTo(X(0.2), Y(-1.05), X(0.95), Y(-1.0), X(0.7), Y(-1.45));
        ctx.bezierCurveTo(X(0.5), Y(-1.75), X(0.05), Y(-1.62), X(0), Y(-1.35));
        ctx.bezierCurveTo(X(-0.05), Y(-1.62), X(-0.5), Y(-1.75), X(-0.7), Y(-1.45));
        ctx.bezierCurveTo(X(-0.95), Y(-1.0), X(-0.2), Y(-1.05), X(0.35), Y(-0.78));
      };
      const w = r * 0.22;
      path(); ctx.lineWidth = w + lw * 4.2; ctx.strokeStyle = "#fff"; ctx.stroke();
      path(); ctx.lineWidth = w + lw * 2; ctx.strokeStyle = INK; ctx.stroke();
      path(); ctx.lineWidth = w; ctx.strokeStyle = c.hair; ctx.stroke();
      path(); ctx.lineWidth = w * 0.28; ctx.strokeStyle = shade(c.hair, 0.3); ctx.stroke();
      salt(ctx, r, [[X(0.55), Y(-1.58)], [X(0.82), Y(-1.2)], [X(-0.55), Y(-1.58)], [X(-0.82), Y(-1.2)], [X(0.28), Y(-1.0)], [X(-0.28), Y(-1.0)]]);
    },
    face: {
      eye: "std", eyeY: -0.08, brow: "heavy", browCol: () => "#3b1f0e",
      mouth(ctx, c, x, y, r, dir, lw, o, P) {
        const mx = P.fx + dir * r * 0.04;
        mouthStd(ctx, mx, y + r * 0.56, r, dir, lw, P.mood, 0.8);
        const my = y + r * 0.36;
        [-1, 1].forEach(s => blob(ctx, () => {
          ctx.beginPath(); ctx.moveTo(mx, my - r * 0.04);
          ctx.quadraticCurveTo(mx + s * r * 0.3, my - r * 0.12, mx + s * r * 0.48, my + r * 0.04);
          ctx.quadraticCurveTo(mx + s * r * 0.56, my - r * 0.14, mx + s * r * 0.44, my - r * 0.2);
          ctx.quadraticCurveTo(mx + s * r * 0.62, my - r * 0.16, mx + s * r * 0.56, my + r * 0.06);
          ctx.quadraticCurveTo(mx + s * r * 0.45, my + r * 0.18, mx + s * r * 0.2, my + r * 0.1);
          ctx.quadraticCurveTo(mx + s * r * 0.08, my + r * 0.08, mx, my + r * 0.06); ctx.closePath();
        }, "#3b1f0e", lw * 0.7, false));
        blob(ctx, () => circ(ctx, mx + dir * r * 0.04, my - r * 0.12, r * 0.13), shade(c.skin, 0.12), lw * 0.7, false);
      },
    },
    front(ctx, c, x, y, r) {
      salt(ctx, r, [[x - r * 0.58, y - r * 0.52], [x + r * 0.55, y - r * 0.6], [x - r * 0.25, y - r * 0.8], [x + r * 0.74, y - r * 0.22]]);
    },
  },
};

// Kette liegt auf dem weißen Sticker-Rand unten am Kopf (Vorderteil, über der Outline)
function chain(ctx, x, y, r, dir, lw, w, col, links) {
  const cy = y + r * 0.06, cr = r * 1.04;
  ctx.beginPath(); ctx.arc(x, cy, cr, Math.PI * 0.25, Math.PI * 0.75);
  ctx.lineWidth = w + lw * 1.4; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = w; ctx.strokeStyle = col; ctx.stroke();
  if (links) for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (0.27 + 0.46 * k / 10), px = x + Math.cos(a) * cr, py = cy + Math.sin(a) * cr;
    ctx.beginPath(); ctx.ellipse(px, py, w * 0.42, w * 0.21, a + Math.PI / 2 + (k % 2 ? 0.5 : -0.5), 0, TAU); ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = lw * 0.45; ctx.stroke();
  }
  return { px: x - dir * r * 0.1, py: cy + cr + w * 0.5 };
}
function moaiJaw(ctx, x, y, r) {
  return () => { ctx.moveTo(x - r * 0.88, y + r * 0.34); ctx.lineTo(x - r * 0.74, y + r * 0.98); ctx.quadraticCurveTo(x, y + r * 1.08, x + r * 0.74, y + r * 0.98); ctx.lineTo(x + r * 0.88, y + r * 0.34); };
}
function chadJaw(ctx, x, y, r, dir) {
  const o = dir * r * 0.08;
  return () => { ctx.moveTo(x - r * 0.95, y + r * 0.22); ctx.lineTo(x - r * 0.86 + o, y + r * 0.66); ctx.lineTo(x - r * 0.34 + o, y + r * 1.03); ctx.lineTo(x + r * 0.34 + o, y + r * 1.03); ctx.lineTo(x + r * 0.86 + o, y + r * 0.66); ctx.lineTo(x + r * 0.95, y + r * 0.22); };
}
function salt(ctx, r, pts) {
  pts.forEach(([px, py], k) => {
    ctx.save(); ctx.translate(px, py); ctx.rotate(k * 0.9);
    ctx.fillStyle = "rgba(10,18,48,.25)"; ctx.fillRect(-r * 0.035, -r * 0.015, r * 0.08, r * 0.055);
    ctx.fillStyle = "#fff"; ctx.fillRect(-r * 0.045, -r * 0.03, r * 0.08, r * 0.055);
    ctx.restore();
  });
}
