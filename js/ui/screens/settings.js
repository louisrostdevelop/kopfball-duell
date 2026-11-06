// Einstellungen
import { S, save, reset as resetProfile } from "../../app/profile.js";
import { setQuality } from "../render/render.js";
import { $, applyI18n, seg, toast, toggle } from "../dom.js";
import { audio as A, input as I } from "../../app/services.js";
import { registerScreen } from "../nav.js";
import { saveName } from "./online.js";
import { refreshTop } from "./home.js";
import { accountUI } from "./account.js";
import { online as serverOn, setServerName } from "../../app/account.js";
import { detectLang, LANG_NAMES, setLang, t } from "../../content/i18n.js";

export function settingsScreen() {
  $("setName").value = S.name || "";
  toggle($("tglSfx"), S.sfx, v => { S.sfx = v; A.setSfx(v); save(); });
  toggle($("tglMusic"), S.music, v => { S.music = v; A.setMusic(v); save(); });
  toggle($("tglVib"), S.vib, v => { S.vib = v; I.setVibration(v); save(); });
  accountUI();
  seg($("segLang"), [{ v: "auto", t: t("set.langAuto") }, ...Object.keys(LANG_NAMES).map(v => ({ v, t: v.toUpperCase() }))], S.lang || "auto", v => {
    S.lang = v; save(); setLang(v === "auto" ? detectLang() : v);
    applyI18n(); refreshTop(); settingsScreen();   // feste Texte sofort, Bildschirme beim nächsten Anzeigen
  });
  seg($("segQual"), [{ v: "high", t: t("set.qHigh") }, { v: "low", t: t("set.qLow") }], S.quality, v => { S.quality = v; setQuality(v); save(); });
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initSettings() {
  registerScreen("settings", { show: settingsScreen });
  $("setName").addEventListener("change", async e => {
    saveName(e.target.value); refreshTop();
    if (serverOn()) { const err = await setServerName(S.name); if (err) toast(err, "i-close"); else toast(t("set.nameSaved"), "i-check"); }
  });
  $("btnReset").onclick = async () => { if (confirm(t("set.confirmReset"))) { await resetProfile(); location.reload(); } };
}
