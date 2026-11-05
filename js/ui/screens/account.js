// Konto in den Einstellungen (nur mit Server): Gast sichern (E-Mail), Passwort für andere Geräte, anmelden, abmelden
import { $, esc, toast } from "../dom.js";
import { S, reset as resetProfile } from "../../app/profile.js";
import { online as serverOn } from "../../app/account.js";
import { audio as A, auth } from "../../app/services.js";

let view = "main";   // main | login
const okMail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const msg = (t, err) => { const m = $("accMsg"); if (m) { m.textContent = t; m.classList.toggle("err", !!err); } };
const ERR = { email_exists: "Diese E-Mail gehört schon zu einem Konto. Melde dich damit an.", invalid_credentials: "E-Mail oder Passwort stimmt nicht.", weak_password: "Passwort zu schwach: mindestens 10 Zeichen mit Buchstaben und Zahlen.", over_email_send_rate_limit: "Zu viele Mails. Warte ein paar Minuten.", offline: "Keine Verbindung zum Server." };
const errText = e => ERR[e && e.code] || (e && /password/i.test(e.code) ? ERR.weak_password : "Das hat nicht geklappt" + (e && e.code ? " (" + e.code + ")" : "") + ".");

export function accountUI() {
  const box = $("accountPanel"); box.hidden = !serverOn(); if (box.hidden) return;
  const u = auth.user() || { guest: true }, b = $("accBody");
  if (view === "login") {
    b.innerHTML = `<p class="hint">Mit einem bestehenden Konto anmelden. Der Spielstand auf diesem Gerät wird durch den des Kontos ersetzt.</p>
      <input id="accMail" type="email" placeholder="E-Mail" autocomplete="email"><input id="accPw" type="password" placeholder="Passwort" autocomplete="current-password">
      <div class="row"><button class="btn small ghost" id="accBack">Zurück</button><button class="btn small green" id="accLogin">Anmelden</button></div><p class="hint" id="accMsg"></p>`;
    $("accBack").onclick = () => { view = "main"; accountUI(); };
    $("accLogin").onclick = async () => {
      const email = $("accMail").value.trim(), password = $("accPw").value;
      if (!okMail(email) || !password) { msg("E-Mail und Passwort eingeben.", true); return; }
      try { await auth.signIn({ email, password }); await resetProfile(); location.reload(); } catch (e) { msg(errText(e), true); }
    };
    return;
  }
  if (u.guest) {
    b.innerHTML = `<div class="accstate guest"><svg><use href="#i-user"/></svg><span><b>Gast</b><small>${u.pendingEmail ? "Bestätigung an " + esc(u.pendingEmail) + " geschickt. Link in der Mail antippen." : "Spielstand liegt auf dem Server, ist aber nur auf diesem Gerät erreichbar."}</small></span></div>
      <p class="hint">Mit E-Mail sichern: Spielstand geht nicht verloren, du kannst auf jedem Gerät weiterspielen. Nötig für Ranked und Käufe.</p>
      <input id="accMail" type="email" placeholder="E-Mail" autocomplete="email" value="${esc(u.pendingEmail || "")}">
      <button class="btn green" id="accLink">${u.pendingEmail ? "Mail nochmal schicken" : "Spielstand sichern"}</button>
      <p class="hint" id="accMsg"></p>
      <button class="linkbtn" id="accToLogin">Schon ein Konto? Anmelden</button>`;
    $("accLink").onclick = async () => {
      A.sfx("click");
      const email = $("accMail").value.trim();
      if (!okMail(email)) { msg("Bitte eine gültige E-Mail eingeben.", true); return; }
      try { await auth.upgrade({ email }); msg("Mail ist unterwegs. Link antippen, dann ist dein Konto gesichert."); toast("Bestätigungs-Mail geschickt", "i-check"); setTimeout(accountUI, 2500); }
      catch (e) { msg(errText(e), true); }
    };
    $("accToLogin").onclick = () => { view = "login"; accountUI(); };
    return;
  }
  b.innerHTML = `<div class="accstate"><svg><use href="#i-user"/></svg><span><b>${esc(S.name || "Spieler")}</b><small>${esc(u.email || "")}</small></span></div>
    <p class="hint">Passwort für die Anmeldung auf anderen Geräten:</p>
    <input id="accPw" type="password" placeholder="Neues Passwort (mind. 10 Zeichen)" autocomplete="new-password">
    <div class="row"><button class="btn small green" id="accSetPw">Passwort speichern</button><button class="btn small ghost danger" id="accOut">Abmelden</button></div>
    <p class="hint" id="accMsg"></p>`;
  $("accSetPw").onclick = async () => {
    const pw = $("accPw").value;
    if (pw.length < 10 || !/[a-z]/i.test(pw) || !/\d/.test(pw)) { msg(ERR.weak_password, true); return; }
    try { await auth.setPassword(pw); $("accPw").value = ""; msg("Gespeichert."); } catch (e) { msg(errText(e), true); }
  };
  $("accOut").onclick = async () => {
    if (!confirm("Abmelden? Auf diesem Gerät startest du dann als neuer Gast. Dein Konto bleibt erhalten.")) return;
    await auth.signOut(); await resetProfile(); location.reload();
  };
}
