// Ein Takt des Spiels für den Rollback-Netcode: Eingaben (Bits oder { b, e } mit Emote) anwenden, Physik einen Takt
// weiter, Ereignisse zurückgeben. Emotes und „Jubel überspringen“ (nur Host, Bit x) sind Teil der Eingaben, damit beide
// Seiten sie im selben Takt sehen.
import { emote, skipCelebration, tick } from "./physics.js";
import { BITS, unpackInput } from "./rollback.js";

/**
 * Eingabe säubern (auf beiden Seiten gleich, sonst rechnen sie verschieden): nur 7 Bits, Emote nur, wenn okEmote es
 * kennt. Alles andere (fremde Felder, Zahlen außerhalb, kaputte Typen) wird zu einer gültigen Eingabe.
 */
export function cleanInput(v, okEmote) {
  if (v !== null && typeof v === "object") { const b = (v.b | 0) & 127; return typeof v.e === "string" && okEmote(v.e) ? { b, e: v.e } : b; }
  return (v | 0) & 127;
}
const bitsOf = v => (v !== null && typeof v === "object" ? v.b | 0 : v | 0);
export function gameTick(st, inputs) {
  for (let i = 0; i < 2; i++) { const v = inputs[i]; if (v !== null && typeof v === "object" && typeof v.e === "string" && v.e) emote(st, i, v.e); }
  if (bitsOf(inputs[0]) & BITS.x) skipCelebration(st);
  tick(st, [unpackInput(bitsOf(inputs[0])), unpackInput(bitsOf(inputs[1]))]);
  return st.ev.splice(0);
}
