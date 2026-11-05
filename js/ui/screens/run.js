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

export function runScreen() {
  const r = App.run, br = $("bracket"); br.innerHTML = "";
  const btn = $("btnRunNext");
  if (r.kind === "cup") {
    $("runTitle").textContent = "Kopfball-Cup";
    const titles = ["Viertelfinale", "Halbfinale", "Finale"];
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
    const tr = document.createElement("div"); tr.className = "round trophy" + (r.done && r.round >= 3 ? " won" : ""); tr.innerHTML = svg("i-trophy") + "<b>Pokal</b><em>+300</em>"; br.append(tr);
    if (r.done) { $("runNote").textContent = r.round >= 3 ? "Pokalsieger!" : "Ausgeschieden. Nächstes Mal!"; btn.textContent = "Zurück"; }
    else { $("runNote").textContent = `${titles[r.round]} gegen ${charById(r.ops[r.round].ch).name}`; btn.textContent = r.round === 0 ? "Los geht's" : "Nächstes Spiel"; }
  } else {
    $("runTitle").textContent = "Endlos";
    const cur = document.createElement("div"); cur.className = "round";
    cur.innerHTML = `<small>Siege am Stück</small><span class="streakbig">${r.streak}</span><em>Rekord: ${Math.max(S.endlessBest, r.streak)}</em>`;
    br.append(cur);
    if (!r.done) {
      const o = r.next, d = document.createElement("div"); d.className = "round now";
      d.innerHTML = "<small>Nächster Gegner</small>";
      d.append(avatarCanvas(o.ch, 76, { dir: -1 }));
      d.insertAdjacentHTML("beforeend", `<b>${charById(o.ch).name}</b><em>${DIFFS[o.diff].name} · ${arenaById(o.arena).name} · Erster bis 3</em>`);
      br.append(d);
      $("runNote").textContent = r.streak ? "Weiter so!" : "Wie viele Siege schaffst du am Stück?";
      btn.textContent = r.streak ? "Nächstes Spiel" : "Los geht's";
    } else { $("runNote").textContent = `Aus nach ${r.streak} ${r.streak === 1 ? "Sieg" : "Siegen"}.`; btn.textContent = "Zurück"; }
  }
  App.stack = ["home"];
  $$(".screen").forEach(s => s.hidden = s.id !== "scr-run"); App.screen = "run"; $("touch").hidden = true; $("gameBtns").hidden = true;
  document.body.classList.remove("ingame");
  if (App.mode !== "demo") { startDemo(); updateBand(); A.crowdOff(); A.music(true, "menu"); }
}

export function dailyBriefing() {
  const c = dailyChallenge(), o = charById(c.opp);
  const lines = [`Gegner: <b>${o.name}</b> (${DIFFS[c.diff].name})`, `Arena: <b>${arenaById(c.arena).name}</b>`, `Regeln: <b>${c.presetName}</b>, ${matchLen(c.rules).win ? `Erster bis ${matchLen(c.rules).win}` : "60 Sekunden"}`];
  modal({ title: "Tages-Challenge", icon: "i-cal", body: `<div class="briefav"></div><p>${lines.join("<br>")}</p><p>${c.done ? "Heute schon geschafft. Du kannst trotzdem spielen." : `Sieg bringt <b>+${c.reward}</b> Münzen.`}</p>`, btn: "Anpfiff", onOk: () => beginMatch({ mode: "daily", chars: [S.char, c.opp], arena: c.arena, dur: c.dur, rules: c.rules, golden: true, diff: c.diff, names: cpuNames(c.opp), labels: ["DU", null], ball: S.ball }), cancel: "Später" });
  const box = document.querySelector(".briefav"); if (box) box.append(avatarCanvas(c.opp, 110, { dir: -1, mood: "angry" }));
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initRun() {
  registerScreen("run", { back: () => { App.run = null; } });
  $("btnRunNext").onclick = runNext;
}
