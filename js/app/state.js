// Laufzeitzustand der App (Modus, aktuelles Spiel, Online-Puffer) und Abfragen darauf

export const VERSION = 5;

export const App = {
  mode: "demo", st: null, ai: [null, null], cfg: null, acc: 0, paused: false, endShown: false,
  names: ["", ""], labels: [null, null], ball: "klassik", goT: -1,
  rec: [], replay: null, maxDef: 0, screen: "home", stack: [],
  run: null, local2: null, series: {}, lastCfg: null, jug: { i: -1, n: 0 },
  opp: null, guestIn: [0, 0, 0, 0, 0, 0, 0, 0], gPend: { j: 0, d: 0 }, gEdge: null, sendT: 0, outEv: [], snaps: [], gp: null, lastIn: "", inT: 0, pingT: 0, rtt: 0, netCfg: null, mid: 0,
  mm: null,   // Gegnersuche: { mode, state, match, role, opp } (app/matchmaking.js)
};

export const inGame = () => ["cpu", "cup", "local", "host", "guest", "endless", "daily", "train"].includes(App.mode) && App.screen === null;

export const vsCpu = () => ["cpu", "cup", "endless", "daily", "train"].includes(App.mode);

export function myIdx() { return App.mode === "guest" ? 1 : App.mode === "local" || App.mode === "demo" ? -1 : 0; }

export function isHuman(i) { if (App.mode === "local") return true; if (App.mode === "demo") return false; return i === myIdx(); }
