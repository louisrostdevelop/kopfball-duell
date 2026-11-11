// Online-Seite und Lobby
import { ARENAS, charById, SUPERS } from "../../content/config.js";
import { myCos } from "../../app/cosmetics.js";
import { owns, S, save } from "../../app/profile.js";
import { avatarCanvas } from "../render/art.js";
import { sendNetCfg, hostGame, tryJoin, hostStart } from "../../app/online.js";
import { headLevel } from "../../app/game.js";
import { clearSession } from "../../app/session.js";
import { App } from "../../app/state.js";
import { $, seg, shareOrCopy, copyText } from "../dom.js";
import { showScreen, registerScreen, swapScreen, goBack } from "../nav.js";
import { rulesSummary, rulesScreen } from "./rules.js";
import { obsChoices } from "./setup.js";
import { selectScreen } from "./select.js";
import { audio as A, net as Net } from "../../app/services.js";
import { t } from "../../content/i18n.js";

// Mit Freunden spielen: nur Raum erstellen oder per Code beitreten (Casual/Ranked starten direkt aus der Modus-Wahl)
export function openOnline() { netNote(""); showScreen("online"); }

export function lobbyUI(role) {
  const host = role === "host";
  $("inviteBox").hidden = !host;
  $("btnLobbyStart").hidden = !host;
  $("btnLobbyStart").disabled = !App.opp;
  $("lobbyOpts").classList.toggle("locked", !host);
  const me = { name: S.name || t("ui.you"), ch: S.char, cos: myCos() };
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
    back: () => { Net.send({ t: "bye" }); Net.close(250); clearSession(); App.stack = ["home"]; swapScreen("online"); return true; },   // bewusst raus: die andere Seite wartet nicht, kein Zurückverbinden
    resume: () => lobbyUI(Net.role() === "host" ? "host" : "guest"),
  });
  $("btnHost").onclick = () => { A.sfx("click"); hostGame(); };
  $("btnJoin").onclick = () => { A.sfx("click"); tryJoin(); };
  $("codeIn").addEventListener("keydown", e => { if (e.key === "Enter") tryJoin(); });
  $("btnLobbyLeave").onclick = goBack;
  $("btnLobbyStart").onclick = () => { A.sfx("click"); hostStart(); };
  $("btnLobbyRules").onclick = () => { A.sfx("click"); App.netCfg.rules = App.netCfg.rules || {}; rulesScreen(App.netCfg.rules, () => { S.rules = { ...App.netCfg.rules }; save(); Net.send({ t: "cfg", cfg: App.netCfg }); }); };
  $("btnLobbyHead").onclick = () => { A.sfx("click"); selectScreen({ title: t("lobby.changeHead"), okText: t("ui.apply"), onDone: id => { S.char = id; save(); Net.send({ t: "pick", ch: id, lv: headLevel(id), cos: myCos() }); goBack(); } }); };
  $("btnShare").onclick = () => { A.sfx("click"); const link = $("lobbyLink").textContent; if (link) shareOrCopy({ title: "Headstars", text: t("lobby.shareText", { link }) }); };   // i18n-ok: Marke
  $("btnCopyLink").onclick = () => { A.sfx("click"); const link = $("lobbyLink").textContent; if (link) copyText(link); };
  // Raumcode antippen: kopiert ihn (zum Weitersagen oder Eintippen auf einem anderen Gerät)
  $("lobbyCode").onclick = () => { const c = $("lobbyCode").textContent.trim(); if (/^[A-Za-z0-9]{4}$/.test(c)) { A.sfx("click"); copyText(c); } };
}
