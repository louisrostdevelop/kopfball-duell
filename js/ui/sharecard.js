// Ergebnis-Bild zum Teilen (1080×1350, Hochformat für Messenger und Stories): Schriftzug, beide Köpfe mit Rahmen,
// Namen, großes Ergebnis, Ausgang aus Sicht des Teilenden und die Adresse. Stil wie Startseite und Ladebildschirm.
import { avatarCanvas } from "./render/art.js";
import { BRAND } from "./brand.js";
import { t } from "../content/i18n.js";

const W = 1080, H = 1350, B = BRAND;
const FONT = "'Lilita One', 'Arial Black', Impact, sans-serif";

const loadImg = src => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });

/** Text mit dunkler Kontur und Kante nach unten (wie die Knöpfe im Spiel) */
function bold(x, s, cx, cy, size, fill, { align = "center", edge = 0.07 } = {}) {
  x.font = `${size}px ${FONT}`; x.textAlign = align; x.textBaseline = "alphabetic"; x.lineJoin = "round";
  x.lineWidth = size * 0.17; x.strokeStyle = B.ink; x.fillStyle = B.ink;
  x.strokeText(s, cx, cy + size * edge); x.fillText(s, cx, cy + size * edge);
  x.strokeText(s, cx, cy);
  x.fillStyle = fill; x.fillText(s, cx, cy);
}

/** Name passend kürzen */
function fit(x, s, size, max) {
  x.font = `${size}px ${FONT}`;
  while (s.length > 3 && x.measureText(s).width > max) s = s.slice(0, -2) + "…";
  return s;
}

/**
 * @param {{ chars: string[], names: string[], score: number[], me: number, frames?: (string|undefined)[], url: string }} o
 *   me: Index des Teilenden (-1 = zu zweit an einem Gerät)
 * @returns {Promise<Blob>}
 */
export async function shareCard(o) {
  if (document.fonts) await Promise.all([document.fonts.load(`80px ${FONT}`), document.fonts.load("900 40px Nunito")]).catch(() => {});
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  // Hintergrund: Lichtkegel und unscharfe Stadionlichter
  let g = x.createRadialGradient(W / 2, 560, 20, W / 2, 600, 900);
  g.addColorStop(0, "#4f7ee8"); g.addColorStop(.32, "#2c4fb0"); g.addColorStop(.68, B.night); g.addColorStop(1, "#100c33");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.save(); x.filter = "blur(14px)";
  for (const [lx, ly, r, a] of [[110, 180, 60, .22], [960, 140, 80, .2], [880, 470, 34, .28], [160, 560, 30, .22], [1010, 820, 50, .14], [70, 900, 56, .12], [560, 90, 40, .12]]) {
    x.globalAlpha = a; x.fillStyle = "#cfe0ff"; x.beginPath(); x.arc(lx, ly, r, 0, 7); x.fill();
  }
  x.restore();
  x.save(); g = x.createLinearGradient(0, 0, 0, 1000); g.addColorStop(0, "rgba(160,200,255,.3)"); g.addColorStop(1, "rgba(160,200,255,0)");
  x.fillStyle = g; x.beginPath(); x.moveTo(400, 0); x.lineTo(680, 0); x.lineTo(900, 1000); x.lineTo(180, 1000); x.closePath(); x.fill(); x.restore();

  // Schriftzug
  try { const wm = await loadImg("icons/wordmark.webp"); x.drawImage(wm, (W - 840) / 2, 34, 840, 280); }   // i18n-ok: Datei
  catch (_) { bold(x, "HEADSTARS", W / 2, 220, 120, B.gold); }   // i18n-ok: Marke

  // Ausgang aus Sicht des Teilenden
  const [a, b] = o.score, mine = o.me >= 0 ? o.score[o.me] : 0, theirs = o.me >= 0 ? o.score[1 - o.me] : 0;
  const head = o.me < 0 ? (a === b ? t("share.card.draw") : t("share.card.winner", { name: o.names[a > b ? 0 : 1] }))
    : mine > theirs ? t("share.card.win") : mine < theirs ? t("share.card.loss") : t("share.card.draw");
  const good = o.me < 0 || mine >= theirs;
  bold(x, fit(x, head, 84, 960), W / 2, 380, 84, good ? B.gold : "#ffd6e8");

  // Köpfe auf Podesten
  const winner = a === b ? -1 : a > b ? 0 : 1;
  for (const i of [0, 1]) {
    const cx = i ? 800 : 280, cy = 830;
    x.save();
    x.strokeStyle = `rgba(110,200,255,${winner === i ? .7 : .35})`; x.lineWidth = 7;
    x.beginPath(); x.ellipse(cx, cy + 172, 180, 38, 0, 0, 7); x.stroke();
    x.fillStyle = "rgba(10,8,32,.5)"; x.beginPath(); x.ellipse(cx, cy + 172, 140, 26, 0, 0, 7); x.fill();
    x.restore();
    const av = avatarCanvas(o.chars[i], 400, { dir: i ? -1 : 1, mood: winner === i ? "happy" : "", frame: o.frames && o.frames[i] });
    x.save(); if (winner === i) { x.shadowColor = "rgba(255,194,31,.75)"; x.shadowBlur = 60; } else { x.shadowColor = "rgba(120,180,255,.45)"; x.shadowBlur = 40; }
    x.drawImage(av, cx - 200, cy - 224, 400, 400); x.restore();
    const nm = fit(x, o.names[i] || "", 50, 440);
    bold(x, nm, cx, cy + 262, 50, i === o.me ? B.gold : B.cream);
  }

  // Ergebnis in der Mitte
  bold(x, `${a}`, 470, 600, 200, winner === 0 ? B.gold : B.cream, { align: "right" });
  bold(x, ":", W / 2, 584, 160, B.cream);
  bold(x, `${b}`, 610, 600, 200, winner === 1 ? B.gold : B.cream, { align: "left" });

  // Aufforderung und Adresse wie der Spielen-Knopf
  const bw = 820, bh = 128, bx = (W - bw) / 2, by = 1170;
  const pill = (yy, r) => { x.beginPath(); x.roundRect(bx, yy, bw, bh, r); };
  x.fillStyle = B.ink; pill(by + 12, 40); x.fill();
  g = x.createLinearGradient(0, by, 0, by + bh); g.addColorStop(0, "#ffe36a"); g.addColorStop(.55, "#ffc21f"); g.addColorStop(1, "#ff9a00");
  x.fillStyle = g; pill(by, 40); x.fill(); x.lineWidth = 9; x.strokeStyle = B.ink; x.stroke();
  x.fillStyle = "rgba(255,255,255,.45)"; x.beginPath(); x.roundRect(bx + 26, by + 12, bw - 52, 18, 9); x.fill();
  const cta = t("share.card.cta");
  x.textAlign = "center"; x.textBaseline = "middle"; x.fillStyle = B.ink;
  x.font = `900 40px Nunito, sans-serif`; x.fillText(cta, W / 2, by + 44, bw - 80);
  x.font = `62px ${FONT}`; x.fillText(o.url, W / 2, by + 92);

  return await new Promise(ok => { c.toBlob(ok, "image/png"); });
}
