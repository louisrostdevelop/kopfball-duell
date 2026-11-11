// Laufzeitzustand der App (Modus, aktuelles Spiel, Online-Puffer) und Abfragen darauf

export const VERSION = 15;   // Online-Protokoll: beide Seiten müssen gleich sein; erhöhen bei jeder Änderung an Physik, Zustand oder Nachrichten

export const App = {
  mode: "demo", st: null, cfg: null, acc: 0, paused: false, endShown: false,
  names: ["", ""], labels: [null, null], ball: "klassik", goT: -1,
  rec: [], replay: null, maxDef: 0, screen: "home", stack: [],
  run: null, local2: null, series: {}, lastCfg: null, jug: { i: -1, n: 0 },
  opp: null, pingT: 0, rtt: 0, pings: [], pingUi: 0, netCfg: null, mid: 0, lastRx: 0, lagWarn: false, netLost: null, netWait: null, netBye: false, dropTried: false, roomCode: "", joinH: null, netTok: "", guestCfg: null,
  career: null,   // laufendes Karriere-Spiel: { li, gi }
  modeTab: "",   // zuletzt offener Reiter der Modus-Wahl ("on" / "off")
  dailyLater: null,
  afterMatch: null,   // Meldungen vom Endbildschirm (Level, Arena frei …), die erst im Menü kommen (screens/end.js)   // Tagesbelohnung nachholen, sobald man wieder auf der Startseite ist (main.js, home.js)
  rb: null, testPatch: null, matchKey: "", endedKey: "", leaving: null, endPend: null,   // Rollback-Sitzung (app/rbnet.js), Test-Startzustand
  mm: null,   // Gegnersuche: { mode, state, match, role, opp, kicked, ask, ownSaves } (app/matchmaking.js)
  mmVoid: null, mmBye: null,   // Gegnersuche: Spiel ungültig machen, Grund der Gegenseite (matchmaking.js)
  fixLog: null, rbSaves: null,   // Korrekturen je Spiel (rbnet.js), gesicherte Stände mit Takt (online.js keepSave)
};

/** Modi gegen den Computer, alle Modi mit laufendem Spiel */
export const CPU_MODES = ["cpu", "cup", "career", "endless", "daily", "train"];
export const PLAY_MODES = [...CPU_MODES, "local", "host", "guest"];

export const inGame = () => PLAY_MODES.includes(App.mode) && App.screen === null;

export const vsCpu = () => CPU_MODES.includes(App.mode);

export function myIdx() { return App.mode === "guest" ? 1 : App.mode === "local" || App.mode === "demo" ? -1 : 0; }

export function isHuman(i) { if (App.mode === "local") return true; if (App.mode === "demo") return false; return i === myIdx(); }
