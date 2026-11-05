// Einstellungen
import { S, save, reset as resetProfile } from "../../app/profile.js";
import { setQuality } from "../render/render.js";
import { $, seg, toggle } from "../dom.js";
import { audio as A, input as I } from "../../app/services.js";
import { registerScreen } from "../nav.js";
import { saveName } from "./online.js";
import { refreshTop } from "./home.js";

export function settingsScreen() {
  $("setName").value = S.name || "";
  toggle($("tglSfx"), S.sfx, v => { S.sfx = v; A.setSfx(v); save(); });
  toggle($("tglMusic"), S.music, v => { S.music = v; A.setMusic(v); save(); });
  toggle($("tglVib"), S.vib, v => { S.vib = v; I.setVibration(v); save(); });
  seg($("segQual"), [{ v: "high", t: "Hoch" }, { v: "low", t: "Schnell" }], S.quality, v => { S.quality = v; setQuality(v); save(); });
}

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initSettings() {
  registerScreen("settings", { show: settingsScreen });
  $("setName").addEventListener("change", e => { saveName(e.target.value); refreshTop(); });
  $("btnReset").onclick = async () => { if (confirm("Wirklich alles löschen? Münzen, Köpfe und Erfolge sind dann weg.")) { await resetProfile(); location.reload(); } };
}
