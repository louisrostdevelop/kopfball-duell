// Knöpfe im Spiel: Pause, Fortsetzen, Neustart, Aufgeben, Vollbild, Emotes, Jubel überspringen
import { EMOTES } from "../content/config.js";
import { REPLAY_START, skipCelebration } from "../core/physics.js";
import { beginMatch, goFullscreen, pause, quitToMenu, sendEmote } from "../app/game.js";
import { backToLobby } from "../app/online.js";
import { App, inGame } from "../app/state.js";
import { $ } from "./dom.js";
import { runScreen } from "./screens/run.js";
import { audio as A, net as Net } from "../app/services.js";

export function initHud() {
  $("btnPause").onclick = () => { A.sfx("click"); pause(true); };
  $("btnResume").onclick = () => { A.sfx("click"); pause(false); };
  $("btnRestart").onclick = () => { A.sfx("click"); $("scr-pause").hidden = true; beginMatch({ ...App.lastCfg }); };
  $("btnQuit").onclick = () => { A.sfx("click"); $("scr-pause").hidden = true; if (App.mode === "host") { Net.send({ t: "lobby" }); backToLobby(); } else if (App.run && !App.run.done && ["cup", "endless"].includes(App.mode)) { App.run.done = true; runScreen(); } else quitToMenu(); };
  $("btnFull").onclick = () => { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else goFullscreen(); };
  const bar = $("emoteBar");
  EMOTES.forEach((e, n) => { const b = document.createElement("button"); b.textContent = e; b.title = "Taste " + (n + 1); b.onclick = () => sendEmote(e); bar.append(b); });
  $("btnEmote").onclick = () => { bar.hidden = !bar.hidden; };
  $("cv").addEventListener("pointerdown", () => { if (inGame() && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START) skipCelebration(App.st); });
  $("touch").addEventListener("pointerdown", () => { if (inGame() && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START - 0.3) skipCelebration(App.st); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && inGame() && App.mode !== "host" && App.mode !== "guest") pause(true); });
}
