// Bildschirmwechsel und Zurück-Navigation.
// Bildschirme melden sich hier an (registerScreen) statt dass die Navigation sie alle kennt:
//   show   – wird beim Anzeigen aufgerufen (Inhalt neu aufbauen)
//   back   – eigenes Verhalten beim Zurück; true = erledigt, sonst geht es normal zum vorigen Bildschirm
//   resume – wird aufgerufen, wenn man per Zurück wieder hier landet
import { App } from "../app/state.js";
import { $, $$ } from "./dom.js";
import { audio as A, input as I } from "../app/services.js";

/** @type {Record<string, { show?: () => void, back?: () => boolean|void, resume?: () => void }>} */
const screens = {};
export function registerScreen(id, hooks) { screens[id] = { ...screens[id], ...hooks }; }

export function showScreen(id, root) {
  if (id && !root && App.screen && App.screen !== id && !["end", "pause"].includes(App.screen)) App.stack.push(App.screen);
  if (root) App.stack = [];
  $$(".screen").forEach(s => s.hidden = s.id !== "scr-" + id);
  App.screen = id;
  document.body.dataset.scr = id || "";
  $("touch").hidden = !!id;
  if (App.mode !== "demo") $("gameBtns").hidden = !!id;
  const fn = id && screens[id] && screens[id].show;
  if (fn) fn();
  if (id && I.usedPad) { const f = $("scr-" + id).querySelector(".btn-play, .btn.big, .btn, button:not(.iconback)"); if (f) f.focus({ preventScroll: true }); }
}
// Bildschirm zeigen, ohne die Zurück-Liste oder show() anzufassen (z. B. Lobby -> Online-Seite)
export function swapScreen(id) { $$(".screen").forEach(s => s.hidden = s.id !== "scr-" + id); App.screen = id; }

export function goBack() {
  A.sfx("click");
  const cur = App.screen && screens[App.screen];
  if (cur && cur.back && cur.back() === true) return;
  const prev = App.stack.pop() || "home";
  showScreen(prev, true);
  App.stack = App.stack.length ? App.stack : [];
  if (screens[prev] && screens[prev].resume) screens[prev].resume();
}

export function initNav() { $$("[data-back]").forEach(b => b.onclick = goBack); }
