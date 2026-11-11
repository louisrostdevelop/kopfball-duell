// Online über die Warteschlange (Casual ohne Wertung, Ranked mit Wertung). Der Server paart die Spieler,
// verbunden wird wie beim Freunde-Modus direkt per PeerJS: der Server bestimmt, wer Host ist, der Raumname
// kommt aus der Spiel-ID. Am Ende melden beide das Ergebnis; zählt nur, wenn beide dasselbe melden.
import { S } from "./profile.js";
import { myCos } from "./cosmetics.js";
import { applyState } from "./account.js";
import { quitToMenu } from "./game.js";
import { rbBestState } from "./rbnet.js";
import { settlePending } from "./results.js";
import { connOpened, hello, netEnded, hostData, guestData, hostStart, knock, netDropped, restoreGuest, restoreHostGame } from "./online.js";
import { clearSession } from "./session.js";
import { mmArena } from "../core/rbstart.js";
import { NET_CHECK, netTooBad, pingStats } from "./netcode.js";
import { App, inGame, VERSION } from "./state.js";
import { toast } from "../ui/dom.js";
import { showScreen } from "../ui/nav.js";
import { searchActivity, searchUI } from "../ui/screens/search.js";
import { activity } from "./activity.js";
import { net as Net, server } from "./services.js";
import { ensureRelay } from "./relay.js";
import { t } from "../content/i18n.js";
import { netFailed, netOpened, track } from "./track.js";

const POLL_MS = 2000, CONNECT_MS = 25000;
// wie auf dem Server (game.config: casual_min_level, ranked_min_level)
export const MIN_LEVEL = { casual: 2, ranked: 5 };
export const LEAGUES = [[2000, "legend"], [1700, "diamond"], [1450, "platinum"], [1250, "gold"], [1100, "silver"], [0, "bronze"]];
export const league = mmr => t("league." + LEAGUES.find(([m]) => mmr >= m)[1]);

const ERR = {
  account_required: 1, level_required: 1, no_season: 1, head_not_owned: 1, rate_limited: 1, offline: 1, cooldown: 1,
};
export const errText = e => t(e && ERR[e.code] ? "err.mm." + e.code : "err.tryAgain");

let timer = null, gen = 0;
const stop = () => { clearTimeout(timer); timer = null; gen++; };
const $hideCpu = () => { const b = document.getElementById("srCpu"); if (b) b.hidden = true; const o = document.getElementById("srOpp"); if (o) o.textContent = ""; };

/** Suche starten. Wirft bei Fehlern (z. B. Ranked ohne Konto) eine Meldung für die Oberfläche. */
let joining = false;
export async function findMatch(mode) {
  if (joining) return;   // Doppeltipp: nur eine Anmeldung
  stop(); Net.close(); App.netBye = false;
  const mine = gen;
  joining = true;
  // Relay-Zugangsdaten vor der Suche: nach dem Paaren wird sofort verbunden
  try { await ensureRelay(); await server.queueJoin(mode, "head:" + S.char, myCos(), VERSION); } finally { joining = false; }
  // während der Anmeldung abgebrochen (oder neu gestartet): wieder austragen statt weiterzusuchen
  if (mine !== gen) { server.queueLeave().catch(() => {}); return; }
  App.mm = { mode, state: "search", t0: Date.now() };
  track("search_start", { mode });
  searchUI(App.mm); showScreen("search");
  $hideCpu();
  activity(0).then(searchActivity);
  const my = gen;
  const tick = async () => {
    if (my !== gen) return;
    try {
      const r = await server.queuePoll();
      if (my !== gen) return;
      if (r.matched) return matched(r);
      searchUI(App.mm);
      activity(10000).then(searchActivity);   // Zahlen für den Hinweis: alle 10 s genügt (die Paarung fragt alle 2 s)
    } catch (e) {
      if (my !== gen) return;
      if (e.code === "not_queued") { await server.queueJoin(mode, "head:" + S.char, myCos(), VERSION).catch(() => {}); }
    }
    timer = setTimeout(tick, POLL_MS);
  };
  timer = setTimeout(tick, 600);
}

export async function cancelSearch() {
  const was = App.mm; stop(); App.mm = null; Net.close();
  if (was && was.state === "search") { searchEnd(was, "cancel"); await server.queueLeave().catch(() => {}); }
}

const roomOf = match => "m" + match.replace(/-/g, "").slice(0, 20);
const searchEnd = (mm, outcome) => track("search_end", { mode: mm.mode, outcome, wait_s: Math.min(3600, Math.max(0, Math.round((Date.now() - (mm.t0 || Date.now())) / 1000))) });

function matched(r) {
  const mm = App.mm;
  searchEnd(mm, "matched");
  Object.assign(mm, { state: "connect", match: r.match, role: r.role, opp: r.opponent || {}, heads: r.heads, connT: Date.now() });
  searchUI(mm);
  App.opp = null; App.mid = 0;   // neue Paarung: Spielnummer neu (ein „Weiter“ vom Host gilt nur für ein hier schon begonnenes Spiel)
  // Gleiche Bedingungen für alle: Standardregeln, 90 s, bei Gleichstand Golden Goal. Arena aus der Spiel-ID.
  App.netCfg = { arena: mmArena(r.match), rules: {} };
  const my = gen;
  timer = setTimeout(() => { if (my === gen && App.mm && App.mm.state === "connect") fail(t("mm.noConnect")); }, CONNECT_MS);
  const onClose = lostFor(mm);
  App.netLost = onClose;   // Wächter in online.js: Gegenseite friert ein, ohne dass die Verbindung schließt
  App.mmVoid = voidFor(mm); App.mmBye = byeFor(mm);
  App.roomCode = roomOf(r.match);
  if (r.role === "host") {
    Net.host({
      onKnock: knock, onConn: connOpened,
      onData: d => { hostData(d); if (d.t === "hello" && App.opp && App.mm && App.mm.state === "connect") { clearTimeout(timer); netOpened(App.mm.mode); checkThenStart(my); } },
      onClose: () => netDropped(onClose),
      onError: type => { if (my === gen) fail(t("net.roomFailed", { type })); },
    }, { code: roomOf(r.match) });
  } else {
    let tries = 0;
    App.roomCode = roomOf(r.match);
    const join = () => Net.join(roomOf(r.match), App.joinH = {
      onConn: () => Net.send(hello({ lv: 1 })),   // Level kommt vom Server
      onData: d => {
        guestData(d);
        if (d.t === "welcome" && App.mm && App.mm.state === "connect") { App.mm.state = "check"; clearTimeout(timer); netOpened(App.mm.mode); searchUI(App.mm); }
        // Anpfiff beim Server melden nur, wenn hier wirklich die Sitzung dieses Starts läuft (ungültiger Start: badStart)
        if (d.t === "start" && !d.resume && App.mm && App.rb && d.rb && App.rb.ep === d.rb.ep) started(App.mm);
        // Ergebnis des Verbindungs-Checks nur während des Checks (später würde es eine Suche neu starten oder den Zustand zurücksetzen)
        if (d.t === "net" && App.mm && App.mm.state === "check") { if (d.bad) requeue(d.ms); else { if (d.weak) toast(t("mm.weakNet", { ms: d.ms }), "i-globe"); App.mm.state = "play"; searchUI(App.mm); } }
      },
      onClose: () => netDropped(onClose),
      onError: (type, wasOk) => { if (wasOk || my !== gen) return; if (type === "peer-unavailable" && ++tries < 12) setTimeout(() => { if (my === gen) join(); }, 1500); else fail(t("mm.connectFailed", { type })); },
    });
    setTimeout(join, 800);   // Host braucht einen Moment, bis der Raum offen ist
  }
}

// Verbindungs-Check (Host): ein paar Pings, dann entscheiden. Ranked bei schlechter Verbindung: beide suchen neu
// (Server bricht das Spiel ab und paart die zwei eine Weile nicht). Casual: nur ein Hinweis, gespielt wird trotzdem.
async function checkThenStart(my) {
  App.mm.state = "check"; searchUI(App.mm);
  let st = null, bad = true;
  // erst bei schlechter Messung eine zweite Runde: kurz ausgelastete Geräte (gerade geladen) schicken sonst Paare weg
  for (let round = 0; round < NET_CHECK.rounds && bad; round++) {
    App.pings = [];
    for (let i = 0; i < NET_CHECK.samples; i++) { Net.send({ t: "ping", c: performance.now() }); await sleep(NET_CHECK.gapMs); }
    await sleep(NET_CHECK.waitMs);
    if (my !== gen || !App.mm) return;
    st = pingStats(App.pings); bad = netTooBad(st);
  }
  const ms = st ? st.ms : 999;
  if (bad && App.mm.mode === "ranked") { Net.send({ t: "net", bad: true, ms }); setTimeout(() => requeue(ms), 150); return; }
  Net.send({ t: "net", bad: false, weak: bad, ms });
  if (bad) toast(t("mm.weakNet", { ms }), "i-globe");
  App.mm.state = "play"; searchUI(App.mm);
  // abgebrochen oder neue Suche in den 400 ms: dann nicht anpfeifen (und den Anpfiff auch nicht beim Server melden)
  const mm = App.mm; setTimeout(() => { if (my === gen && App.mm === mm) { started(mm); hostStart(); } }, 400);
}
// Anpfiff an den Server melden (beide Seiten): danach kann keiner das Spiel mehr per Abbruch ungültig machen
const started = mm => { if (mm.match && server.matchStarted) server.matchStarted(mm.match).catch(() => {}); };
const sleep = ms => new Promise(r => { setTimeout(r, ms); });

async function requeue(ms) {
  const mm = App.mm; if (!mm) return;
  toast(t("mm.badNet", { ms }), "i-globe");
  stop(); Net.close(); App.mm = null;
  await server.matchAbort(mm.match).catch(() => {});
  findMatch(mm.mode).catch(e => fail(errText(e)));
}

/**
 * Spiel ungültig (Rechnung weicht ab, der Host gibt einen Stand vor oder schickt mitten im Spiel Unerwartetes): Grund
 * an die Gegenseite (die meldet es dann auch, statt 35 s zu warten), „desync“ an den Server (beide: keine Wertung, keine
 * Aufgabe; meldet die andere Seite etwas anderes, wird das Spiel strittig), Hinweis, zurück ins Menü. Ein endgültig
 * abgepfiffenes Spiel bleibt, wie es ist (gemeldet wird dann das Ergebnis). why: „self“ (hier erkannt) oder „peer“
 * (die Gegenseite hat es gemeldet); der Server rechnet es dem zu, der es ausgelöst hat (Ranked-Pause)
 */
function voidFor(mm) {
  return (why = "self") => {
    if (!App.mm || App.mm.match !== mm.match || mm.voided || netEnded()) return;
    mm.voided = true; App.netLost = null; App.mmVoid = null; App.mmBye = null; clearSession();
    track("abort", { mode: mm.mode, reason: "desync" });
    Net.send({ t: "bye", reason: "desync" });
    if (!mm.reported && server.reportOnline) { mm.reported = true; server.reportOnline(mm.match, { desync: why === "peer" ? "peer" : "self" }).catch(() => {}); }
    toast(t("mm.desync"), "i-close");
    quitToMenu();
  };
}

/**
 * Gegenseite geht mit Grund: „desync“ (sie hält das Spiel für ungültig: hier genauso), „badstart“ (der Gast hat den
 * Start abgelehnt und beim Server abgebrochen: kein „Gegner weg“, keine Meldung)
 */
function byeFor(mm) {
  const bad = voidFor(mm);
  return reason => {
    if (!App.mm || App.mm.match !== mm.match) return;
    if (reason === "desync") { bad("peer"); return; }
    if (reason !== "badstart" || netEnded()) return;
    App.netLost = null; App.mmVoid = null; App.mmBye = null; clearSession();
    track("abort", { mode: mm.mode, reason: "void" });
    toast(t("mm.oppRejected"), "i-close");
    quitToMenu();
  };
}

// Gegenseite endgültig weg (Wartezeit um oder „Verlassen“)
function lostFor(mm) {
  return () => {
    if (!App.mm || App.mm.match !== mm.match) return;
    App.netLost = null; clearSession();
    settlePending();   // schon endgültig abgepfiffen: normal werten statt Aufgabe
    if (inGame() || App.screen === "pause") {
      // Gegner mitten im Spiel weg: als Aufgabe melden. Meldet er nichts, gewinnt man nach ein paar Minuten.
      const st = rbBestState(); reportResult([st.s[0], st.s[1]], (Date.now() - (App.t0 || Date.now())) / 1000, true);   // Rollback: endgültiger Stand
      track("abort", { mode: mm.mode, reason: "opp_gone" });
      toast(t("mm.oppLeftWin"), "i-close"); quitToMenu();
    }
    else if (App.screen !== "end") fail(t("mm.oppGone"));
  };
}

/** Nach einem App-Neustart mitten in einem Spiel der Gegnersuche: zurück ins selbe Spiel (Host mit gespeichertem Stand) */
export function resumeMatch(s) {
  if (!Net.available()) { clearSession(); return false; }
  stop(); Net.close();
  // nach dem Anpfiff (die Sitzung gibt es erst danach); der Gast vergleicht den Stand des Hosts mit seinem gesicherten
  App.mm = { ...s.mm, state: "play", kicked: true, ownSaves: s.role === "guest" && Array.isArray(s.saves) ? s.saves : null };
  const gone = lostFor(App.mm);
  App.mmVoid = voidFor(App.mm); App.mmBye = byeFor(App.mm);
  // Kommt die Verbindung nach dem eigenen Neustart nicht mehr zustande, war man selbst weg: keine Aufgabe des
  // Gegners melden (das tut seine Seite). Erst nach der Rückkehr gilt wieder der normale Abbruch.
  const onClose = self => {
    if (!App.resumePending) { gone(); return; }
    App.resumePending = false; App.netLost = null; clearSession();
    if (netEnded()) return;   // Spiel war schon abgepfiffen und gewertet: auf dem Ergebnis bleiben
    track("abort", { mode: s.mm.mode, reason: "dropped" });
    if (!self) toast(t("net.resumeFailed"), "i-close");   // selbst „Verlassen“ gedrückt: keine Fehlermeldung
    quitToMenu();
  };
  App.resumePending = true; App.netLost = onClose;
  if (s.role === "host") restoreHostGame(s, { onKnock: knock, onConn: connOpened, onData: hostData, onClose: () => netDropped(onClose), onError: () => {} }, onClose);
  else restoreGuest(s, { onConn: () => Net.send(hello({ lv: 1 })), onData: guestData, onClose: () => netDropped(onClose), onError: () => {} }, onClose);
  return true;
}

function fail(msg) {
  const mm = App.mm;
  stop(); Net.close(); App.mm = null;
  // Statistik: Suche endet mit Fehler, Verbindung kam nicht zustande
  if (mm && mm.state === "search") searchEnd(mm, "error");
  else if (mm && mm.state === "connect") netFailed(mm.mode);
  // Verbindung kam vor dem Anpfiff nicht zustande: Spiel beim Server abbrechen, sonst bleibt es offen, bis die Wartung
  // es aufräumt. Nach dem eigenen Anpfiff nicht mehr (der Server lehnt es dann ohnehin ab).
  if (mm && mm.match && !mm.kicked && (mm.state === "connect" || mm.state === "check") && server.matchAbort) server.matchAbort(mm.match).catch(() => {});
  if (inGame()) quitToMenu();
  App.opp = null;
  App.stack = []; showScreen("home", true); toast(msg, "i-close");   // Suche gestartet wird aus der Modus-Wahl auf der Startseite
}

/** Ergebnis melden (beide Seiten). Wartet, bis der Server gewertet hat, und gibt das Ergebnis zurück. */
export async function reportResult(score, duration, forfeit = false) {
  const mm = App.mm; if (!mm || !mm.match || mm.reported) return null;
  mm.reported = true;
  let res;
  try { res = await server.reportOnline(mm.match, { score, duration: Math.max(10, Math.min(900, Math.round(duration))), ...(forfeit ? { forfeit: true } : {}) }); }
  catch (e) { return { status: "error", error: e }; }
  for (let i = 0; res.status === "waiting" && i < 15; i++) {
    await new Promise(r => { setTimeout(r, 2000); });
    try { res = await server.matchStatus(mm.match); if (res.status === "open") res.status = "waiting"; } catch (_) {}
  }
  server.state().then(applyState).catch(() => {});
  return res;
}

/** Nach dem Spiel: Verbindung trennen, nochmal suchen oder ins Menü */
// („bye“ und kurz offen lassen: die letzte Nachricht, z. B. „bin abgepfiffen“, kommt sonst nicht sicher an)
export function again() { const mode = App.mm && App.mm.mode; Net.send({ t: "bye" }); Net.close(250); return findMatch(mode); }
export function leave() { stop(); App.mm = null; quitToMenu(); }
