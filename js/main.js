// Headstars: Einstiegspunkt (Composition Root).
// Hier und nur hier wird entschieden, welche Adapter das Spiel benutzt. Alles andere kennt nur die
// Schnittstellen aus js/ports/. Für einen Server (Konto, Profil-Sync) werden hier andere Adapter eingesteckt.
import { fireSuper } from "./core/physics.js";
import { provide } from "./app/services.js";
import { initProfile, dailyCheck, S } from "./app/profile.js";
import { canFullscreen, startDemo, updateBand } from "./app/game.js";
import { loop } from "./app/loop.js";
import { giveUpWaiting, resumeFriends, sessionHide, tryJoin } from "./app/online.js";
import { resumeMatch } from "./app/matchmaking.js";
import { clearSession, sessionRole, takeResumable } from "./app/session.js";
import { App, inGame } from "./app/state.js";
import { initRender, resize, setQuality } from "./ui/render/render.js";
import { onKey, onPad } from "./ui/controls.js";
import { $, applyI18n, toast } from "./ui/dom.js";
import { detectLang, setLang, t } from "./content/i18n.js";
import { dailyModal } from "./ui/modals.js";
import { canInstall, initInstall, install, standalone } from "./ui/install.js";
import { initNav, showScreen } from "./ui/nav.js";
import { initHud } from "./ui/hud.js";
import { homeScreen, initHome, refreshTop } from "./ui/screens/home.js";
import { initModes } from "./ui/screens/modes.js";
import { initSelect } from "./ui/screens/select.js";
import { initSetup } from "./ui/screens/setup.js";
import { initRules } from "./ui/screens/rules.js";
import { initRun } from "./ui/screens/run.js";
import { initCareer } from "./ui/screens/career.js";
import { initChests } from "./ui/screens/chests.js";
import { initLocker } from "./ui/screens/locker.js";
import { initOnline, openOnline } from "./ui/screens/online.js";
import { initShop } from "./ui/screens/shop.js";
import { initTasks } from "./ui/screens/tasks.js";
import { initAchievements } from "./ui/screens/achievements.js";
import { initSettings } from "./ui/screens/settings.js";
import { initProfileScreen } from "./ui/screens/profile.js";
import { initEnd } from "./ui/screens/end.js";
import { initSearch } from "./ui/screens/search.js";
import { initPass } from "./ui/screens/pass.js";
import { initBoard } from "./ui/screens/board.js";
// Adapter
import * as webAudio from "./adapters/audio/webaudio.js";
import * as domInput from "./adapters/input/dom-input.js";
import * as peerjs from "./adapters/net/peerjs.js";
import { localProfileStore } from "./adapters/storage/local.js";
import { guestAuth } from "./adapters/auth/guest.js";
import { createClient } from "./adapters/server/supabase-rest.js";
import { supabaseAuth } from "./adapters/auth/supabase.js";
import { supabaseServer } from "./adapters/server/supabase.js";
import { turnstileToken } from "./adapters/server/turnstile.js";
import { BACKEND } from "./content/backend.js";
import { awaitPurchase, claimDaily, initAccount, onSync, online as serverOn, syncOnStart } from "./app/account.js";

async function boot() {
  // 1. Dienste einstecken, Spieler und Profil laden. Mit Server (content/backend.js): Konto und Spielstand dort.
  const be = backendConfig();
  const client = be && createClient({ ...be, captcha: be.captchaSiteKey ? turnstileToken(be.captchaSiteKey) : null, sessionKey: be.sessionKey });
  // Rückkehr aus der Bestätigungs-Mail (#access_token=...): Sitzung übernehmen, Adresse aufräumen
  let mailBack = null;
  if (client && /access_token=|error_description=/.test(location.hash)) {
    mailBack = await client.takeRedirect(location.hash).catch(e => e.code || "Fehler");
    history.replaceState(null, "", location.pathname + location.search);
  }
  const auth = client ? supabaseAuth(client) : guestAuth();
  provide({ audio: webAudio, input: domInput, net: peerjs, auth, ...(client ? { server: supabaseServer(client) } : {}) });
  await auth.init();
  await initProfile(localProfileStore());
  setLang(S.lang && S.lang !== "auto" ? S.lang : detectLang());   // Sprache vor dem ersten Text
  applyI18n();
  initAccount();
  onSync(refreshTop);
  const synced = serverOn() ? syncOnStart().catch(() => null) : null;

  // 2. Oberfläche aufbauen
  initRender($("cv"));
  setQuality(S.quality);
  webAudio.setSfx(S.sfx); webAudio.setMusic(S.music); domInput.setVibration(S.vib);
  domInput.initInput({ inGame: () => inGame(), onKey, onPadButton: onPad, onTouch: () => { webAudio.unlock(); updateBand(); } });
  [initNav, initHome, initModes, initSelect, initSetup, initRules, initRun, initCareer, initChests, initLocker, initOnline, initShop, initTasks, initAchievements, initSettings, initProfileScreen, initEnd, initSearch, initPass, initBoard, initHud].forEach(f => f());

  // 3. Los geht's
  startDemo();
  showScreen("home", true);
  requestAnimationFrame(loop);
  let netClosed = false;
  window.addEventListener("pagehide", () => { netClosed = sessionHide(true); });
  // aus dem Zurück-Speicher des Browsers wiederhergestellt: Verbindung ist weg, Neustart setzt das Online-Spiel fort
  // (auch ohne Sitzung, z. B. mitten in der Gegnersuche: sonst hängt die Seite ohne Verbindung)
  window.addEventListener("pageshow", e => { if (e.persisted && (sessionRole() || netClosed)) location.reload(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sessionHide(false); });
  $("netWaitLeave").onclick = giveUpWaiting;
  const unlockOnce = () => { webAudio.unlock(); if (!inGame()) webAudio.music(true, "menu"); window.removeEventListener("pointerdown", unlockOnce); window.removeEventListener("keydown", unlockOnce); };
  window.addEventListener("pointerdown", unlockOnce); window.addEventListener("keydown", unlockOnce);
  const fontsReady = document.fonts ? Promise.all(["400 20px 'Lilita One'", "800 20px Nunito", "900 20px Nunito"].map(f => document.fonts.load(f).catch(() => {}))) : Promise.resolve();
  Promise.race([fontsReady, new Promise(r => { setTimeout(r, 1500); })]).then(() => {
    $("loading").classList.add("done"); resize(); homeScreen();
    return takeResumable().catch(() => null);
  }).then(found => {
    // Einladungslink: ?join=CODE (alte Links mit #CODE gehen auch)
    const qs = new URLSearchParams(location.search).get("join") || "";
    const h = /^[A-Za-z0-9]{4}$/.test(qs) ? qs : (location.hash || "").slice(1);
    const invite = /^[A-Za-z0-9]{4}$/.test(h) ? h : "";
    // App mitten im Online-Spiel geschlossen? Dann zurück ins Spiel bzw. in die Lobby (session.js).
    // Ein neuer Einladungslink in einen anderen Raum geht vor.
    let back = found;
    if (back && invite && invite.toLowerCase() !== String(back.code).toLowerCase()) { clearSession(); back = null; }
    if (back && (back.mm ? resumeMatch : resumeFriends)(back)) toast(t("net.resuming"), "i-swap");
    else back = null;
    // Tagesbelohnung: nicht mitten ins zurückgeholte Online-Spiel, sondern beim nächsten Weg ins Menü (quitToMenu)
    const daily = () => {
      const d = dailyCheck();
      if (d) setTimeout(() => dailyModal(d), 500);
      return (synced || Promise.resolve()).then(() => { homeScreen(); return serverOn() ? claimDaily() : null; }).then(x => { if (x) { homeScreen(); setTimeout(() => dailyModal(x), 500); } });
    };
    if (back) { App.dailyLater = daily; if (synced) synced.then(() => homeScreen()); } else daily();
    if (mailBack) toast(mailBack === "ok" ? t("acc.linked") : t("acc.linkFailed", { err: mailBack }), mailBack === "ok" ? "i-check" : "i-close", mailBack === "ok");
    // Rückkehr von der Bezahlseite
    const kauf = new URLSearchParams(location.search).get("kauf");
    if (kauf && serverOn()) {
      const q = new URLSearchParams(location.search); q.delete("kauf");
      history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : ""));
      if (kauf === "ok") {
        toast(t("shop.thanks"), "i-gem", true);
        (synced || Promise.resolve()).then(() => awaitPurchase(S.gems || 0)).then(n => { homeScreen(); if (n) toast(t("shop.gemsPlus", { n }), "i-gem", true); });
      } else toast(t("shop.cancelled"), "i-close");
    }
    // App installieren: Knopf oben und in den Einstellungen, nur wenn es geht und die App nicht schon läuft
    // Vollbild-Zeile nur, wo es Vollbild gibt (nicht als installierte App, nicht auf dem iPhone); dort Hinweis bei „App installieren“
    const showInstall = () => {
      const ok = canInstall(); $("btnInstall").hidden = !ok; $("rowInstall").hidden = !ok;
      $("rowFull").hidden = !canFullscreen() || standalone(); $("installFsHint").hidden = !ok || canFullscreen();
    };
    $("btnInstall").onclick = install; $("btnInstall2").onclick = install;
    initInstall(showInstall);
    if (invite) { history.replaceState(null, "", location.pathname); if (!back) { $("codeIn").value = invite.toUpperCase(); openOnline(); setTimeout(() => tryJoin(invite), 400); } }
  });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /[?&]sw=1/.test(location.search))) navigator.serviceWorker.register("sw.js").catch(() => {});   // sw=1: Test ohne https
  window.__kd = App; window.__kdFire = fireSuper; // für Tests
}

// Server aus content/backend.js; für Tests und Entwicklung auch ?backend=<url>&key=<anon> (nur localhost)
function backendConfig() {
  const q = new URLSearchParams(location.search), u = q.get("backend");
  // as=2: zweites Konto im selben Browser (Tests mit zwei Tabs)
  if (u && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) return { url: u, anonKey: q.get("key") || "dev", sessionKey: q.get("as") ? "kopfball-duell-session-" + q.get("as").replace(/\W/g, "") : undefined };
  // lokal ohne ?backend=: ohne Server. Tests und Entwicklung reden so nie mit dem Live-Server
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return null;
  return BACKEND.url && BACKEND.anonKey ? BACKEND : null;
}

boot();
