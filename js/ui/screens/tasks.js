// Tagesaufgaben und Tages-Challenge
import { arenaById, charById, DIFFS } from "../../content/config.js";
import { matchLen } from "../../core/physics.js";
import { S, save, tasks } from "../../app/profile.js";
import { avatarCanvas } from "../render/art.js";
import { dailyChallenge } from "../../app/modes.js";
import { $, esc, svg } from "../dom.js";
import { dailyBriefing } from "./run.js";
import { registerScreen } from "../nav.js";
import { passButton } from "./pass.js";
import { t } from "../../content/i18n.js";

export function tasksScreen() {
  passButton();
  const c = dailyChallenge(), o = charById(c.opp), card = $("challengeCard");
  card.innerHTML = `<div class="ch-head">${svg("i-cal")}<h3>${t("mode.daily.name")}</h3></div>`;
  const row = document.createElement("div"); row.className = "ch-row";
  row.append(avatarCanvas(c.opp, 76, { dir: -1, mood: "angry" }));
  row.insertAdjacentHTML("beforeend", `<ul><li>${t("ch.opp", { name: o.name, diff: DIFFS[c.diff].name })}</li><li>${t("ch.arena", { name: arenaById(c.arena).name })}</li><li>${t("ch.rules", { name: c.presetName, len: matchLen(c.rules).win ? t("home.upTo", { n: matchLen(c.rules).win }) : "60 s" })}</li></ul>`);
  card.append(row);
  if (c.done) card.insertAdjacentHTML("beforeend", `<div class="done">${t("mode.daily.done")} ✓</div>`);
  const b = document.createElement("button"); b.className = "btn yellow big"; b.innerHTML = c.done ? t("tasks.playAgain") : `<span class="coin"></span>${t("tasks.get", { n: c.reward })}`;
  b.onclick = () => { S.mode = "daily"; save(); dailyBriefing(); };
  card.append(b);
  const icons = { wins: "i-trophy", goals: "i-ball", headGoals: "i-ball", supers: "i-bolt", pus: "i-gift", stomps: "i-users", online: "i-globe", hard: "i-crown", cupRound: "i-trophy" };
  $("taskList").innerHTML = tasks().map(tk => `<div class="task${tk.done ? " done" : ""}"><span class="tk-ic">${svg(tk.done ? "i-check" : icons[tk.id] || "i-star")}</span><div class="tk-main"><b>${esc(tk.text)}</b><div class="prog"><i style="width:${Math.round(tk.prog / tk.n * 100)}%"></i></div></div><span class="tk-rw">${tk.done ? "✓" : `<span class="coin"></span>${tk.reward}`}</span></div>`).join("");
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initTasks() {
  registerScreen("tasks", { show: tasksScreen });
}
