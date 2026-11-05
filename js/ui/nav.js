// Bildschirmwechsel und Zurück-Navigation
import { App } from "../app/state.js";
import { $, $$ } from "./dom.js";
import { achScreen } from "./screens/achievements.js";
import { homeScreen } from "./screens/home.js";
import { modesScreen } from "./screens/modes.js";
import { lobbyUI } from "./screens/online.js";
import { rulesCtx } from "./screens/rules.js";
import { settingsScreen } from "./screens/settings.js";
import { refreshSetup } from "./screens/setup.js";
import { shopScreen } from "./screens/shop.js";
import { tasksScreen } from "./screens/tasks.js";
import * as A from "../adapters/audio/webaudio.js";
import * as I from "../adapters/input/dom-input.js";
import * as Net from "../adapters/net/peerjs.js";

export function showScreen(id, root) {
  if (id && !root && App.screen && App.screen !== id && !["end", "pause"].includes(App.screen)) App.stack.push(App.screen);
  if (root) App.stack = [];
  $$(".screen").forEach(s => s.hidden = s.id !== "scr-" + id);
  App.screen = id;
  document.body.dataset.scr = id || "";
  $("touch").hidden = !!id;
  if (App.mode !== "demo") $("gameBtns").hidden = !!id;
  const fn = { home: homeScreen, shop: shopScreen, ach: achScreen, settings: settingsScreen, tasks: tasksScreen, modes: modesScreen }[id];
  if (fn) fn();
  if (id && I.usedPad) { const f = $("scr-" + id).querySelector(".btn-play, .btn.big, .btn, button:not(.iconback)"); if (f) f.focus({ preventScroll: true }); }
}

export function goBack() {
  A.sfx("click");
  if (App.screen === "lobby") { Net.close(); App.stack = ["home"]; $$(".screen").forEach(s => s.hidden = s.id !== "scr-online"); App.screen = "online"; return; }
  if (App.screen === "run") { App.run = null; }
  if (App.screen === "rules" && rulesCtx && rulesCtx.onDone) rulesCtx.onDone();
  const prev = App.stack.pop() || "home";
  showScreen(prev, true);
  App.stack = App.stack.length ? App.stack : [];
  if (prev === "lobby") lobbyUI(Net.role() === "host" ? "host" : "guest");
  if (prev === "setup") refreshSetup();
}
