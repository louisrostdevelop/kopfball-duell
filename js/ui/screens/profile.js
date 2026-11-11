// Profil (Klick oben links): Spielerkarte (Kopf mit Rahmen, Name, Titel, Level), Statistik, Erfolge und Ausrüstung,
// daneben das Konto (sichern, anmelden, abmelden, löschen) und „Fortschritt löschen“
import { S, reset as resetProfile, xpFor } from "../../app/profile.js";
import { $, esc, svg, toast } from "../dom.js";
import { audio as A, auth } from "../../app/services.js";
import { registerScreen, showScreen } from "../nav.js";
import { avatarCanvas } from "../render/art.js";
import { saveName } from "./online.js";
import { refreshTop } from "./home.js";
import { accountUI, initAccountUI, refreshAccount } from "./account.js";
import { online as serverOn, setServerName } from "../../app/account.js";
import { cosById } from "../../content/cosmetics.js";
import { t } from "../../content/i18n.js";

/** Konto-Stand für Kopfzeile und Profil: offline (ohne Server), guest, pending (Code unterwegs), signed */
export function accountState() {
  if (!serverOn()) return { kind: "offline" };
  const u = (auth && auth.user()) || { guest: true };
  if (!u.guest) return { kind: "signed", email: u.email || "" };
  return u.pendingEmail ? { kind: "pending", email: u.pendingEmail } : { kind: "guest" };
}

/** Name übernehmen: lokal speichern und, mit Server, dort setzen (Fehler wie „Name vergeben“ als Hinweis) */
async function commitName(v) {
  const before = S.name || "";
  saveName(v); refreshTop();
  if (serverOn() && (S.name || "") !== before) { const err = await setServerName(S.name); if (err) toast(err, "i-close"); else toast(t("set.nameSaved"), "i-check"); }
}

function nameView() {
  $("pcNameBox").innerHTML = `<b>${esc(S.name || t("ui.player"))}</b><button class="pc-edit" id="pcEdit" aria-label="${t("player.editName")}">${svg("i-pen")}</button>`;
  $("pcEdit").onclick = () => { A.sfx("click"); nameEdit(); };
}
function nameEdit() {
  const box = $("pcNameBox"), old = S.name || "";
  box.innerHTML = `<input id="pcNameIn" maxlength="12" value="${esc(old)}" placeholder="${t("html.attr.deinName")}" autocomplete="nickname">`;
  const inp = $("pcNameIn"); inp.focus(); inp.select();
  let done = false;
  const finish = keep => { if (done) return; done = true; if (keep) commitName(inp.value).then(nameView); else nameView(); };
  inp.onblur = () => finish(true);
  inp.onkeydown = e => { if (e.key === "Enter") finish(true); if (e.key === "Escape") finish(false); };
}

export function profileScreen() {
  const av = $("profAv"); av.innerHTML = ""; av.append(avatarCanvas(S.char, 112, { mood: "happy", frame: S.equip.frame, live: true }));
  nameView();
  const ti = cosById(S.equip.title); $("pcTitle").textContent = ti ? ti.name : ""; $("pcTitle").hidden = !ti;
  $("profLvl").textContent = S.level;
  const need = xpFor(S.level);
  $("profXp").style.width = Math.round(S.xp / need * 100) + "%";
  $("profXpTxt").textContent = t("player.xp", { n: S.xp, max: need });
  const st = S.stats;
  $("profStats").innerHTML = [[t("prof.games"), st.games], [t("prof.wins"), st.wins], [t("prof.goals"), st.goals], [t("prof.headGoals"), st.headGoals], [t("stat.supers"), st.supers], [t("prof.endless"), S.endlessBest]]
    .map(([l, v]) => `<div class="pstat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join("");
  $("localPanel").hidden = serverOn();
  accountUI(); refreshAccount();
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initProfileScreen() {
  registerScreen("profile", { show: profileScreen });
  initAccountUI();
  $("btnProfAch").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("pcToLocker").onclick = () => { A.sfx("click"); showScreen("locker"); };
  $("btnReset").onclick = async () => { if (confirm(t("set.confirmReset"))) { await resetProfile(); location.reload(); } };
}
