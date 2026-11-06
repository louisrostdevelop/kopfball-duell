// Spielende: Belohnungen, Serien, Revanche, Teilen
import { charById, COL, DIFFS, W } from "../content/config.js";
import { addCoins, addXP, challenge, challengeDone, checkAch, grantChest, masteryProgress, S, save, taskProgress, weeklyProgress } from "./profile.js";
import { cosById } from "../content/cosmetics.js";

import { fx } from "../ui/render/render.js";
import { beginMatch, quitToMenu } from "./game.js";
import { endlessOpp } from "./modes.js";
import { backToLobby, hostStart } from "./online.js";
import { App, myIdx, vsCpu } from "./state.js";
import { $, shareOrCopy, toast } from "../ui/dom.js";
import { trophyModal } from "../ui/modals.js";
import { showEnd } from "../ui/screens/end.js";
import { runScreen } from "../ui/screens/run.js";
import { careerScreen } from "../ui/screens/career.js";
import { careerKey, recordResult } from "../core/career.js";
import { CAREER } from "../content/career.js";
import { audio as A, net as Net } from "./services.js";
import { careerNotice, online as serverOn, reportMatch, serverMode, submitEndless } from "./account.js";
import { refreshTop } from "../ui/screens/home.js";
import { again as mmAgain, leave as mmLeave, reportResult } from "./matchmaking.js";
import { t } from "../content/i18n.js";

// Meisterschaft: neue Stufe melden
function masteryToast(m, n = 0) {
  const c = charById(m.head.replace(/^head:/, "")), it = m.item && cosById(m.item);
  setTimeout(() => { toast(t("mastery.reached", { name: c.name, n: m.stage, item: it ? it.name : t("chest." + m.chest) }), "i-crown", true); A.sfx("levelup"); }, 1600 + n * 1300);
}

export function seriesKey() {
  if (App.mode === "local") return "local";
  if (App.mode === "host" || App.mode === "guest") return "net:" + (App.opp ? App.opp.name : "");
  if (App.mode === "cpu") return "cpu:" + App.st.p[1].ch;
  return null;
}

export function seriesText() {
  const k = seriesKey(); if (!k || !App.series[k]) return "";
  const s = App.series[k]; if (s[0] + s[1] === 0) return "";
  return t("end.series", { a: s[0], b: s[1] });
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
    case "cpu": add(t(win ? "rw.win" : "rw.played"), win ? Math.round(24 * m) : 7); break;
    case "cup": add(t(win ? "rw.cupWin" : "rw.out"), win ? Math.round(30 * m) : 9); break;
    case "career": add(t(win ? "rw.win" : "rw.played"), win ? Math.round(24 * m) : 7); break;
    case "endless": add(t(win ? "rw.win" : "rw.played"), win ? Math.round(21 * m) : 6); break;
    case "daily": { const c = challenge(); if (win && !c.done) { add(t("rw.daily"), c.reward); challengeDone(); } else add(t(win ? "rw.win" : "rw.played"), win ? 18 : 6); break; }
    case "host": case "guest": add(t(win ? "rw.onlineWin" : "rw.online"), win ? 42 : 15); break;
    case "local": add(t("rw.local"), 12); break;
  }
  if (myS && myS.goals) add(t("rw.goals", { n: myS.goals }), myS.goals * (vsCpu() ? 5 : 3));
  if (win && st.s[op] === 0) add(t("rw.cleanSheet"), 12);
  // Läufe
  let runInfo = null;
  if (App.run && App.run.kind === "cup" && App.mode === "cup") {
    const r = App.run; r.res[r.round] = { s: [a, b], win };
    if (win) { r.round++; if (r.round >= r.ops.length) { r.done = true; add(t("rw.trophy"), 180); runInfo = "cup"; S.cupBest = 3; } } else r.done = true;
  }
  if (App.run && App.run.kind === "endless" && App.mode === "endless") {
    const r = App.run;
    if (win) { r.streak++; r.next = endlessOpp(r.streak); } else { r.done = true; add(t("rw.endlessRun"), r.streak * 25); if (r.streak > S.endlessBest) { S.endlessBest = r.streak; runInfo = "record"; } }
  }
  // Karriere: Sterne eintragen (nie weniger als vorher)
  let career = null;
  if (App.mode === "career" && App.career && me >= 0) {
    career = recordResult(S.career, App.career.li, App.career.gi, st.s[me], st.s[op]);
    S.career = career.prog;
    // Liga-Bonus: mit Server bucht ihn der Server (Meldung kommt mit der Antwort), sonst gleich hier
    if (career.leagueDone && !serverOn()) { add(t("career.bonusLine", { name: CAREER[App.career.li].name }), CAREER[App.career.li].bonus.coins); grantChest(CAREER[App.career.li].chest, "career", CAREER[App.career.li].id); }
  }
  addCoins(coins);
  // XP doppelt so viel wie Münzen: Münzen pro Spiel sind seit docs/BALANCE.md niedriger, Level kommen gleich schnell
  const ups = addXP(Math.round(coins * 2) + 15);
  S.stats.games++;
  if (win) S.stats.wins++;
  if (myS) ["goals", "headGoals", "pus", "stomps", "supers"].forEach(f => S.stats[f] += myS[f]);
  const online = App.mode === "guest" || App.mode === "host";
  const inc = myS ? { wins: win ? 1 : 0, goals: myS.goals, headGoals: myS.headGoals, supers: myS.supers, pus: myS.pus, stomps: myS.stomps, online: online ? 1 : 0, hard: win && vsCpu() && (App.cfg.diff ?? 1) >= 2 ? 1 : 0, cupRound: win && App.mode === "cup" ? 1 : 0 } : { pus: st.stats[0].pus + st.stats[1].pus, stomps: st.stats[0].stomps + st.stats[1].stomps };
  if (myS) masteryProgress(st.p[me].ch, win, myS.goals, myS.supers).forEach(masteryToast);
  if (myS) weeklyProgress({ wins: win ? 1 : 0, goals: myS.goals, supers: myS.supers, headGoals: myS.headGoals, career: App.mode === "career" ? 1 : 0, clean: win && st.s[op] === 0 ? 1 : 0, online: online ? 1 : 0 }, "head:" + st.p[me].ch)
    .forEach((w, n) => setTimeout(() => { toast(t("week.done", { text: w.text, n: w.reward }), "i-cal", true); A.sfx("coin"); }, 900 + n * 1300));
  taskProgress(inc).forEach((task, n) => setTimeout(() => { toast(t("task.done", { text: task.text, n: task.reward }), "i-tasks", true); A.sfx("coin"); }, 600 + n * 1300));
  const achs = me >= 0 ? checkAch({ win, myGoals: myS.goals, conceded: st.s[op], superGoals: myS.superGoals, lastSec: myS.lastSecGoals, longGoals: myS.longGoals, maxDeficit: App.maxDef, cupWon: runInfo === "cup", diff: App.cfg.diff, mode: online ? "online" : ["cup", "career", "endless", "daily"].includes(App.mode) ? "cpu" : App.mode }) : checkAch({});
  save();
  showEnd({ win, me, lines, ups, achs, runInfo, career });
  if (App.mm && online) {
    const mm = App.mm;
    reportResult([a, b], (Date.now() - (App.t0 || Date.now())) / 1000).then(res => {
      if (App.mm !== mm || App.screen !== "end") { if (res && res.status === "settled") refreshTop(); return; }
      const note = $("endNote"), r = res && res.result;
      if (res && res.status === "settled" && r) {
        const side = mm.role === "host" ? "p1" : "p2", d = r.mmr ? r.mmr[side] : side === "p1" ? r.mmrDelta : -r.mmrDelta;
        const why = r.mmrDelta === 0 ? " " + t("mm.pairLimit") : d >= 0 && d < Math.abs(r.mmrDelta) ? " " + t("mm.provisional") : "";
        note.textContent = mm.mode === "ranked" ? t("mm.rating", { d: (d >= 0 ? "+" : "") + d }) + why : t("mm.booked");
        if (mm.mode === "ranked" && d) toast(t("mm.rating", { d: (d > 0 ? "+" : "") + d }), "i-crown", d > 0);
      } else if (res && res.status === "disputed") note.textContent = t("mm.disputed");
      else if (res && res.status === "waiting") note.textContent = t("mm.waiting");
      else note.textContent = t("mm.reportFailed");
      refreshTop();
    });
  }
  const endlessFinal = App.run && App.run.kind === "endless" && App.mode === "endless" && App.run.done ? App.run.streak : 0;
  if (serverOn() && serverMode(App.mode)) {
    const facts = myS ? [myS.goals >= 3 && "hattrick", myS.superGoals > 0 && "supergoal", myS.lastSecGoals > 0 && "lastsec", myS.longGoals > 0 && "longshot", win && App.maxDef >= 2 && "comeback"].filter(Boolean) : [];
    reportMatch({
      mode: serverMode(App.mode), won: win, ...(App.mode === "career" && App.career ? { stage: careerKey(App.career.li, App.career.gi) } : {}), goals: myS ? myS.goals : 0, conceded: me >= 0 ? st.s[op] : 0,
      duration: Math.round(Math.min(900, (Date.now() - (App.t0 || Date.now())) / 1000)), head: "head:" + (me >= 0 ? st.p[me].ch : S.char), diff: App.cfg.diff ?? 1,
      stats: myS ? { headGoals: myS.headGoals, pus: myS.pus, stomps: myS.stomps, supers: myS.supers } : {}, facts, cup: App.mode === "cup",
    }).then(res => {
      if (endlessFinal) submitEndless(endlessFinal);   // nach der Meldung: der Server zählt die Siege
      if (!res) return;
      careerNotice(res);
      (res.mastery || []).forEach(masteryToast);
      if (res.capReached) toast(t("cap.reached"), "i-lock");
      else if (res.coinsBeforeCap > res.coins) toast(t("cap.soft"), "i-clock");
      refreshTop();
    });
  }
  A.sfx(me < 0 || win ? "win" : "lose");
  if (win || me < 0) fx.burst("goal", W / 2, 300, { col: COL.gold });
}

export function endAgain() {
  A.sfx("click");
  if (App.mm) { mmAgain().catch(() => mmLeave()); return; }
  if (App.mode === "career") { careerScreen(); return; }
  if (App.mode === "cup" || App.mode === "endless") { if (App.run && App.run.done && App.run.kind === "cup" && App.run.round >= 3) trophyModal(); runScreen(); return; }
  if (App.mode === "guest") { Net.send({ t: "rematch" }); $("endNote").textContent = t("end.rematchSent"); $("btnEndAgain").disabled = true; return; }
  if (App.mode === "host") { hostStart(); return; }
  beginMatch({ ...App.lastCfg, chars: [...App.lastCfg.chars] });
}

export function endMenu() { A.sfx("click"); if (App.mm) { mmLeave(); return; } if (App.mode === "host") { Net.send({ t: "lobby" }); backToLobby(); return; } quitToMenu(); }

export function shareResult() {
  const st = App.st, me = myIdx(), url = location.origin + location.pathname;
  let text;
  if (me >= 0) { const w = st.s[me] > st.s[1 - me]; text = t(w ? "share.won" : "share.lost", { a: st.s[me], b: st.s[1 - me], opp: App.names[1 - me], url }); }
  else text = t("share.local", { p1: App.names[0], a: st.s[0], b: st.s[1], p2: App.names[1], url });
  shareOrCopy({ title: "Kopfball Duell", text });   // i18n-ok: Marke
}
