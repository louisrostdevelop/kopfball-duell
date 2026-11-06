// Gemeinsame Zeichen-Grundlagen für art.js, meme-heads.js und shoes.js
import { COL } from "../../content/config.js";

export const INK = COL.ink;
export const TAU = Math.PI * 2;

/** Farbe aufhellen (f > 0) oder abdunkeln (f < 0) */
export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
export function stroke(ctx, lw) { ctx.lineWidth = lw; ctx.strokeStyle = INK; ctx.stroke(); }
