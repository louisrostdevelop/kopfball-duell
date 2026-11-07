// Online-Spiel mit Rollback-Netcode (core/rbpeer.js): beide Geräte rechnen das Spiel selbst, ausgetauscht werden nur
// Eingaben. Hier die Anbindung an die App: Eingaben sammeln, Ereignisse (Ton, Effekte, Wiederholung) verteilen,
// Korrekturen weich zeichnen, Spielende aus dem endgültigen Stand. Der Host entscheidet beim Anpfiff, ob Rollback läuft
// (Nachricht „start“ mit rb), sonst gilt das alte Verfahren (Host rechnet, Gast bekommt Zustände).
import { clamp, EMOTES, setFieldW, W0 } from "../content/config.js";
import { advance } from "../core/physics.js";
import { cleanInput, gameTick } from "../core/rbgame.js";
import { createPeer } from "../core/rbpeer.js";
import { BITS, clone, packInput } from "../core/rollback.js";
import { CELEB, onEvent } from "./effects.js";
import { validEmote } from "./cosmetics.js";
import { App } from "./state.js";
import { input as I, net as Net } from "./services.js";

/** Rollback an? Zum Vergleichen/Notfall: ?netcode=classic (oder window.__netcode = "classic", Tests) schaltet beim Host das alte Verfahren ein */
export const rollbackWanted = () => { try { return globalThis.__netcode !== "classic" && !/[?&]netcode=classic\b/.test(location.search); } catch (_) { return true; } };

/** Eingabeverzögerung aus der Laufzeit (Hin und zurück, ms): kurze Wege 2 Takte, sehr lange höchstens 6 */
export function pickDelay(rtt) {
  if (!(rtt > 0)) return 3;
  return clamp(Math.round(rtt / 2 / (1000 / 60) * 0.5), 2, 6);
}
const MAX_PRED = 10;

// Eingaben der Gegenseite deterministisch säubern (auf beiden Seiten gleich, sonst rechnen sie verschieden)
// Torjubel des Schützen (effects.js onGoal); erst beim ersten Gebrauch, die Module laden sich gegenseitig
let celebs = null;
const isCeleb = e => (celebs ||= new Set(Object.values(CELEB))).has(e);
const okEmote = e => typeof e === "string" && (validEmote(e) || isCeleb(e));
// je Spieler: Standard-Emotes, seine ausgerüsteten Plätze (aus der Kosmetik beim Anpfiff, auf beiden Seiten gleich), Torjubel
const okFor = i => e => {
  if (typeof e !== "string") return false;
  if (EMOTES.includes(e) || isCeleb(e)) return true;
  const slots = (App.cfg && App.cfg.cos && App.cfg.cos[i] && App.cfg.cos[i].emotes) || [];
  return slots.includes(e) && validEmote(e);
};
const clean = (v, i) => cleanInput(v, okFor(i));
const step = (st, inputs) => gameTick(st, [clean(inputs[0], 0), clean(inputs[1], 1)]);

/** Zustand so, wie er übers Netz geht (JSON): beide Seiten starten von exakt demselben Stand */
export const netState = st => JSON.parse(JSON.stringify(st));

/**
 * Sitzung starten (Anpfiff, Wiederaufnahme, Revanche). ep: Nummer der Sitzung innerhalb des Spiels (Pakete älterer
 * Sitzungen werden ignoriert), st: Startzustand (schon netState), delay: vom Host festgelegt.
 */
export function startRb({ ep, st, delay, ended = false }) {
  const me = App.mode === "guest" ? 1 : 0;
  setFieldW(W0 * ((st.rules && st.rules.field) || 1));   // Feldbreite ist global (config.js): fest zum Startzustand
  const fast = m => (Net.sendFast ? Net.sendFast(m) : Net.send(m));
  const rb = {
    me, ep, delay, ended: null, endAt: 0, endF: 0, lastFinal: null, pend: 0, emo: "", skip: false,
    counts: {},   // endgültige Ereignisse je Art und Spieler (Fehlersuche, Tests)
    off: { b: [0, 0], p: [[0, 0], [0, 0]] },   // Versatz zum weichen Zeichnen nach Korrekturen
    peer: null,
  };
  rb.peer = createPeer({
    me, state: st, delay, maxPred: MAX_PRED, mid: App.mid + ":" + ep, step,
    send: fast, sendSafe: m => Net.send(m),
    onSpec: e => onEvent(e, false),
    onFinal: (evs, f, after) => finalFrame(rb, evs, after, f),
    onRollback: (old, neu) => smooth(rb, old, neu),
  });
  App.rb = rb;
  App.st = rb.peer.state();
  // Endstand vom Host: nichts mehr zu rechnen oder zu senden
  if (ended) { rb.ended = rb.peer.state(); rb.endAt = performance.now(); rb.remoteDone = true; rb.quiet = true; App.st = rb.ended; }
  App.rec = []; App.replay = null;
  return rb;
}
export function stopRb() { App.rb = null; }

// Endgültige Takte: Wiederholung aus sicheren Zuständen, Tor/Ende/Anstoß erst jetzt (keine Phantom-Tore)
function finalFrame(rb, evs, after, f) {
  if (!after) return;
  rb.lastFinal = after;
  const me = rb.me; App.maxDef = Math.max(App.maxDef, after.s[1 - me] - after.s[me]);   // höchster Rückstand (Erfolg „Comeback“)
  if (after.ph === "play") { App.rec.push(snapFor(after)); if (App.rec.length > 200) App.rec.shift(); }
  if (after.ph === "ko" || after.ph === "cd") App.rec = [];
  for (const e of evs) {
    const k = e.t + (e.i ?? ""); rb.counts[k] = (rb.counts[k] || 0) + 1;
    if (e.t === "goal" || e.t === "ko") onEvent(e, false);
    if (e.t === "end" && !rb.ended) { onEvent(e, false); rb.ended = clone(after); rb.endAt = performance.now(); rb.endF = f; }
  }
}
// wie loop.js snap(): nur was die Wiederholung zeichnet
const snapFor = st => ({ obsP: (st.obs || []).map(o => ({ x: o.x, y: o.y })), arena: st.arena, s: st.s, t: st.t, ph: st.ph, gold: st.gold, mod: st.mod, rules: st.rules, wind: st.wind, wall: [...st.wall], bigGoal: [...st.bigGoal], pu: st.pu.map(u => ({ ...u })), b: { ...st.b }, p: st.p.map(p => ({ ...p })) });

// Korrektur nach falscher Vorhersage: Sprung nicht sofort zeigen, sondern in ~80 ms weich nachziehen
function smooth(rb, old, neu) {
  const add = (o, dx, dy) => { if (Math.abs(dx) < 160 && Math.abs(dy) < 160) { o[0] += dx; o[1] += dy; } };
  if (old.b && neu.b) add(rb.off.b, old.b.x - neu.b.x, old.b.y - neu.b.y);
  for (let i = 0; i < 2; i++) if (old.p[i] && neu.p[i]) add(rb.off.p[i], old.p[i].x - neu.p[i].x, old.p[i].y - neu.p[i].y);
}

/** Emote über die Eingaben schicken (kommt auf beiden Seiten im selben Takt an) */
export function rbEmote(e) { if (App.rb && okEmote(e)) App.rb.emo = e; }
/** Jubel überspringen (nur der Host darf, wie bisher) */
export function rbSkip() { if (App.rb && App.rb.me === 0) App.rb.skip = true; }

/** Jedes Bild (statt advance/guestFrame): Eingaben sammeln, Takte rechnen, Pakete senden */
export function rbFrame(dt) {
  const rb = App.rb;
  // Spiel vorbei: endgültigen Stand zeigen (Figuren bewegen sich weiter) und noch 30 s weiter senden (ab dem Abpfiff
  // bzw. dem Wiederverbinden): die Gegenseite kommt so sicher bis zum Abpfiff und erfährt, dass ihre Eingaben da sind
  if (rb.ended) {
    if (App.st !== rb.ended) { App.st = rb.ended; App.st.ev = []; App.acc = 0; }
    App.acc = advance(App.st, dt, [{}, {}], App.acc);
    if (!rb.quiet && performance.now() - rb.endAt < 30000) rb.peer.update(dt, () => 0);
    return;
  }
  // Eingabe einmal pro Bild lesen (holt auch kurze Tipps ab); was zwischen zwei Takten gedrückt war, zählt im nächsten
  const c = I.getInput(rb.me, "single");
  rb.pend |= packInput(c);
  const obs = App.st && App.st.obs;
  rb.peer.update(dt, () => {
    let b = rb.pend | packInput(c);
    rb.pend = 0;
    if (rb.skip) { b |= BITS.x; rb.skip = false; }
    if (rb.emo) { const e = rb.emo; rb.emo = ""; return { b, e }; }
    return b;
  });
  const st = rb.ended || rb.peer.state();   // gerade endgültig abgepfiffen: gleich den endgültigen Stand zeigen
  // Aufleuchten von Hindernissen (nur Anzeige) über das Neurechnen retten
  if (st !== App.st && obs && st.obs) st.obs.forEach((o, i) => { if (obs[i] && obs[i].hitT !== undefined) o.hitT = obs[i].hitT; });
  App.st = st;
  const k = Math.exp(-dt * 14);
  rb.off.b[0] *= k; rb.off.b[1] *= k;
  for (const o of rb.off.p) { o[0] *= k; o[1] *= k; }
}

/** Zustand zum Zeichnen: mit dem Versatz der letzten Korrekturen (nur Positionen, Rest unverändert) */
export function rbView(st) {
  const rb = App.rb;
  if (!rb || rb.ended || st !== rb.peer.state()) return st;
  const o = rb.off, tiny = v => Math.abs(v[0]) < 0.3 && Math.abs(v[1]) < 0.3;
  if (tiny(o.b) && tiny(o.p[0]) && tiny(o.p[1])) return st;
  return { ...st, b: { ...st.b, x: st.b.x + o.b[0], y: st.b.y + o.b[1] }, p: st.p.map((p, i) => ({ ...p, x: p.x + o.p[i][0], y: p.y + o.p[i][1] })) };
}

/** Abgepfiffen und hat die Gegenseite alle eigenen Eingaben bis zum Abpfiff? (dann kann sie auch abpfeifen) */
export function rbRemoteDone() { const rb = App.rb; return !rb || !rb.ended || rb.remoteDone || rb.peer.acked >= rb.endF; }

/** Nach dem eigenen Abpfiff gehen (Lobby, Menü, Revanche, nächster Gegner): kurz warten, bis die Gegenseite alles hat */
export function afterRemote(fn) {
  const key = App.matchKey, t0 = performance.now();
  if (key && App.leaving === key) return;   // schon unterwegs (Doppelklick, zweiter Knopf)
  App.leaving = key;
  const go = () => {
    // Verbindung weg (die Warte-Leiste regelt das) oder inzwischen ein anderes Spiel/ein anderer Bildschirm: nichts tun
    if (App.netWait || App.matchKey !== key || App.screen !== "end") { App.leaving = null; return; }
    if (rbRemoteDone() || performance.now() - t0 > 3000) fn(); else setTimeout(go, 100);   // (App.leaving bleibt bis zum nächsten Spiel)
  };
  go();
}

/**
 * Gast meldet sich zurück, der Host hat aber schon endgültig abgepfiffen (Gast ohne Sitzung, z. B. nach einem
 * Neustart): ihm den Endstand schicken statt einer neuen Sitzung (aus „Ende“ heraus gäbe es nie einen Abpfiff)
 */
export function rbEndedStart() {
  const rb = App.rb;
  // Host nach einem Neustart, gesicherter Stand ist schon der endgültige Abpfiff (online.js afterWhistle hält ihn so lange)
  if (!rb) return App.rbOn && App.st && App.st.ph === "end" ? { ep: (Date.now() % 1e9) + 1, st: netState(App.st), d: 3, ended: true } : null;
  if (!rb.ended) return null;
  rb.endSent = true;   // erledigt, sobald der Gast „rbok“ schickt (online.js)
  return { ep: rb.ep, st: netState(rb.ended), d: rb.delay, ended: true };
}

/** Rollback-Nachricht? (dann verarbeitet) */
export const rbMessage = d => !!(App.rb && d && (d.t === "ri" || d.t === "rh" || d.t === "rs") && App.rb.peer.onMessage(d));

/** Stand, den der Host sichert bzw. bei Wiederaufnahme schickt: der letzte endgültige, sonst der angezeigte */
export function rbBestState() {
  const rb = App.rb;
  if (!rb) return App.st;
  if (rb.ended) return rb.ended;
  const s = rb.peer.session;
  return s.stateAt(s.sync) || rb.lastFinal || rb.peer.state();
}

/** Host: Spielzustand auf beiden Seiten ändern (Tests): als Korrektur ab dem letzten endgültigen Takt */
export const rbForce = fn => !!(App.rb && !App.rb.ended && App.rb.peer.force(fn));

/** Kennzahlen für Tests und Fehlersuche (window.__kd.rb) */
export const rbStats = () => (App.rb ? { ...App.rb.peer.metrics, frame: App.rb.peer.frame, sync: App.rb.peer.session.sync, delay: App.rb.delay, ep: App.rb.ep, counts: { ...App.rb.counts }, ended: !!App.rb.ended } : null);
