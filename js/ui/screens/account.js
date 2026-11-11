// Konto in den Einstellungen (nur mit Server): Gast sichern und auf anderen Geräten anmelden, beides mit einem
// 6-stelligen Code aus der Mail (kein Passwort). Der Link in der Mail geht auch, der Code klappt aber überall,
// auch in der installierten App auf dem iPhone (dort öffnet ein Link Safari statt der App).
import { $, esc, toast } from "../dom.js";
import { S, reset as resetProfile } from "../../app/profile.js";
import { deleteAccount, online as serverOn } from "../../app/account.js";
import { audio as A, auth } from "../../app/services.js";
import { t } from "../../content/i18n.js";
import { standalone } from "../install.js";

let view = "main";   // main | login
let loginMail = "";  // Anmelden: Code ist an diese Adresse unterwegs
let otherMail = false;   // Sichern: trotz offenem Code eine andere Adresse eingeben
const okMail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const okCode = v => /^\d{6}$/.test(v);
// Knopf gesperrt, solange die Anfrage läuft (Captcha kann dauern; kein zweites Captcha, keine zweite Mail)
async function busy(id, job) {
  const b = $(id); if (b && b.disabled) return;
  if (b) b.disabled = true;
  try { await job(); } finally { if (b && b.isConnected) b.disabled = false; }
}
const msg = (text, err) => { const m = $("accMsg"); if (m) { m.textContent = text; m.classList.toggle("err", !!err); } };
const ERR = ["email_exists", "otp_expired", "otp_disabled", "over_email_send_rate_limit", "offline", "captcha_failed"];
const errText = e => (ERR.includes(e && e.code) ? t("acc.err." + e.code) : t("acc.err.other", { code: e && e.code ? " (" + e.code + ")" : "" }));
// Eingabefeld für den 6-stelligen Code aus der Mail (Handys bieten den Code aus der Mail direkt an)
const codeInput = () => `<input id="accCode" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="${t("acc.codePh")}">`;
const code = () => ($("accCode").value || "").replace(/\D/g, "");
// Installierte App: der Link aus der Mail öffnet meist den Browser (ohne Mail-Merker, wird dort abgelehnt und verbraucht
// dabei auch den Code), also schon beim Anfordern: Link nicht antippen, nur den Code hier eingeben
const appHint = () => (standalone() ? `<p class="hint accnote" id="accAppHint">${t("acc.appHint")}</p>` : "");
const showCode = () => { const c = $("accCode"); if (c && c.scrollIntoView) c.scrollIntoView({ block: "nearest" }); };   // Code-Feld sofort im Blick
// Hinweis auf Nutzungsbedingungen und Datenschutz direkt am Knopf (Einbeziehung nach § 305 Abs. 2 BGB)
const legalNote = () => `<p class="hint accnote">${t("legal.acceptSecure", { terms: `<a href="legal/terms.html" target="_blank" rel="noopener">${t("legal.terms")}</a>`, privacy: `<a href="legal/privacy.html" target="_blank" rel="noopener">${t("legal.privacy")}</a>` })}</p>`;

// Sichern woanders bestätigt (Link in einem anderen Browser geöffnet): beim Öffnen des Kontos und beim Zurückkommen in
// die App Stand vom Server holen; ändert sich der Konto-Zustand, Anzeige neu (sonst nicht, Eingaben bleiben stehen)
const state = u => (u ? [u.guest, u.email, u.pendingEmail].join("|") : "");
let shown = null;   // Konto-Zustand, den die Anzeige gerade zeigt
export async function refreshAccount() {
  if (!serverOn() || !auth.reload) return;
  const before = auth.user(), u = await auth.reload().catch(() => null);
  if (before && before.guest && u && !u.guest) toast(t("acc.linked"), "i-check", true);
}
export function initAccountUI() {
  auth.onChange(u => { const p = $("accountPanel"); if (shown !== null && state(u) !== shown && !p.hidden && p.offsetParent) accountUI(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refreshAccount(); });
}

/** Nach Anmelden auf einem anderen Konto: lokalen Stand verwerfen und neu laden */
async function switched() { await resetProfile(); location.reload(); }

// Konto löschen (DSGVO): auch als Gast, die Daten liegen ja schon auf dem Server. Danach startet das Spiel frisch.
function wireDelete() {
  $("accDelete").onclick = async () => {
    if (!confirm(t("acc.confirmDelete"))) return;
    try { await deleteAccount(); await auth.signOut(); await resetProfile(); location.reload(); } catch (e) { msg(errText(e), true); }
  };
}

export function accountUI() {
  const box = $("accountPanel"); box.hidden = !serverOn(); if (box.hidden) return;
  const u = auth.user() || { guest: true }, b = $("accBody");
  shown = state(auth.user());
  if (view === "login") {
    if (!loginMail) {
      b.innerHTML = `<p class="hint">${t("acc.loginHint")}</p>
        <input id="accMail" type="email" placeholder="${t("acc.email")}" autocomplete="email">${appHint()}
        <div class="row"><button class="btn small ghost" id="accBack">${t("ui.back")}</button><button class="btn small green" id="accSend">${t("acc.sendCode")}</button></div><p class="hint" id="accMsg"></p>`;
      $("accSend").onclick = () => busy("accSend", async () => {
        A.sfx("click");
        const email = $("accMail").value.trim();
        if (!okMail(email)) { msg(t("acc.badEmail"), true); return; }
        try { await auth.sendCode({ email }); loginMail = email; accountUI(); showCode(); msg(t("acc.codeSent", { email })); } catch (e) { msg(errText(e), true); }
      });
    } else {
      b.innerHTML = `<p class="hint">${t("acc.codeSent", { email: esc(loginMail) })}</p>${codeInput()}${appHint()}
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
      ${pend ? `${codeInput()}${appHint()}<button class="btn green" id="accConfirm">${t("acc.confirm")}</button>
        <div class="row"><button class="linkbtn" id="accResend">${t("acc.resend")}</button><button class="linkbtn" id="accOther">${t("acc.otherMail")}</button></div>`
      : `<p class="hint">${t("acc.secureHint")}</p><input id="accMail" type="email" placeholder="${t("acc.email")}" autocomplete="email">${appHint()}<button class="btn green" id="accLink">${t("acc.secure")}</button>${legalNote()}`}
      <p class="hint" id="accMsg"></p>
      <button class="linkbtn" id="accToLogin">${t("acc.haveAccount")}</button>
      <button class="linkbtn danger" id="accDelete">${t("acc.delete")}</button>`;
    wireDelete();
    const send = async email => {
      if (!okMail(email)) { msg(t("acc.badEmail"), true); return; }
      try { await auth.upgrade({ email }); otherMail = false; accountUI(); showCode(); msg(t("acc.mailSent")); toast(t("acc.mailSentToast"), "i-check"); }
      catch (e) { msg(errText(e), true); }
    };
    if (pend) {
      $("accConfirm").onclick = async () => {
        A.sfx("click");
        if (!okCode(code())) { msg(t("acc.badCode"), true); return; }
        try { await auth.confirmUpgrade({ email: pend, code: code() }); toast(t("acc.linked"), "i-check", true); accountUI(); } catch (e) { msg(errText(e), true); }
      };
      $("accResend").onclick = () => { A.sfx("click"); busy("accResend", () => send(pend)); };
      $("accOther").onclick = () => { A.sfx("click"); otherMail = true; accountUI(); };
    } else $("accLink").onclick = () => { A.sfx("click"); busy("accLink", () => send($("accMail").value.trim())); };
    $("accToLogin").onclick = () => { view = "login"; loginMail = ""; accountUI(); };
    return;
  }
  b.innerHTML = `<div class="accstate"><svg><use href="#i-user"/></svg><span><b>${esc(S.name || t("ui.player"))}</b><small>${esc(u.email || "")}</small></span></div>
    <p class="hint">${t("acc.signedInHint")}</p>
    <div class="row"><button class="btn small ghost danger" id="accOut">${t("acc.signOut")}</button></div>
    <p class="hint" id="accMsg"></p>
    <button class="linkbtn danger" id="accDelete">${t("acc.delete")}</button>`;
  wireDelete();
  $("accOut").onclick = async () => {
    if (!confirm(t("acc.confirmLogout"))) return;
    await auth.signOut(); await resetProfile(); location.reload();
  };
}
