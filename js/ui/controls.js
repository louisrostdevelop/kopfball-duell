// Pause per Taste, Controller-Navigation in Menüs
import { emoteSlots } from "../app/cosmetics.js";
import { REPLAY_START } from "../core/physics.js";
import { pause, sendEmote, skipGoal } from "../app/game.js";
import { App, inGame } from "../app/state.js";
import { $, focusFirst, moveFocus } from "./dom.js";
import { goBack } from "./nav.js";
import { audio as A } from "../app/services.js";

export function onKey(code) {
  A.unlock();
  if (code === "Escape" || code === "KeyP") {
    if (inGame()) { pause(true); return; }
    if (App.screen === "pause") { pause(false); return; }
    if (!$("modal").hidden) { $("modal").hidden = true; return; }
    if (code === "Escape" && App.screen && !["home", "end"].includes(App.screen)) { goBack(); return; }
  }
  if (inGame() && /^Digit[1-4]$/.test(code) && App.mode !== "local") sendEmote(emoteSlots()[+code.slice(5) - 1]);
  if (inGame() && App.st.ph === "goal" && (code === "Space" || code === "Enter") && App.mode !== "guest" && App.st.pt < REPLAY_START) skipGoal();
}

export function onPad(btn) {
  A.unlock();
  if (btn === 9) { if (inGame()) pause(true); else if (App.screen === "pause") pause(false); return; }
  if (inGame()) { if (btn === 0 && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START) skipGoal(); return; }
  if (!$("modal").hidden) { if (btn === 0) $("modalOk").click(); if (btn === 1) $("modal").hidden = true; return; }
  const scr = App.screen && $("scr-" + App.screen);
  if (!scr) return;
  if (btn === 1) { const b = scr.querySelector("[data-back], #btnLobbyLeave"); if (b) b.click(); else if (App.screen === "pause") pause(false); return; }
  if (btn === 0) { const a = document.activeElement; if (a && scr.contains(a)) a.click(); else focusFirst(scr); return; }
  const dirs = { 12: [0, -1], 13: [0, 1], 14: [-1, 0], 15: [1, 0] };
  if (dirs[btn]) moveFocus(scr, dirs[btn]);
}
