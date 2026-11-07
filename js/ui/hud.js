// Knöpfe im Spiel: Pause, Fortsetzen, Neustart, Aufgeben, Vollbild, Emotes, Jubel überspringen
import { REPLAY_START, skipCelebration } from "../core/physics.js";
import { beginMatch, canFullscreen, fullscreenElement, pause, quitToMenu, toggleFullscreen } from "../app/game.js";
import { backToLobby } from "../app/online.js";
import { App, inGame } from "../app/state.js";
import { $ } from "./dom.js";
import { standalone } from "./install.js";
import { runScreen } from "./screens/run.js";
import { careerScreen } from "./screens/career.js";
import { audio as A, net as Net } from "../app/services.js";

export function initHud() {
  $("btnPause").onclick = () => { A.sfx("click"); pause(true); };
  $("btnResume").onclick = () => { A.sfx("click"); pause(false); };
  $("btnRestart").onclick = () => { A.sfx("click"); $("scr-pause").hidden = true; beginMatch({ ...App.lastCfg }); };
  $("btnQuit").onclick = () => { A.sfx("click"); $("scr-pause").hidden = true; if (App.mode === "host") { Net.send({ t: "lobby" }); backToLobby(); } else if (App.run && !App.run.done && ["cup", "endless"].includes(App.mode)) { App.run.done = true; runScreen(); } else if (App.mode === "career") careerScreen(); else quitToMenu(); };
  $("btnFull").onclick = toggleFullscreen;
  // Vollbild-Knöpfe: oben rechts auf der Startseite und im Pausenmenü; Symbol zeigt, was ein Tipp bewirkt.
  // Nicht auf dem iPhone (kann im Browser kein Vollbild) und nicht in der installierten App.
  const fsIcon = () => document.querySelectorAll(".fsbtn use").forEach(u => u.setAttribute("href", fullscreenElement() ? "#i-shrink" : "#i-expand"));
  document.querySelectorAll(".fsbtn").forEach(b => { b.hidden = !canFullscreen() || standalone(); b.onclick = () => { A.sfx("click"); toggleFullscreen(); }; });
  document.addEventListener("fullscreenchange", fsIcon); document.addEventListener("webkitfullscreenchange", fsIcon);
  const bar = $("emoteBar");
  $("btnEmote").onclick = () => { bar.hidden = !bar.hidden; };
  $("netPing").onclick = () => $("netPing").classList.toggle("ms");
  $("cv").addEventListener("pointerdown", () => { if (inGame() && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START) skipCelebration(App.st); });
  $("touch").addEventListener("pointerdown", () => { if (inGame() && App.st.ph === "goal" && App.mode !== "guest" && App.st.pt < REPLAY_START - 0.3) skipCelebration(App.st); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && inGame() && App.mode !== "host" && App.mode !== "guest") pause(true); });
}
