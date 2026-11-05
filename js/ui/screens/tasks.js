// Tagesaufgaben und Tages-Challenge
import { arenaById, charById, DIFFS } from "../../content/config.js";
import { matchLen } from "../../core/physics.js";
import { S, save, tasks } from "../../store.js";
import { avatarCanvas } from "../render/art.js";
import { dailyChallenge } from "../../app/modes.js";
import { $, esc, svg } from "../dom.js";
import { dailyBriefing } from "./run.js";

export function tasksScreen() {
  const c = dailyChallenge(), o = charById(c.opp), card = $("challengeCard");
  card.innerHTML = `<div class="ch-head">${svg("i-cal")}<h3>Tages-Challenge</h3></div>`;
  const row = document.createElement("div"); row.className = "ch-row";
  row.append(avatarCanvas(c.opp, 76, { dir: -1, mood: "angry" }));
  row.insertAdjacentHTML("beforeend", `<ul><li>Gegner: <b>${o.name}</b> (${DIFFS[c.diff].name})</li><li>Arena: <b>${arenaById(c.arena).name}</b></li><li>Regeln: <b>${c.presetName}</b>${matchLen(c.rules).win ? `, bis ${matchLen(c.rules).win}` : ", 60 s"}</li></ul>`);
  card.append(row);
  if (c.done) card.insertAdjacentHTML("beforeend", '<div class="done">Heute geschafft ✓</div>');
  const b = document.createElement("button"); b.className = "btn yellow big"; b.innerHTML = c.done ? "Nochmal spielen" : `<span class="coin"></span>+${c.reward} holen`;
  b.onclick = () => { S.mode = "daily"; save(); dailyBriefing(); };
  card.append(b);
  const icons = { wins: "i-trophy", goals: "i-ball", headGoals: "i-ball", supers: "i-bolt", pus: "i-gift", stomps: "i-users", online: "i-globe", hard: "i-crown", cupRound: "i-trophy" };
  $("taskList").innerHTML = tasks().map(t => `<div class="task${t.done ? " done" : ""}"><span class="tk-ic">${svg(t.done ? "i-check" : icons[t.id] || "i-star")}</span><div class="tk-main"><b>${esc(t.text)}</b><div class="prog"><i style="width:${Math.round(t.prog / t.n * 100)}%"></i></div></div><span class="tk-rw">${t.done ? "✓" : `<span class="coin"></span>${t.reward}`}</span></div>`).join("");
}
