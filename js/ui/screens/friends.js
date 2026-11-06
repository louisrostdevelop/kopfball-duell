// Freunde (nur mit Server, auf der Online-Seite): per Name hinzufügen, Anfragen annehmen, entfernen, einladen
import { $, esc, toast } from "../dom.js";
import { addFriend, friendsList, online as serverOn, removeFriend } from "../../app/account.js";
import { hostGame } from "../../app/online.js";
import { audio as A } from "../../app/services.js";
import { t } from "../../content/i18n.js";

const msg = (text, err) => { const m = $("frMsg"); m.textContent = text || ""; m.classList.toggle("err", !!err); };
const isOn = iso => iso && Date.now() - new Date(iso) < 5 * 60 * 1000;

export async function friendsPanel() {
  const box = $("friendsPanel"); box.hidden = !serverOn(); if (box.hidden) return;
  const list = $("frList");
  let d;
  try { d = await friendsList(); } catch (_) { list.innerHTML = `<p class="hint">${t("ui.unreachable")}</p>`; return; }
  list.innerHTML = "";
  d.incoming.forEach(name => {
    const r = document.createElement("div"); r.className = "fr-row incoming";
    r.innerHTML = `<b>${esc(name)}</b><small>${t("fr.wants")}</small>`;
    const ok = document.createElement("button"); ok.className = "btn small green"; ok.textContent = t("fr.accept");
    ok.onclick = async () => { A.sfx("click"); const res = await addFriend(name); if (!res.ok) msg(res.msg, true); friendsPanel(); };
    const no = document.createElement("button"); no.className = "btn small ghost"; no.textContent = t("fr.decline");
    no.onclick = async () => { await removeFriend(name).catch(() => {}); friendsPanel(); };
    r.append(ok, no); list.append(r);
  });
  d.friends.forEach(f => {
    const r = document.createElement("div"); r.className = "fr-row";
    r.innerHTML = `<i class="dot${isOn(f.lastSeen) ? " on" : ""}"></i><b>${esc(f.name || t("ui.player"))}</b><small>${t("level.title", { n: f.level })}${isOn(f.lastSeen) ? " · " + t("fr.online") : ""}</small>`;
    const play = document.createElement("button"); play.className = "btn small purple"; play.textContent = t("fr.invite");
    play.onclick = () => { A.sfx("click"); toast(t("fr.roomOpen", { name: f.name }), "i-share"); hostGame(); };
    const rm = document.createElement("button"); rm.className = "btn small ghost"; rm.textContent = "✕"; rm.setAttribute("aria-label", t("fr.remove"));
    rm.onclick = async () => { if (!confirm(t("fr.confirmRemove", { name: f.name }))) return; await removeFriend(f.name).catch(() => {}); friendsPanel(); };
    r.append(play, rm); list.append(r);
  });
  if (!d.friends.length && !d.incoming.length) list.innerHTML = `<p class="hint">${t("fr.empty")}</p>`;
}

export function initFriends() {
  const add = async () => {
    const name = $("frName").value.trim(); if (!name) return;
    A.sfx("click");
    const r = await addFriend(name);
    if (!r.ok) { msg(r.msg, true); return; }
    $("frName").value = ""; msg(r.accepted ? t("fr.nowFriends") : t("fr.requestSent", { name })); friendsPanel();
  };
  $("frAdd").onclick = add;
  $("frName").addEventListener("keydown", e => { if (e.key === "Enter") add(); });
}
