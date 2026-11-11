// Netz-Hilfen für Online-Spiele: Statistik säubern, Ping auswerten, Verbindungs-Check nach dem Paaren.
// (Gerechnet wird mit Rollback: core/rollback.js, core/rbpeer.js, app/rbnet.js)

import { mkStats } from "../core/physics.js";
import { statNum } from "../core/economy.js";

/** Statistik aus einem fremden Zustand (Rollback-Start vom Gegner) säubern: zwei Einträge, jedes Feld eine ganze Zahl ≥ 0 */
export function cleanStats(v) {
  return [0, 1].map(i => { const s = mkStats(), o = Array.isArray(v) && v[i] && typeof v[i] === "object" ? v[i] : {}; for (const k of Object.keys(s)) s[k] = statNum(o[k]); return s; });
}

/** Ping aus den letzten Proben (Hin und zurück, ms): Median und mittlere Abweichung davon (Schwankung) */
export function pingStats(samples) {
  if (!samples || !samples.length) return null;
  const s = [...samples].sort((a, b) => a - b), ms = s[Math.floor(s.length / 2)];
  return { ms: Math.round(ms), jitter: Math.round(s.reduce((a, v) => a + Math.abs(v - ms), 0) / s.length) };
}
/** Balken 1–4 für die Anzeige. Schwankung zählt doppelt: sie macht die Ruckler, nicht der Ping allein. */
export const pingBars = st => { if (!st) return 0; const e = st.ms + 2 * st.jitter; return e < 70 ? 4 : e < 120 ? 3 : e < 190 ? 2 : 1; };
/** Verbindungs-Check nach dem Paaren: Proben, Abstand, ab wann es zu schlecht ist (Ranked: neu suchen, Casual: Hinweis).
 * Die Messung enthält auch die Last der Geräte (gerade geladen, Demo-Spiel im Hintergrund): eine zweite Runde nur, wenn
 * die erste schlecht war, und die Grenze großzügig. */
export const NET_CHECK = { samples: 6, gapMs: 200, waitMs: 400, badMs: 250, rounds: 2 };
export const netTooBad = st => !st || st.ms + st.jitter > NET_CHECK.badMs;
