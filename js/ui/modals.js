// Dialoge: Tagesbonus, Level, neuer Kopf, Pokal
import { RARITY, rarityOf, SUPERS } from "../content/config.js";
import { addCoins, S, save } from "../app/profile.js";
import { LEVEL_SURE_HEAD, levelChest, levelCoins } from "../content/cosmetics.js";
import { chestEl, openChestOverlay } from "./screens/chests.js";
import { avatarCanvas } from "./render/art.js";
import { modal, toast } from "./dom.js";
import { refreshTop } from "./screens/home.js";
import { audio as A } from "../app/services.js";
import { t } from "../content/i18n.js";

export function dailyModal(d) {
  const days = Array.from({ length: 7 }, (_, n) => `<i class="${n < d.streak ? "on" : ""}">${n + 1}</i>`).join("");
  modal({ title: t("daily.title"), icon: "i-gift", body: `<p>${t("daily.streak", { n: d.streak, coins: d.amount })}</p><div class="streak">${days}</div><p style="font-size:14px;opacity:.7">${t("daily.more")}</p>`, btn: t("daily.collect"), onOk: () => { A.sfx("coin"); refreshTop(); } });
}

export function levelModal(lvl) {
  A.sfx("levelup");
  const bonus = levelCoins(lvl); addCoins(bonus); save(); refreshTop();
  const tier = levelChest(lvl), sure = LEVEL_SURE_HEAD[lvl];
  modal({ title: t("level.title", { n: lvl }), icon: "i-star", body: `<p>${t("level.bonus", { coins: bonus })}</p><div class="lvchest"></div><p><b>${t("level.chest", { tier: t("chest." + tier) })}</b>${sure ? `<br><small>${t("level.sureHead", { rarity: RARITY[sure] })}</small>` : ""}</p>`,
    btn: t("level.openChest"), cancel: t("level.later"), onOk: () => openLevelChest(lvl) });
  const box = document.querySelector(".lvchest"); if (box) box.append(chestEl(tier, 110));
}

// Kiste des Level-Ups öffnen. Mit Server kommt sie mit der Spielmeldung, also kurz warten
async function openLevelChest(lvl) {
  for (let i = 0; i < 20; i++) {
    const c = S.chests.find(x => x.source === "level" && x.ref === String(lvl)) || S.chests.find(x => x.source === "level");
    if (c) { openChestOverlay(c); return; }
    await new Promise(r => { setTimeout(r, 200); });
  }
  toast(t("level.chestLater"), "i-chest");
}

export function unlockModal(c) {
  const rar = rarityOf(c);
  modal({ title: t("unlock.title"), body: `<div class="briefav"></div><p><b>${c.name}</b> · ${RARITY[rar]}</p><p style="font-size:15px">${t("unlock.super", { name: SUPERS[c.super].name })}</p>`, btn: t("unlock.ok"), ribbon: "" });
  const box = document.querySelector(".briefav"); if (box) box.append(avatarCanvas(c.id, 130, { mood: "happy" }));
}

export function trophyModal() { A.sfx("levelup"); modal({ title: t("trophy.title"), icon: "i-trophy", body: `<p>${t("trophy.text")}</p>`, btn: t("trophy.ok") }); }
