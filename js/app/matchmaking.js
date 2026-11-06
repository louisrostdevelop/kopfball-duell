// Online über die Warteschlange (Casual ohne Wertung, Ranked mit Wertung). Der Server paart die Spieler,
// verbunden wird wie beim Freunde-Modus direkt per PeerJS: der Server bestimmt, wer Host ist, der Raumname
// kommt aus der Spiel-ID. Am Ende melden beide das Ergebnis; zählt nur, wenn beide dasselbe melden.
import { S } from "./profile.js";
import { myCos } from "./cosmetics.js";
import { applyState } from "./account.js";
import { quitToMenu } from "./game.js";
import { hello, hostData, guestData, hostStart, netDropped } from "./online.js";
import { NET_CHECK, netTooBad, pingStats } from "./netcode.js";
import { App, inGame } from "./state.js";
import { toast } from "../ui/dom.js";
import { showScreen, swapScreen } from "../ui/nav.js";
import { mmPanel, netNote } from "../ui/screens/online.js";
import { searchUI } from "../ui/screens/search.js";
import { net as Net, server } from "./services.js";
import { t } from "../content/i18n.js";

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

/** Suche starten. Wirft bei Fehlern (z. B. Ranked ohne Konto) eine Meldung für die Oberfläche. */
export async function findMatch(mode) {
  stop(); Net.close();
  await server.queueJoin(mode, "head:" + S.char, myCos());
  App.mm = { mode, state: "search", t0: Date.now() };
  searchUI(App.mm); showScreen("search");
  const my = gen;
  const tick = async () => {
    if (my !== gen) return;
    try {
      const r = await server.queuePoll();
      if (my !== gen) return;
      if (r.matched) return matched(r);
      searchUI(App.mm);
    } catch (e) {
      if (my !== gen) return;
      if (e.code === "not_queued") { await server.queueJoin(mode, "head:" + S.char, myCos()).catch(() => {}); }
    }
    timer = setTimeout(tick, POLL_MS);
  };
  timer = setTimeout(tick, 600);
}

export async function cancelSearch() {
  const was = App.mm; stop(); App.mm = null; Net.close();
  if (was && was.state === "search") await server.queueLeave().catch(() => {});
}

const roomOf = match => "m" + match.replace(/-/g, "").slice(0, 20);

function matched(r) {
  const mm = App.mm;
  Object.assign(mm, { state: "connect", match: r.match, role: r.role, opp: r.opponent || {}, heads: r.heads, connT: Date.now() });
  searchUI(mm);
  App.opp = null;
  // Gleiche Bedingungen für alle: Standardregeln, 90 s, bei Gleichstand Golden Goal. Arena aus der Spiel-ID.
  App.netCfg = { arena: parseInt(r.match.slice(0, 2), 16) % 2 ? "strand" : "stadion", rules: {} };
  const my = gen;
  timer = setTimeout(() => { if (my === gen && App.mm && App.mm.state === "connect") fail(t("mm.noConnect")); }, CONNECT_MS);
  const onClose = () => {
    if (!App.mm || App.mm.match !== mm.match) return;
    App.netLost = null;
    if (inGame() || App.screen === "pause") {
      // Gegner mitten im Spiel weg: als Aufgabe melden. Meldet er nichts, gewinnt man nach ein paar Minuten.
      const st = App.st; reportResult([st.s[0], st.s[1]], (Date.now() - (App.t0 || Date.now())) / 1000, true);
      toast(t("mm.oppLeftWin"), "i-close"); quitToMenu();
    }
    else if (App.screen !== "end") fail(t("mm.oppGone"));
  };
  App.netLost = onClose;   // Wächter in online.js: Gegenseite friert ein, ohne dass die Verbindung schließt
  if (r.role === "host") {
    Net.host({
      onData: d => { hostData(d); if (d.t === "hello" && App.opp && App.mm && App.mm.state === "connect") { clearTimeout(timer); checkThenStart(my); } },
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
        if (d.t === "welcome" && App.mm) { App.mm.state = "check"; clearTimeout(timer); searchUI(App.mm); }
        if (d.t === "start" && !d.resume && App.mm) started(App.mm);
        if (d.t === "net" && App.mm) { if (d.bad) requeue(d.ms); else { if (d.weak) toast(t("mm.weakNet", { ms: d.ms }), "i-globe"); App.mm.state = "play"; searchUI(App.mm); } }
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
  started(App.mm);
  setTimeout(hostStart, 400);
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

function fail(msg) {
  stop(); Net.close(); App.mm = null;
  if (inGame()) quitToMenu();
  App.stack = ["home"]; swapScreen("online"); netNote(msg, true); mmPanel();
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
export function again() { const mode = App.mm && App.mm.mode; Net.close(); return findMatch(mode); }
export function leave() { stop(); App.mm = null; quitToMenu(); }
