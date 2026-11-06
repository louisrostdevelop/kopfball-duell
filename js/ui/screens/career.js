// Karriere: Ligen als Reiter, fünf Gegner pro Liga mit Sternen, Anpfiff für das gewählte Spiel
import { arenaById, charById, CHALLENGE_SETS, DIFFS } from "../../content/config.js";
import { CAREER } from "../../content/career.js";
import { gameOpen, gameRules, leagueDone, leagueOpen, leagueStars, MAX_STARS, nextGame, starsOf, totalStars } from "../../core/career.js";
import { matchLen } from "../../core/physics.js";
import { S } from "../../app/profile.js";
import { App } from "../../app/state.js";
import { startDemo, updateBand } from "../../app/game.js";
import { startCareer } from "../../app/modes.js";
import { online as serverOn } from "../../app/account.js";
import { audio as A } from "../../app/services.js";
import { avatarCanvas } from "../render/art.js";
import { $, svg } from "../dom.js";
import { registerScreen, showScreen } from "../nav.js";
import { t } from "../../content/i18n.js";

let tab = 0, sel = null;

const starRow = n => `<span class="stars">${[0, 1, 2].map(i => `<svg class="${i < n ? "on" : ""}"><use href="#i-star"/></svg>`).join("")}</span>`;

function lenText(rules) {
  const ml = matchLen(rules);
  return ml.win ? t("run.firstTo", { n: ml.win }) : t("career.secs", { n: ml.dur });
}

/** Karriere zeigen; nach einem Spiel springt die Auswahl auf das nächste offene */
export function careerScreen() {
  const nx = nextGame(S.career);
  if (App.career || !sel) { sel = nx || { li: CAREER.length - 1, gi: CAREER[CAREER.length - 1].games.length - 1 }; tab = sel.li; }
  App.career = null;
  if (App.mode !== "demo") {
    document.body.classList.remove("ingame"); $("gameBtns").hidden = true;
    startDemo(); updateBand(); A.crowdOff(); A.music(true, "menu");
  }
  App.stack = []; showScreen("career"); App.stack = ["home"];
}

function render() {
  const prog = S.career;
  $("careerStars").textContent = `${totalStars(prog)}/${MAX_STARS}`;
  const tabs = $("careerTabs"); tabs.innerHTML = "";
  CAREER.forEach((l, li) => {
    const b = document.createElement("button"); b.className = li === tab ? "on" : "";
    const open = leagueOpen(prog, li);
    b.innerHTML = (open ? "" : svg("i-lock")) + `<span>${l.name}</span>`;
    b.title = open ? t("career.stars", { n: leagueStars(prog, li), max: l.games.length * 3 }) : t("career.locked", { name: CAREER[li - 1].name });
    b.onclick = () => { A.sfx("click"); tab = li; render(); };
    tabs.append(b);
  });
  const lg = CAREER[tab], grid = $("careerGrid"); grid.innerHTML = "";
  grid.style.setProperty("--c1", lg.c1); grid.style.setProperty("--c2", lg.c2);
  lg.games.forEach((g, gi) => {
    const open = gameOpen(prog, tab, gi), st = starsOf(prog, tab, gi), rules = gameRules(tab, gi), set = g.set && CHALLENGE_SETS.find(s => s.id === g.set);
    const d = document.createElement("button"); d.className = "round cstage" + (st ? " won" : "") + (open ? "" : " locked") + (sel && sel.li === tab && sel.gi === gi ? " now" : "");
    d.disabled = !open;
    d.innerHTML = `<small>${t("career.game", { n: gi + 1 })}</small>`;
    d.append(open ? avatarCanvas(g.ch, 70, { dir: -1, mood: st ? "sad" : "" }) : Object.assign(document.createElement("div"), { className: "cslock", innerHTML: svg("i-lock") }));
    d.insertAdjacentHTML("beforeend", `<b>${charById(g.ch).name}</b><em>${DIFFS[g.diff].name} · ${arenaById(g.arena).name}</em><em>${set ? set.name + " · " : ""}${lenText(rules)}</em>${starRow(st)}`);
    d.onclick = () => { A.sfx("click"); sel = { li: tab, gi }; render(); };
    grid.append(d);
  });
  const btn = $("btnCareerGo"), ok = sel && gameOpen(prog, sel.li, sel.gi);
  btn.disabled = !ok;
  btn.textContent = ok ? t("career.next", { name: charById(CAREER[sel.li].games[sel.gi].ch).name }) : t("career.play");
  const b = lg.bonus, gems = serverOn() && b.gems;
  const bonus = leagueDone(prog, tab) ? t("career.bonusDone") : t(gems ? "career.bonusInfoGems" : "career.bonusInfo", { coins: b.coins, gems: b.gems });
  $("careerNote").textContent = (!leagueOpen(prog, tab) ? t("career.locked", { name: CAREER[tab - 1].name })
    : nextGame(prog) ? t("career.starsHelp") : t("career.allDone")) + " · " + bonus;
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initCareer() {
  registerScreen("career", { show: render, back: () => { sel = null; } });
  $("btnCareerGo").onclick = () => { if (!sel || !gameOpen(S.career, sel.li, sel.gi)) return; A.sfx("click"); startCareer(sel.li, sel.gi); };
}
