// Rollback-Netcode (Art GGPO), rein und ohne DOM oder Netz: beide Geräte rechnen dasselbe Spiel aus denselben Eingaben.
// Eigene Eingaben gelten mit kleiner Verzögerung (delay Takte), fehlende Eingaben der Gegenseite werden vorhergesagt
// (letzte bekannte wiederholt). Kommt die echte Eingabe an und weicht ab, wird ab dort neu gerechnet („Rollback“).
// Begriffe: Takt f = Eingaben von f anwenden; Zustand S_f = vor Takt f. frame = nächster Takt (angezeigt wird S_frame).
// sync = erster Takt, dessen Zustand endgültig ist (alle Eingaben davor bestätigt); Ereignisse vor sync sind sicher.
// Eingaben sind Zahlen (Bits, siehe packInput) oder Objekte { b, e } mit Emote; eq() vergleicht.

export const BITS = { l: 1, r: 2, j: 4, d: 8, k: 16, s: 32, x: 64 };
/** Eingabe {l,r,j,d,k,s,x} -> Bits */
export function packInput(c) { let n = 0; if (c) for (const k in BITS) if (c[k]) n |= BITS[k]; return n; }
/** Bits -> Eingabe für die Physik */
export function unpackInput(n) { const c = {}; for (const k in BITS) if (n & BITS[k]) c[k] = true; return c; }

/** exakte Kopie von reinen Daten (Objekte, Arrays, Zahlen, Text; behält -0 und undefined) */
export function clone(v) {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) { const a = new Array(v.length); for (let i = 0; i < v.length; i++) a[i] = clone(v[i]); return a; }
  const o = {}; for (const k in v) o[k] = clone(v[k]); return o;
}

/** Prüfsumme über den Zustand, unabhängig von der Reihenfolge der Felder; skip: rein optische Felder */
export function hashState(st, skip = SKIP) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  const add = s => { for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 0x01000193); h2 = Math.imul(h2 ^ c, 0x5bd1e995) ^ (h2 >>> 13); } };
  const walk = v => {
    if (v === undefined) { add("u"); return; }
    if (v === null || typeof v !== "object") { add(typeof v === "number" ? (v === 0 ? "0" : String(v)) : typeof v === "string" ? "'" + v : String(v)); add(","); return; }
    if (Array.isArray(v)) { add("["); v.forEach(walk); add("]"); return; }
    add("{");
    for (const k of Object.keys(v).sort()) { if (v[k] === undefined || skip.has(k)) continue; add(k); add(":"); walk(v[k]); }
    add("}");
  };
  walk(st);
  return ((h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0"));
}
// Ereignisse (st.ev) und Felder, die nur die Anzeige setzt (Aufleuchten von Hindernissen), zählen nicht
const SKIP = new Set(["ev", "hitT"]);

const isObj = v => v !== null && typeof v === "object";
const eqIn = (a, b) => (isObj(a) || isObj(b) ? (a && a.b) === (b && b.b) && (a && a.e) === (b && b.e) : a === b);
// Vorhersage: letzte bekannte Eingabe halten, einmalige Dinge (Emote) nie vorhersagen
const predictIn = last => (isObj(last) ? (last.b || 0) : (last || 0));

/**
 * Sitzung anlegen.
 * o.me: eigener Spieler (0/1), o.state: Startzustand S_frame0, o.frame0: erster Takt (Standard 0),
 * o.tick(st, inputs[2], f): Takt ausführen (verändert st, liefert die Ereignisse des Takts als Array),
 * o.delay: Eingabeverzögerung in Takten, o.maxPred: so weit darf vorhergesagt werden, o.ring: Zustände im Speicher.
 */
export function createSession(o) {
  const me = o.me, op = 1 - me, D = Math.max(0, o.delay | 0), maxPred = o.maxPred ?? 8, RING = o.ring ?? 256;
  const tickFn = o.tick;
  const S = new Map();            // f -> Zustand S_f (Kopie)
  const IN = [new Map(), new Map()];   // Spieler -> (f -> Eingabe), bestätigt bzw. eigene
  const used = new Map();         // f -> Eingabe der Gegenseite, mit der Takt f zuletzt gerechnet wurde
  const evs = new Map();          // f -> Ereignisse aus der letzten Rechnung von Takt f
  let frame = o.frame0 | 0, sync = frame, remoteTop = frame - 1, localTop = frame - 1, dirty = Infinity;
  let cur = clone(o.state);
  S.set(frame, clone(cur));
  // die ersten D Takte haben keine eigenen Eingaben (sie wurden vor dem Start nicht gesendet): beide neutral
  for (let f = frame; f < frame + D; f++) { IN[me].set(f, 0); IN[op].set(f, 0); }
  localTop = frame + D - 1; remoteTop = frame + D - 1;
  const m = { rollbacks: 0, resimFrames: 0, maxDepth: 0, stalls: 0, predicted: 0, mispredicted: 0 };

  const remoteIn = f => (IN[op].has(f) ? IN[op].get(f) : predictIn(IN[op].get(Math.min(f, remoteTop))));
  const runTick = f => {
    const ri = remoteIn(f), li = IN[me].get(f) ?? 0;
    used.set(f, ri);
    const inputs = me === 0 ? [li, ri] : [ri, li];
    const out = tickFn(cur, inputs, f) || [];
    evs.set(f, out);
    S.set(f + 1, clone(cur));
    return out;
  };
  const trim = () => {
    const keep = Math.min(sync, frame) - RING;
    for (const map of [S, used, evs, IN[0], IN[1]]) for (const k of map.keys()) { if (k < keep) map.delete(k); else break; }
  };

  const api = {
    get frame() { return frame; }, get sync() { return sync; }, get delay() { return D; }, get remoteTop() { return remoteTop; },
    get localTop() { return localTop; }, metrics: m, state: () => cur,
    /** Zustand S_f (Kopie aus dem Speicher) oder null */
    stateAt: f => (S.has(f) ? S.get(f) : null),
    eventsAt: f => evs.get(f) || [],
    /** wird eine neue eigene Eingabe gebraucht? (für Takt frame + delay; bei Stau nicht) */
    needLocal: () => localTop < frame + D,
    /** eigene Eingabe für Takt frame + delay eintragen; liefert den Takt (-1: schon belegt) */
    setLocal(inp) {
      const f = frame + D;
      if (localTop >= f) return -1;
      for (let g = localTop + 1; g < f; g++) IN[me].set(g, IN[me].get(localTop) ?? 0);   // Lücke (nach einer Korrektur)
      IN[me].set(f, inp); localTop = f;
      return f;
    },
    /** eigene Eingaben ab Takt from (zum Senden; die ältesten zuerst, höchstens n Stück) */
    localRange(from, n = 32) {
      const out = [], a = Math.max(from, frame - RING);
      for (let f = a; f <= localTop && out.length < n; f++) out.push(IN[me].get(f) ?? 0);
      return { f: a, v: out };
    },
    /** Eingaben der Gegenseite ab Takt f0 (mehrfach gesendet ist egal) */
    addRemote(f0, list) {
      for (let k = 0; k < list.length; k++) {
        const f = f0 + k;
        if (f <= remoteTop || f < frame - RING) continue;
        if (f !== remoteTop + 1) break;   // Lücke: auf die fehlende warten (kommt redundant im nächsten Paket)
        const v = list[k];
        IN[op].set(f, v); remoteTop = f;
        if (used.has(f)) { m.predicted++; if (!eqIn(used.get(f), v)) { m.mispredicted++; if (f < dirty) dirty = f; } }
      }
    },
    /** Neu rechnen, wo eine Vorhersage falsch war; true, wenn zurückgespult wurde */
    reconcile() {
      let rolled = false;
      if (dirty < frame) {
        const from = dirty, to = frame;
        cur = clone(S.get(from));
        for (let f = from; f < to; f++) runTick(f);
        m.rollbacks++; m.resimFrames += to - from; m.maxDepth = Math.max(m.maxDepth, to - from);
        rolled = true;
      }
      dirty = Infinity;
      // endgültig: alle Takte vor sync mit echten Eingaben beider Seiten gerechnet
      sync = Math.max(sync, Math.min(remoteTop + 1, localTop + 1, frame));
      return rolled;
    },
    /** darf der nächste Takt laufen? (nicht weiter als maxPred über die letzte bekannte Eingabe hinaus) */
    canAdvance: () => frame - remoteTop <= maxPred && IN[me].has(frame),
    /** einen Takt weiter; null, wenn blockiert (dann wurde nichts gerechnet) */
    advance() {
      api.reconcile();
      if (!api.canAdvance()) { m.stalls++; return null; }
      const out = runTick(frame);
      frame++;
      sync = Math.max(sync, Math.min(remoteTop + 1, localTop + 1, frame));
      trim();
      return out;
    },
    /** Zustand für Takt f hart setzen (Korrektur vom Host, Wiederaufnahme) und bis zum aktuellen Takt neu rechnen */
    resync(f, state) {
      S.set(f, clone(state));
      for (const k of [...S.keys()]) if (k > f) S.delete(k);
      cur = clone(state);
      const to = Math.max(frame, f);
      if (f > frame) {   // Gegenseite war schon weiter: eigene fehlende Eingaben neutral auffüllen
        for (let g = localTop + 1; g < f + D; g++) IN[me].set(g, 0);
        localTop = Math.max(localTop, f + D - 1);
      }
      frame = f;
      for (let g = f; g < to && IN[me].has(g); g++) { runTick(g); frame = g + 1; }
      sync = Math.max(Math.min(sync, f), Math.min(remoteTop + 1, localTop + 1, frame));
      dirty = Infinity;
    },
  };
  return api;
}
