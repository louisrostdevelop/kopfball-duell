// Ausrüstung: Hut, Schuhe, Torexplosion, 4 Emote-Plätze. Besessenes antippen = tragen, Fehlendes mit Splittern herstellen.
import { COSMETICS, SHARDS } from "../../content/cosmetics.js";
import { RARITY } from "../../content/config.js";
import { S } from "../../app/profile.js";
import { craft } from "../../app/account.js";
import { emoteSlots, equip, isEquipped } from "../../app/cosmetics.js";
import { avatarCanvas } from "../render/art.js";
import { cosIcon } from "./chests.js";
import { $, esc, toast } from "../dom.js";
import { registerScreen, showScreen } from "../nav.js";
import { audio as A } from "../../app/services.js";
import { num, t } from "../../content/i18n.js";

const TABS = [["hat", ["hat"]], ["shoes", ["shoes"]], ["goalfx", ["goalfx"]], ["emotes", ["emote", "emoji"]]];
let tab = "hat", slot = 0;

export function lockerScreen() { showScreen("locker"); }

function slotLabel(e) {
  const c = COSMETICS.find(x => x.id === e);
  return c ? cosIcon(e, 34) : Object.assign(document.createElement("span"), { className: "stdemo", textContent: e });
}

function render() {
  $("lockerShards").textContent = num(S.shards || 0);
  const pv = $("lockerPreview"); pv.innerHTML = "";
  pv.append(avatarCanvas(S.char, 120, { hat: S.equip.hat, mood: "happy" }));
  const tabs = $("lockerTabs"); tabs.innerHTML = "";
  for (const [id] of TABS) {
    const b = document.createElement("button"); b.className = id === tab ? "on" : ""; b.textContent = t("locker.tab." + id); b.dataset.tab = id;
    b.onclick = () => { A.sfx("click"); tab = id; render(); };
    tabs.append(b);
  }
  // Emote-Plätze
  const sl = $("lockerSlots"); sl.innerHTML = ""; sl.hidden = tab !== "emotes";
  emoteSlots().forEach((e, n) => {
    const b = document.createElement("button"); b.className = "eslot" + (n === slot ? " on" : ""); b.append(slotLabel(e));
    b.title = t("locker.slot", { n: n + 1 }); b.onclick = () => { A.sfx("click"); slot = n; render(); };
    sl.append(b);
  });
  const kinds = TABS.find(x => x[0] === tab)[1], grid = $("lockerGrid"); grid.innerHTML = "";
  for (const c of COSMETICS.filter(x => kinds.includes(x.kind))) {
    const own = S.cos.includes(c.id), on = own && isEquipped(c.id), cost = SHARDS.craft[c.rarity];
    const d = document.createElement("button"); d.className = `lcard r-${c.rarity}` + (own ? "" : " locked") + (on ? " on" : ""); d.dataset.id = c.id;
    d.append(cosIcon(c.id, 52));
    d.insertAdjacentHTML("beforeend", `<b>${esc(c.name)}</b><small>${RARITY[c.rarity]}</small>` +
      (own ? `<em>${on ? t("locker.worn") : t("locker.wear")}</em>` : `<em class="craft">${t("locker.craft", { n: cost })}</em>`));
    d.onclick = async () => {
      if (own) { A.sfx("click"); equip(c.id, slot); render(); return; }
      if ((S.shards || 0) < cost) { toast(t("locker.needShards", { n: cost }), "i-lock"); return; }
      try { if (!(await craft(c.id))) throw new Error("craft"); A.sfx("levelup"); toast(t("locker.crafted", { name: c.name }), "i-star", true); equip(c.id, slot); render(); }
      catch (e) { toast(t(e && e.code === "offline" ? "sync.buyOffline" : "locker.craftFailed"), "i-lock"); }
    };
    grid.append(d);
  }
}

export function initLocker() {
  registerScreen("locker", { show: render });
  $("btnSelLocker").onclick = () => { A.sfx("click"); showScreen("locker"); };
}
