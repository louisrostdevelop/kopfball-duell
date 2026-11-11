/* global document */
// App-Icon „Kopf + Ball“ wie auf der Startseite: Kalle schaut hoch zum Spielball, dahinter Lichtkegel, Lichter und Podest-Ringe.
// Zeichnet mit den echten Spielgrafiken (avatarCanvas-Kopf, drawBall). Randlos quadratisch; runden tun Systeme bzw. CSS.
import { drawHead, drawBall } from "../../js/ui/render/art.js";

/** @param {number} px Kantenlänge @param {{ safe?: number }} [o] safe: Inhalt kleiner (maskable Icons, Sicherheitszone) */
export function iconCanvas(px, { safe = 1 } = {}) {
  const c = document.createElement("canvas"); c.width = c.height = px;
  const x = c.getContext("2d"), s = px / 512;
  x.scale(s, s);
  // Hintergrund: tiefes Blau mit Lichtkegel hinter dem Kopf
  let g = x.createRadialGradient(256, 250, 10, 256, 260, 360);
  g.addColorStop(0, "#4f7ee8"); g.addColorStop(.35, "#2c4fb0"); g.addColorStop(.75, "#1b2b6b"); g.addColorStop(1, "#100c33");
  x.fillStyle = g; x.fillRect(0, 0, 512, 512);
  // unscharfe Stadionlichter
  x.save(); x.filter = "blur(6px)";
  for (const [lx, ly, lr, a] of [[78, 120, 26, .22], [440, 96, 34, .2], [400, 200, 16, .25], [120, 230, 14, .2], [470, 300, 20, .14], [40, 330, 22, .12]]) {
    x.globalAlpha = a; x.fillStyle = "#cfe0ff"; x.beginPath(); x.arc(lx, ly, lr, 0, 7); x.fill();
  }
  x.restore();
  // Lichtstrahl von oben
  x.save(); x.globalCompositeOperation = "lighter";
  g = x.createLinearGradient(256, 0, 256, 420); g.addColorStop(0, "rgba(160,200,255,.35)"); g.addColorStop(1, "rgba(160,200,255,0)");
  x.fillStyle = g; x.beginPath(); x.moveTo(196, 0); x.lineTo(316, 0); x.lineTo(420, 430); x.lineTo(92, 430); x.closePath(); x.fill();
  x.restore();
  x.translate(256, 256); x.scale(safe, safe); x.translate(-256, -256);
  // Podest-Ringe
  x.save(); x.lineWidth = 6;
  for (const [ry, a] of [[30, .55], [46, .3]]) { x.strokeStyle = `rgba(110,200,255,${a})`; x.beginPath(); x.ellipse(256, 452, ry * 4.6, ry, 0, 0, 7); x.stroke(); }
  x.fillStyle = "rgba(10,8,32,.45)"; x.beginPath(); x.ellipse(256, 452, 118, 22, 0, 0, 7); x.fill();
  x.restore();
  // Kopf (wie auf der Startseite: Blick nach oben zum Ball)
  // erst einzeln zeichnen, dann einmal mit Leuchten einsetzen (sonst legt sich das Leuchten jeder Teilform über die anderen)
  const hc = document.createElement("canvas"); hc.width = hc.height = 1024;
  const hx = hc.getContext("2d"); hx.scale(2, 2);
  drawHead(hx, "kalle", 256, 322, 142, { dir: 1, look: -Math.PI / 2 - 0.15, mood: "", t: 1 });
  x.save(); x.shadowColor = "rgba(120,180,255,.6)"; x.shadowBlur = 44;
  x.drawImage(hc, 0, 0, 512, 512);
  x.restore();
  // Ball über dem Kopf mit Aufprall-Strichen
  x.save(); x.shadowColor = "rgba(0,0,0,.45)"; x.shadowOffsetY = 8; x.shadowBlur = 10;
  drawBall(x, "klassik", 284, 88, 64, 0.5, 1, null, { t: 1 });
  x.restore();
  x.strokeStyle = "#fff8e8"; x.lineWidth = 12; x.lineCap = "round";
  for (const [a, b, cc, d] of [[204, 104, 174, 86], [200, 144, 164, 144], [364, 104, 394, 86], [368, 144, 404, 144]]) { x.beginPath(); x.moveTo(a, b); x.lineTo(cc, d); x.stroke(); }
  return c;
}
