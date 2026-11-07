// Modus-Auswahl
import { MODES } from "../../content/config.js";
import { MAX_STARS, totalStars } from "../../core/career.js";
import { challenge, S, save } from "../../app/profile.js";
import { App } from "../../app/state.js";
import { $ } from "../dom.js";
import { showScreen, registerScreen } from "../nav.js";
import { audio as A } from "../../app/services.js";
import { online as serverOn, serverState } from "../../app/account.js";
import { league, MIN_LEVEL } from "../../app/matchmaking.js";
import { activity } from "../../app/activity.js";
import { t } from "../../content/i18n.js";

/** Modi, die es gerade gibt (Casual/Ranked nur mit Server) */
export const availableModes = () => MODES.filter(m => !m.server || serverOn());
/** Warum ein Server-Modus gesperrt ist: "level" | "account" | "season" | "" */
export function modeLock(id) {
  if (id !== "casual" && id !== "ranked") return "";
  if (S.level < MIN_LEVEL[id]) return "level";
  if (id === "ranked" && S.guest !== false) return "account";
  if (id === "ranked" && serverState() && !serverState().season) return "season";
  return "";
}
/** Kurztext für die Sperre */
export const lockText = (lock, id) => (lock ? t("lock." + lock, { n: MIN_LEVEL[id] }) : "");

export function modesScreen() {
  const g = $("modeGrid"); g.innerHTML = "";
  availableModes().forEach(m => {
    const b = document.createElement("button"); b.className = "mcard" + (S.mode === m.id ? " on" : "");
    b.dataset.mode = m.id; b.style.setProperty("--c1", m.c1); b.style.setProperty("--c2", m.c2);
    let tags = [...m.tags];
    if (m.id === "daily") { const c = challenge(); tags = [c.done ? t("mode.daily.done") : t("mode.daily.today", { n: c.reward })]; }
    if (m.id === "endless" && S.endlessBest) tags = [t("mode.endless.record", { n: S.endlessBest })];
    if (m.id === "career") tags = [t("career.stars", { n: totalStars(S.career), max: MAX_STARS })];
    if (m.id === "ranked") { const r = serverState() && serverState().season && serverState().season.rating; tags = [league(r ? r.mmr : 1000) + " · " + (r ? r.mmr : 1000)]; }
    const lock = modeLock(m.id); if (lock) { tags = [lockText(lock, m.id)]; b.classList.add("locked"); }
    b.innerHTML = `<svg class="big-ic"><use href="#${m.icon}"/></svg><b>${m.name}</b><p>${m.desc}</p><span class="tags">${tags.map(x => `<span class="tag">${x}</span>`).join("")}</span>` + (m.isNew ? `<span class="newflag">${t("ui.new")}</span>` : "");
    b.onclick = () => { A.sfx("click"); S.mode = m.id; save(); App.stack = []; showScreen("home", true); };
    g.append(b);
  });
  // Aktivität dezent an Casual und Ranked: wie viele gerade suchen bzw. spielen
  activity().then(a => {
    if (!a) return;
    for (const id of ["casual", "ranked"]) {
      const card = g.querySelector(`[data-mode="${id}"]`);
      if (!card || card.classList.contains("locked") || card.querySelector(".tag.live")) continue;
      const tag = document.createElement("span"); const { text, on } = activityText(a, id);
      tag.className = "tag live" + (on ? " on" : ""); tag.textContent = text;
      card.querySelector(".tags").append(tag);
    }
  });
}

/** Kurztext zur Aktivität für einen Modus: suchen > spielen > aktiv > ruhig */
export function activityText(a, id) {
  const n = a[id] || 0;
  if (n > 0) return { text: t(n === 1 ? "act.search1" : "act.search", { n }), on: true };
  if (a.playing > 0) return { text: t("act.playing", { n: a.playing }), on: true };
  if (a.active > 1) return { text: t("act.active", { n: a.active }), on: false };
  return { text: t("act.quiet"), on: false };
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initModes() {
  registerScreen("modes", { show: modesScreen });
}
