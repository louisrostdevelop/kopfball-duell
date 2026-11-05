// Modus-Auswahl
import { MODES } from "../../content/config.js";
import { challenge, S, save } from "../../app/profile.js";
import { App } from "../../app/state.js";
import { $ } from "../dom.js";
import { showScreen, registerScreen } from "../nav.js";
import { audio as A } from "../../app/services.js";
import { online as serverOn, serverState } from "../../app/account.js";
import { league, MIN_LEVEL } from "../../app/matchmaking.js";

/** Modi, die es gerade gibt (Casual/Ranked nur mit Server) */
export const availableModes = () => MODES.filter(m => !m.server || serverOn());
/** Warum ein Server-Modus gesperrt ist (oder "") */
export function modeLock(id) {
  if (id !== "casual" && id !== "ranked") return "";
  if (S.level < MIN_LEVEL[id]) return `ab Level ${MIN_LEVEL[id]}`;
  if (id === "ranked" && S.guest !== false) return "Konto nötig";
  return "";
}

export function modesScreen() {
  const g = $("modeGrid"); g.innerHTML = "";
  availableModes().forEach(m => {
    const b = document.createElement("button"); b.className = "mcard" + (S.mode === m.id ? " on" : "");
    b.style.setProperty("--c1", m.c1); b.style.setProperty("--c2", m.c2);
    let tags = [...m.tags];
    if (m.id === "daily") { const c = challenge(); tags = [c.done ? "Heute geschafft" : `+${c.reward} heute`]; }
    if (m.id === "endless" && S.endlessBest) tags = [`Rekord ${S.endlessBest}`];
    if (m.id === "ranked") { const r = serverState() && serverState().season && serverState().season.rating; tags = [league(r ? r.mmr : 1000) + " · " + (r ? r.mmr : 1000)]; }
    const lock = modeLock(m.id); if (lock) { tags = [lock]; b.classList.add("locked"); }
    b.innerHTML = `<svg class="big-ic"><use href="#${m.icon}"/></svg><b>${m.name}</b><p>${m.desc}</p><span class="tags">${tags.map(t => `<span class="tag">${t}</span>`).join("")}</span>` + (m.isNew ? '<span class="newflag">NEU</span>' : "");
    b.onclick = () => { A.sfx("click"); S.mode = m.id; save(); App.stack = []; showScreen("home", true); };
    g.append(b);
  });
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initModes() {
  registerScreen("modes", { show: modesScreen });
}
