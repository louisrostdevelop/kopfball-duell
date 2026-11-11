// Ein Takt des Spiels für den Rollback-Netcode: Eingaben (Bits oder { b, e } mit Emote) anwenden, Physik einen Takt
// weiter, Ereignisse zurückgeben. Emotes und „Jubel überspringen“ (nur Host, Bit x) sind Teil der Eingaben, damit beide
// Seiten sie im selben Takt sehen. (Prüfung einer Korrektur vom Host: rbfix.js)
import { emote, skipCelebration, tick } from "./physics.js";
import { BITS, unpackInput } from "./rollback.js";

/**
 * Emotes je Spieler höchstens eins alle EMOTE_TICKS Takte (knapp 3 s, wie die Sperre beim Absender). Ausnahme: der
 * Torjubel (celeb(e)), einmal je Tor während des Jubels; er setzt die Sperre nicht.
 */
export const EMOTE_TICKS = 168;

/**
 * Eingabe säubern (auf beiden Seiten gleich, sonst rechnen sie verschieden): nur 7 Bits, Emote nur, wenn okEmote es
 * kennt. Alles andere (fremde Felder, Zahlen außerhalb, kaputte Typen) wird zu einer gültigen Eingabe.
 */
export function cleanInput(v, okEmote) {
  if (v !== null && typeof v === "object") { const b = (v.b | 0) & 127; return typeof v.e === "string" && okEmote(v.e) ? { b, e: v.e } : b; }
  return (v | 0) & 127;
}
const bitsOf = v => (v !== null && typeof v === "object" ? v.b | 0 : v | 0);
export function gameTick(st, inputs, celeb = null) {
  const cd = st.emoCD || (st.emoCD = [0, 0]);   // Sperre in Takten, im Zustand (auf beiden Seiten gleich)
  const goals = st.s[0] + st.s[1];
  for (let i = 0; i < 2; i++) {
    if (cd[i] > 0) cd[i]--;
    const v = inputs[i];
    if (v === null || typeof v !== "object" || typeof v.e !== "string" || !v.e) continue;
    const cg = st.celebG || (st.celebG = [-1, -1]);   // Tor, zu dem der Spieler schon gejubelt hat
    if (celeb && celeb(v.e) && st.ph === "goal" && cg[i] !== goals) { cg[i] = goals; emote(st, i, v.e); }
    else if (cd[i] === 0) { emote(st, i, v.e); cd[i] = EMOTE_TICKS; }
  }
  if (bitsOf(inputs[0]) & BITS.x) skipCelebration(st);
  tick(st, [unpackInput(bitsOf(inputs[0])), unpackInput(bitsOf(inputs[1]))]);
  return st.ev.splice(0);
}
