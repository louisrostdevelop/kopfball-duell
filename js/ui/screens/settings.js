// Einstellungen in Tabs: Allgemein, Steuerung (Tabelle fürs Gerät), Info (Rechtliches)
import { S, save } from "../../app/profile.js";
import { setQuality } from "../render/render.js";
import { $, applyI18n, seg, toggle } from "../dom.js";
import { audio as A, input as I } from "../../app/services.js";
import { registerScreen } from "../nav.js";
import { refreshTop } from "./home.js";
import { detectLang, LANG_NAMES, setLang, t } from "../../content/i18n.js";

let tab = "general", ctl = null;
const kbd = s => `<kbd>${s}</kbd>`;
// Aktion → Eingabe je Gerät (Tastatur: zwei Spieler an einem Gerät)
const ACTIONS = () => [
  ["html.settings.laufen", [kbd("A") + kbd("D"), kbd("←") + kbd("→")], t("html.settings.stick"), t("html.settings.linksZiehen")],
  ["html.settings.springen", [kbd("W"), kbd("↑")], kbd("A"), t("html.settings.linksHoch")],
  ["html.settings.graetscheBombe", [kbd("S"), kbd("↓")], t("html.settings.stick2"), t("html.settings.linksRunter")],
  ["html.settings.schuss", [kbd(t("html.settings.leer")), kbd("Enter")], kbd("X") + kbd("B"), t("ctl.shootBtn")],
  ["html.settings.super", [kbd("E"), kbd(".")], kbd("Y") + kbd("RB"), t("ctl.superBtn")],
  ["ctl.emotes", [kbd("1") + "–" + kbd("6"), "–"], "–", t("ctl.emoteBtn")],
];

function controls() {
  ctl ??= document.body.classList.contains("is-touch") ? "touch" : "keys";
  seg($("segCtl"), [{ v: "keys", t: t("ctl.keyboard") }, { v: "pad", t: t("html.settings.controller") }, { v: "touch", t: t("html.settings.touch") }], ctl, v => { ctl = v; controls(); });
  const head = ctl === "keys" ? `<tr><th></th><th>${t("html.settings.spieler1")}</th><th>${t("html.settings.spieler2")}</th></tr>` : "";
  $("ctlTable").innerHTML = head + ACTIONS().map(([k, keys, pad, touch]) =>
    `<tr><th scope="row">${t(k)}</th>${ctl === "keys" ? `<td>${keys[0]}</td><td>${keys[1]}</td>` : `<td>${ctl === "pad" ? pad : touch}</td>`}</tr>`).join("");
}

function showTab(v) {
  tab = v;
  document.querySelectorAll("#setTabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === v));
  document.querySelectorAll("#scr-settings .setpane").forEach(p => { p.hidden = p.dataset.pane !== v; });
  if (v === "controls") controls();
}

export function settingsScreen() {
  toggle($("tglSfx"), S.sfx, v => { S.sfx = v; A.setSfx(v); save(); });
  toggle($("tglMusic"), S.music, v => { S.music = v; A.setMusic(v); save(); });
  toggle($("tglVib"), S.vib, v => { S.vib = v; I.setVibration(v); save(); });
  seg($("segLang"), [{ v: "auto", t: t("set.langAuto") }, ...Object.keys(LANG_NAMES).map(v => ({ v, t: v.toUpperCase() }))], S.lang || "auto", v => {
    S.lang = v; save(); setLang(v === "auto" ? detectLang() : v);
    applyI18n(); refreshTop(); settingsScreen();   // feste Texte sofort, Bildschirme beim nächsten Anzeigen
  });
  seg($("segQual"), [{ v: "high", t: t("set.qHigh") }, { v: "low", t: t("set.qLow") }], S.quality, v => { S.quality = v; setQuality(v); save(); });
  showTab(tab);
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initSettings() {
  registerScreen("settings", { show: settingsScreen });
  document.querySelectorAll("#setTabs button").forEach(b => { b.onclick = () => { A.sfx("click"); showTab(b.dataset.tab); }; });
}
