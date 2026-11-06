// Online über die Warteschlange (Casual ohne Wertung, Ranked mit Wertung). Der Server paart die Spieler,
// verbunden wird wie beim Freunde-Modus direkt per PeerJS: der Server bestimmt, wer Host ist, der Raumname
// kommt aus der Spiel-ID. Am Ende melden beide das Ergebnis; zählt nur, wenn beide dasselbe melden.
import { S } from "./profile.js";
import { myCos } from "./cosmetics.js";
import { applyState } from "./account.js";
import { quitToMenu } from "./game.js";
import { hostData, guestData, hostStart } from "./online.js";
import { App, inGame, VERSION } from "./state.js";
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
      onData: d => { hostData(d); if (d.t === "hello" && App.opp && App.mm && App.mm.state === "connect") { App.mm.state = "play"; clearTimeout(timer); setTimeout(hostStart, 600); } },
      onClose,
      onError: type => { if (my === gen) fail(t("net.roomFailed", { type })); },
    }, { code: roomOf(r.match) });
  } else {
    let tries = 0;
    const join = () => Net.join(roomOf(r.match), {
      onConn: () => Net.send({ t: "hello", name: S.name || t("ui.guest"), ch: S.char, lv: 1, v: VERSION }),   // Level kommt vom Server
      onData: d => { guestData(d); if (d.t === "welcome" && App.mm) { App.mm.state = "play"; clearTimeout(timer); searchUI(App.mm); } },
      onClose,
      onError: (type, wasOk) => { if (wasOk || my !== gen) return; if (type === "peer-unavailable" && ++tries < 12) setTimeout(() => { if (my === gen) join(); }, 1500); else fail(t("mm.connectFailed", { type })); },
    });
    setTimeout(join, 800);   // Host braucht einen Moment, bis der Raum offen ist
  }
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
