// Modus-Auswahl
import { MODES } from "../../content/config.js";
import { challenge, S, save } from "../../app/profile.js";
import { App } from "../../app/state.js";
import { $ } from "../dom.js";
import { showScreen, registerScreen } from "../nav.js";
import { audio as A } from "../../app/services.js";

export function modesScreen() {
  const g = $("modeGrid"); g.innerHTML = "";
  MODES.forEach(m => {
    const b = document.createElement("button"); b.className = "mcard" + (S.mode === m.id ? " on" : "");
    b.style.setProperty("--c1", m.c1); b.style.setProperty("--c2", m.c2);
    let tags = [...m.tags];
    if (m.id === "daily") { const c = challenge(); tags = [c.done ? "Heute geschafft" : `+${c.reward} heute`]; }
    if (m.id === "endless" && S.endlessBest) tags = [`Rekord ${S.endlessBest}`];
    b.innerHTML = `<svg class="big-ic"><use href="#${m.icon}"/></svg><b>${m.name}</b><p>${m.desc}</p><span class="tags">${tags.map(t => `<span class="tag">${t}</span>`).join("")}</span>` + (m.isNew ? '<span class="newflag">NEU</span>' : "");
    b.onclick = () => { A.sfx("click"); S.mode = m.id; save(); App.stack = []; showScreen("home", true); };
    g.append(b);
  });
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initModes() {
  registerScreen("modes", { show: modesScreen });
}
