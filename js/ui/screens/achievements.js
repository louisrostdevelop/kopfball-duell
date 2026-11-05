// Erfolge und Profil-Statistik
import { ACHIEVEMENTS } from "../../content/config.js";
import { achProgress, S } from "../../store.js";
import { $, svg } from "../dom.js";

export function achScreen() {
  const st = S.stats;
  $("profileBox").innerHTML = [["Spiele", st.games], ["Siege", st.wins], ["Tore", st.goals], ["Kopfballtore", st.headGoals], ["Spezialschüsse", st.supers], ["Endlos-Rekord", S.endlessBest]].map(([l, v]) => `<div class="pstat"><b>${v}</b><span>${l}</span></div>`).join("");
  const l = $("achList"); l.innerHTML = "";
  ACHIEVEMENTS.forEach(a => {
    const done = !!S.ach[a.id], p = achProgress(a);
    const d = document.createElement("div"); d.className = "ach" + (done ? " done" : "");
    d.innerHTML = `<span class="medal">${svg(done ? "i-star" : "i-lock")}</span><div style="flex:1;min-width:0"><b>${a.name}</b><p>${a.desc}</p>${a.stat && !done ? `<div class="prog"><i style="width:${Math.round(p * 100)}%"></i></div>` : ""}</div><span class="rw">${done ? svg("i-check").replace("<svg>", '<svg style="width:22px;height:22px">') : `<span class="coin"></span>${a.reward}`}</span>`;
    l.append(d);
  });
  $("achSum").textContent = Object.keys(S.ach).length + " / " + ACHIEVEMENTS.length;
}
