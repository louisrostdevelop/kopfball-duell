// Profil (Tipp auf den Namen oben links): Spielerkarte, Konto-Stand (offline / Gast / angemeldet), Statistik
import { S, xpFor } from "../../app/profile.js";
import { online as serverOn } from "../../app/account.js";
import { audio as A, auth } from "../../app/services.js";
import { cosById } from "../../content/cosmetics.js";
import { avatarCanvas } from "../render/art.js";
import { $, esc, svg } from "../dom.js";
import { registerScreen, showScreen } from "../nav.js";
import { saveName } from "./online.js";
import { showLogin } from "./account.js";
import { t } from "../../content/i18n.js";

/** Konto-Stand für Profil und Kopfzeile: offline (ohne Server), guest, pending (Mail unbestätigt), signed */
export function accountState() {
  if (!serverOn()) return { kind: "offline" };
  const u = auth.user() || { guest: true };
  if (!u.guest) return { kind: "signed", email: u.email || "" };
  return u.pendingEmail ? { kind: "pending", email: u.pendingEmail } : { kind: "guest" };
}

function toSettings(login) {
  A.sfx("click"); showScreen("settings");
  if (login) showLogin();
  const p = $("accountPanel"); if (p) setTimeout(() => p.scrollIntoView({ block: "start", behavior: "smooth" }), 60);
}

function nameEdit() {
  const box = $("pcNameBox"), old = S.name || "";
  box.innerHTML = `<input id="pcNameIn" maxlength="12" value="${esc(old)}" placeholder="${t("html.attr.deinName")}" autocomplete="nickname">`;
  const inp = $("pcNameIn"); inp.focus(); inp.select();
  const done = () => { saveName(inp.value); playerScreen(); };
  inp.onblur = done;
  inp.onkeydown = e => { if (e.key === "Enter") inp.blur(); if (e.key === "Escape") { inp.value = old; inp.blur(); } };
}

export function playerScreen() {
  const av = $("pcAv"); av.innerHTML = ""; av.append(avatarCanvas(S.char, 112, { mood: "happy", frame: S.equip.frame, live: true }));
  $("pcNameBox").innerHTML = `<b>${esc(S.name || t("ui.player"))}</b><button class="pc-edit" id="pcEdit" aria-label="${t("player.editName")}">${svg("i-pen")}</button>`;
  $("pcEdit").onclick = () => { A.sfx("click"); nameEdit(); };
  const ti = cosById(S.equip.title); $("pcTitle").textContent = ti ? ti.name : "";
  $("pcLvl").textContent = S.level;
  $("pcXp").style.width = Math.round(S.xp / xpFor(S.level) * 100) + "%";
  $("pcXpTxt").textContent = t("player.xp", { n: S.xp, max: xpFor(S.level) });
  // Konto-Stand: auf einen Blick, ob der Spielstand sicher ist
  const a = accountState(), box = $("pcAcc");
  box.className = "acccard " + a.kind;
  if (a.kind === "offline") box.innerHTML = `<span class="ac-ic">${svg("i-user")}</span><div><b>${t("player.offlineT")}</b><p>${t("player.offlineD")}</p></div>`;
  else if (a.kind === "signed") box.innerHTML = `<span class="ac-ic">${svg("i-check")}</span><div><b>${t("player.signedT")}</b><p>${esc(a.email)}</p></div><button class="btn small ghost" id="pcAccBtn">${t("player.manage")}</button>`;
  else {
    box.innerHTML = `<span class="ac-ic">${svg("i-user")}</span><div><b>${t("player.guestT")}</b><p>${a.kind === "pending" ? t("player.pending", { email: esc(a.email) }) : t("player.guestD")}</p></div>
      <div class="ac-btns"><button class="btn small green" id="pcAccBtn">${t(a.kind === "pending" ? "player.manage" : "player.secure")}</button><button class="linkbtn" id="pcLogin">${t("player.signIn")}</button></div>`;
    $("pcLogin").onclick = () => toSettings(true);
  }
  const ab = $("pcAccBtn"); if (ab) ab.onclick = () => toSettings(false);
  const st = S.stats;
  $("pcStats").innerHTML = [[t("prof.games"), st.games], [t("prof.wins"), st.wins], [t("prof.goals"), st.goals], [t("prof.headGoals"), st.headGoals], [t("stat.supers"), st.supers], [t("prof.endless"), S.endlessBest]]
    .map(([l, v]) => `<div class="pstat"><b>${v}</b><span>${l}</span></div>`).join("");
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initPlayer() {
  registerScreen("player", { show: playerScreen });
  $("pcToAch").onclick = () => { A.sfx("click"); showScreen("ach"); };
  $("pcToLocker").onclick = () => { A.sfx("click"); showScreen("locker"); };
}
