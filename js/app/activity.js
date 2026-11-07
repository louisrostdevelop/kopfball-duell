// Aktivität auf der Plattform: wie viele gerade suchen, spielen und aktiv sind (api.activity). Kurz zwischengespeichert,
// damit Modus-Auswahl und Gegnersuche den Server nicht bei jedem Bild fragen.
import { server } from "./services.js";
import { online as serverOn } from "./account.js";

let last = null, at = 0, pending = null;

/** @returns {Promise<{ active: number, casual: number, ranked: number, playing: number } | null>} */
export function activity(maxAge = 10000) {
  if (!serverOn() || !server || !server.activity) return Promise.resolve(null);
  if (last && Date.now() - at < maxAge) return Promise.resolve(last);
  pending ??= server.activity().then(r => { last = r; at = Date.now(); return r; }).catch(() => null).finally(() => { pending = null; });
  return pending;
}
