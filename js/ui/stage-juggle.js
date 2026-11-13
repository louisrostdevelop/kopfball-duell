// Jonglier-Bühne für eine Zeichenfläche: Antippen, Ton und Vibration, Zeitschritt und Zeichnen
import { audio as A, input as I } from "../app/services.js";
import { BALL_R, createJuggle, juggleStep, juggleTap } from "./juggle.js";
import { drawJuggle } from "./render/juggle-art.js";

const SUB = 1 / 120;

export function juggleStage() {
  const j = createJuggle(), taps = [];
  return {
    j,
    /** pointerdown-Handler */
    tap: e => { taps.push(e && e.timeStamp ? e.timeStamp : performance.now()); },
    /** @param {{ cx: number, headY: number, r: number, w: number, wx?: number, char: string, ball: string, t: number, glow?: number[] }} o wx: Bühnenbreite/2 in Kopfradien */
    draw(x, dt, o) {
      // Eingaben erst hier auswerten: der Zustand ist der vom letzten Bild, der Abstand dazu wird herausgerechnet
      const now = performance.now();
      for (const s of taps.splice(0)) juggleTap(j, Math.min(0.1, Math.max(0, (now - s) / 1000)));
      const room = { lim: (o.headY - 4) / o.r - 1 - 2 * BALL_R, wx: o.wx || o.w / 2 / o.r };
      for (let left = Math.min(0.05, dt); left > 1e-6; left -= SUB) juggleStep(j, Math.min(SUB, left), room);
      for (const e of j.ev.splice(0)) feedback(e);
      drawJuggle(x, j, o);
    },
  };
}

function feedback(e) {
  if (e.k === "hit") { A.sfx("head", e.q === "perfect" ? 1.1 : 0.8); if (e.q === "perfect") I.vibrate(8); }
  else A.sfx("bounce", e.k === "miss" ? 0.6 : 0.35);
}
