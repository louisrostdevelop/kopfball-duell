// Kopfball Duell: Einstiegspunkt. Setzt die Teile zusammen und startet.
import { fireSuper } from "./core/physics.js";
import { dailyCheck, S, save } from "./store.js";
import { initRender, resize, setQuality } from "./ui/render/render.js";
import { startDemo, updateBand } from "./app/game.js";
import { loop } from "./app/loop.js";
import { tryJoin } from "./app/online.js";
import { App, inGame } from "./app/state.js";
import { onKey, onPad } from "./ui/controls.js";
import { $, toast } from "./ui/dom.js";
import { dailyModal } from "./ui/modals.js";
import { showScreen } from "./ui/nav.js";
import { homeScreen } from "./ui/screens/home.js";
import { openOnline } from "./ui/screens/online.js";
import { wireUI } from "./ui/wire.js";
import * as A from "./adapters/audio/webaudio.js";
import * as I from "./adapters/input/dom-input.js";

function boot() {
  initRender($("cv"));
  setQuality(S.quality);
  A.setSfx(S.sfx); A.setMusic(S.music); I.setVibration(S.vib);
  I.initInput({ inGame: () => inGame(), onKey, onPadButton: onPad, onTouch: () => { A.unlock(); updateBand(); } });
  wireUI();
  startDemo();
  showScreen("home", true);
  requestAnimationFrame(loop);
  const unlockOnce = () => { A.unlock(); if (!inGame()) A.music(true, "menu"); window.removeEventListener("pointerdown", unlockOnce); window.removeEventListener("keydown", unlockOnce); };
  window.addEventListener("pointerdown", unlockOnce); window.addEventListener("keydown", unlockOnce);
  const fontsReady = document.fonts ? Promise.all(["400 20px 'Lilita One'", "800 20px Nunito", "900 20px Nunito"].map(f => document.fonts.load(f).catch(() => {}))) : Promise.resolve();
  Promise.race([fontsReady, new Promise(r => setTimeout(r, 1500))]).then(() => {
    $("loading").classList.add("done"); resize(); homeScreen();
    const d = dailyCheck();
    if (d) setTimeout(() => dailyModal(d), 500);
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !navigator.standalone;
    if (ios && !S.iosHint) setTimeout(() => { toast("Tipp: Teilen → „Zum Home-Bildschirm“ für Vollbild"); S.iosHint = true; save(); }, d ? 6000 : 2500);
    // Einladungslink: ?join=CODE (alte Links mit #CODE gehen auch)
    const qs = new URLSearchParams(location.search).get("join") || "";
    const h = /^[A-Za-z0-9]{4}$/.test(qs) ? qs : (location.hash || "").slice(1);
    if (/^[A-Za-z0-9]{4}$/.test(h)) { history.replaceState(null, "", location.pathname); $("codeIn").value = h.toUpperCase(); openOnline(); setTimeout(() => tryJoin(h), 400); }
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  window.__kd = App; window.__kdFire = fireSuper; // für Tests
}

boot();
