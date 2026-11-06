// Kompakte Zustände für Online-Spiele (Schlüssel t, mid sind für die Nachricht reserviert): der Host schickt 30-mal pro Sekunde den Spielstand.
// Statt des vollen Objekts (~1,3 KB, mehr als ein Netzpaket) nur Felder, die vom Standardwert abweichen,
// als ganze Zahlen mit kurzen Schlüsseln (meist 150-250 Bytes). decodeState() baut daraus wieder den
// vollständigen Zustand (gleiche Form wie packState in online.js), fehlende Felder = Standardwert.
// Statistik und Ereignisse gehen getrennt über den zuverlässigen Kanal (sie dürfen nicht verloren gehen).

// [Name, Standardwert, Faktor] — Zahlen werden mit Faktor multipliziert und gerundet; ohne Faktor unverändert
const PF = [["x", 0, 10], ["y", 0, 10], ["vx", 0, 10], ["vy", 0, 10], ["kick", 0, 100], ["kHeld", false], ["charge", 0, 10], ["sc", 1, 100],
  ["frz", 0, 10], ["stun", 0, 10], ["meter", 0, 1], ["full", false], ["armed", 0, 10], ["fireNext", false], ["bigT", 0, 10], ["miniT", 0, 10],
  ["spdT", 0, 10], ["jmpT", 0, 10], ["mood", ""], ["emo", ""], ["emoT", 0, 10], ["land", 0, 10], ["onG", true], ["confT", 0, 10], ["djT", 0, 10],
  ["slide", 0, 100], ["slideDir", 1], ["bomb", 0], ["tripCD", 0, 10], ["sadT", 0, 10], ["charmT", 0, 10]];
const BF = [["x", 0, 10], ["y", 0, 10], ["vx", 0, 10], ["vy", 0, 10], ["r", 0, 10], ["a", 0, 10], ["pw", 0, 10], ["fx", ""], ["fxT", 0, 10], ["fxK", 0],
  ["fxBX", 0, 10], ["fxBY", 0, 10], ["fxDX", 0, 10], ["fxDY", 0, 10], ["fxTX", 0, 10], ["fxTY", 0, 10], ["alpha", 1, 10], ["fxP", 0]];
const KEYS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

const q = (v, f) => (f ? Math.round((v || 0) * f) : v);
function enc(o, schema) {
  const out = {};
  schema.forEach(([k, d, f], i) => { const v = q(o[k] ?? d, f); if (v !== q(d, f)) out[KEYS[i]] = v; });
  return out;
}
function dec(c, schema) {
  const out = {};
  schema.forEach(([k, d, f], i) => { const v = c[KEYS[i]]; out[k] = v === undefined ? d : f ? v / f : v; });
  return out;
}

/** Zustand für den schnellen Kanal. seq: laufende Nummer (ältere verwirft der Gast), ht: Sendezeit des Hosts (ms) */
export function encodeState(st, seq, ht) {
  const o = { q: seq, h: Math.round(ht), s: st.s, tm: q(st.t, 10), e: q(st.el, 1000), ph: st.ph, b: enc(st.b, BF), p: st.p.map(p => enc(p, PF)) };
  if (st.pt) o.pt = q(st.pt, 10);
  if (st.gold) o.g = 1;
  if (st.wall[0] || st.wall[1]) o.w = st.wall.map(v => q(v, 10));
  if (st.bigGoal[0] || st.bigGoal[1]) o.bg = st.bigGoal.map(v => q(v, 10));
  if (st.wind.t) o.wd = [q(st.wind.t, 10), st.wind.dir];
  if (st.pu.length) o.pu = st.pu.map(u => [u.id, u.k, q(u.x, 10), q(u.y, 10), q(u.t, 10)]);
  return o;
}

/** Zurück in die volle Form (wie packState), ohne Statistik */
export function decodeState(o) {
  return {
    seq: o.q, ht: o.h, s: o.s, t: o.tm / 10, el: o.e / 1000, ph: o.ph, pt: (o.pt || 0) / 10, gold: !!o.g,
    wall: o.w ? o.w.map(v => v / 10) : [0, 0], bigGoal: o.bg ? o.bg.map(v => v / 10) : [0, 0],
    wind: o.wd ? { t: o.wd[0] / 10, dir: o.wd[1] } : { t: 0, dir: 1 },
    pu: (o.pu || []).map(([id, k, x, y, t]) => ({ id, k, x: x / 10, y: y / 10, t: t / 10 })),
    b: dec(o.b, BF), p: o.p.map(p => dec(p, PF)),
  };
}

/**
 * Empfangszeitplan beim Gast: schätzt aus den Sendezeiten des Hosts den Uhrversatz (kleinste Laufzeit der letzten
 * Sekunden) und die Schwankung, und daraus, wie weit hinter dem Host gezeichnet wird: so knapp wie möglich,
 * so viel wie nötig, damit fast immer zwei Zustände zum Dazwischenrechnen da sind.
 */
export function makeClock({ sendMs = 1000 / 30, minDelay = 35, maxDelay = 250 } = {}) {
  const lags = []; let offset = null, jit = 8, margin = 0;
  return {
    /** Paket mit Host-Zeit ht kam zur lokalen Zeit now an */
    arrive(ht, now) {
      const lag = now - ht; lags.push([now, lag]);
      while (lags.length && lags[0][0] < now - 3000) lags.shift();
      offset = Math.min(...lags.map(x => x[1]));
      jit += (Math.max(0, lag - offset) - jit) * 0.08;   // gleitender Mittelwert der Verspätung über dem besten Fall
      margin = Math.max(0, margin - 0.4);
    },
    /** Host-Zeit, die jetzt gezeichnet wird */
    renderTime(now) { return offset === null ? null : now - offset - this.delay(); },
    delay() { return Math.max(minDelay, Math.min(maxDelay, sendMs + 2.2 * jit + 6 + margin)); },
    /** Zeichnen lief über den neuesten Zustand hinaus (Paket fehlt): Puffer etwas größer */
    starved() { margin = Math.min(90, margin + 4); },
    get jitter() { return jit; },
  };
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
 * die erste schlecht war, und die Grenze großzügig (die Vorhersage des Gasts trägt bis etwa 250 ms). */
export const NET_CHECK = { samples: 6, gapMs: 200, waitMs: 400, badMs: 250, rounds: 2 };
export const netTooBad = st => !st || st.ms + st.jitter > NET_CHECK.badMs;
