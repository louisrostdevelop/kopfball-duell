// Online-Seite und Lobby
import { ARENAS, charById, SUPERS } from "../../content/config.js";
import { owns, S, save } from "../../store.js";
import { avatarCanvas } from "../render/art.js";
import { sendNetCfg } from "../../app/online.js";
import { App } from "../../app/state.js";
import { $, seg } from "../dom.js";
import { showScreen } from "../nav.js";
import { rulesSummary } from "./rules.js";
import { obsChoices } from "./setup.js";

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
