// Online-Spiel: Lobby-Protokoll, Anpfiff, Wiederverbinden, Sitzung über Neustarts (gerechnet wird mit Rollback, rbnet.js)
import { charById, clamp, HEAD_MAX_LEVEL } from "../content/config.js";
import { matchLen } from "../core/physics.js";
import { mmArena, sameMoment, sameStart, sameState, seedFrom, startCfg } from "../core/rbstart.js";
import { owns, S } from "./profile.js";
import { beginMatch, headLevel, quitToMenu, resolveObs, startDemo, updateBand } from "./game.js";
import { cleanCos, myCos } from "./cosmetics.js";
import { App, inGame, VERSION } from "./state.js";
import { $, toast } from "../ui/dom.js";
import { showScreen } from "../ui/nav.js";
import { lobbyUI, makeQR, netNote } from "../ui/screens/online.js";
import { audio as A, net as Net, server } from "./services.js";
import { ensureRelay, relayReady } from "./relay.js";
import { pingBars, pingStats } from "./netcode.js";
import { t } from "../content/i18n.js";
import { clearSession, markClosing, saveSession, sessionRole, touchSession } from "./session.js";
import { settlePending } from "./results.js";
import { matchEnded, netFailed, netOpened, track } from "./track.js";
import { REWIND_MAX, fixBudget, netState, pickDelay, rbBestState, rbEndedStart, rbMessage, rbRemoteDone, rbSave, rbStateAt, rbSync, startRb, stopRb } from "./rbnet.js";

/** Ergebnis-Bildschirm beim Host: Gast hat Revanche angefragt */
export function rematchHint() {
  if (App.mode !== "host" || !App.rematchWanted || App.screen !== "end") return;
  $("endNote").textContent = t("end.rematchWanted", { name: App.opp ? App.opp.name : t("ui.guest") });
  $("btnEndAgain").classList.add("wants");
}
/** Raum öffnen. resume: { code, netCfg } = nach einem App-Neustart denselben Raum wieder öffnen (der Link bleibt gültig) */
export function hostGame(resume = null) {
  if (!Net.available()) { netNote(t("net.unavailable"), true); return; }
  App.opp = null; App.netBye = false;
  App.netCfg = resume && resume.netCfg ? resume.netCfg : { arena: owns("arenas", S.arena) ? S.arena : "stadion", rules: { ...S.rules } };
  $("lobbyCode").textContent = "····"; $("lobbyLink").textContent = ""; $("qrBox").innerHTML = "";
  lobbyUI("host");
  $("lobbyNote").textContent = t("lobby.opening");
  showScreen("lobby");
  setTimeout(() => { if (App.screen === "lobby" && $("lobbyCode").textContent === "····") $("lobbyNote").textContent = t("lobby.noServer"); }, 9000);
  const open = () => Net.host(hostHandlers(!resume), resume ? { code: resume.code, retries: REOPEN_TRIES } : undefined);
  // erst mit Relay-Zugangsdaten öffnen (sonst nur direkte Verbindungen); fehlen sie noch, kurz darauf warten
  if (relayReady()) open(); else ensureRelay().then(() => { if (App.screen === "lobby") open(); });
}
/** Neue Verbindung, während die alte noch als offen gilt: nur derselbe Gast (Merker), z. B. nach seinem App-Neustart */
export const knock = d => { const ok = !!(d && d.t === "hello" && App.opp && d.tok && d.tok === App.opp.tok); if (ok) connOpened(); return ok; };
/**
 * Host: neue Verbindung offen. Nur ihre ersten beiden Nachrichten (hello, ggf. ein zweites nach „weiter so“ ohne
 * Sitzung beim Gast) dürfen eine Wiederaufnahme anfragen, sonst könnte ein Gast über die laufende Verbindung beliebig
 * oft einen neuen Stand verlangen
 */
export const connOpened = () => { App.helloOpen = 2; };
/** created: neu geöffneter Raum (für die Statistik; Wiederöffnen nach Neustart oder Abbruch zählt nicht) */
function hostHandlers(created = false) {
  return {
    onKnock: knock,
    onReady: code => {
      App.roomCode = code;
      if (created) { created = false; track("lobby", { action: "created" }); }
      if (!liveOnline()) saveSession("host", { phase: "lobby", code, netCfg: App.netCfg, st: null });   // nach Neustart im Spiel: Sitzung bleibt „Spiel“
      const link = location.origin + location.pathname + "?join=" + code.toUpperCase();
      $("lobbyCode").textContent = code.toUpperCase(); $("lobbyLink").textContent = link;
      $("lobbyNote").textContent = t("lobby.sendLink");
      makeQR(link);
    },
    onConn: () => { connOpened(); $("lobbyNote").textContent = t("lobby.connected"); },
    onData: hostData,
    onClose: () => netDropped(hostLost),
    onError: type => { $("lobbyNote").textContent = t("net.roomFailed", { type }) + " " + t("ui.tryAgain"); },
  };
}

function hostLost() {
  App.opp = null;
  if (liveOnline()) track("abort", { mode: "friends", reason: "opp_gone" });
  if (inGame() || App.screen === "end" || App.screen === "pause") { toast(t("net.oppLost")); backToLobby(); }
  lobbyUI("host"); $("lobbyNote").textContent = t("lobby.oppGone");
  // Warten aufgegeben oder abgelaufen (Raum dabei geschlossen): derselbe Code bleibt gültig, Einladungen und ein spät
  // zurückkehrender Gast landen in dieser Lobby
  if (!Net.role() && App.roomCode && App.screen === "lobby") Net.host(hostHandlers(), { code: App.roomCode, retries: REOPEN_TRIES });
}
function guestLost() {
  if (liveOnline()) track("abort", { mode: "friends", reason: "opp_gone" });
  if (App.mode === "guest" || App.screen === "lobby" || App.screen === "end") { toast(t("net.hostLeft")); quitToMenu(); }
}

/**
 * Wächter für laufende Online-Spiele (jeden Frame): kommt von der anderen Seite nichts mehr an (Tab im Hintergrund,
 * Netz weg, ohne dass die Verbindung sauber schließt), erst ein Hinweis, nach NET_LOST ms wie ein Abbruch.
 * App.netLost setzt, wer die Verbindung aufbaut (Freunde: hostLost/guestLost, Gegnersuche: matchmaking.js).
 */
export const NET_WARN = 4000, NET_DROP = 8000, NET_LOST = 15000, RECONNECT_MS = 35000;
/** Raum mit festem Code wieder öffnen: Versuche alle 1,5 s, solange die Gegenseite wartet */
const REOPEN_TRIES = Math.floor((RECONNECT_MS - 2000) / 1500);
/** Online-Spiel läuft (auch mit offenem Pausemenü): Abbruch heißt warten statt beenden */
export const liveOnline = () => (App.mode === "host" || App.mode === "guest") && !!App.st && !netEnded() && (App.screen === null || App.screen === "pause");
/** Spiel vorbei? Rollback: erst, wenn der Abpfiff endgültig ist (eine Vorhersage kann ein spätes Tor noch ändern) */
export const netEnded = () => (App.rb ? !!App.rb.ended : !!App.st && App.st.ph === "end");
export function watchNet(now) {
  if ((App.mode !== "host" && App.mode !== "guest") || !App.st || netEnded() || !App.lastRx || App.netWait) return;
  const gap = now - App.lastRx;
  if (gap > NET_WARN && !App.lagWarn) { App.lagWarn = true; toast(t("net.lagging"), "i-close"); }
  else if (gap < 1000) { App.lagWarn = false; App.dropTried = false; }   // es kommt wieder etwas an
  // erst die Verbindung trennen (löst Wiederverbinden aus), wenn das nicht hilft: Abbruch
  if (gap > NET_DROP && Net.drop && !App.dropTried) { App.dropTried = true; Net.drop(); return; }
  if (gap > NET_LOST && App.netLost) { const f = App.netLost; App.netLost = null; App.lastRx = 0; Net.close(); f(); }
}

// ---------- Wiederverbinden ----------
// Reißt die Verbindung mitten im Spiel ab, steht das Spiel bis zu RECONNECT_MS still. Der Gast tritt demselben Raum
// wieder bei und weist sich mit seinem Sitzungs-Merker aus. Der Host setzt die Rollback-Sitzung fort (rb.keep) oder
// schickt einen neuen Start ab seinem letzten sicheren Stand. Kommt keiner zurück, gilt der bisherige Abbruch (lost).
const token = () => App.netTok || (App.netTok = Math.random().toString(36).slice(2, 12));
export function hello(extra = {}) { return { t: "hello", name: S.name || t("ui.guest"), ch: S.char, lv: headLevel(S.char), cos: myCos(), v: VERSION, tok: token(), ...extra }; }
export function netDropped(lost) {
  if (App.netWait) return;
  if (App.netBye) { App.netBye = false; lost(); return; }   // hat sich verabschiedet: nicht warten
  // Gast in der Lobby oder auf dem Endbildschirm (Freunde): Host ist kurz weg (z. B. App neu gestartet) – wieder
  // beitreten statt rauszufliegen, der Host öffnet dieselbe Lobby
  const lobbyGuest = !liveOnline() && Net.role() === "guest" && (App.screen === "lobby" || App.screen === "end") && !App.mm;
  // Rollback: selbst abgepfiffen, die Gegenseite hat aber noch nicht alle Eingaben bis zum Abpfiff: auf sie warten
  // (sonst bleibt sie ohne Ergebnis, in der Gegnersuche würde sie eine Aufgabe melden)
  const endPending = !rbRemoteDone();
  if (!lobbyGuest && !liveOnline() && !endPending) { lost(); return; }
  waitFor(lost);
  if (App.mode === "guest" || lobbyGuest) rejoin();
}
/** Auf die Gegenseite warten (Spiel steht, Leiste mit Restzeit und „Verlassen“) */
export function waitFor(lost) { App.netWait = { until: performance.now() + RECONNECT_MS, lost }; }
/** „Verlassen“ in der Warte-Leiste: nicht weiter warten, wie nach Ablauf der Zeit */
export function giveUpWaiting() { const w = App.netWait; if (!w) return; App.netWait = null; Net.close(); clearSession(); w.lost(true); }
/**
 * Wiederaufnahme anfragen (hello mit resume). rb: eigene Sitzung (der Host setzt sie fort) mit dem eigenen endgültigen
 * Takt; at: nach einem eigenen Neustart die gesicherten Takte. Gegnersuche: nur eine Antwort darauf darf einen neuen
 * Stand bringen (eine je Anfrage, „start“), und nur einen, den diese Seite exakt so hat (sameState)
 */
function askResume() {
  const x = rbSync(), extra = x ? { rb: { ep: x.ep, f: x.f } } : App.rb ? { rb: { ep: App.rb.ep } } : {};
  if (App.mm) {
    App.mm.ask = { mid: App.mid, at: performance.now() };
    const sv = App.mm.ownSaves;
    if (!App.rb && Array.isArray(sv) && sv.length) { const ep = sv[sv.length - 1].ep; extra.at = { ep, fs: sv.filter(v => v.ep === ep).map(v => v.f) }; }
  }
  return hello({ resume: App.mid, ...(App.mm ? { lv: 1 } : {}), ...extra });
}
function rejoin() {
  if (!App.netWait || !App.roomCode || !App.joinH) return;
  const h = App.joinH;
  Net.join(App.roomCode, { ...h,
    // mid 0 = Lobby: Host nimmt als neuen Gast an. rb: eigene Rollback-Sitzung, die der Host ohne Neustart fortsetzt
    onConn: () => Net.send(askResume()),
    onClose: () => { if (App.netWait) setTimeout(rejoin, 800); else h.onClose(); },
    onError: () => { if (App.netWait) setTimeout(rejoin, 1000); },
  });
}
/** Jeden Frame: true, solange auf die Gegenseite gewartet wird (dann steht das Spiel) */
export function netWaitTick(now) {
  const w = App.netWait, box = $("netWaitBox"), shade = $("netWaitShade");
  if (!w) { if (!box.hidden) { box.hidden = true; shade.hidden = true; } return false; }
  if (now > w.until) { App.netWait = null; box.hidden = true; shade.hidden = true; Net.close(); clearSession(); w.lost(); return false; }
  box.hidden = false;
  shade.hidden = App.screen === null;   // im Menü (Neustart, Lobby): Menü sperren, bis zurück oder „Verlassen“
  $("netWaitTxt").textContent = t("net.waitFor", { name: (App.opp && App.opp.name) || t("search.opponent"), s: Math.ceil((w.until - now) / 1000) });
  return true;
}
// Nach dem Wiederverbinden noch NET_LOST − NET_DROP ms Zeit, bis etwas ankommt. Ein eingefrorener Gegner, der nur die
// Verbindung neu aufbaut, verbindet so nicht endlos neu.
function resumed() { if (App.rb && App.rb.ended) App.rb.endAt = performance.now();   // nach dem Abpfiff: wieder 30 s senden
  App.netWait = null; App.resumePending = false; App.lastRx = performance.now() - NET_DROP; App.lagWarn = true; App.dropTried = true; toast(t("net.back"), "i-check", true); }


// ---------- Sitzung über einen App-Neustart (session.js) ----------
let sessT = 0, sessSync = -1;
/**
 * Jeden Frame: Lebenszeichen jede Sekunde, Host mit Spielstand (Rollback: alle 0,25 s, damit ein Host-Neustart wenig
 * zurückdreht, aber nur, wenn der endgültige Stand weiter ist); nach dem Abpfiff Lobby (Freunde) bzw. Ende (Gegnersuche)
 */
export function sessionTick(dt) {
  if (!sessionRole()) return;
  sessT += dt;
  const fresh = App.rb && !App.rb.ended && savesState() && App.rb.peer.session.sync !== sessSync;
  if (sessT < 1 && !(fresh && sessT >= 0.25)) return;
  sessT = 0; if (App.rb) sessSync = App.rb.peer.session.sync;
  if (!afterWhistle()) touchSession(hostState());
}
// Spielstand, den der Host sichert (nicht, während er selbst auf den Gast wartet: der Stand steht dann ohnehin)
// (Rollback: auch nach dem eigenen Abpfiff, solange die Gegenseite ihn noch nicht hat, dann mit dem Endstand).
// Gegnersuche: der Gast auch, er vergleicht nach einem eigenen Neustart den Stand des Hosts damit (mmResume)
const savesState = () => App.mode === "host" || (App.mode === "guest" && !!App.mm);
const hostState = () => (savesState() && (liveOnline() || !rbRemoteDone()) && !App.netWait ? { st: rbBestState(), saves: keepSave(), ...(App.mm ? { mm: mmInfo() } : {}) } : undefined);
/** die letzten drei gesicherten endgültigen Stände mit Sitzung und Takt (Wiederaufnahme nach einem Neustart) */
function keepSave() {
  const x = rbSave(), L = App.rbSaves || (App.rbSaves = []);
  if (x && !(L.length && L[L.length - 1].ep === x.ep && L[L.length - 1].f === x.f)) { L.push(x); if (L.length > 3) L.shift(); }
  return L;
}
// Abgepfiffen: ein Neustart führt nicht zurück ins beendete Spiel (keine doppelte Wertung oder Belohnung).
// Gegnersuche: Sitzung vorbei; Freunde: zurück in dieselbe Lobby.
function afterWhistle() {
  const ended = (App.mode === "host" || App.mode === "guest") && App.st && netEnded();
  if (!ended) return false;
  // Rollback: Gegenseite hat den Abpfiff noch nicht: Sitzung (mit Endstand) behalten, damit ein Neustart ihn ihr schicken
  // kann – nur solange das Spiel noch offen ist (Lobby, „Nochmal“ beenden die Sitzung) und begrenzt (kommt sie nie, gilt
  // danach die Lobby bzw. nichts)
  if (!rbRemoteDone() && performance.now() - App.rb.endAt < 30000 + RECONNECT_MS) return false;
  if (App.mm) clearSession(); else saveSession(sessionRole(), { phase: "lobby", st: null, mid: 0 });
  return true;
}
/** Seite wird versteckt (closing false: lebt evtl. weiter) oder geschlossen: Stand sofort sichern (danach kommt evtl. nichts mehr). true: Verbindung geschlossen */
export function sessionHide(closing) {
  if (sessionRole() && !afterWhistle()) (closing ? markClosing : touchSession)(hostState());
  // Seite geht wirklich zu: Verbindung sauber beenden (ohne „bye“), damit die Gegenseite sofort aufs Zurückkommen
  // wartet und der Server den Raumcode für den Neustart gleich freigibt
  if (closing && Net.role()) { Net.close(); return true; }
  return false;
}
/**
 * Gegnersuche, Gast: stimmen die Bedingungen des Hosts? (Standardregeln, Arena aus der Spiel-ID, Level und Köpfe vom
 * Server, Spieldauer) Liefert die Bedingungen für den eigenen Anpfiff (nur Geprüftes, Seed aus der Spiel-ID, Kosmetik
 * vom Server, Namen von hier) oder null.
 */
function mmCfg(c) {
  const mm = App.mm, sv = mm.heads, lv = sv && sv.p1 ? [sv.p1.level || 1, (sv.p2 && sv.p2.level) || 1] : null;
  const rules = c.rules && typeof c.rules === "object" ? c.rules : null;
  if (!mm.match) return null;
  if (!rules || Object.keys(rules).some(k => k !== "obs" || rules[k] !== "off")) return null;
  if (c.arena !== mmArena(mm.match)) return null;
  if (c.fair !== (mm.mode === "ranked") || c.mod || c.golden !== true) return null;
  if (lv && (!Array.isArray(c.levels) || c.levels[0] !== lv[0] || c.levels[1] !== lv[1])) return null;
  // Köpfe wie beim Server angemeldet, Spieldauer nach den Standardregeln
  const hd = q => (q && typeof q.head === "string" ? q.head.replace(/^head:/, "") : null), h1 = sv && hd(sv.p1), h2 = sv && hd(sv.p2);
  if ((h1 && c.chars[0] !== h1) || (h2 && c.chars[1] !== h2)) return null;
  if (c.dur !== matchLen(rules).dur) return null;
  // nicht spielrelevant: Kosmetik wie beim Server angemeldet (wie beim Host, auch für die Emote-Plätze), Namen aus
  // „welcome“ und der eigenen Anmeldung, Ball-Skin nur als Text (unbekannte zeichnet die Anzeige als Standardball)
  const seed = seedFrom(mm.match);
  const cos = sv && sv.p1 ? [cleanCos(sv.p1.cos), cleanCos(sv.p2 && sv.p2.cos)] : [0, 1].map(i => cleanCos(Array.isArray(c.cos) && c.cos[i]));
  const names = [App.opp ? App.opp.name : t("ui.host"), S.name || t("ui.guest")];
  return { ...startCfg(c, seed), cos, names, ball: typeof c.ball === "string" ? c.ball.slice(0, 24) : undefined };
}
/** Anpfiff: Bedingungen prüfen, dann den Rollback-Startzustand selbst nachbauen und exakt vergleichen; { cfg, st } oder null */
function mmStart(d) {
  if (d.rb.keep || d.rb.ended) return null;
  const cfg = mmCfg(d.cfg);
  // Startzustand: Ball, Leisten, Zeit, Power-ups, Positionen, Zufall – alles muss genau dem Nachbau entsprechen;
  // gestartet wird mit dem eigenen Nachbau
  const st = cfg && sameStart(cfg, cfg.seed, d.rb.st);
  return st ? { cfg, st } : null;
}
/**
 * Wiederaufnahme mitten im Spiel: Bedingungen wie beim Anpfiff, und der Host schickt den Stand eines Takts (rb.from),
 * den diese Seite schon endgültig gerechnet (laufende Sitzung) oder vor dem eigenen Neustart gesichert hat
 * (App.mm.ownSaves). Er muss exakt gleich sein, gestartet wird mit dem eigenen. Sonst null (Spiel ungültig).
 */
function mmResume(d) {
  const fr = d.rb.from;
  if (d.rb.keep || d.rb.ended || !fr || typeof fr !== "object") return null;
  const cfg = mmCfg(d.cfg);
  if (!cfg) return null;
  const at = rbStateAt(fr.ep, fr.f);
  let own = at && at.st, back = at ? at.back : 0;
  const sv = Array.isArray(App.mm.ownSaves) ? App.mm.ownSaves.filter(x => x && x.ep === fr.ep && Number.isInteger(x.f)) : [];
  if (!own && !App.rb && sv.length) {
    // nach dem eigenen Neustart: höchstens REWIND_MAX hinter der jüngsten eigenen Sicherung, ohne Tor und
    // Phasenwechsel dazwischen (wie rbStateAt)
    const v = sv.find(x => x.f === fr.f), top = sv.reduce((a, x) => (x.f > a.f ? x : a));
    if (v && v.f >= top.f - REWIND_MAX && sameMoment(v.st, top.st)) { own = v.st; back = top.f - v.f; }
  }
  return own && sameState(own, d.rb.st) ? { cfg, st: netState(own), back } : null;
}
/**
 * Host, Gegnersuche: Wiederaufnahme mit einem Stand, den der Gast exakt so hat. Host neu gestartet: der jüngste
 * gesicherte, der nicht weiter ist als der endgültige Takt des Gasts; Gast neu gestartet: der eigene Stand zu einem der
 * gesicherten Takte des Gasts (nur, wenn er hier schon endgültig ist). Liefert { st, from } oder null (dann ungültig).
 */
function resumeFrom(d) {
  if (d.rb && Number.isInteger(d.rb.f) && Array.isArray(App.rbSaves)) {
    // höchstens REWIND_MAX hinter der jüngsten eigenen Sicherung, ohne Tor und Phasenwechsel dazwischen (sonst könnte
    // ein Gast mit kleinem f zurückdrehen)
    const L = App.rbSaves.filter(x => x && x.ep === d.rb.ep), top = L[L.length - 1];
    const v = top && [...L].reverse().find(x => x.f <= d.rb.f && x.f >= top.f - REWIND_MAX && sameMoment(x.st, top.st));
    if (v) return { st: v.st, from: { ep: v.ep, f: v.f }, back: top.f - v.f };
  }
  if (d.at && typeof d.at === "object" && Array.isArray(d.at.fs)) {
    const f = d.at.fs.filter(x => rbStateAt(d.at.ep, x)).sort((a, b) => b - a)[0];
    if (f !== undefined) { const at = rbStateAt(d.at.ep, f); return { st: netState(at.st), from: { ep: d.at.ep, f }, back: at.back }; }
  }
  return null;
}
/** Gegnersuche nach dem eigenen Anpfiff: Unerwartetes vom Host macht das Spiel ungültig (beide melden „desync“) */
function mmVoid() { if (App.mmVoid) App.mmVoid(); else badStart(); }
function badStart() {
  if (App.mm && App.mm.match && server.matchAbort) server.matchAbort(App.mm.match).catch(() => {});   // sonst hängt das Spiel beim Server
  if (App.mm) track("abort", { mode: App.mm.mode, reason: "void" });
  App.netWait = null; App.mm = null; App.netLost = null; App.resumePending = false; clearSession();
  Net.send({ t: "bye", reason: "badstart" }); Net.close(250);   // Grund an den Host (sonst wartet er aufs Wiederverbinden)
  showScreen("online"); netNote(t("net.badStart"), true);
}

const mmInfo = () => (App.mm ? { mode: App.mm.mode, match: App.mm.match, role: App.mm.role, opp: App.mm.opp, heads: App.mm.heads, kicked: !!App.mm.kicked, rewound: !!App.mm.rewound } : null);
/**
 * Gegnersuche: höchstens EINE Wiederaufnahme mit Zurückdrehen je Seite und Spiel (back: Takte zurück; 0 zählt nicht).
 * Jede erlaubt, bis zu REWIND_MAX Takte vor einem noch nicht gefallenen Tor neu zu spielen (ehrlich: ein Neustart).
 * Gezählt auch über einen eigenen Neustart (mmInfo). false = schon einmal (dann ungültig)
 */
function rewindOk(back) {
  if (!(back > 0)) return true;
  if (App.mm.rewound) return false;
  App.mm.rewound = true; return true;
}

/**
 * Nach einem App-Neustart: Host öffnet denselben Raum mit dem gespeicherten Stand und wartet auf den Gast.
 * h: Verbindungs-Handler (Freunde oder Gegnersuche), lost: was passiert, wenn der Gast nicht zurückkommt.
 */
export function restoreHostGame(s, h, lost) {
  App.opp = s.opp; App.netCfg = s.netCfg || App.netCfg; App.mid = s.mid; App.matchKey = s.key || ""; App.endedKey = s.endedKey || ""; App.guestCfg = s.guestCfg; App.roomCode = s.code;
  beginMatch(s.cfg, { resume: true });
  App.st = s.st; App.st.ev = []; App.t0 = s.t0 || Date.now();   // Rollback: Sitzung startet, wenn der Gast zurück ist
  App.rbSaves = Array.isArray(s.saves) ? s.saves : [];   // gesicherte Stände mit Takt (Gegnersuche: resumeFrom)
  // schon endgültig abgepfiffen (gesichert, weil der Gast den Abpfiff noch nicht hatte): beendete Sitzung, die ihm den
  // Endstand schickt und auf seine Bestätigung wartet
  if (s.st && s.st.ph === "end") { startRb({ ep: (Date.now() % 1e9) + 1, st: netState(s.st), delay: 3, ended: true }); App.rb.remoteDone = false; App.rb.endF = Infinity; }
  App.netLost = lost; App.lastRx = 0;
  saveSession("host", { ...s });
  waitFor(lost);
  Net.host(h, { code: s.code, retries: REOPEN_TRIES });
}
/** Nach einem App-Neustart: Gast tritt dem Raum wieder bei (im Spiel mit Merker und Spiel-Nr., in der Lobby als neuer Gast) */
export function restoreGuest(s, h, lost) {
  App.netTok = s.tok || ""; App.endedKey = s.endedKey || ""; App.roomCode = s.code; App.opp = s.opp || null; App.mid = s.phase === "play" ? s.mid : 0; App.resumeT0 = s.t0 || 0;
  App.joinH = h;
  saveSession("guest", { ...s });
  waitFor(lost);
  rejoin();
}
/** Freunde-Modus fortsetzen (Gegnersuche: matchmaking.js resumeMatch) */
export function resumeFriends(s) {
  if (!Net.available()) { clearSession(); return false; }
  const gone = self => {
    if (liveOnline()) track("abort", { mode: "friends", reason: "dropped" });
    if (!self) toast(t("net.resumeFailed"), "i-close"); clearSession(); if (App.mode === "host" || App.mode === "guest" || App.screen === "lobby") quitToMenu();
  };
  if (s.role === "host" && s.phase === "play") {
    restoreHostGame(s, hostHandlers(), () => { clearSession(); hostLost(); });
  } else if (s.role === "host") {
    hostGame({ code: s.code, netCfg: s.netCfg });
  } else {
    restoreGuest(s, guestHandlers(s.code), gone);
  }
  return true;
}

// ---------- Ping: beide Seiten messen jede Sekunde (Hin und zurück) ----------
export function pingTick(dt) { App.pingT += dt; if (App.pingT >= 1) { App.pingT = 0; Net.send({ t: "ping", c: performance.now() }); } }
function pong(c) {
  const rtt = performance.now() - c; if (!(rtt >= 0 && rtt < 5000)) return;
  App.rtt = rtt; App.pings.push(rtt); if (App.pings.length > 8) App.pings.shift();
  // vor dem Anpfiff ein paar Messungen sammeln (Eingabeverzögerung beim Rollback aus dem Mittel, nicht aus einer)
  if (App.pings.length < 5 && !liveOnline() && Net.isOpen()) setTimeout(() => { if (Net.isOpen()) Net.send({ t: "ping", c: performance.now() }); }, 200);
}
/** Ping-Balken im Spiel (nur online). Antippen zeigt die Millisekunden. */
export function pingHud(dt) {
  const el = $("netPing"), on = (App.mode === "host" || App.mode === "guest") && Net.isOpen() && App.pings.length > 0;
  if (el.hidden === on) el.hidden = !on;
  if (!on || (App.pingUi -= dt) > 0) return;
  App.pingUi = 0.5;
  const st = pingStats(App.pings), n = pingBars(st);
  el.dataset.bars = n; $("netPingMs").textContent = st.ms + " ms";
  el.setAttribute("aria-label", t("net.ping", { ms: st.ms }));
}

export function hostData(d) {
  // Ping/Pong beantwortet auch ein eingefrorener Tab (kommt nicht über die Spielschleife): kein Lebenszeichen
  if (d.t !== "ping" && d.t !== "pong") App.lastRx = performance.now();
  if (rbMessage(d)) return;
  switch (d.t) {
    case "hello": {
      const fresh = App.helloOpen > 0; App.helloOpen = Math.max(0, (App.helloOpen | 0) - 1);   // neue Verbindung?
      // Rückkehr nach Abbruch: nur derselbe Gast (Merker), dann Spiel mit dem vollen Stand fortsetzen
      // (auch nach dem eigenen Abpfiff, solange der Gast ihn noch nicht hat: er bekommt dann den Endstand bzw. „weiter so“)
      if ((App.netWait || liveOnline() || !rbRemoteDone()) && App.mode === "host") {
        // Wiederaufnahme nur als erste Nachricht einer neuen Verbindung oder während der Host selbst wartet (über die
        // laufende Verbindung wäre es ein Weg, beliebig oft einen alten Stand zu verlangen): sonst ignoriert
        if (!fresh && !App.netWait) break;
        if (App.opp && d.tok && d.tok === App.opp.tok && d.resume === App.mid && App.guestCfg) {
          // haben beide ihre Sitzung noch (kein Neustart), geht sie einfach weiter: unbestätigte Eingaben kommen
          // erneut, nichts Endgültiges wird zurückgenommen. Sonst neue Sitzung ab dem letzten sicheren Stand des Hosts.
          // Gegnersuche: der neue Stand muss einer sein, den der Gast exakt so hat (resumeFrom), sonst ungültig
          const keep = App.rb && d.rb && d.rb.ep === App.rb.ep, delay = App.rb ? App.rb.delay : pickDelay(App.rtt);
          const from = !keep && App.mm ? resumeFrom(d) : null;
          // Neue Stände höchstens 4 je Minute je Spiel (wie beim Gast; „weiter so“ zählt nicht). Gegnersuche: höchstens
          // eine Wiederaufnahme mit Zurückdrehen je Seite und Spiel (rewindOk), sonst ungültig
          if (!keep && !fixBudget("ask")) { if (App.mm && App.mmVoid) App.mmVoid(); break; }
          if (!keep && App.mm && ((!from && !rbEndedStart()) || (from && !rewindOk(from.back)))) { if (App.mmVoid) App.mmVoid(); break; }
          const rb = keep ? { ep: App.rb.ep, keep: true } : rbEndedStart() || (from ? rbStart(from.st, delay, from.from) : rbStart(rbBestState(), delay));
          Net.send({ t: "start", mid: App.mid, key: App.matchKey, cfg: App.guestCfg, resume: true, rb }); resumed();
        } else Net.send({ t: "full" });
        break;
      }
      App.helloOpen = 0;   // Verbindung für die Lobby: über sie keine Wiederaufnahme
      if (d.v !== VERSION) toast(t("net.oldVersionGuest"), "i-close");
      if (!App.mm) netOpened("friends");   // Gegnersuche: matchmaking.js
      App.opp = { name: String(d.name || t("ui.guest")).slice(0, 12), ch: charById(d.ch).id, lv: d.lv, cos: cleanCos(d.cos), tok: String(d.tok || "") };
      Net.send({ t: "welcome", name: S.name || t("ui.host"), ch: S.char, cos: myCos(), cfg: App.netCfg, v: VERSION });
      Net.send({ t: "ping", c: performance.now() });   // Laufzeit schon vor dem Anpfiff kennen (Eingabeverzögerung beim Rollback)
      lobbyUI("host"); A.sfx("coin"); toast(t("lobby.joined", { name: App.opp.name }), "i-users");
      break;
    }
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; if (d.lv) App.opp.lv = d.lv; if (d.cos) App.opp.cos = cleanCos(d.cos); lobbyUI("host"); } break;
    case "ping": Net.send({ t: "pong", c: d.c }); break;
    case "bye": App.netBye = true; if (d.reason && App.mmBye) App.mmBye(d.reason); break;   // Gegnersuche: Grund (ungültig, Start abgelehnt)
    case "pong": pong(d.c); break;
    case "rbok": rbOk(d); break;
    case "rematch":
      // Gast will Revanche: Hinweis bleibt auf dem Ergebnis-Bildschirm stehen (auch wenn er erst danach aufgeht)
      App.rematchWanted = true; rematchHint();
      toast(t("lobby.wantsRematch", { name: App.opp ? App.opp.name : t("ui.guest") }), "i-swap"); A.sfx("emote"); break;
  }
}

export function hostStart() {
  if (!App.opp) return;
  const c = App.netCfg;
  // Kopf-Level: Gegnersuche vom Server (zum Spielbeginn festgehalten), unter Freunden das, was jeder mitbringt
  const sv = App.mm && App.mm.heads, lv = sv && sv.p1 ? [sv.p1.level || 1, (sv.p2 && sv.p2.level) || 1] : [headLevel(S.char), Math.max(1, Math.min(HEAD_MAX_LEVEL, App.opp.lv | 0 || 1))];
  // Kosmetik: bei der Gegnersuche vom Server geprüft, unter Freunden was jeder mitbringt
  const cos = sv && sv.p1 ? [cleanCos(sv.p1.cos), cleanCos(sv.p2 && sv.p2.cos)] : [myCos(), App.opp.cos || {}];
  const cfg = { mode: "host", levels: lv, cos, chars: [S.char, App.opp.ch], arena: c.arena, dur: matchLen(c.rules).dur, rules: c.rules, mod: null, fair: !!(App.mm && App.mm.mode === "ranked"), golden: true, names: [S.name || t("ui.you"), App.opp.name], labels: [t("hud.you"), null], ball: S.ball };
  // Gegnersuche: Zufall aus der Spiel-ID (der Gast baut den Start damit nach, mmStart); sonst frei
  if (App.mm && App.mm.match) cfg.seed = seedFrom(App.mm.match);
  App.mid++;
  App.matchKey = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);   // eindeutig je Spiel (auch über Neustarts)
  const fixed = resolveObs(cfg);
  App.guestCfg = { ...fixed, mode: "guest", labels: [null, t("hud.you")] };
  beginMatch(fixed); App.dropTried = false; App.rbSaves = [];
  if (!App.mm) track("lobby", { action: "started" });
  // Rollback: beide rechnen ab genau diesem Startzustand (der Gast bekommt ihn mit)
  const rb = rbStart(App.st, pickDelay(medianPing()));
  Net.send({ t: "start", mid: App.mid, key: App.matchKey, cfg: App.guestCfg, rb });
  App.lastRx = performance.now(); App.lagWarn = false;
  if (!App.mm) App.netLost = hostLost;
  saveSession("host", { phase: "play", code: App.roomCode, mid: App.mid, key: App.matchKey, cfg: fixed, guestCfg: App.guestCfg, opp: App.opp, netCfg: App.netCfg, mm: mmInfo(), t0: App.t0, st: App.st });
}
/** Host: Rollback-Sitzung starten; liefert, was der Gast dafür braucht (Sitzungs-Nr., Startzustand, Verzögerung) */
function rbStart(st, delay, from = undefined) {
  const tp = App.testPatch; App.testPatch = null; if (tp) tp(st);   // nur Tests: Startzustand einmal vorgeben (z. B. Ball vor dem Tor)
  const ep = (Date.now() % 1e9) + 1, s0 = netState(st);
  startRb({ ep, st: s0, delay });
  return { ep, st: s0, d: delay, ...(from ? { from } : {}) };   // from: Sitzung und Takt, aus dem der Stand stammt
}
const medianPing = () => { const p = [...App.pings].sort((a, b) => a - b); return p.length ? p[p.length >> 1] : App.rtt; };

export function tryJoin(code) {
  code = String(code || $("codeIn").value).trim().toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) { netNote(t("net.codeLength"), true); return; }
  if (!Net.available()) { netNote(t("net.loading"), true); return; }
  netNote(t("net.connecting", { code: code.toUpperCase() }));
  App.roomCode = code; App.netBye = false;
  joinFresh = true;   // erster Beitritt (Statistik: beigetreten bzw. gescheitert)
  const go = () => Net.join(code, App.joinH = guestHandlers(code));
  // Wer per Link kommt, startet gerade erst: Relay-Zugangsdaten kurz abwarten (zweiter Beitritt in der Zeit gewinnt)
  if (relayReady()) go(); else { const my = ++joinGen; ensureRelay(4000).then(() => { if (my === joinGen) go(); }); }
}
let joinGen = 0, joinFresh = false;
function guestHandlers(code) {
  return {
    onConn: () => Net.send(hello()),
    onData: guestData,
    onClose: () => netDropped(guestLost),
    onError: (type, wasOk) => {
      if (wasOk) return;
      Net.close();
      // falscher Code ist kein Verbindungsproblem
      if (joinFresh && type !== "peer-unavailable") netFailed("friends");
      joinFresh = false;
      const msg = type === "peer-unavailable" ? t("net.noRoom", { code: code.toUpperCase() }) : type === "timeout" ? t("net.timeout") : t("net.failed", { type });
      if (App.screen !== "online") showScreen("online");
      netNote(msg, true);
    },
  };
}

export function guestData(d) {
  // Ping/Pong beantwortet auch ein eingefrorener Tab (kommt nicht über die Spielschleife): kein Lebenszeichen
  if (d.t !== "ping" && d.t !== "pong") App.lastRx = performance.now();
  if (rbMessage(d)) return;
  switch (d.t) {
    case "welcome":
      if (App.mm && App.mm.kicked) break;   // Gegnersuche: nur vor dem Anpfiff (mitten im Spiel unerwartet: ignoriert)
      if (d.v !== VERSION) {
        // Gegnersuche: Spiel beim Server abbrechen (noch vor dem Anpfiff), sonst hängt es dort bis zur Wartung
        if (App.mm && App.mm.match && server.matchAbort) server.matchAbort(App.mm.match).catch(() => {});
        App.netWait = null; App.mm = null; App.netLost = null; App.resumePending = false; clearSession(); Net.close(); showScreen("online"); netNote(t("net.versionMismatch"), true); break;
      }
      App.netWait = null; App.resumePending = false;   // nach einem Neustart: wieder in der Lobby
      App.opp = { name: String(d.name || t("ui.host")).slice(0, 12), ch: charById(d.ch).id, cos: cleanCos(d.cos) }; App.netCfg = d.cfg; lobbyUI("guest");
      if (joinFresh && !App.mm) { joinFresh = false; track("lobby", { action: "joined" }); netOpened("friends"); }
      if (!App.mm) saveSession("guest", { phase: "lobby", code: App.roomCode, tok: token(), opp: App.opp });
      if (!App.mm) { if (App.mode === "guest") backToLobby(); else showScreen("lobby"); }   // Gegnersuche: keine Lobby, der Host pfeift gleich an
      A.sfx("coin"); break;
    case "cfg": App.netCfg = d.cfg; lobbyUI("guest"); break;
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; if (d.cos) App.opp.cos = cleanCos(d.cos); lobbyUI("guest"); } break;
    case "full": if (App.mm && App.mm.kicked) break;   // Gegnersuche nach dem Anpfiff: ignoriert (wer nicht zurücklässt, gilt als weg)
      App.netWait = null; App.mm = null; App.netLost = null; App.resumePending = false; clearSession(); Net.close(); showScreen("online"); netNote(t("net.full"), true); break;
    case "start": {
      // Rollback-Sitzung läuft weiter (Verbindung war nur kurz weg): nichts neu anlegen
      if (d.resume && d.rb && d.rb.keep && App.mode === "guest" && App.rb && App.rb.ep === d.rb.ep && d.mid === App.mid) {
        if (App.mm) App.mm.ask = null;   // die Anfrage ist beantwortet
        App.lastRx = performance.now(); App.lagWarn = false; App.dropTried = false; resumed();
        if (App.rb.ended) Net.send({ t: "rbok", mid: App.mid });   // schon abgepfiffen: Host muss nicht mehr warten
        break;
      }
      // „weiter so“, aber die Sitzung gibt es hier nicht (mehr): neu melden, ohne Sitzung, dann schickt der Host einen Stand
      if (d.rb && d.rb.keep && !(App.mm && App.mm.kicked && !App.mm.ask)) { if (App.mm) App.mm.ask = null; Net.send(askResume()); break; }
      // Form prüfen: ein kaputter oder manipulierter Start darf den Gast nicht einfrieren (ohne Rollback-Startzustand: kein Spiel)
      const form = d.cfg && typeof d.cfg === "object" && Array.isArray(d.cfg.chars) && d.rb && d.rb.st && typeof d.rb.st === "object";
      let ok = null;
      if (!App.mm) { if (!form) break; ok = { cfg: d.cfg, st: d.rb.st }; }
      else if (!App.mm.kicked) {
        // Gegnersuche, Anpfiff: nur faire Bedingungen und genau den Startzustand, den sie ergeben (mmStart); sonst Abbruch
        // beim Server (hier noch nicht angepfiffen)
        if (!form || d.resume || !(ok = mmStart(d))) { badStart(); break; }
      } else {
        // Gegnersuche nach dem eigenen Anpfiff: nur EIN Anpfiff je Spiel. Ein neuer Stand nur als Antwort auf die eigene
        // Anfrage (askResume, eine je Anfrage), für dasselbe Spiel, passend zum eigenen Stand (mmResume) und selten
        // (fixBudget), und nur, solange die Verbindung hier weg war (netWait; über eine laufende Verbindung gibt es
        // keinen Grund für einen neuen Stand). Alles andere (neuer Anpfiff, kaputter Start, Stand ohne Anfrage): ungültig
        const ask = App.mm.ask; App.mm.ask = null;
        if (!form || !d.resume || !App.netWait || d.mid !== App.mid || !ask || ask.mid !== App.mid || performance.now() - ask.at > 60000 || !(ok = mmResume(d)) || !rewindOk(ok.back) || !fixBudget()) { mmVoid(); break; }
      }
      const cfg = ok.cfg;
      if (App.mm) App.mm.kicked = true;
      if (!d.resume) App.rbSaves = [];   // neues Spiel: alte Sicherungen gelten nicht
      App.matchKey = typeof d.key === "string" ? d.key.slice(0, 24) : "";
      App.mid = d.mid; App.pings = []; beginMatch({ ...cfg, mode: "guest", labels: [null, t("hud.you")] }, { resume: !!d.resume });
      // vom Host vorgegebener Startzustand und Verzögerung
      startRb({ ep: d.rb.ep, st: ok.st, delay: clamp(d.rb.d | 0, 0, 8), ended: d.rb.ended === true });
      if (d.rb.ended === true) Net.send({ t: "rbok", mid: d.mid });   // Endstand angekommen: der Host muss nicht weiter warten
      App.lastRx = performance.now(); App.lagWarn = false; App.dropTried = false; if (!App.mm) App.netLost = guestLost;
      if (d.resume) { resumed(); if (App.resumeT0) App.t0 = App.resumeT0; }
      App.resumeT0 = 0;
      saveSession("guest", { phase: "play", code: App.roomCode, tok: token(), mid: App.mid, opp: App.opp, mm: mmInfo(), t0: App.t0, st: App.mm ? rbBestState() : null });
      break;
    }
    case "lobby": if (!App.mm) backToLobby(); break;
    case "ping": Net.send({ t: "pong", c: d.c }); break;
    case "pong": pong(d.c); break;
    case "bye": App.netBye = true; if (d.reason && App.mmBye) App.mmBye(d.reason); break;   // Gegnersuche: Grund (ungültig, Start abgelehnt)
    case "rbok": rbOk(d); break;
  }
}
/** Gegenseite hat endgültig abgepfiffen (Rollback): hier muss niemand mehr auf sie warten */
function rbOk(d) { if (App.rb && App.rb.ended && d.mid === App.mid) App.rb.remoteDone = true; }

export function backToLobby() {
  settlePending();
  matchEnded(false);   // abgepfiffen: schon gemeldet
  stopRb();
  if (sessionRole() && !App.mm) saveSession(sessionRole(), { phase: "lobby", st: null, mid: 0 });   // nach einem Neustart: Lobby, nicht das alte Spiel
  document.body.classList.remove("ingame");
  $("gameBtns").hidden = true;
  A.crowdOff();
  const role = Net.role();
  startDemo(); updateBand();
  lobbyUI(role === "host" ? "host" : "guest");
  App.stack = ["home"];
  showScreen("lobby");
}

export function sendNetCfg() { Net.send({ t: "cfg", cfg: App.netCfg }); lobbyUI(Net.role() === "host" ? "host" : "guest"); }
