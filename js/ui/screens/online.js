// Online-Seite und Lobby
import { ARENAS, charById, SUPERS } from "../../content/config.js";
import { owns, S, save } from "../../app/profile.js";
import { avatarCanvas } from "../render/art.js";
import { sendNetCfg, hostGame, tryJoin, hostStart } from "../../app/online.js";
import { App } from "../../app/state.js";
import { $, seg, shareOrCopy, copyText } from "../dom.js";
import { showScreen, registerScreen, swapScreen, goBack } from "../nav.js";
import { rulesSummary, rulesScreen } from "./rules.js";
import { obsChoices } from "./setup.js";
import { selectScreen } from "./select.js";
import { audio as A, net as Net } from "../../app/services.js";

export function openOnline() { $("nameIn").value = S.name || ""; netNote(""); showScreen("online"); }

export function lobbyUI(role) {
  const host = role === "host";
  $("inviteBox").hidden = !host;
  $("btnLobbyStart").hidden = !host;
  $("btnLobbyStart").disabled = !App.opp;
  $("lobbyOpts").classList.toggle("locked", !host);
  const me = { name: S.name || "Du", ch: S.char };
  const left = host ? me : App.opp, right = host ? App.opp : me;
  const put = (n, p, you) => {
    const av = $("vsAv" + n); av.innerHTML = "";
    if (p) { av.append(avatarCanvas(p.ch, 110, { dir: n ? -1 : 1 })); $("vsName" + n).textContent = p.name + (you ? " (du)" : ""); $("vsCh" + n).textContent = charById(p.ch).name + " · " + SUPERS[charById(p.ch).super].name; }
    else { av.innerHTML = '<span class="wait">?</span>'; $("vsName" + n).textContent = "Warte…"; $("vsCh" + n).textContent = ""; }
  };
  put(0, left, host); put(1, right, !host);
  if (!host) $("lobbyNote").textContent = App.opp ? "Warte, bis " + App.opp.name + " anpfeift." : "Verbinde…";
  else if (App.opp) $("lobbyNote").textContent = App.opp.name + " ist bereit. Anpfiff, wenn du willst!";
  const c = App.netCfg || { arena: S.arena, rules: {} };
  seg($("segLobbyArena"), ARENAS.map(a => ({ v: a.id, t: a.name, dis: host && !owns("arenas", a.id) })), c.arena, v => { App.netCfg.arena = v; sendNetCfg(); });
  seg($("segLobbyObs"), obsChoices(c.arena), (c.rules && c.rules.obs) ?? "off", v => { App.netCfg.rules = App.netCfg.rules || {}; if (v === "off") delete App.netCfg.rules.obs; else App.netCfg.rules.obs = v; sendNetCfg(); });
  $("lobbyRulesSum").textContent = rulesSummary(c.rules);
}

export function makeQR(link) {
  const box = $("qrBox"); box.innerHTML = "";
  if (!window.qrcode) return;
  try { const q = window.qrcode(0, "M"); q.addData(link); q.make(); const img = new Image(); img.src = q.createDataURL(5, 2); img.alt = "QR-Code zum Beitreten"; box.append(img); } catch (_) {}
}

export function netNote(t, err) { const n = $("netNote"); n.textContent = t || "Wenn dein Kumpel dir einen Link geschickt hat, öffne einfach den Link."; n.classList.toggle("err", !!err); }

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
  $("btnLobbyHead").onclick = () => { A.sfx("click"); selectScreen({ title: "Kopf wechseln", okText: "Übernehmen", onDone: id => { S.char = id; save(); Net.send({ t: "pick", ch: id }); goBack(); } }); };
  $("btnShare").onclick = () => { A.sfx("click"); const link = $("lobbyLink").textContent; if (link) shareOrCopy({ title: "Kopfball Duell", text: "Kopfball Duell gegen mich? Tipp auf den Link: " + link }); };
  $("btnCopyLink").onclick = () => { A.sfx("click"); const link = $("lobbyLink").textContent; if (link) copyText(link); };
}
