// Startzustand der Gegnersuche nachbauen: Der Gast baut ihn aus den geprüften Bedingungen selbst und vergleicht ihn mit
// dem, den der Host im „start“ schickt. So kann ein manipulierter Host keinen Vorteil (Ball, Leiste, Zeit, Power-ups,
// Positionen) in den Start schmuggeln. Der Zufall kommt aus der Spiel-ID: ein frei gewählter Seed bestimmt Anstoß-Drift
// und erstes Power-up (Zeit, Art, Ort), der Host könnte sich vorab einen günstigen aussuchen.
import { newMatch } from "./physics.js";

/** Seed aus der Spiel-ID (FNV-1a, 32 Bit): beide kennen sie, keiner kann ihn sich aussuchen */
export function seedFrom(id) {
  const s = String(id);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Arena der Gegnersuche aus der Spiel-ID (beide Seiten gleich, auch nach einem Neustart) */
export const mmArena = id => (parseInt(String(id).slice(0, 2), 16) % 2 ? "strand" : "stadion");

/** Nur die Bedingungen, die den Startzustand bestimmen (Kosmetik, Namen, Ball-Skin, Beschriftung nicht) */
export const startCfg = (c, seed) => ({ arena: c.arena, levels: c.levels, chars: c.chars, dur: c.dur, rules: c.rules, mod: c.mod, fair: c.fair, golden: c.golden, seed });

/** Startzustand, wie ihn der Host aus diesen Bedingungen baut, so wie er übers Netz geht (JSON) */
export const buildStart = (c, seed) => JSON.parse(JSON.stringify(newMatch(startCfg(c, seed))));

// exakt gleiche Daten (Reihenfolge der Felder egal). a ist der selbst gebaute Stand: die Tiefe ist durch ihn begrenzt.
function same(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if (!Object.prototype.hasOwnProperty.call(b, k) || !same(a[k], b[k])) return false;
  return true;
}

/**
 * Stimmt der gesendete Startzustand st mit dem selbst gebauten überein? Exakter Vergleich statt Prüfsumme (hashState ist
 * kein kryptografischer Hash, eine passend gebaute Kollision wäre denkbar). Liefert den selbst gebauten Stand (damit
 * startet der Gast, nicht mit den fremden Daten) oder null; kaputte Daten: null.
 */
export function sameStart(c, seed, st) {
  try { const own = buildStart(c, seed); return same(own, st) ? own : null; } catch (_) { return null; }
}

/**
 * Wiederaufnahme in der Gegnersuche: Der Host schickt den Stand eines Takts, den der Gast selbst schon endgültig
 * gerechnet (oder vor einem eigenen Neustart gesichert) hat. Beide rechnen bitgleich, also muss der Stand exakt gleich
 * sein (wie sameStart; ohne die Ereignisliste und das Aufleuchten von Hindernissen, die nur die Anzeige betreffen).
 * own: eigener Stand dieses Takts. Kaputte Daten: false.
 */
/**
 * Wiederaufnahme mit Zurückdrehen: zwischen den beiden Ständen derselbe Spielstand, kein Golden Goal und kein Abpfiff
 * dazwischen? Sonst nähme sie ein Tor oder den Abpfiff zurück. Andere Phasenwechsel (Anstoß, Ende des Torjubels,
 * Countdown) zählen nicht: zurück in den Anstoß oder Jubel nimmt nichts zurück, das Tor selbst steckt im Spielstand
 * (so lehnen ehrliche Neustarts kurz nach einem Anstoß nicht ab)
 */
export const sameMoment = (a, b) => !!a && !!b && Array.isArray(a.s) && Array.isArray(b.s) && a.s[0] === b.s[0] && a.s[1] === b.s[1] && (a.ph === "end") === (b.ph === "end") && !!a.gold === !!b.gold;
export function sameState(own, st) {
  try { return !!own && !!st && same(strip(JSON.parse(JSON.stringify(own))), strip(st)); } catch (_) { return false; }
}
// Kopie ohne ev und obs[].hitT (zählen auch für die Prüfsumme nicht, rollback.js hashState)
function strip(st) {
  if (!st || typeof st !== "object") return st;
  const o = { ...st }; delete o.ev;
  if (Array.isArray(o.obs)) o.obs = o.obs.map(x => { if (!x || typeof x !== "object") return x; const y = { ...x }; delete y.hitT; return y; });
  return o;
}
