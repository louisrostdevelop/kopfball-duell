// Kopfball Duell: Einstiegspunkt (Composition Root).
// Hier und nur hier wird entschieden, welche Adapter das Spiel benutzt. Alles andere kennt nur die
// Schnittstellen aus js/ports/. Für einen Server (Konto, Profil-Sync) werden hier andere Adapter eingesteckt.
import { fireSuper } from "./core/physics.js";
import { provide } from "./app/services.js";
import { initProfile, dailyCheck, S, save } from "./app/profile.js";
import { startDemo, updateBand } from "./app/game.js";
import { loop } from "./app/loop.js";
import { tryJoin } from "./app/online.js";
import { App, inGame } from "./app/state.js";
import { initRender, resize, setQuality } from "./ui/render/render.js";
import { onKey, onPad } from "./ui/controls.js";
import { $, toast } from "./ui/dom.js";
import { dailyModal } from "./ui/modals.js";
import { initNav, showScreen } from "./ui/nav.js";
import { initHud } from "./ui/hud.js";
import { homeScreen, initHome } from "./ui/screens/home.js";
import { initModes } from "./ui/screens/modes.js";
import { initSelect } from "./ui/screens/select.js";
import { initSetup } from "./ui/screens/setup.js";
import { initRules } from "./ui/screens/rules.js";
import { initRun } from "./ui/screens/run.js";
import { initOnline, openOnline } from "./ui/screens/online.js";
import { initShop } from "./ui/screens/shop.js";
import { initTasks } from "./ui/screens/tasks.js";
import { initAchievements } from "./ui/screens/achievements.js";
import { initSettings } from "./ui/screens/settings.js";
import { initEnd } from "./ui/screens/end.js";
// Adapter
import * as webAudio from "./adapters/audio/webaudio.js";
import * as domInput from "./adapters/input/dom-input.js";
import * as peerjs from "./adapters/net/peerjs.js";
import { localProfileStore } from "./adapters/storage/local.js";
import { guestAuth } from "./adapters/auth/guest.js";

async function boot() {
  // 1. Dienste einstecken, Spieler und Profil laden
  const auth = guestAuth();
  provide({ audio: webAudio, input: domInput, net: peerjs, auth });
  await auth.init();
  await initProfile(localProfileStore());

  // 2. Oberfläche aufbauen
  initRender($("cv"));
  setQuality(S.quality);
  webAudio.setSfx(S.sfx); webAudio.setMusic(S.music); domInput.setVibration(S.vib);
  domInput.initInput({ inGame: () => inGame(), onKey, onPadButton: onPad, onTouch: () => { webAudio.unlock(); updateBand(); } });
  [initNav, initHome, initModes, initSelect, initSetup, initRules, initRun, initOnline, initShop, initTasks, initAchievements, initSettings, initEnd, initHud].forEach(f => f());

  // 3. Los geht's
  startDemo();
  showScreen("home", true);
  requestAnimationFrame(loop);
  const unlockOnce = () => { webAudio.unlock(); if (!inGame()) webAudio.music(true, "menu"); window.removeEventListener("pointerdown", unlockOnce); window.removeEventListener("keydown", unlockOnce); };
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
