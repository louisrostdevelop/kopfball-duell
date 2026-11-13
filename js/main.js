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
import { captchaBlockedModal, dailyModal, foreignLinkModal, linkErrorModal } from "./ui/modals.js";
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
import { backendConfig } from "./adapters/server/config.js";
import { awaitPurchase, claimDaily, initAccount, onSync, online as serverOn, syncOnStart } from "./app/account.js";
import { ensureRelay } from "./app/relay.js";
import { firstVisit } from "./app/track.js";

// bekannte Fehler im Link aus der Mail, sonst Text von Supabase (nur eigene Schlüssel: error_code=constructor o. ä.;
// hasOwnProperty statt Object.hasOwn, das fehlt in Safari vor 15.4)
const LINK_ERR = { otp_expired: "acc.linkExpired" };

// Neu laden (neue Version, Konto in einem anderen Tab geändert) nur auf dem Startbildschirm: nicht in einem (auch
// pausierten) Spiel, nicht in der Gegnersuche oder mit offenem Raum, nicht beim Tippen. Sonst alle 5 s nachsehen.
const typing = () => { const a = document.activeElement; return !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName); };
const calm = () => App.screen === "home" && !inGame() && !App.mm && !App.netWait && !peerjs.role() && App.mode !== "host" && App.mode !== "guest" && !typing();
let reloadPending = false;
const reloadWhenCalm = () => {
  if (reloadPending) return;
  reloadPending = true;
  const go = () => { if (calm()) location.reload(); else setTimeout(go, 5000); };
  go();
};

async function boot() {
  // 1. Dienste einstecken, Spieler und Profil laden. Mit Server (content/backend.js): Konto und Spielstand dort.
  const be = backendConfig(location, BACKEND);
  // Captcha: Kästchen zum Anklicken nie mitten im Spiel; lädt es gar nicht (Werbeblocker), einmal erklären
  let blockedSaid = false;
  const captchaBlocked = () => {
    if (blockedSaid || globalThis.navigator?.onLine === false) return;   // ohne Netz lädt nichts, das ist kein Werbeblocker
    blockedSaid = true;
    if (inGame()) toast(t("acc.captchaBlocked.text"), "i-close"); else captchaBlockedModal();
  };
  const captcha = be && be.captchaSiteKey ? turnstileToken(be.captchaSiteKey, { allowInteraction: () => !inGame(), onBlocked: captchaBlocked }) : null;
  const client = be && createClient({ ...be, captcha, sessionKey: be.sessionKey });
  if (client) {
    // anderer Tab oder die App im selben Browser hat das Konto gewechselt oder sich abgemeldet: neu laden, sobald es nicht stört
    client.onSessionChanged(() => {
      if (!calm()) toast(t("acc.otherTab"), "i-user");
      reloadWhenCalm();
    });
    let warned = false;   // Speicher voll: Anmeldung nur in diesem Tab, einmal Bescheid sagen
    client.onUnsaved(() => { if (!warned) { warned = true; toast(t("acc.unsaved"), "i-close"); } });
  }
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
  onSync(() => refreshTop(true));
  const synced = serverOn() ? syncOnStart().catch(() => null) : null;
  // Relay-Zugangsdaten für Online-Spiele schon jetzt holen (wer per Einladungslink kommt, verbindet gleich) und
  // ablaufende rechtzeitig erneuern; ensureRelay fragt nur, wenn keine gültigen da sind
  if (synced) { synced.then(() => ensureRelay(15000)); setInterval(() => { ensureRelay(); }, 10 * 60 * 1000); }
  // Nutzungsstatistik: erst mit Sitzung (sonst legte die Meldung selbst einen Gast an); Herkunft vor dem Aufräumen der Adresse
  if (synced) { const from = location.href; synced.then(() => { const u = auth.user(); if (u) firstVisit(u.id, from); }); }

  // 2. Oberfläche aufbauen
  initRender($("cv"));
  setQuality(S.quality);
  webAudio.setSfx(S.sfx); webAudio.setMusic(S.music); domInput.setVibration(S.vib);
  domInput.initInput({ label: k => t("touch." + k), inGame: () => inGame(), onKey, onPadButton: onPad, onTouch: () => { webAudio.unlock(); updateBand(); } });
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
    // Rückkehr aus der Mail. Was man lesen muss, kommt als Dialog (bei einem zurückgeholten Online-Spiel erst danach):
    // fremder Link (in einem anderen Browser angefordert, z. B. in der installierten App; Link und Code sind verbraucht),
    // abgelaufener Link. Schon mit dem Konto angemeldet: nur kurz Bescheid, nichts zu tun.
    const later = f => { if (back) { const d = App.dailyLater; App.dailyLater = () => { f(); return d && d(); }; } else f(); };
    const linkErr = mailBack && typeof mailBack === "object" ? mailBack : null, me = auth.user();
    if (mailBack === "ok") toast(t("acc.linked"), "i-check", true);
    else if (mailBack === "own" || (linkErr && linkErr.error === "otp_expired" && me && !me.guest)) toast(t("acc.alreadyIn"), "i-check");
    else if (mailBack === "foreign") later(foreignLinkModal);
    else if (mailBack) later(() => linkErrorModal(linkErr && Object.prototype.hasOwnProperty.call(LINK_ERR, linkErr.error) ? t(LINK_ERR[linkErr.error]) : t("acc.linkFailed", { err: String(linkErr ? linkErr.text : mailBack).slice(0, 160) })));
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
  if ("serviceWorker" in navigator && (location.protocol === "https:" || /[?&]sw=1/.test(location.search))) {   // sw=1: Test ohne https
    const hadCtl = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register("sw.js").then(reg => {
      // neue Version suchen, wenn die App wieder nach vorne kommt (eine offene App läuft sonst tagelang mit der alten)
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") reg.update().catch(() => {}); });
    }).catch(() => {});
    // neue Version übernommen: außerhalb eines Spiels neu laden, sonst beim nächsten Weg ins Menü
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadCtl) return;
      reloadWhenCalm();
    });
  }
  // Test-Zugang nur lokal (auf headstars.app nicht offen: sonst ließe sich der Spielstand bequem von Hand ändern)
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) { window.__kd = App; window.__kdFire = fireSuper; window.__kdAudio = webAudio.state; }
}

boot().catch(e => {
  // Start fehlgeschlagen: nicht ewig auf dem Ladebildschirm hängen, sondern sagen, was zu tun ist
  console.error(e);
  const l = document.getElementById("loading");
  if (l) { const m = document.createElement("p"); m.className = "ld-err"; m.textContent = "Headstars konnte nicht starten. Bitte neu laden. / Headstars could not start. Please reload."; l.append(m); }
});
