// Einstellungen
import { S, save } from "../../store.js";
import { setQuality } from "../render/render.js";
import { $, seg, toggle } from "../dom.js";
import * as A from "../../adapters/audio/webaudio.js";
import * as I from "../../adapters/input/dom-input.js";

export function settingsScreen() {
  $("setName").value = S.name || "";
  toggle($("tglSfx"), S.sfx, v => { S.sfx = v; A.setSfx(v); save(); });
  toggle($("tglMusic"), S.music, v => { S.music = v; A.setMusic(v); save(); });
  toggle($("tglVib"), S.vib, v => { S.vib = v; I.setVibration(v); save(); });
  seg($("segQual"), [{ v: "high", t: "Hoch" }, { v: "low", t: "Schnell" }], S.quality, v => { S.quality = v; setQuality(v); save(); });
}
