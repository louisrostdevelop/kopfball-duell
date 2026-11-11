// Online-Spiel mit Rollback-Netcode (core/rbpeer.js): beide Geräte rechnen das Spiel selbst, ausgetauscht werden nur
// Eingaben. Hier die Anbindung an die App: Eingaben sammeln, Ereignisse (Ton, Effekte, Wiederholung) verteilen,
// Korrekturen weich zeichnen, Spielende aus dem endgültigen Stand. Der Host schickt beim Anpfiff den Startzustand
// (Nachricht „start“ mit rb).
import { clamp, EMOTES, setFieldW, W0 } from "../content/config.js";
import { advance } from "../core/physics.js";
import { cleanInput, gameTick } from "../core/rbgame.js";
import { fixOk } from "../core/rbfix.js";
import { sameMoment } from "../core/rbstart.js";
import { createPeer } from "../core/rbpeer.js";
import { BITS, clone, packInput } from "../core/rollback.js";
import { CELEB, onEvent } from "./effects.js";
import { validEmote } from "./cosmetics.js";
import { App } from "./state.js";
import { sessionRole, touchSession } from "./session.js";
import { input as I, net as Net } from "./services.js";
import { toast } from "../ui/dom.js";
import { t } from "../content/i18n.js";

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
// Torjubel: einmal je Tor frei, ohne Emote-Sperre (rbgame.js)
const step = (st, inputs) => gameTick(st, [clean(inputs[0], 0), clean(inputs[1], 1)], isCeleb);

/**
 * Gast unter Freunden: Korrektur des Hosts annehmen? Nur, wenn sie zum eigenen Stand passt (fixOk) und selten ist:
 * ehrliche Korrekturen gibt es nur bei einer Abweichung der Rechnung, höchstens FIX_MAX je Minute (echte Zeit, je Spiel,
 * auch über neue Sitzungen hinweg). In der Gegnersuche gibt es keine Korrektur (strict: das Spiel wird ungültig).
 * (App.testTrustFix: nur Tests über window.__kd auf localhost, die den Stand per rbForce vorgeben)
 */
const FIX_MAX = 4, FIX_WIN_MS = 60000;
/**
 * eine Korrektur bzw. ein neuer Stand mitten im Spiel (kind "fix") oder eine beantwortete Anfrage zur Wiederaufnahme
 * (Host, kind "ask"): zählt mit; false = zu viele in der letzten Minute (je Spiel)
 */
export function fixBudget(kind = "fix") {
  const logs = App.fixLog && App.fixLog.mid === App.mid ? App.fixLog : (App.fixLog = { mid: App.mid });
  const now = performance.now(), log = logs[kind] || (logs[kind] = { at: [] });
  while (log.at.length && log.at[0] <= now - FIX_WIN_MS) log.at.shift();
  if (log.at.length >= FIX_MAX) return false;
  log.at.push(now); return true;
}
const checkFix = (own, fix, recent) => App.testTrustFix || (fixOk(own, fix, recent) && fixBudget());
const strict = () => !!App.mm && !App.testTrustFix;
/**
 * Unplausible Korrektur unter Freunden: Grund an die Gegenseite (sonst wartet sie bis zu 35 s aufs Wiederverbinden),
 * dann Ende wie bei einem Verbindungsabbruch (zurück ins Menü)
 */
export function badFix() {
  const lost = App.netLost;
  App.netLost = null; App.lastRx = 0; App.netWait = null;
  Net.send({ t: "bye", reason: "badfix" }); Net.close(250);
  toast(t("net.badFix"), "i-close");
  if (lost) lost();
}
/** Gegnersuche: Rechnung weicht ab oder der Host will den Stand vorgeben: Spiel ungültig (app/matchmaking.js) */
const desync = () => { if (App.mmVoid) App.mmVoid(); };

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
    onSpec: e => onEvent(e),
    onFinal: (evs, f, after) => finalFrame(rb, evs, after, f),
    onRollback: (old, neu) => smooth(rb, old, neu),
    checkFix, onBadFix: badFix, strict, onDesync: desync,
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
    if (e.t === "goal" || e.t === "ko") onEvent(e);
    if (e.t === "end" && !rb.ended) {
      onEvent(e); rb.ended = clone(after); rb.endAt = performance.now(); rb.endF = f;
      if (App.mode === "host" && sessionRole()) touchSession({ st: rb.ended });   // Endstand sofort sichern (Neustart)
      Net.send({ t: "rbok", mid: App.mid });   // Gegenseite: ich bin durch (sie muss nicht auf mich warten)
    }
  }
}
// wie loop.js snap(): nur was die Wiederholung zeichnet (mit den Feldwirkungen der Power-ups)
const snapFor = st => ({ obsP: (st.obs || []).map(o => ({ x: o.x, y: o.y })), arena: st.arena, s: st.s, t: st.t, ph: st.ph, gold: st.gold, mod: st.mod, rules: st.rules,
  wind: { ...st.wind }, wall: [...st.wall], wallHp: [...st.wallHp], bigGoal: [...st.bigGoal], clone: st.clone.map(c => ({ ...c })), slow2: [...st.slow2],
  floatT: st.floatT, portal: st.portal && { ...st.portal }, pu: st.pu.map(u => ({ ...u })),
  b: { ...st.b, stick: st.b.stick && { ...st.b.stick } }, p: st.p.map(p => ({ ...p })) });

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

/** Jedes Bild (statt advance): Eingaben sammeln, Takte rechnen, Pakete senden */
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
    if (rbRemoteDone() || !Net.isOpen() || performance.now() - t0 > 3000) {   // (ohne Verbindung wartet man umsonst)
      if (App.rb && App.rb.ended) Net.send({ t: "rbok", mid: App.mid });   // vor dem Gehen: „bin durch“ (falls verloren)
      fn();   // (App.leaving bleibt bis zum nächsten Spiel)
    } else setTimeout(go, 100);
  };
  go();
}

/**
 * Gast meldet sich zurück, der Host hat aber schon endgültig abgepfiffen (Gast ohne Sitzung, z. B. nach einem
 * Neustart): ihm den Endstand schicken statt einer neuen Sitzung (aus „Ende“ heraus gäbe es nie einen Abpfiff)
 */
export function rbEndedStart() {
  const rb = App.rb;
  if (!rb || !rb.ended) return null;   // (Host nach einem Neustart mit Endstand: beendete Sitzung aus restoreHostGame)
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

/**
 * Wie weit eine Wiederaufnahme höchstens hinter den eigenen endgültigen Takt zurückgehen darf. Ehrlich liegt der Stand,
 * ab dem es weitergeht, hinter dem endgültigen Takt der Seite, die NICHT neu gestartet hat: die neu gestartete hat
 * nur ihre letzte Sicherung (alle 15 Takte, 0,25 s), dazu läuft der endgültige Takt der einen Seite dem der anderen
 * um Verzögerung und Vorhersage voraus. 36 Takte (0,6 s) decken Abstürze und Neuladen auch bei Verlust, Schwankung und
 * langsamen Tabs mit etwas Reserve ab (prüfen per Simulation vieler Abstürze), aber jeder Takt mehr ist Zeit, die ein
 * Betrüger einmal je Spiel neu spielen kann. Ohne Grenze ginge es bis zu 256 Takte (gut 4 s) zurück. „Nie hinter den
 * endgültigen Takt der Gegenseite“ geht nicht: nach einem Neustart fehlt der neu gestarteten Seite genau dieses Stück.
 */
export const REWIND_MAX = 36;
/**
 * Wiederaufnahme (Gegnersuche): eigener Stand des Takts f der Sitzung ep, wenn hier endgültig gerechnet (beide Seiten
 * haben ihn dann bitgleich), noch im Speicher (256 Takte), höchstens REWIND_MAX hinter dem eigenen endgültigen Takt und
 * seitdem ohne Tor, Golden Goal oder Abpfiff (sameMoment: sonst nähme das Zurückdrehen ihn zurück); sonst null.
 * Liefert { st, back } (back: Takte zurück)
 */
export function rbStateAt(ep, f) {
  const rb = App.rb, s = rb && rb.peer.session, sync = s && s.sync;
  if (!rb || rb.ep !== ep || !Number.isInteger(f) || f > sync || f < sync - REWIND_MAX) return null;
  const st = s.stateAt(f);
  if (!st) return null;
  for (let x = f + 1; x <= sync; x++) if (!sameMoment(st, s.stateAt(x))) return null;
  return { st, back: sync - f };
}
/** Sicherung: endgültiger Stand mit Sitzung und Takt (für die Wiederaufnahme nach einem Neustart), sonst null */
export function rbSave() {
  const rb = App.rb;
  if (!rb || rb.ended) return null;
  const s = rb.peer.session, st = s.stateAt(s.sync);
  return st ? { ep: rb.ep, f: s.sync, st: netState(st) } : null;
}
/** eigener endgültiger Takt der laufenden Sitzung (für die Anfrage zur Wiederaufnahme) */
export const rbSync = () => (App.rb && !App.rb.ended ? { ep: App.rb.ep, f: App.rb.peer.session.sync } : null);

/** Host: Spielzustand auf beiden Seiten ändern (Tests): als Korrektur ab dem letzten endgültigen Takt */
export const rbForce = fn => !!(App.rb && !App.rb.ended && App.rb.peer.force(fn));

/** Kennzahlen für Tests und Fehlersuche (window.__kd.rb) */
export const rbStats = () => (App.rb ? { ...App.rb.peer.metrics, frame: App.rb.peer.frame, sync: App.rb.peer.session.sync, delay: App.rb.delay, ep: App.rb.ep, counts: { ...App.rb.counts }, ended: !!App.rb.ended } : null);
