// Endbildschirm
import { S, xpFor } from "../../store.js";
import { avatarCanvas } from "../render/art.js";
import { App } from "../../app/state.js";
import { $, esc, toast } from "../dom.js";
import { levelModal } from "../modals.js";
import { showScreen } from "../nav.js";
import * as A from "../../adapters/audio/webaudio.js";

export function showEnd(r) {
  const st = App.st, [a, b] = st.s, me = r.me;
  const t = $("endTitle");
  if (me < 0) { t.textContent = a === b ? "Unentschieden" : (App.names[a > b ? 0 : 1]) + " gewinnt!"; t.className = "ribbon gold"; }
  else if (r.win) { t.textContent = r.runInfo === "cup" ? "Pokalsieger!" : "Sieg!"; t.className = "ribbon" + (r.runInfo === "cup" ? " gold" : ""); }
  else { t.textContent = a === b ? "Unentschieden" : "Niederlage"; t.className = "ribbon " + (a === b ? "draw" : "lose"); }
  [0, 1].forEach(i => { const av = $("endAv" + i); av.innerHTML = ""; const won = st.s[i] > st.s[1 - i]; av.append(avatarCanvas(st.p[i].ch, 92, { dir: i ? -1 : 1, mood: won ? "happy" : st.s[i] < st.s[1 - i] ? "sad" : "" })); $("endN" + i).textContent = App.names[i]; });
  $("endS0").textContent = a; $("endS1").textContent = b;
  const s0 = st.stats[0], s1 = st.stats[1];
  const rows = [["Schüsse", s0.shots, s1.shots], ["Kopfbälle", s0.heads, s1.heads], ["Spezialschüsse", s0.supers, s1.supers], ["Power-ups", s0.pus, s1.pus], ["Schubser", s0.stomps, s1.stomps]].filter(r => r[1] + r[2] > 0);
  $("endStats").innerHTML = rows.map(([l, x, y]) => `<span class="v">${x}</span><span class="lbl">${l}</span><span class="v r">${y}</span>`).join("");
  const rw = $("endRewards"); rw.innerHTML = "";
  r.lines.forEach(([l, c], n) => { const d = document.createElement("div"); d.className = "rw-line"; d.style.animationDelay = (0.2 + n * 0.22) + "s"; d.innerHTML = `<span class="coin"></span><b>+${c}</b><span>${esc(l)}</span>`; rw.append(d); setTimeout(() => A.sfx("coin"), 200 + n * 220); });
  if (r.lines.length) {
    const xp = document.createElement("div"); xp.className = "xpwrap rw-line"; xp.style.animationDelay = (0.3 + r.lines.length * 0.22) + "s";
    xp.innerHTML = `<span>Level ${S.level}</span><span class="xpbar"><i style="width:0%"></i></span>`; rw.append(xp);
    setTimeout(() => { const i = xp.querySelector("i"); if (i) i.style.width = Math.round(S.xp / xpFor(S.level) * 100) + "%"; }, 50);
  }
  r.achs.forEach((ac, n) => setTimeout(() => { toast(`Erfolg: ${ac.name} (+${ac.reward})`, "i-star", true); A.sfx("levelup"); }, 900 + n * 1200));
  if (r.ups.length) setTimeout(() => levelModal(r.ups[r.ups.length - 1]), 1500);
  if (r.runInfo === "record") setTimeout(() => toast("Neuer Endlos-Rekord!", "i-inf", true), 700);
  const again = $("btnEndAgain"), note = $("endNote"), menu = $("btnEndMenu");
  note.textContent = ""; again.hidden = false; again.disabled = false; again.className = "btn yellow big";
  menu.textContent = "Menü";
  switch (App.mode) {
    case "cup": case "endless": again.textContent = App.run && !App.run.done ? "Weiter" : "Fertig"; break;
    case "guest": again.textContent = "Revanche!"; note.textContent = "Der Gastgeber startet die nächste Runde."; menu.textContent = "Verlassen"; break;
    case "host": again.textContent = "Revanche"; menu.textContent = "Lobby"; break;
    case "daily": again.textContent = "Nochmal"; break;
    default: again.textContent = "Revanche";
  }
  showScreen("end");
}
