// Relay-Server (TURN) für Online-Spiele. Zwei Geräte finden sich ohne Relay nur, wenn eine direkte Verbindung möglich
// ist; im Mobilfunk oder hinter Routern, die Geräte im selben WLAN voneinander abschirmen, oft nicht. Die Zugangsdaten
// sind kurzlebig und kommen vom Spielserver (Funktion „turn“). Ohne Server oder bei Fehlern wird nur direkt verbunden.
import { has, net as Net, server } from "./services.js";

// ms: nach einem Fehlschlag (Grenze erreicht, Relay nicht eingerichtet) so lange nicht neu fragen; Suche und Räume
// starten dann sofort ohne Relay, statt bei jedem Versuch auf die Antwort zu warten
const RETRY_MS = 2 * 60 * 1000;
let until = 0, failAt = -Infinity, pending = null;

/** Gültige Zugangsdaten vorhanden (nicht älter als die halbe Laufzeit)? */
export const relayReady = () => Date.now() < until;

/** Zugangsdaten holen, falls nötig. Wartet höchstens maxMs (ms), danach geht es ohne Relay weiter; true = vorhanden. */
export function ensureRelay(maxMs = 3000) {
  if (relayReady()) return Promise.resolve(true);
  if (!has("server") || typeof server.turn !== "function" || typeof Net.setIce !== "function") return Promise.resolve(false);
  if (!pending && Date.now() - failAt < RETRY_MS) return Promise.resolve(false);
  if (!pending) {
    pending = server.turn()
      .then(r => {
        if (!r || !Array.isArray(r.iceServers) || !r.iceServers.length) return false;
        Net.setIce(r.iceServers);
        until = Date.now() + Math.max(60, (r.ttl | 0) || 3600) * 500;   // halbe Laufzeit in ms: rechtzeitig neue holen
        return true;
      })
      .catch(() => false)
      .then(ok => { if (!ok) failAt = Date.now(); return ok; })
      .finally(() => { pending = null; });
  }
  return Promise.race([pending, new Promise(res => { setTimeout(() => res(false), maxMs); })]);
}
