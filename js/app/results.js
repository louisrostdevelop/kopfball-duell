// Spielende: Belohnungen, Serien, Revanche, Teilen
import { COL, DIFFS, W } from "../content/config.js";
import { addCoins, addXP, challenge, challengeDone, checkAch, S, save, taskProgress } from "../store.js";
import { fx } from "../ui/render/render.js";
import { beginMatch, quitToMenu } from "./game.js";
import { endlessOpp } from "./modes.js";
import { backToLobby, hostStart } from "./online.js";
import { App, myIdx, vsCpu } from "./state.js";
import { $, shareOrCopy, toast } from "../ui/dom.js";
import { trophyModal } from "../ui/modals.js";
import { showEnd } from "../ui/screens/end.js";
import { runScreen } from "../ui/screens/run.js";
import * as A from "../adapters/audio/webaudio.js";
import * as Net from "../adapters/net/peerjs.js";

export function seriesKey() {
  if (App.mode === "local") return "local";
  if (App.mode === "host" || App.mode === "guest") return "net:" + (App.opp ? App.opp.name : "");
  if (App.mode === "cpu") return "cpu:" + App.st.p[1].ch;
  return null;
}

export function seriesText() {
  const k = seriesKey(); if (!k || !App.series[k]) return "";
  const s = App.series[k]; if (s[0] + s[1] === 0) return "";
  return "Serie " + s[0] + " : " + s[1];
}

export function matchEnd() {
  const st = App.st, me = myIdx(), op = me >= 0 ? 1 - me : -1;
  const [a, b] = st.s, k = seriesKey();
  if (k) { App.series[k] = App.series[k] || [0, 0]; if (a > b) App.series[k][0]++; else if (b > a) App.series[k][1]++; }
  const win = me >= 0 && st.s[me] > st.s[op];
  const myS = me >= 0 ? st.stats[me] : null;
  const lines = [];
  let coins = 0;
  const add = (label, c) => { if (c) { coins += c; lines.push([label, c]); } };
  const m = DIFFS[(App.cfg && App.cfg.diff) ?? 1].coins;
  switch (App.mode) {
    case "cpu": add(win ? "Sieg" : "Teilnahme", win ? Math.round(40 * m) : 12); break;
    case "cup": add(win ? "Cup-Sieg" : "Ausgeschieden", win ? Math.round(50 * m) : 15); break;
    case "endless": add(win ? "Sieg" : "Teilnahme", win ? Math.round(35 * m) : 10); break;
    case "daily": { const c = challenge(); if (win && !c.done) { add("Tages-Challenge", c.reward); challengeDone(); } else add(win ? "Sieg" : "Teilnahme", win ? 30 : 10); break; }
    case "host": case "guest": add(win ? "Online-Sieg" : "Online-Spiel", win ? 70 : 25); break;
    case "local": add("Spiel zu zweit", 20); break;
  }
  if (myS && myS.goals) add(myS.goals + (myS.goals === 1 ? " Tor" : " Tore"), myS.goals * (vsCpu() ? 8 : 5));
  if (win && st.s[op] === 0) add("Zu null", 20);
  // Läufe
  let runInfo = null;
  if (App.run && App.run.kind === "cup" && App.mode === "cup") {
    const r = App.run; r.res[r.round] = { s: [a, b], win };
    if (win) { r.round++; if (r.round >= r.ops.length) { r.done = true; add("Pokal", 300); runInfo = "cup"; S.cupBest = 3; } } else r.done = true;
  }
  if (App.run && App.run.kind === "endless" && App.mode === "endless") {
    const r = App.run;
    if (win) { r.streak++; r.next = endlessOpp(r.streak); } else { r.done = true; add("Endlos-Lauf", r.streak * 25); if (r.streak > S.endlessBest) { S.endlessBest = r.streak; runInfo = "record"; } }
  }
  addCoins(coins);
  const ups = addXP(Math.round(coins * 1.2) + 15);
  S.stats.games++;
  if (win) S.stats.wins++;
  if (myS) ["goals", "headGoals", "pus", "stomps", "supers"].forEach(f => S.stats[f] += myS[f]);
  const online = App.mode === "guest" || App.mode === "host";
  const inc = myS ? { wins: win ? 1 : 0, goals: myS.goals, headGoals: myS.headGoals, supers: myS.supers, pus: myS.pus, stomps: myS.stomps, online: online ? 1 : 0, hard: win && vsCpu() && (App.cfg.diff ?? 1) >= 2 ? 1 : 0, cupRound: win && App.mode === "cup" ? 1 : 0 } : { pus: st.stats[0].pus + st.stats[1].pus, stomps: st.stats[0].stomps + st.stats[1].stomps };
  taskProgress(inc).forEach((t, n) => setTimeout(() => { toast(`Aufgabe geschafft: ${t.text} (+${t.reward})`, "i-tasks", true); A.sfx("coin"); }, 600 + n * 1300));
  const achs = me >= 0 ? checkAch({ win, myGoals: myS.goals, conceded: st.s[op], superGoals: myS.superGoals, lastSec: myS.lastSecGoals, longGoals: myS.longGoals, maxDeficit: App.maxDef, cupWon: runInfo === "cup", diff: App.cfg.diff, mode: online ? "online" : App.mode === "cup" || App.mode === "endless" || App.mode === "daily" ? "cpu" : App.mode }) : checkAch({});
  save();
  showEnd({ win, me, lines, ups, achs, runInfo });
  A.sfx(me < 0 || win ? "win" : "lose");
  if (win || me < 0) fx.burst("goal", W / 2, 300, { col: COL.gold });
}

export function endAgain() {
  A.sfx("click");
  if (App.mode === "cup" || App.mode === "endless") { if (App.run && App.run.done && App.run.kind === "cup" && App.run.round >= 3) trophyModal(); runScreen(); return; }
  if (App.mode === "guest") { Net.send({ t: "rematch" }); $("endNote").textContent = "Anfrage gesendet. Warte auf den Gastgeber…"; $("btnEndAgain").disabled = true; return; }
  if (App.mode === "host") { hostStart(); return; }
  beginMatch({ ...App.lastCfg, chars: [...App.lastCfg.chars] });
}

export function endMenu() { A.sfx("click"); if (App.mode === "host") { Net.send({ t: "lobby" }); backToLobby(); return; } quitToMenu(); }

export function shareResult() {
  const st = App.st, me = myIdx(), url = location.origin + location.pathname;
  let text;
  if (me >= 0) { const w = st.s[me] > st.s[1 - me]; text = w ? `${st.s[me]}:${st.s[1 - me]} gegen ${App.names[1 - me]} gewonnen in Kopfball Duell. Traust du dich? ${url}` : `${st.s[me]}:${st.s[1 - me]} verloren in Kopfball Duell. Wer rächt mich? ${url}`; }
  else text = `${App.names[0]} ${st.s[0]}:${st.s[1]} ${App.names[1]} in Kopfball Duell ${url}`;
  shareOrCopy({ title: "Kopfball Duell", text });
}
