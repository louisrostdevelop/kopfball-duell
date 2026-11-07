// Online-Spiel: Host schickt Zustände, Gast sagt voraus und gleicht ab; Lobby-Protokoll
import { charById, clamp, EMOTES, HEAD_MAX_LEVEL } from "../content/config.js";
import { moveObstacles } from "../content/layouts.js";
import { emote, matchLen, predictPlayer } from "../core/physics.js";
import { owns, S } from "./profile.js";
import { onEvent } from "./effects.js";
import { beginMatch, EMOTE_GAP, headLevel, quitToMenu, resolveObs, startDemo, updateBand } from "./game.js";
import { cleanCos, myCos, validEmote } from "./cosmetics.js";
import { App, inGame, VERSION } from "./state.js";
import { $, toast } from "../ui/dom.js";
import { showScreen } from "../ui/nav.js";
import { lobbyUI, makeQR, netNote, saveName } from "../ui/screens/online.js";
import { audio as A, input as I, net as Net } from "./services.js";
import { decodeState, encodeState, makeClock, pingBars, pingStats } from "./netcode.js";
import { t } from "../content/i18n.js";
import { clearSession, markClosing, saveSession, sessionRole, touchSession } from "./session.js";
import { settlePending } from "./results.js";
import { netState, pickDelay, rbBestState, rbEndedStart, rbMessage, rbRemoteDone, rollbackWanted, startRb, stopRb } from "./rbnet.js";

// Zustände/Eingaben über den schnellen Kanal (falls der Adapter einen hat)
const fast = m => (Net.sendFast ? Net.sendFast(m) : Net.send(m));

export function packState(st) {
  const r = v => Math.round(v * 10) / 10;
  const P = p => ({ x: r(p.x), y: r(p.y), vx: r(p.vx), vy: r(p.vy), kick: r(p.kick * 100) / 100, kHeld: p.kHeld, charge: r(p.charge), sc: r(p.sc * 100) / 100, frz: r(p.frz), stun: r(p.stun), meter: Math.round(p.meter), full: p.full, armed: r(p.armed), fireNext: p.fireNext, bigT: r(p.bigT), miniT: r(p.miniT), spdT: r(p.spdT), jmpT: r(p.jmpT), mood: p.mood, emo: p.emo, emoT: r(p.emoT), land: r(p.land), onG: p.onG, confT: r(p.confT), djT: r(p.djT), slide: r(p.slide * 100) / 100, slideDir: p.slideDir, bomb: p.bomb, tripCD: r(p.tripCD) });
  const b = st.b;
  return {
    s: st.s, t: r(st.t), el: Math.round(st.el * 1000) / 1000, ph: st.ph, pt: r(st.pt), gold: st.gold, wall: st.wall.map(r), bigGoal: st.bigGoal.map(r), wind: { t: r(st.wind.t), dir: st.wind.dir },
    pu: st.pu.map(u => ({ id: u.id, k: u.k, x: r(u.x), y: r(u.y), t: r(u.t) })),
    b: { x: r(b.x), y: r(b.y), vx: r(b.vx), vy: r(b.vy), r: r(b.r), a: r(b.a), pw: r(b.pw || 0), fx: b.fx, fxT: r(b.fxT), fxK: b.fxK, fxBX: r(b.fxBX), fxBY: r(b.fxBY), fxDX: r(b.fxDX), fxDY: r(b.fxDY), fxTX: r(b.fxTX || 0), fxTY: r(b.fxTY || 0), alpha: r(b.alpha), fxP: b.fxP },
    p: st.p.map(P), stats: st.stats,
  };
}

// Host: 30-mal pro Sekunde kompakter Zustand (schneller Kanal). Ereignisse und Statistik zuverlässig, nur wenn neu.
let netSeq = 0, lastStats = "";
export function hostSend(dt) {
  if (!Net.isOpen()) return;
  // feste 30 Hz: Rest behalten statt auf 0 setzen, sonst wechseln die Abstände zwischen 33 und 50 ms (bei 60 Hz
  // Bildrate) und der Gast muss mit mehr Puffer zeichnen oder ruckelt
  App.sendT += dt;
  if (App.sendT < 1 / 30) return;
  App.sendT = Math.min(App.sendT - 1 / 30, 1 / 30);
  fast({ t: "s", mid: App.mid, ...encodeState(App.st, ++netSeq, performance.now()) });
  pingTick(1 / 30);
  const ev = App.outEv.splice(0).filter(e => e.t !== "bounce" || e.v > 400);
  if (ev.length) Net.send({ t: "ev", mid: App.mid, ht: performance.now(), ev });
  const sj = JSON.stringify(App.st.stats);
  if (sj !== lastStats) { lastStats = sj; Net.send({ t: "stats", mid: App.mid, stats: App.st.stats }); }
}

export function guestFrame(dt, now) {
  const st = App.st;
  const me = I.getInput(1, "single");
  App.gEdge = App.gEdge || { j: 0, d: 0, lj: false, ld: false };
  const ge = App.gEdge; if (me.j && !ge.lj) ge.j++; if (me.d && !ge.ld) ge.d++; ge.lj = !!me.j; ge.ld = !!me.d;
  const iv = [me.l, me.r, me.j, me.k, me.s, me.d].map(v => (v ? 1 : 0)).concat([ge.j % 1000, ge.d % 1000]), key = iv.join(",");
  // Eingaben: sofort bei Änderung, danach noch dreimal im 33-ms-Takt (falls eins verloren geht), sonst alle 100 ms.
  // Zähler für Sprung/Bombe stecken mit drin: auch ein verlorenes Paket verschluckt keinen Druck.
  App.inT += dt;
  if (key !== App.lastIn) { App.lastIn = key; App.inRep = 3; App.inT = 0; fast({ t: "i", q: ++App.inSeq, i: iv }); }
  else if ((App.inRep > 0 && App.inT >= 0.033) || App.inT >= 0.1) { App.inRep = Math.max(0, App.inRep - 1); App.inT = 0; fast({ t: "i", q: ++App.inSeq, i: iv }); }
  pingTick(dt);
  // Zeichnen knapp hinter dem Host: Zeitachse = Sendezeit des Hosts, Puffer passt sich dem Netz an (netcode.js)
  const S2 = App.snaps;
  if (!S2.length) { flushEvents(null); return; }
  const rt = App.clock.renderTime(now);
  flushEvents(rt);
  while (S2.length > 2 && S2[1].ht <= rt) S2.shift();
  const a = S2[0], b = S2[1] || S2[0];
  if (rt > S2[S2.length - 1].ht + 4) App.clock.starved();
  const k = b === a ? 1 : clamp((rt - a.ht) / (b.ht - a.ht), 0, 1.3);
  applySnap(st, a.s, b.s, k);
  const sp = b.s.p[1];
  if (!App.gp) App.gp = Object.assign({}, st.p[1]);
  const gp = App.gp;
  ["sc", "frz", "stun", "bigT", "miniT", "spdT", "jmpT", "armed", "confT", "djT", "tripCD"].forEach(f => gp[f] = sp[f]);
  if (st.obs && st.obs.length) moveObstacles(st.obs, st.el, dt);
  if (gp.bomb && !sp.bomb && sp.vy < 0) { gp.bomb = 0; gp.bombLock = true; gp.vy = sp.vy; gp.y = sp.y; gp.onG = false; }
  if (gp.slide > 0 && !(sp.slide > 0) && Math.abs(sp.vx) < Math.abs(gp.vx) * 0.7) { gp.slide = 0; gp.slideCD = 0.5; gp.vx = sp.vx; }
  if (sp.stun > 0 && gp.slide > 0) gp.slide = 0;
  predictPlayer(st, gp, me, dt);
  const lat = Math.min(0.3, App.rtt / 2000 + App.clock.delay() / 1000);   // so weit liegt der gezeichnete Host-Stand zurück
  const tx = sp.x + sp.vx * lat, ty = sp.y + sp.vy * lat * 0.5;
  const ex = tx - gp.x, ey = ty - gp.y;
  if (Math.abs(ex) > 140 || Math.abs(ey) > 160 || st.ph !== "play") { gp.x += ex * 0.35; gp.y += ey * 0.35; }
  else { gp.x += ex * 0.08; gp.y += ey * (gp.onG && sp.onG ? 0.3 : 0.06); }
  Object.assign(st.p[1], { x: gp.x, y: gp.y, kick: Math.max(gp.kick, sp.kick), kHeld: gp.kHeld, charge: gp.charge, onG: gp.onG, slide: gp.slide, slideDir: gp.slideDir, bomb: gp.bomb, vx: gp.vx, vy: gp.vy });
}

/** Ergebnis-Bildschirm beim Host: Gast hat Revanche angefragt */
export function rematchHint() {
  if (App.mode !== "host" || !App.rematchWanted || App.screen !== "end") return;
  $("endNote").textContent = t("end.rematchWanted", { name: App.opp ? App.opp.name : t("ui.guest") });
  $("btnEndAgain").classList.add("wants");
}
// quiet: veraltet (Tab war im Hintergrund): nur noch die Wiederholung merken, keine Töne und Effekte an alten Stellen
function playEvents(ev, quiet = false) { ev.forEach(e => { if (e.t === "goal") App.replay = quiet ? null : App.rec.slice(-160); if (!quiet) onEvent(e, true); }); }
function flushEvents(rt) {
  const q = App.evQ || [];
  const n = rt === null ? q.length : q.findIndex(x => x.ht > rt);
  q.splice(0, n < 0 ? q.length : n).forEach(x => playEvents(x.ev, rt !== null && x.ht < rt - 300));
}

export function applySnap(st, a, b, k) {
  const L = (x, y) => x + (y - x) * k;
  if (b.el !== undefined) { const ne = a.el !== undefined && Math.abs(b.el - a.el) < 1 ? L(a.el, b.el) : b.el; if (ne > st.el || ne < st.el - 2) st.el = ne; }
  // Phasen-Zeit gleitend (steuert z. B. die Wiederholung), sonst springt sie im 30-Hz-Takt
  st.s = b.s; st.t = b.t; st.ph = b.ph; st.pt = a.ph === b.ph && a.pt !== undefined ? L(a.pt, b.pt) : b.pt; st.gold = b.gold; st.wall = b.wall; st.bigGoal = b.bigGoal; if (b.wind) st.wind = b.wind; st.pu = b.pu;
  if (b.stats) st.stats = b.stats;
  const jump = Math.hypot(a.b.x - b.b.x, a.b.y - b.b.y) > 200;
  Object.assign(st.b, b.b);
  if (!jump) { st.b.x = L(a.b.x, b.b.x); st.b.y = L(a.b.y, b.b.y); st.b.a = L(a.b.a, b.b.a); }
  [0, 1].forEach(i => { const pa = a.p[i], pb = b.p[i], p = st.p[i]; Object.assign(p, pb); if (Math.hypot(pa.x - pb.x, pa.y - pb.y) < 200) { p.x = L(pa.x, pb.x); p.y = L(pa.y, pb.y); } });
}

/** Raum öffnen. resume: { code, netCfg } = nach einem App-Neustart denselben Raum wieder öffnen (der Link bleibt gültig) */
export function hostGame(resume = null) {
  if (!Net.available()) { netNote(t("net.unavailable"), true); return; }
  if (!resume) saveName($("nameIn").value);
  App.opp = null;
  App.netCfg = resume && resume.netCfg ? resume.netCfg : { arena: owns("arenas", S.arena) ? S.arena : "stadion", rules: { ...S.rules } };
  $("lobbyCode").textContent = "····"; $("lobbyLink").textContent = ""; $("qrBox").innerHTML = "";
  lobbyUI("host");
  $("lobbyNote").textContent = t("lobby.opening");
  showScreen("lobby");
  setTimeout(() => { if (App.screen === "lobby" && $("lobbyCode").textContent === "····") $("lobbyNote").textContent = t("lobby.noServer"); }, 9000);
  Net.host(hostHandlers(), resume ? { code: resume.code, retries: REOPEN_TRIES } : undefined);
}
/** Neue Verbindung, während die alte noch als offen gilt: nur derselbe Gast (Merker), z. B. nach seinem App-Neustart */
export const knock = d => !!(d && d.t === "hello" && App.opp && d.tok && d.tok === App.opp.tok);
function hostHandlers() {
  return {
    onKnock: knock,
    onReady: code => {
      App.roomCode = code;
      if (!liveOnline()) saveSession("host", { phase: "lobby", code, netCfg: App.netCfg, st: null });   // nach Neustart im Spiel: Sitzung bleibt „Spiel“
      const link = location.origin + location.pathname + "?join=" + code.toUpperCase();
      $("lobbyCode").textContent = code.toUpperCase(); $("lobbyLink").textContent = link;
      $("lobbyNote").textContent = t("lobby.sendLink");
      makeQR(link);
    },
    onConn: () => { $("lobbyNote").textContent = t("lobby.connected"); },
    onData: hostData,
    onClose: () => netDropped(hostLost),
    onError: type => { $("lobbyNote").textContent = t("net.roomFailed", { type }) + " " + t("ui.tryAgain"); },
  };
}

function hostLost() {
  App.opp = null;
  if (inGame() || App.screen === "end" || App.screen === "pause") { toast(t("net.oppLost")); backToLobby(); }
  lobbyUI("host"); $("lobbyNote").textContent = t("lobby.oppGone");
  // Warten aufgegeben oder abgelaufen (Raum dabei geschlossen): derselbe Code bleibt gültig, Einladungen und ein spät
  // zurückkehrender Gast landen in dieser Lobby
  if (!Net.role() && App.roomCode && App.screen === "lobby") Net.host(hostHandlers(), { code: App.roomCode, retries: REOPEN_TRIES });
}
function guestLost() { if (App.mode === "guest" || App.screen === "lobby" || App.screen === "end") { toast(t("net.hostLeft")); quitToMenu(); } }

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
// wieder bei und weist sich mit seinem Sitzungs-Merker aus, der Host schickt den Start erneut, die Zustände holen den
// Rest nach. Kommt keiner zurück, gilt der bisherige Abbruch (lost).
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
function rejoin() {
  if (!App.netWait || !App.roomCode || !App.joinH) return;
  const h = App.joinH;
  Net.join(App.roomCode, { ...h,
    // mid 0 = Lobby: Host nimmt als neuen Gast an. rb: eigene Rollback-Sitzung, die der Host ohne Neustart fortsetzt
    onConn: () => Net.send(hello({ resume: App.mid, ...(App.mm ? { lv: 1 } : {}), ...(App.rb ? { rb: { ep: App.rb.ep } } : {}) })),
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
  const fresh = App.rb && !App.rb.ended && App.mode === "host" && App.rb.peer.session.sync !== sessSync;
  if (sessT < 1 && !(fresh && sessT >= 0.25)) return;
  sessT = 0; if (App.rb) sessSync = App.rb.peer.session.sync;
  if (!afterWhistle()) touchSession(hostState());
}
// Spielstand, den der Host sichert (nicht, während er selbst auf den Gast wartet: der Stand steht dann ohnehin)
// (Rollback: auch nach dem eigenen Abpfiff, solange die Gegenseite ihn noch nicht hat, dann mit dem Endstand)
const hostState = () => (App.mode === "host" && (liveOnline() || !rbRemoteDone()) && !App.netWait ? { st: rbBestState() } : undefined);
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
const mmInfo = () => (App.mm ? { mode: App.mm.mode, match: App.mm.match, role: App.mm.role, opp: App.mm.opp, heads: App.mm.heads } : null);

/**
 * Nach einem App-Neustart: Host öffnet denselben Raum mit dem gespeicherten Stand und wartet auf den Gast.
 * h: Verbindungs-Handler (Freunde oder Gegnersuche), lost: was passiert, wenn der Gast nicht zurückkommt.
 */
export function restoreHostGame(s, h, lost) {
  App.opp = s.opp; App.netCfg = s.netCfg || App.netCfg; App.mid = s.mid; App.matchKey = s.key || ""; App.endedKey = s.endedKey || ""; App.guestCfg = s.guestCfg; App.roomCode = s.code;
  beginMatch(s.cfg);
  App.st = s.st; App.st.ev = []; App.t0 = s.t0 || Date.now(); App.rbOn = !!s.rb;   // Rollback: Sitzung startet, wenn der Gast zurück ist
  // schon endgültig abgepfiffen (gesichert, weil der Gast den Abpfiff noch nicht hatte): beendete Sitzung, die ihm den
  // Endstand schickt und auf seine Bestätigung wartet
  if (s.rb && s.st && s.st.ph === "end") { startRb({ ep: (Date.now() % 1e9) + 1, st: netState(s.st), delay: 3, ended: true }); App.rb.remoteDone = false; App.rb.endF = Infinity; }
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
  const gone = self => { if (!self) toast(t("net.resumeFailed"), "i-close"); clearSession(); if (App.mode === "host" || App.mode === "guest" || App.screen === "lobby") quitToMenu(); };
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
    case "hello":
      // Rückkehr nach Abbruch: nur derselbe Gast (Merker), dann Spiel mit dem vollen Stand fortsetzen
      // (auch nach dem eigenen Abpfiff, solange der Gast ihn noch nicht hat: er bekommt dann den Endstand bzw. „weiter so“)
      if ((App.netWait || liveOnline() || !rbRemoteDone()) && App.mode === "host") {
        if (App.opp && d.tok && d.tok === App.opp.tok && d.resume === App.mid && App.guestCfg) {
          lastStats = ""; App.inSeqSeen = -1; App.guestIn = [0, 0, 0, 0, 0, 0, 0, 0];
          App.gPend = { j: 0, d: 0 };   // Druck-Zähler des Gastes neu übernehmen (nach seinem Neustart beginnt er bei 0), kein Geistersprung
          App.outEv = [];   // Ereignisse von vor dem Abriss nicht verspätet laut nachschicken
          // Rollback: haben beide ihre Sitzung noch (kein Neustart), geht sie einfach weiter: unbestätigte Eingaben kommen
          // erneut, nichts Endgültiges wird zurückgenommen. Sonst neue Sitzung ab dem letzten sicheren Stand des Hosts.
          const keep = App.rbOn && App.rb && d.rb && d.rb.ep === App.rb.ep;
          const rb = !App.rbOn ? undefined : keep ? { ep: App.rb.ep, keep: true } : rbEndedStart() || rbStart(rbBestState(), App.rb ? App.rb.delay : pickDelay(App.rtt));
          Net.send({ t: "start", mid: App.mid, key: App.matchKey, cfg: App.guestCfg, resume: true, rb }); resumed();
        } else Net.send({ t: "full" });
        break;
      }
      if (d.v !== VERSION) toast(t("net.oldVersionGuest"), "i-close");
      App.opp = { name: (d.name || t("ui.guest")).slice(0, 12), ch: charById(d.ch).id, lv: d.lv, cos: cleanCos(d.cos), tok: String(d.tok || "") }; App.inSeqSeen = -1;
      Net.send({ t: "welcome", name: S.name || t("ui.host"), ch: S.char, cos: myCos(), cfg: App.netCfg, v: VERSION });
      Net.send({ t: "ping", c: performance.now() });   // Laufzeit schon vor dem Anpfiff kennen (Eingabeverzögerung beim Rollback)
      lobbyUI("host"); A.sfx("coin"); toast(t("lobby.joined", { name: App.opp.name }), "i-users");
      break;
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; if (d.lv) App.opp.lv = d.lv; if (d.cos) App.opp.cos = cleanCos(d.cos); lobbyUI("host"); } break;
    case "i":
      if (!Array.isArray(d.i)) break;
      if (typeof d.q === "number") { if (d.q <= App.inSeqSeen) break; App.inSeqSeen = d.q; }   // ungeordnet: ältere verwerfen
      App.guestIn = d.i.slice(0, 8); App.guestInAt = performance.now(); break;
    case "emo": {
      // Gegner-Emote: gültig, aus seinen Plätzen, höchstens eins alle 3 Sekunden
      const now = performance.now() / 1000, slots = (App.cfg && App.cfg.cos && App.cfg.cos[1] && App.cfg.cos[1].emotes) || EMOTES;
      if (App.mode === "host" && App.st && !App.rb && validEmote(d.e) && (slots.includes(d.e) || EMOTES.includes(d.e)) && now - (App.oppEmoT || 0) >= EMOTE_GAP - 0.2) { App.oppEmoT = now; emote(App.st, 1, d.e); }
      break;
    }
    case "ping": Net.send({ t: "pong", c: d.c }); break;
    case "bye": App.netBye = true; break;
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
  App.mid++;
  App.matchKey = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);   // eindeutig je Spiel (auch über Neustarts)
  const fixed = resolveObs(cfg);
  App.guestCfg = { ...fixed, mode: "guest", labels: [null, t("hud.you")] };
  beginMatch(fixed); App.dropTried = false;
  // Rollback: beide rechnen ab genau diesem Startzustand (der Gast bekommt ihn mit), sonst rechnet nur der Host
  App.rbOn = rollbackWanted();
  const rb = App.rbOn ? rbStart(App.st, pickDelay(medianPing())) : undefined;
  Net.send({ t: "start", mid: App.mid, key: App.matchKey, cfg: App.guestCfg, rb });
  App.lastRx = performance.now(); App.guestInAt = App.lastRx; App.lagWarn = false;
  if (!App.mm) App.netLost = hostLost;
  saveSession("host", { phase: "play", code: App.roomCode, mid: App.mid, key: App.matchKey, cfg: fixed, guestCfg: App.guestCfg, opp: App.opp, netCfg: App.netCfg, mm: mmInfo(), t0: App.t0, st: App.st, rb: App.rbOn });
}
/** Host: Rollback-Sitzung starten; liefert, was der Gast dafür braucht (Sitzungs-Nr., Startzustand, Verzögerung) */
function rbStart(st, delay) {
  const tp = App.testPatch; App.testPatch = null; if (tp) tp(st);   // nur Tests: Startzustand einmal vorgeben (z. B. Ball vor dem Tor)
  const ep = (Date.now() % 1e9) + 1, s0 = netState(st);
  startRb({ ep, st: s0, delay });
  return { ep, st: s0, d: delay };
}
const medianPing = () => { const p = [...App.pings].sort((a, b) => a - b); return p.length ? p[p.length >> 1] : App.rtt; };

export function tryJoin(code) {
  code = String(code || $("codeIn").value).trim().toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) { netNote(t("net.codeLength"), true); return; }
  if (!Net.available()) { netNote(t("net.loading"), true); return; }
  saveName($("nameIn").value);
  netNote(t("net.connecting", { code: code.toUpperCase() }));
  App.roomCode = code;
  Net.join(code, App.joinH = guestHandlers(code));
}
function guestHandlers(code) {
  return {
    onConn: () => Net.send(hello()),
    onData: guestData,
    onClose: () => netDropped(guestLost),
    onError: (type, wasOk) => {
      if (wasOk) return;
      Net.close();
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
      if (d.v !== VERSION) { App.netWait = null; App.mm = null; App.netLost = null; App.resumePending = false; clearSession(); Net.close(); showScreen("online"); netNote(t("net.versionMismatch"), true); break; }
      App.netWait = null; App.resumePending = false;   // nach einem Neustart: wieder in der Lobby
      App.opp = { name: (d.name || t("ui.host")).slice(0, 12), ch: charById(d.ch).id, cos: cleanCos(d.cos) }; App.netCfg = d.cfg; lobbyUI("guest");
      if (!App.mm) saveSession("guest", { phase: "lobby", code: App.roomCode, tok: token(), opp: App.opp });
      if (!App.mm) { if (App.mode === "guest") backToLobby(); else showScreen("lobby"); }   // Gegnersuche: keine Lobby, der Host pfeift gleich an
      A.sfx("coin"); break;
    case "cfg": App.netCfg = d.cfg; lobbyUI("guest"); break;
    case "pick": if (App.opp) { App.opp.ch = charById(d.ch).id; if (d.cos) App.opp.cos = cleanCos(d.cos); lobbyUI("guest"); } break;
    case "full": App.netWait = null; App.mm = null; App.netLost = null; App.resumePending = false; clearSession(); Net.close(); showScreen("online"); netNote(t("net.full"), true); break;
    case "start":
      // Rollback-Sitzung läuft weiter (Verbindung war nur kurz weg): nichts neu anlegen
      if (d.resume && d.rb && d.rb.keep && App.mode === "guest" && App.rb && App.rb.ep === d.rb.ep && d.mid === App.mid) {
        App.lastRx = performance.now(); App.lagWarn = false; App.dropTried = false; resumed();
        if (App.rb.ended) Net.send({ t: "rbok", mid: App.mid });   // schon abgepfiffen: Host muss nicht mehr warten
        break;
      }
      // „weiter so“, aber die Sitzung gibt es hier nicht (mehr): neu melden, ohne Sitzung, dann schickt der Host einen Stand
      if (d.rb && d.rb.keep) { Net.send(hello({ resume: App.mid, ...(App.mm ? { lv: 1 } : {}) })); break; }
      // Wiederaufnahme: Ereignisse von vor dem Abriss sind inzwischen Sekunden alt und fallen bewusst weg (Ton und Jubel
      // zum falschen Zeitpunkt wären schlimmer), der Spielstand kommt mit dem nächsten Zustand
      App.matchKey = typeof d.key === "string" ? d.key.slice(0, 24) : "";
      App.gEdge = null;   // Druck-Zähler neu ab 0 (der Host übernimmt beim Anpfiff/Zurückkommen den ersten Wert als Grundstand)
      App.mid = d.mid; App.pings = []; beginMatch({ ...d.cfg, mode: "guest", labels: [null, t("hud.you")] }); App.lastSeq = -1; App.clock = makeClock();
      // Rollback: vom Host vorgegebener Startzustand und Verzögerung; ohne rb das alte Verfahren (Host rechnet)
      if (d.rb && d.rb.st && typeof d.rb.st === "object") {
        startRb({ ep: d.rb.ep, st: d.rb.st, delay: clamp(d.rb.d | 0, 0, 8), ended: d.rb.ended === true });
        if (d.rb.ended === true) Net.send({ t: "rbok", mid: d.mid });   // Endstand angekommen: der Host muss nicht weiter warten
      }
      else { stopRb(); App.st.ph = "cd"; }
      App.lastRx = performance.now(); App.lagWarn = false; App.dropTried = false; if (!App.mm) App.netLost = guestLost;
      if (d.resume) { resumed(); if (App.resumeT0) App.t0 = App.resumeT0; }
      App.resumeT0 = 0;
      saveSession("guest", { phase: "play", code: App.roomCode, tok: token(), mid: App.mid, opp: App.opp, mm: mmInfo(), t0: App.t0 });
      break;
    case "s": {
      if (App.mode !== "guest" || d.mid !== App.mid) break; // alte Pakete vom letzten Spiel ignorieren
      if (d.q <= App.lastSeq) break;                        // ungeordneter Kanal: ältere als das neueste verwerfen
      App.lastSeq = d.q;
      const s = decodeState(d), now = performance.now();
      App.clock.arrive(s.ht, now);
      App.snaps.push({ ht: s.ht, s });
      if (App.snaps.length > 20) App.snaps.shift();
      break;
    }
    case "ev":
      if (App.mode !== "guest" || d.mid !== App.mid || !Array.isArray(d.ev)) break;
      // Ereignisse erst zeigen, wenn das gezeichnete Bild so weit ist (der Gast zeichnet etwas hinter dem Host):
      // sonst explodiert das Tor, bevor der Ball drin ist, und die Wiederholung endet zu früh
      if (typeof d.ht === "number" && App.clock) (App.evQ ||= []).push({ ht: d.ht, ev: d.ev });
      else playEvents(d.ev);
      break;
    case "stats": if (App.mode === "guest" && d.mid === App.mid && App.st) App.st.stats = d.stats; break;
    case "lobby": if (!App.mm) backToLobby(); break;
    case "ping": Net.send({ t: "pong", c: d.c }); break;
    case "pong": pong(d.c); break;
    case "bye": App.netBye = true; break;
    case "rbok": rbOk(d); break;
  }
}
/** Gegenseite hat endgültig abgepfiffen (Rollback): hier muss niemand mehr auf sie warten */
function rbOk(d) { if (App.rb && App.rb.ended && d.mid === App.mid) App.rb.remoteDone = true; }

export function backToLobby() {
  settlePending();
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
