// Zeichnet das Kopfball-Jonglieren (Logik: ../juggle.js) auf eine Bühne
import { BALL_R, FLOOR, nodOffset } from "../juggle.js";
import { drawBall, drawHead } from "./art.js";

/**
 * @param {CanvasRenderingContext2D} x
 * @param {ReturnType<import("../juggle.js").createJuggle>} j
 * @param {{ cx: number, headY: number, r: number, char: string, ball: string, t: number, glow?: number[] }} o glow: Lichtkante [r, g, b]
 */
export function drawJuggle(x, j, o) {
  const { cx, headY, r, t } = o, br = r * BALL_R, floor = headY + r * FLOOR;
  const bx = cx + j.x * r, by = headY + j.y * r, hy = headY - nodOffset(j) * r;
  // unter der Bühnenkante blendet der Ball aus (fällt in die Tiefe); Schatten nur, solange Boden unter ihm ist
  const up = Math.max(0, (floor - by) / (r * 4)), below = j.y - (FLOOR - BALL_R);
  const alpha = below > 0 ? Math.max(0, 1 - below / 1.5) : 1;
  if (below <= 0.05 && Math.abs(j.x) < Math.max(j.edge, 1)) {
    x.fillStyle = `rgba(0,0,0,${0.2 * (1 - Math.min(0.7, up))})`; x.beginPath(); x.ellipse(bx, floor, br * (1.1 - Math.min(0.5, up)), br * 0.22, 0, 0, Math.PI * 2); x.fill();
  }
  // Kopf, beim Treffer kurz gestaucht
  const sq = Math.sin(Math.min(1, j.sq) * Math.PI) * 0.08;
  x.save(); x.translate(cx, floor); x.scale(1 + sq, 1 - sq); x.translate(-cx, -floor);
  if (o.glow) {
    const [gr, gg, gb] = o.glow, gl = x.createRadialGradient(cx, hy, r * 0.85, cx, hy, r * 1.32);
    gl.addColorStop(0, `rgba(${gr},${gg},${gb},.5)`); gl.addColorStop(1, `rgba(${gr},${gg},${gb},0)`);
    x.fillStyle = gl; x.beginPath(); x.arc(cx, hy, r * 1.32, 0, Math.PI * 2); x.fill();
  }
  drawHead(x, o.char, cx, hy, r, { dir: 1, look: Math.atan2(by - hy, bx - cx), mood: j.moodT > 0 ? j.mood : "", blink: Math.sin(t * 1.7) > 0.97, t });
  x.restore();
  // perfekter Treffer: ein zarter Ring
  if (j.ring < 0.35) {
    const p = j.ring / 0.35;
    x.strokeStyle = `rgba(255,255,255,${0.35 * (1 - p)})`; x.lineWidth = r * 0.04 * (1 - p);
    x.beginPath(); x.arc(bx, by + br, br + r * 0.8 * Math.sqrt(p), 0, Math.PI * 2); x.stroke();
  }
  const stretch = j.sq > 0 ? { ang: Math.PI / 2, k: 1 - 0.3 * Math.sin((j.sq * Math.PI) / 2) } : null;
  if (alpha > 0) drawBall(x, o.ball, bx, by, br, j.a, alpha, stretch, { t, vx: j.vx * r, vy: j.vy * r });
}
