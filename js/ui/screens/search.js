// Gegnersuche (Casual / Ranked): Wartezeit, Gegner gefunden, Verbindungsaufbau
import { avatarCanvas } from "../render/art.js";
import { $ } from "../dom.js";
import { goBack, registerScreen } from "../nav.js";
import { S } from "../../app/profile.js";
import { App } from "../../app/state.js";
import { cancelSearch, league } from "../../app/matchmaking.js";
import { serverState } from "../../app/account.js";
import { cleanCos } from "../../app/cosmetics.js";
import { cosById } from "../../content/cosmetics.js";
import { t } from "../../content/i18n.js";

let clock = null;
const mmss = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");

export function searchUI(mm) {
  if (!mm) return;
  $("srTitle").textContent = t(mm.mode === "ranked" ? "mode.ranked.name" : "mode.casual.name");
  const av = $("srAv"); if (mm.state === "search" || !av.firstChild) { av.innerHTML = ""; av.append(avatarCanvas(S.char, 120)); }
  const rating = serverState() && serverState().season && serverState().season.rating;
  $("srMe").textContent = (S.name || t("ui.you")) + (mm.mode === "ranked" ? " · " + league(rating ? rating.mmr : 1000) + " " + (rating ? rating.mmr : 1000) : "");
  const st = $("srState"), opp = $("srOpp");
  if (mm.state === "search") {
    st.textContent = t("search.searching"); opp.textContent = "";
    $("scr-search").classList.remove("found");
    clearInterval(clock); clock = setInterval(() => { if (App.mm && App.mm.state === "search") $("srTime").textContent = mmss((Date.now() - App.mm.t0) / 1000); else clearInterval(clock); }, 250);
  } else {
    clearInterval(clock);
    $("scr-search").classList.add("found");
    const o = mm.opp || {};
    st.textContent = t(mm.state === "connect" ? "search.found" : mm.state === "check" ? "search.checking" : "lobby.connected");
    opp.textContent = "";
    // Spieler-Karte des Gegners: Kopf, Rahmen und Titel (vom Server geprüft), Name, Level, Kopf-Level, Liga
    const h = (mm.heads && mm.heads[mm.role === "host" ? "p2" : "p1"]) || {}, card = $("srThem");
    const oav = $("srOppAv"); oav.innerHTML = "";
    const oc = cleanCos(h.cos);
    oav.append(avatarCanvas((h.head || "head:kalle").replace(/^head:/, ""), 120, { dir: -1, frame: oc.frame, live: true }));
    $("srOppName").textContent = (o.name || t("search.opponent")) + (oc.title ? " · " + cosById(oc.title).name : "");
    $("srOppInfo").textContent = [t("level.title", { n: o.level || 1 }), t("search.headLevel", { n: h.level || 1 }), mm.mode === "ranked" && o.mmr ? league(o.mmr) + " " + o.mmr : ""].filter(Boolean).join(" · ");
    card.hidden = false;
  }
  if (mm.state === "search") $("srThem").hidden = true;
  $("srCancel").hidden = mm.state !== "search";
}

export function initSearch() {
  registerScreen("search", { back: () => { if (App.mm && App.mm.state !== "search") return true; cancelSearch(); return false; } });
  $("srCancel").onclick = goBack;
}
