// Spielmodi: Schnelles Spiel, Cup, Endlos, Tages-Challenge, Training
import { ARENAS, charById, CHARS } from "../content/config.js";
import { challenge, owns, S } from "./profile.js";
import { beginMatch, quitToMenu } from "./game.js";
import { App } from "./state.js";
import { openOnline } from "../ui/screens/online.js";
import { dailyBriefing, runScreen } from "../ui/screens/run.js";
import { selectScreen } from "../ui/screens/select.js";
import { setupScreen } from "../ui/screens/setup.js";
import { audio as A } from "./services.js";

export function cpuNames(opp) { return [S.name || "Du", charById(opp).name]; }

export function startMode(id) {
  A.sfx("click");
  switch (id) {
    case "quick": setupScreen({ mode: "cpu" }); break;
    case "local": App.local2 = [S.char]; selectScreen({ title: "Spieler 2: Kopf wählen", cur: CHARS.find(c => c.id !== S.char && owns("chars", c.id)).id, p2: true, okText: "Weiter", onDone: id2 => { App.local2[1] = id2; setupScreen({ mode: "local" }); } }); break;
    case "online": openOnline(); break;
    case "cup": startCup(); break;
    case "endless": startEndless(); break;
    case "daily": dailyBriefing(); break;
    case "train": setupScreen({ mode: "train" }); break;
  }
}

// Cup
export function startCup() {
  const pool = CHARS.filter(c => c.id !== S.char).sort(() => Math.random() - 0.5);
  const owned = ARENAS.filter(a => owns("arenas", a.id)).map(a => a.id);
  App.run = { kind: "cup", ops: pool.slice(0, 3).map((c, n) => ({ ch: c.id, diff: [1, 2, 3][n], arena: owned[Math.floor(Math.random() * owned.length)] })), round: 0, res: [], done: false };
  runScreen();
}

// Endlos
export function startEndless() {
  App.run = { kind: "endless", streak: 0, done: false, next: endlessOpp(0) };
  runScreen();
}

export function endlessOpp(n) {
  const pool = CHARS.filter(c => c.id !== S.char);
  return { ch: pool[Math.floor(Math.random() * pool.length)].id, diff: n < 2 ? 1 : n < 5 ? 2 : 3, arena: ARENAS[Math.floor(Math.random() * ARENAS.length)].id };
}

export function runNext() {
  const r = App.run; A.sfx("click");
  if (!r || r.done) { App.run = null; quitToMenu(); return; }
  if (r.kind === "cup") { const o = r.ops[r.round]; beginMatch({ mode: "cup", chars: [S.char, o.ch], arena: o.arena, dur: 60, rules: {}, golden: true, diff: o.diff, names: cpuNames(o.ch), labels: ["DU", null], ball: S.ball }); }
  else { const o = r.next; beginMatch({ mode: "endless", chars: [S.char, o.ch], arena: o.arena, dur: 90, rules: { len: "w3", ...(r.streak >= 2 ? { obs: "rnd" } : {}) }, golden: true, diff: o.diff, names: cpuNames(o.ch), labels: ["DU", null], ball: S.ball }); }
}

// Tages-Challenge
export function dailyChallenge() {
  const c = challenge();
  if (c.opp === S.char) c.opp = CHARS[(CHARS.findIndex(x => x.id === c.opp) + 1) % CHARS.length].id;
  return c;
}
