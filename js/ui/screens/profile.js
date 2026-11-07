// Profil (Klick oben links): Kopf, Name, Level, Statistik, Konto und Spielstand löschen
import { S, reset as resetProfile, xpFor } from "../../app/profile.js";
import { $, toast } from "../dom.js";
import { audio as A } from "../../app/services.js";
import { registerScreen, showScreen } from "../nav.js";
import { avatarCanvas } from "../render/art.js";
import { saveName } from "./online.js";
import { refreshTop } from "./home.js";
import { accountUI } from "./account.js";
import { online as serverOn, setServerName } from "../../app/account.js";
import { t } from "../../content/i18n.js";

export function profileScreen() {
  const av = $("profAv"); av.innerHTML = ""; av.append(avatarCanvas(S.char, 96));
  $("setName").value = S.name || "";
  $("profLvl").textContent = S.level;
  const need = xpFor(S.level);
  $("profXp").style.width = Math.round(S.xp / need * 100) + "%";
  $("profXpTxt").textContent = S.xp + " / " + need + " XP";   // i18n-ok: Einheit
  const st = S.stats;
  $("profStats").innerHTML = [[t("prof.games"), st.games], [t("prof.wins"), st.wins], [t("prof.goals"), st.goals], [t("prof.headGoals"), st.headGoals], [t("stat.supers"), st.supers], [t("prof.endless"), S.endlessBest]]
    .map(([l, v]) => `<div class="pstat"><b>${v}</b><span>${l}</span></div>`).join("");
  $("localPanel").hidden = serverOn();
  accountUI();
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initProfileScreen() {
  registerScreen("profile", { show: profileScreen });
  $("setName").addEventListener("change", async e => {
    saveName(e.target.value); refreshTop();
    if (serverOn()) { const err = await setServerName(S.name); if (err) toast(err, "i-close"); else toast(t("set.nameSaved"), "i-check"); }
  });
  $("btnProfAch").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("btnReset").onclick = async () => { if (confirm(t("set.confirmReset"))) { await resetProfile(); location.reload(); } };
}
