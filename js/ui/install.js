// App installieren: Chrome/Edge/Android zeigen den System-Dialog (beforeinstallprompt), iPhone/iPad bekommen eine
// kurze Anleitung (Teilen → Zum Home-Bildschirm). Wer die App schon nutzt, sieht nichts davon.
import { esc, modal, toast } from "./dom.js";
import { t } from "../content/i18n.js";

let deferred = null, onChange = () => {};

export const standalone = () => matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches || navigator.standalone === true;   // i18n-ok: Medienabfrage
export const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);   // i18n-ok: Gerätekennung
/** Gibt es einen Weg zu installieren (System-Dialog oder iPhone-Anleitung)? */
export const canInstall = () => !standalone() && (!!deferred || isIOS());

/** @param {() => void} changed wird aufgerufen, wenn sich canInstall() ändert */
export function initInstall(changed) {
  onChange = changed;
  addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; onChange(); });
  addEventListener("appinstalled", () => { deferred = null; onChange(); toast(t("install.done"), "i-check"); });
  onChange();
}

export async function install() {
  if (deferred) {
    const d = deferred; deferred = null;
    d.prompt();
    try { const r = await d.userChoice; if (r && r.outcome !== "accepted") deferred = null; } catch (_) { /* abgebrochen */ }
    onChange();
    return;
  }
  if (isIOS()) iosGuide();
}

function iosGuide() {
  const steps = ["install.ios1", "install.ios2", "install.ios3"].map(k => `<li>${esc(t(k))}</li>`).join("");
  modal({ title: t("install.title"), icon: "i-share", body: `<ol class="install-steps">${steps}</ol>`, btn: t("install.gotIt") });
}

/** Einmaliger Hinweis (nach ein paar Spielen, aufgerufen von der Startseite) */
export function installAsk() {
  const el = document.documentElement, noFs = !(el.requestFullscreen || el.webkitRequestFullscreen);
  modal({ title: t("install.title"), icon: "i-download", body: `<p>${esc(t(noFs ? "install.askFs" : "install.ask"))}</p>`, btn: t("install.btn"), cancel: t("install.later"), onOk: install });
}
