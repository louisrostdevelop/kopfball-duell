// Konto in den Einstellungen (nur mit Server): Gast sichern (E-Mail), Passwort für andere Geräte, anmelden, abmelden
import { $, esc, toast } from "../dom.js";
import { S, reset as resetProfile } from "../../app/profile.js";
import { deleteAccount, online as serverOn } from "../../app/account.js";
import { audio as A, auth } from "../../app/services.js";
import { t } from "../../content/i18n.js";

let view = "main";   // main | login
const okMail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const msg = (text, err) => { const m = $("accMsg"); if (m) { m.textContent = text; m.classList.toggle("err", !!err); } };
const ERR = ["email_exists", "invalid_credentials", "weak_password", "over_email_send_rate_limit", "offline"];
const errText = e => (ERR.includes(e && e.code) ? t("acc.err." + e.code) : e && /password/i.test(e.code) ? t("acc.err.weak_password") : t("acc.err.other", { code: e && e.code ? " (" + e.code + ")" : "" }));

export function accountUI() {
  const box = $("accountPanel"); box.hidden = !serverOn(); if (box.hidden) return;
  const u = auth.user() || { guest: true }, b = $("accBody");
  if (view === "login") {
    b.innerHTML = `<p class="hint">${t("acc.loginHint")}</p>
      <input id="accMail" type="email" placeholder="${t("acc.email")}" autocomplete="email"><input id="accPw" type="password" placeholder="${t("acc.password")}" autocomplete="current-password">
      <div class="row"><button class="btn small ghost" id="accBack">${t("ui.back")}</button><button class="btn small green" id="accLogin">${t("acc.signIn")}</button></div><p class="hint" id="accMsg"></p>`;
    $("accBack").onclick = () => { view = "main"; accountUI(); };
    $("accLogin").onclick = async () => {
      const email = $("accMail").value.trim(), password = $("accPw").value;
      if (!okMail(email) || !password) { msg(t("acc.enterBoth"), true); return; }
      try { await auth.signIn({ email, password }); await resetProfile(); location.reload(); } catch (e) { msg(errText(e), true); }
    };
    return;
  }
  if (u.guest) {
    b.innerHTML = `<div class="accstate guest"><svg><use href="#i-user"/></svg><span><b>${t("ui.guest")}</b><small>${u.pendingEmail ? t("acc.pending", { email: esc(u.pendingEmail) }) : t("acc.guestState")}</small></span></div>
      <p class="hint">${t("acc.secureHint")}</p>
      <input id="accMail" type="email" placeholder="${t("acc.email")}" autocomplete="email" value="${esc(u.pendingEmail || "")}">
      <button class="btn green" id="accLink">${t(u.pendingEmail ? "acc.resend" : "acc.secure")}</button>
      <p class="hint" id="accMsg"></p>
      <button class="linkbtn" id="accToLogin">${t("acc.haveAccount")}</button>`;
    $("accLink").onclick = async () => {
      A.sfx("click");
      const email = $("accMail").value.trim();
      if (!okMail(email)) { msg(t("acc.badEmail"), true); return; }
      try { await auth.upgrade({ email }); msg(t("acc.mailSent")); toast(t("acc.mailSentToast"), "i-check"); setTimeout(accountUI, 2500); }
      catch (e) { msg(errText(e), true); }
    };
    $("accToLogin").onclick = () => { view = "login"; accountUI(); };
    return;
  }
  b.innerHTML = `<div class="accstate"><svg><use href="#i-user"/></svg><span><b>${esc(S.name || t("ui.player"))}</b><small>${esc(u.email || "")}</small></span></div>
    <p class="hint">${t("acc.pwHint")}</p>
    <input id="accPw" type="password" placeholder="${t("acc.newPw")}" autocomplete="new-password">
    <div class="row"><button class="btn small green" id="accSetPw">${t("acc.savePw")}</button><button class="btn small ghost danger" id="accOut">${t("acc.signOut")}</button></div>
    <p class="hint" id="accMsg"></p>
    <button class="linkbtn danger" id="accDelete">${t("acc.delete")}</button>`;
  $("accSetPw").onclick = async () => {
    const pw = $("accPw").value;
    if (pw.length < 10 || !/[a-z]/i.test(pw) || !/\d/.test(pw)) { msg(ERR.weak_password, true); return; }
    try { await auth.setPassword(pw); $("accPw").value = ""; msg(t("acc.saved")); } catch (e) { msg(errText(e), true); }
  };
  $("accDelete").onclick = async () => {
    if (!confirm(t("acc.confirmDelete"))) return;
    try { await deleteAccount(); await auth.signOut(); await resetProfile(); location.reload(); } catch (e) { msg(errText(e), true); }
  };
  $("accOut").onclick = async () => {
    if (!confirm(t("acc.confirmLogout"))) return;
    await auth.signOut(); await resetProfile(); location.reload();
  };
}
