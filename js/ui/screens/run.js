// Cup- und Endlos-Übersicht, Briefing der Tages-Challenge
import { arenaById, charById, DIFFS } from "../../content/config.js";
import { matchLen } from "../../core/physics.js";
import { S } from "../../app/profile.js";
import { avatarCanvas } from "../render/art.js";
import { beginMatch, startDemo, updateBand } from "../../app/game.js";
import { cpuNames, dailyChallenge, runNext } from "../../app/modes.js";
import { App } from "../../app/state.js";
import { $, $$, modal, svg } from "../dom.js";
import { audio as A } from "../../app/services.js";
import { registerScreen } from "../nav.js";
import { t } from "../../content/i18n.js";

export function runScreen() {
  const r = App.run, br = $("bracket"); br.innerHTML = "";
  const btn = $("btnRunNext");
  if (r.kind === "cup") {
    $("runTitle").textContent = t("run.cupTitle");
    const titles = [t("run.quarter"), t("run.semi"), t("run.final")];
    r.ops.forEach((o, n) => {
      const d = document.createElement("div"); d.className = "round";
      const res = r.res[n];
      if (n === r.round && !r.done) d.classList.add("now");
      if (res) d.classList.add(res.win ? "won" : "lost");
      d.innerHTML = `<small>${titles[n]}</small>`;
      d.append(avatarCanvas(o.ch, 76, { dir: -1, mood: res ? (res.win ? "sad" : "happy") : "" }));
      d.insertAdjacentHTML("beforeend", `<b>${charById(o.ch).name}</b><em>${DIFFS[o.diff].name} · ${arenaById(o.arena).name}</em>` + (res ? `<span class="res">${res.s[0]} : ${res.s[1]}</span>` : ""));
      br.append(d);
    });
    const tr = document.createElement("div"); tr.className = "round trophy" + (r.done && r.round >= 3 ? " won" : ""); tr.innerHTML = svg("i-trophy") + `<b>${t("rw.trophy")}</b><em>+300</em>`; br.append(tr);
    if (r.done) { $("runNote").textContent = r.round >= 3 ? t("trophy.title") : t("run.out"); btn.textContent = t("ui.back"); }
    else { $("runNote").textContent = t("run.roundVs", { round: titles[r.round], name: charById(r.ops[r.round].ch).name }); btn.textContent = t(r.round === 0 ? "run.go" : "run.nextMatch"); }
  } else {
    $("runTitle").textContent = t("mode.endless.name");
    const cur = document.createElement("div"); cur.className = "round";
    cur.innerHTML = `<small>${t("run.streak")}</small><span class="streakbig">${r.streak}</span><em>${t("run.record", { n: Math.max(S.endlessBest, r.streak) })}</em>`;
    br.append(cur);
    if (!r.done) {
      const o = r.next, d = document.createElement("div"); d.className = "round now";
      d.innerHTML = `<small>${t("end.nextOpp")}</small>`;
      d.append(avatarCanvas(o.ch, 76, { dir: -1 }));
      d.insertAdjacentHTML("beforeend", `<b>${charById(o.ch).name}</b><em>${DIFFS[o.diff].name} · ${arenaById(o.arena).name} · ${t("run.firstTo", { n: 3 })}</em>`);
      br.append(d);
      $("runNote").textContent = t(r.streak ? "run.keepGoing" : "run.howMany");
      btn.textContent = t(r.streak ? "run.nextMatch" : "run.go");
    } else { $("runNote").textContent = t("run.outAfter", { n: r.streak }); btn.textContent = t("ui.back"); }
  }
  App.stack = ["home"];
  $$(".screen").forEach(s => s.hidden = s.id !== "scr-run"); App.screen = "run"; $("touch").hidden = true; $("gameBtns").hidden = true;
  document.body.classList.remove("ingame");
  if (App.mode !== "demo") { startDemo(); updateBand(); A.crowdOff(); A.music(true, "menu"); }
}

export function dailyBriefing() {
  const c = dailyChallenge(), o = charById(c.opp);
  const lines = [t("ch.opp", { name: o.name, diff: DIFFS[c.diff].name }), t("ch.arena", { name: arenaById(c.arena).name }), t("ch.rules", { name: c.presetName, len: matchLen(c.rules).win ? t("run.firstTo", { n: matchLen(c.rules).win }) : t("ch.sixty") })];
  modal({ title: t("mode.daily.name"), icon: "i-cal", body: `<div class="briefav"></div><p>${lines.join("<br>")}</p><p>${c.done ? t("ch.doneToday") : t("ch.reward", { n: c.reward })}</p>`, btn: t("setup.kickoff"), onOk: () => beginMatch({ mode: "daily", chars: [S.char, c.opp], arena: c.arena, dur: c.dur, rules: c.rules, golden: true, diff: c.diff, names: cpuNames(c.opp), labels: [t("hud.you"), null], ball: S.ball }), cancel: t("ui.later") });
  const box = document.querySelector(".briefav"); if (box) box.append(avatarCanvas(c.opp, 110, { dir: -1, mood: "angry" }));
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initRun() {
  registerScreen("run", { back: () => { App.run = null; } });
  $("btnRunNext").onclick = runNext;
}
