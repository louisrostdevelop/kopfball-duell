// Laufzeitzustand der App (Modus, aktuelles Spiel, Online-Puffer) und Abfragen darauf

export const VERSION = 10;   // Online-Protokoll: 10 = Rollback-Netcode und deterministische Physik (9: feine Phasenzeit, 8: Meme-Supers traurig/verliebt, 7: Kosmetik und Emote-Plätze, 6: kompakte Zustände)

export const App = {
  mode: "demo", st: null, ai: [null, null], cfg: null, acc: 0, paused: false, endShown: false,
  names: ["", ""], labels: [null, null], ball: "klassik", goT: -1,
  rec: [], replay: null, maxDef: 0, screen: "home", stack: [],
  run: null, local2: null, series: {}, lastCfg: null, jug: { i: -1, n: 0 },
  opp: null, inSeq: 0, inSeqSeen: -1, inRep: 0, lastSeq: -1, clock: null, guestIn: [0, 0, 0, 0, 0, 0, 0, 0], gPend: { j: 0, d: 0 }, gEdge: null, sendT: 0, outEv: [], snaps: [], gp: null, lastIn: "", inT: 0, pingT: 0, rtt: 0, pings: [], pingUi: 0, netCfg: null, mid: 0, lastRx: 0, guestInAt: 0, lagWarn: false, netLost: null, netWait: null, netBye: false, dropTried: false, roomCode: "", joinH: null, netTok: "", guestCfg: null,
  career: null,   // laufendes Karriere-Spiel: { li, gi }
  dailyLater: null,   // Tagesbelohnung nachholen, sobald man wieder auf der Startseite ist (main.js, home.js)
  rb: null, rbOn: false, testPatch: null, matchKey: "", endedKey: "", leaving: null, endPend: null,   // Rollback-Sitzung (app/rbnet.js), ob das laufende Online-Spiel mit Rollback läuft, Test-Startzustand
  mm: null,   // Gegnersuche: { mode, state, match, role, opp } (app/matchmaking.js)
};

/** Modi gegen den Computer, alle Modi mit laufendem Spiel */
export const CPU_MODES = ["cpu", "cup", "career", "endless", "daily", "train"];
export const PLAY_MODES = [...CPU_MODES, "local", "host", "guest"];

export const inGame = () => PLAY_MODES.includes(App.mode) && App.screen === null;

export const vsCpu = () => CPU_MODES.includes(App.mode);

export function myIdx() { return App.mode === "guest" ? 1 : App.mode === "local" || App.mode === "demo" ? -1 : 0; }

export function isHuman(i) { if (App.mode === "local") return true; if (App.mode === "demo") return false; return i === myIdx(); }
