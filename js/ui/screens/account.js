// Konto in den Einstellungen (nur mit Server): Gast sichern und auf anderen Geräten anmelden, beides mit einem
// 6-stelligen Code aus der Mail (kein Passwort). Der Link in der Mail geht auch, der Code klappt aber überall,
// auch in der installierten App auf dem iPhone (dort öffnet ein Link Safari statt der App).
import { $, esc, toast } from "../dom.js";
import { S, reset as resetProfile } from "../../app/profile.js";
import { deleteAccount, online as serverOn } from "../../app/account.js";
import { audio as A, auth } from "../../app/services.js";
import { t } from "../../content/i18n.js";

let view = "main";   // main | login
let loginMail = "";  // Anmelden: Code ist an diese Adresse unterwegs
let otherMail = false;   // Sichern: trotz offenem Code eine andere Adresse eingeben
const okMail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const okCode = v => /^\d{6}$/.test(v);
const msg = (text, err) => { const m = $("accMsg"); if (m) { m.textContent = text; m.classList.toggle("err", !!err); } };
const ERR = ["email_exists", "otp_expired", "otp_disabled", "over_email_send_rate_limit", "offline"];
const errText = e => (ERR.includes(e && e.code) ? t("acc.err." + e.code) : t("acc.err.other", { code: e && e.code ? " (" + e.code + ")" : "" }));
// Eingabefeld für den 6-stelligen Code aus der Mail (Handys bieten den Code aus der Mail direkt an)
const codeInput = () => `<input id="accCode" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${t("acc.codePh")}">`;
const code = () => ($("accCode").value || "").replace(/\D/g, "");
// Hinweis auf Nutzungsbedingungen und Datenschutz direkt am Knopf (Einbeziehung nach § 305 Abs. 2 BGB)
const legalNote = () => `<p class="hint accnote">${t("legal.acceptSecure", { terms: `<a href="legal/terms.html" target="_blank" rel="noopener">${t("legal.terms")}</a>`, privacy: `<a href="legal/privacy.html" target="_blank" rel="noopener">${t("legal.privacy")}</a>` })}</p>`;

/** Nach Anmelden auf einem anderen Konto: lokalen Stand verwerfen und neu laden */
async function switched() { await resetProfile(); location.reload(); }

export function accountUI() {
  const box = $("accountPanel"); box.hidden = !serverOn(); if (box.hidden) return;
  const u = auth.user() || { guest: true }, b = $("accBody");
  if (view === "login") {
    if (!loginMail) {
      b.innerHTML = `<p class="hint">${t("acc.loginHint")}</p>
        <input id="accMail" type="email" placeholder="${t("acc.email")}" autocomplete="email">
        <div class="row"><button class="btn small ghost" id="accBack">${t("ui.back")}</button><button class="btn small green" id="accSend">${t("acc.sendCode")}</button></div><p class="hint" id="accMsg"></p>`;
      $("accSend").onclick = async () => {
        A.sfx("click");
        const email = $("accMail").value.trim();
        if (!okMail(email)) { msg(t("acc.badEmail"), true); return; }
        try { await auth.sendCode({ email }); loginMail = email; accountUI(); msg(t("acc.codeSent", { email })); } catch (e) { msg(errText(e), true); }
      };
    } else {
      b.innerHTML = `<p class="hint">${t("acc.codeSent", { email: esc(loginMail) })}</p>${codeInput()}
        <div class="row"><button class="btn small ghost" id="accBack">${t("ui.back")}</button><button class="btn small green" id="accLogin">${t("acc.signIn")}</button></div><p class="hint" id="accMsg"></p>`;
      $("accLogin").onclick = async () => {
        A.sfx("click");
        if (!okCode(code())) { msg(t("acc.badCode"), true); return; }
        try { await auth.signIn({ email: loginMail, code: code() }); await switched(); } catch (e) { msg(errText(e), true); }
      };
    }
    $("accBack").onclick = () => { if (loginMail) loginMail = ""; else view = "main"; accountUI(); };
    return;
  }
  if (u.guest) {
    const pend = otherMail ? "" : u.pendingEmail;
    b.innerHTML = `<div class="accstate guest"><svg><use href="#i-user"/></svg><span><b>${t("ui.guest")}</b><small>${pend ? t("acc.codeSent", { email: esc(pend) }) : t("acc.guestState")}</small></span></div>
      ${pend ? `${codeInput()}<button class="btn green" id="accConfirm">${t("acc.confirm")}</button>
        <div class="row"><button class="linkbtn" id="accResend">${t("acc.resend")}</button><button class="linkbtn" id="accOther">${t("acc.otherMail")}</button></div>`
      : `<p class="hint">${t("acc.secureHint")}</p><input id="accMail" type="email" placeholder="${t("acc.email")}" autocomplete="email"><button class="btn green" id="accLink">${t("acc.secure")}</button>${legalNote()}`}
      <p class="hint" id="accMsg"></p>
      <button class="linkbtn" id="accToLogin">${t("acc.haveAccount")}</button>`;
    const send = async email => {
      if (!okMail(email)) { msg(t("acc.badEmail"), true); return; }
      try { await auth.upgrade({ email }); otherMail = false; accountUI(); msg(t("acc.mailSent")); toast(t("acc.mailSentToast"), "i-check"); }
      catch (e) { msg(errText(e), true); }
    };
    if (pend) {
      $("accConfirm").onclick = async () => {
        A.sfx("click");
        if (!okCode(code())) { msg(t("acc.badCode"), true); return; }
        try { await auth.confirmUpgrade({ email: pend, code: code() }); toast(t("acc.linked"), "i-check", true); accountUI(); } catch (e) { msg(errText(e), true); }
      };
      $("accResend").onclick = () => { A.sfx("click"); send(pend); };
      $("accOther").onclick = () => { A.sfx("click"); otherMail = true; accountUI(); };
    } else $("accLink").onclick = () => { A.sfx("click"); send($("accMail").value.trim()); };
    $("accToLogin").onclick = () => { view = "login"; loginMail = ""; accountUI(); };
    return;
  }
  b.innerHTML = `<div class="accstate"><svg><use href="#i-user"/></svg><span><b>${esc(S.name || t("ui.player"))}</b><small>${esc(u.email || "")}</small></span></div>
    <p class="hint">${t("acc.signedInHint")}</p>
    <div class="row"><button class="btn small ghost danger" id="accOut">${t("acc.signOut")}</button></div>
    <p class="hint" id="accMsg"></p>
    <button class="linkbtn danger" id="accDelete">${t("acc.delete")}</button>`;
  $("accDelete").onclick = async () => {
    if (!confirm(t("acc.confirmDelete"))) return;
    try { await deleteAccount(); await auth.signOut(); await resetProfile(); location.reload(); } catch (e) { msg(errText(e), true); }
  };
  $("accOut").onclick = async () => {
    if (!confirm(t("acc.confirmLogout"))) return;
    await auth.signOut(); await resetProfile(); location.reload();
  };
}
