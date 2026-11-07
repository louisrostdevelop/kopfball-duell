// Rollback-Gegenstelle: Takt, Pakete, Zeitabgleich, Prüfsummen und Korrektur rund um die Sitzung (rollback.js).
// Rein und ohne DOM: Netz (send), Uhr (dt in update) und Physik (tick) kommen von außen, deshalb mit simuliertem
// Netz testbar (tests/sim/rollback.test.mjs). Beide Seiten sind gleichberechtigt, nur bei abweichender Prüfsumme
// schickt der Host (me 0) seinen endgültigen Zustand, und beide rechnen ab dort weiter.
import { clone, createSession, hashState } from "./rollback.js";

export const TICK_S = 1 / 60;
/** Ereignisse, die erst zählen, wenn sie endgültig sind (keine Phantom-Tore durch falsche Vorhersage) */
export const FINAL_ONLY = new Set(["goal", "end", "ko"]);
const HASH_EVERY = 60;

/**
 * o.me, o.state, o.frame0, o.delay, o.maxPred: wie createSession
 * o.step(st, inputs[2], f): Physik-Takt, liefert Ereignisse (Array)
 * o.send(msg): schneller, unzuverlässiger Kanal; o.sendSafe(msg): zuverlässiger Kanal (Standard: send)
 * o.onSpec(e, f): Ereignis zum ersten Mal gesehen (Ton, Effekte), o.onFinal(events, f, stateAfter): Takt endgültig
 * o.norm(st): Zustand so, wie er übers Netz käme (Standard: JSON hin und zurück), o.onRollback: siehe createSession
 */
export function createPeer(o) {
  const me = o.me, send = o.send, sendSafe = o.sendSafe || o.send;
  const norm = o.norm || (st => JSON.parse(JSON.stringify(st)));
  const played = [];   // { k, f } zuletzt abgespielte Ereignisse (gegen doppelte Töne nach dem Neurechnen)
  const step = (st, inp, f) => {
    const out = o.step(st, inp, f) || [];
    for (const e of out) {
      if (FINAL_ONLY.has(e.t)) continue;
      const k = e.t + "|" + (e.i ?? "");
      if (played.some(p => p.k === k && Math.abs(p.f - f) <= 2)) continue;
      played.push({ k, f }); if (played.length > 64) played.shift();
      if (o.onSpec) o.onSpec(e, f);
    }
    return out;
  };
  const s = createSession({ me, state: o.state, frame0: o.frame0, delay: o.delay, maxPred: o.maxPred, ring: o.ring, tick: step, onRollback: o.onRollback });
  let acc = 0, sendT = 0, lastFix = -1, ackByRemote = (o.frame0 | 0) + s.delay - 1, lastRemoteFrame = (o.frame0 | 0), remoteAdv = 0, cool = 0, finalDone = o.frame0 | 0;
  const advHist = [];
  const myHash = new Map(), theirHash = new Map();
  const m = Object.assign(s.metrics, { resyncs: 0, slowdowns: 0, packetsIn: 0, packetsOut: 0, desyncs: 0, mid: 0 });
  const mid = o.mid ?? 0;

  function packet() {
    const r = s.localRange(ackByRemote + 1, 40);
    return { t: "ri", mid, f: r.f, v: r.v, k: s.remoteTop, fr: s.frame, ad: s.frame - lastRemoteFrame };
  }
  function flushFinal() {
    while (finalDone < s.sync) {
      const f = finalDone++;
      if (o.onFinal) o.onFinal(s.eventsAt(f), f, s.stateAt(f + 1));
      const g = f + 1;   // Prüfsumme über S_g, alle HASH_EVERY Takte (beide Seiten dieselben Takte)
      if (g % HASH_EVERY === 0) {
        const st = s.stateAt(g);
        if (st) { const h = hashState(st); myHash.set(g, h); sendSafe({ t: "rh", mid, f: g, h }); compare(g); }
      }
    }
    for (const k of myHash.keys()) { if (k < s.sync - 1200) { myHash.delete(k); theirHash.delete(k); } else break; }
  }
  function compare(f) {
    if (!myHash.has(f) || !theirHash.has(f)) return;
    // Abweichungen bis zur letzten Korrektur sind schon behoben (die Gegenseite hatte sie vor der Korrektur gerechnet)
    if (f > lastFix && myHash.get(f) !== theirHash.get(f)) {
      m.desyncs++;
      if (me === 0) correct();
    }
  }
  /** Host: endgültigen Zustand verschicken und selbst genau diesen (übers Netz normierten) Stand übernehmen */
  function correct() {
    const f = s.sync, st = s.stateAt(f);
    if (!st) return;
    const n = norm(st);
    sendSafe({ t: "rs", mid, f, st: n });
    s.resync(f, n); m.resyncs++; lastFix = f;
  }

  return {
    session: s, metrics: m,
    get frame() { return s.frame; },
    state: () => s.state(),
    /**
     * Pro Bild: echte Zeit dt (s) aufholen, je Takt eigene Eingabe holen (sample()), rechnen, senden.
     * Liefert die Zahl der gerechneten Takte (0: Stau, wartet auf die Gegenseite).
     */
    update(dt, sample) {
      acc = Math.min(acc + dt, 0.25);   // nach langem Hänger nicht endlos nachrechnen
      let n = 0;
      while (acc >= TICK_S) {
        acc -= TICK_S;
        // Zeitabgleich: wer im Mittel vorne liegt, wartet ab und zu einen Takt (der andere holt auf)
        if (cool > 0) cool--;
        const adv = advHist.length ? median(advHist) : 0;
        if (adv >= 1 && cool === 0) { cool = 30; m.slowdowns++; continue; }
        if (s.needLocal()) s.setLocal(sample());
        const out = s.advance();
        if (out === null) { acc = 0; break; }   // Stau: auf Eingaben warten
        n++;
      }
      if (n === 0) s.reconcile();
      flushFinal();
      // senden: nach jedem Takt, sonst (Stau, schnelle Bildschirme) höchstens 30-mal pro Sekunde
      sendT += dt;
      if (n > 0 || sendT >= 1 / 30) { sendT = 0; send(packet()); m.packetsOut++; }
      return n;
    },
    /** Nachricht der Gegenseite (nur rollback-eigene Typen; true, wenn verarbeitet) */
    onMessage(d) {
      if (!d || d.mid !== mid) return false;
      if (d.t === "ri") {
        m.packetsIn++;
        if (Array.isArray(d.v) && Number.isInteger(d.f)) s.addRemote(d.f, d.v.slice(0, 64));
        if (Number.isInteger(d.k) && d.k > ackByRemote) ackByRemote = Math.min(d.k, s.localTop);
        if (Number.isInteger(d.fr) && d.fr > lastRemoteFrame) lastRemoteFrame = d.fr;
        if (typeof d.ad === "number") remoteAdv = d.ad;
        // eigener Vorsprung minus dem der Gegenseite, halbiert = wie weit die eigene Uhr vorgeht (Laufzeit kürzt sich weg)
        advHist.push(((s.frame - lastRemoteFrame) - remoteAdv) / 2); if (advHist.length > 24) advHist.shift();
        return true;
      }
      if (d.t === "rh") { if (Number.isInteger(d.f) && typeof d.h === "string") { theirHash.set(d.f, d.h); compare(d.f); } return true; }
      if (d.t === "rs") { if (me !== 0 && Number.isInteger(d.f) && d.st && typeof d.st === "object") { s.resync(d.f, d.st); m.resyncs++; lastFix = d.f; } return true; }
      return false;
    },
    /** Host: Zustand ab dem letzten endgültigen Takt vorgeben (wie eine Korrektur; Tests, Fehlersuche). fn(st) ändert ihn */
    force(fn) {
      if (me !== 0) return false;
      const f = s.sync, st = s.stateAt(f);
      if (!st) return false;
      const n = norm(st); fn(n);
      sendSafe({ t: "rs", mid, f, st: n });
      s.resync(f, n); lastFix = f;
      return true;
    },
    /** Kopie des aktuellen Zustands (z. B. zum Sichern) */
    snapshot: () => clone(s.state()),
  };
}

function median(a) { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; }
