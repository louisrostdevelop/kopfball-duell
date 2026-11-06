// Online-Seite und Lobby
import { ARENAS, charById, SUPERS } from "../../content/config.js";
import { owns, S, save } from "../../app/profile.js";
import { avatarCanvas } from "../render/art.js";
import { sendNetCfg, hostGame, tryJoin, hostStart } from "../../app/online.js";
import { headLevel } from "../../app/game.js";
import { App } from "../../app/state.js";
import { $, seg, shareOrCopy, copyText } from "../dom.js";
import { showScreen, registerScreen, swapScreen, goBack } from "../nav.js";
import { rulesSummary, rulesScreen } from "./rules.js";
import { obsChoices } from "./setup.js";
import { selectScreen } from "./select.js";
import { audio as A, net as Net } from "../../app/services.js";
import { online as serverOn, serverState } from "../../app/account.js";
import { errText, findMatch, league, MIN_LEVEL } from "../../app/matchmaking.js";
import { friendsPanel } from "./friends.js";
import { lockText, modeLock } from "./modes.js";
import { t } from "../../content/i18n.js";

export function openOnline() { $("nameIn").value = S.name || ""; netNote(""); mmPanel(); friendsPanel(); showScreen("online"); }

// Gegner suchen (nur mit Server): Casual ohne Wertung, Ranked mit Liga
export function mmPanel() {
  const box = $("mmPanel"); box.hidden = !serverOn(); if (box.hidden) return;
  const st = serverState() || {}, r = st.season && st.season.rating, mmr = r ? r.mmr : 1000;
  const setBtn = (b, mode, sub) => {
    const lock = modeLock(mode);
    b.classList.toggle("locked", !!lock);
    b.querySelector("em").textContent = lockText(lock, mode) || sub;
    b.onclick = () => {
      A.sfx("click");
      if (lock === "account") { showScreen("settings"); return; }
      if (lock) { netNote(t("lock.levelHint", { n: MIN_LEVEL[mode] }), true); return; }
      saveName($("nameIn").value);
      findMatch(mode).catch(e => netNote(errText(e), true));
    };
  };
  setBtn($("btnCasual"), "casual", t("mm.unranked"));
  setBtn($("btnRanked"), "ranked", league(mmr) + " · " + mmr + (r ? " · " + t("mm.wins", { w: r.wins, g: r.games }) : ""));
}

export function lobbyUI(role) {
  const host = role === "host";
  $("inviteBox").hidden = !host;
  $("btnLobbyStart").hidden = !host;
  $("btnLobbyStart").disabled = !App.opp;
  $("lobbyOpts").classList.toggle("locked", !host);
  const me = { name: S.name || t("ui.you"), ch: S.char };
  const left = host ? me : App.opp, right = host ? App.opp : me;
  const put = (n, p, you) => {
    const av = $("vsAv" + n); av.innerHTML = "";
    if (p) { av.append(avatarCanvas(p.ch, 110, { dir: n ? -1 : 1 })); $("vsName" + n).textContent = p.name + (you ? " " + t("lobby.youTag") : ""); $("vsCh" + n).textContent = charById(p.ch).name + " · " + SUPERS[charById(p.ch).super].name; }
    else { av.innerHTML = '<span class="wait">?</span>'; $("vsName" + n).textContent = t("lobby.waiting"); $("vsCh" + n).textContent = ""; }
  };
  put(0, left, host); put(1, right, !host);
  if (!host) $("lobbyNote").textContent = App.opp ? t("lobby.waitFor", { name: App.opp.name }) : t("lobby.connecting");
  else if (App.opp) $("lobbyNote").textContent = t("lobby.ready", { name: App.opp.name });
  const c = App.netCfg || { arena: S.arena, rules: {} };
  seg($("segLobbyArena"), ARENAS.map(a => ({ v: a.id, t: a.name, dis: host && !owns("arenas", a.id) })), c.arena, v => { App.netCfg.arena = v; sendNetCfg(); });
  seg($("segLobbyObs"), obsChoices(c.arena), (c.rules && c.rules.obs) ?? "off", v => { App.netCfg.rules = App.netCfg.rules || {}; if (v === "off") delete App.netCfg.rules.obs; else App.netCfg.rules.obs = v; sendNetCfg(); });
  $("lobbyRulesSum").textContent = rulesSummary(c.rules);
}

export function makeQR(link) {
  const box = $("qrBox"); box.innerHTML = "";
  if (!window.qrcode) return;
  try { const q = window.qrcode(0, "M"); q.addData(link); q.make(); const img = new Image(); img.src = q.createDataURL(5, 2); img.alt = t("lobby.qrAlt"); box.append(img); } catch (_) {}
}

export function netNote(text, err) { const n = $("netNote"); n.textContent = text || t("net.hint"); n.classList.toggle("err", !!err); }

export function saveName(v) { v = String(v || "").trim().slice(0, 12); if (v) { S.name = v; save(); } }

// Knöpfe verdrahten und bei der Navigation anmelden (einmal beim Start)
export function initOnline() {
  registerScreen("lobby", {
    back: () => { Net.close(); App.stack = ["home"]; swapScreen("online"); return true; },
    resume: () => lobbyUI(Net.role() === "host" ? "host" : "guest"),
  });
  $("btnHost").onclick = () => { A.sfx("click"); hostGame(); };
  $("btnJoin").onclick = () => { A.sfx("click"); tryJoin(); };
  $("codeIn").addEventListener("keydown", e => { if (e.key === "Enter") tryJoin(); });
  $("btnLobbyLeave").onclick = goBack;
  $("btnLobbyStart").onclick = () => { A.sfx("click"); hostStart(); };
  $("btnLobbyRules").onclick = () => { A.sfx("click"); App.netCfg.rules = App.netCfg.rules || {}; rulesScreen(App.netCfg.rules, () => { S.rules = { ...App.netCfg.rules }; save(); Net.send({ t: "cfg", cfg: App.netCfg }); }); };
  $("btnLobbyHead").onclick = () => { A.sfx("click"); selectScreen({ title: t("lobby.changeHead"), okText: t("ui.apply"), onDone: id => { S.char = id; save(); Net.send({ t: "pick", ch: id, lv: headLevel(id) }); goBack(); } }); };
  $("btnShare").onclick = () => { A.sfx("click"); const link = $("lobbyLink").textContent; if (link) shareOrCopy({ title: "Kopfball Duell", text: t("lobby.shareText", { link }) }); };   // i18n-ok: Marke
  $("btnCopyLink").onclick = () => { A.sfx("click"); const link = $("lobbyLink").textContent; if (link) copyText(link); };
}
