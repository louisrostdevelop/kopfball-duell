// Bestenliste (nur mit Server): Endlos-Rekorde und Ranked der laufenden Saison, mit eigenem Platz
import { $, $$, esc, toast } from "../dom.js";
import { registerScreen, showScreen } from "../nav.js";
import { S } from "../../app/profile.js";
import { boards, online as serverOn } from "../../app/account.js";
import { audio as A } from "../../app/services.js";
import { t } from "../../content/i18n.js";

let tab = "endless";
const row = (rank, name, val, sub, me) => `<li class="${me ? "me" : ""}"><span class="rk">${rank}</span><b>${esc(name || t("ui.player"))}</b>${sub ? `<small>${esc(sub)}</small>` : ""}<span class="val">${val}</span></li>`;

export async function boardScreen() {
  $$("#boardTabs button").forEach(b => b.classList.toggle("on", b.dataset.board === tab));
  const list = $("boardList"), me = $("boardMe"), want = tab;
  list.innerHTML = `<li class="hint">${t("ui.loading")}</li>`; me.innerHTML = "";
  let data;
  try { data = await boards[tab](); } catch (_) { list.innerHTML = `<li class="hint">${t("ui.unreachable")}</li>`; return; }
  if (want !== tab) return;
  const mine = S.name;
  list.innerHTML = data.top.length ? data.top.map(r => tab === "endless"
    ? row(r.rank, r.name, t("board.wins", { n: r.score }), r.title, r.name === mine)
    : row(r.rank, r.name, r.mmr, r.league, r.name === mine)).join("") : `<li class="hint">${t(tab === "endless" ? "board.emptyEndless" : "board.emptyRanked")}</li>`;
  const m = data.me;
  me.innerHTML = m && m.rank
    ? `<span>${t("board.yourRank")}</span><b>${m.capped ? "10000+" : m.rank}</b><span>${tab === "endless" ? t("board.wins", { n: m.score }) : m.mmr + " · " + m.league}</span>`
    : `<span>${t(tab === "endless" ? "board.noEndless" : "board.noRanked")}</span>`;
  if (!S.name) me.insertAdjacentHTML("beforeend", `<button class="btn small ghost" id="boardName">${t("board.setName")}</button>`);
  const bn = $("boardName"); if (bn) bn.onclick = () => { toast(t("board.setNameHint"), "i-user"); showScreen("settings"); };
}

export function initBoard() {
  registerScreen("board", { show: boardScreen });
  $$("#boardTabs button").forEach(b => b.onclick = () => { A.sfx("click"); tab = b.dataset.board; boardScreen(); });
  $("btnBoard").onclick = () => { A.sfx("click"); showScreen("board"); };
}
/** Knopf im Erfolge-Bildschirm nur mit Server zeigen */
export function boardButton() { $("btnBoard").hidden = !serverOn(); }
