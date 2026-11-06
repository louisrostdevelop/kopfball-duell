// Dialoge: Tagesbonus, Level, neuer Kopf, Pokal
import { CHARS, RARITY, rarityOf, SUPERS } from "../content/config.js";
import { addCoins, owns, save } from "../app/profile.js";
import { avatarCanvas } from "./render/art.js";
import { modal } from "./dom.js";
import { refreshTop } from "./screens/home.js";
import { audio as A } from "../app/services.js";
import { t } from "../content/i18n.js";

export function dailyModal(d) {
  const days = Array.from({ length: 7 }, (_, n) => `<i class="${n < d.streak ? "on" : ""}">${n + 1}</i>`).join("");
  modal({ title: t("daily.title"), icon: "i-gift", body: `<p>${t("daily.streak", { n: d.streak, coins: d.amount })}</p><div class="streak">${days}</div><p style="font-size:14px;opacity:.7">${t("daily.more")}</p>`, btn: t("daily.collect"), onOk: () => { A.sfx("coin"); refreshTop(); } });
}

export function levelModal(lvl) {
  A.sfx("levelup");
  const bonus = 50 + lvl * 10; addCoins(bonus); save(); refreshTop();
  const next = CHARS.find(c => !owns("chars", c.id));
  modal({ title: t("level.title", { n: lvl }), icon: "i-star", body: `<p>${t("level.bonus", { coins: bonus })}</p>` + (next ? `<p style="font-size:15px;opacity:.75">${t("level.nextHead", { name: next.name, price: next.price })}</p>` : "") });
}

export function unlockModal(c) {
  const rar = rarityOf(c);
  modal({ title: t("unlock.title"), body: `<div class="briefav"></div><p><b>${c.name}</b> · ${RARITY[rar]}</p><p style="font-size:15px">${t("unlock.super", { name: SUPERS[c.super].name })}</p>`, btn: t("unlock.ok"), ribbon: "" });
  const box = document.querySelector(".briefav"); if (box) box.append(avatarCanvas(c.id, 130, { mood: "happy" }));
}

export function trophyModal() { A.sfx("levelup"); modal({ title: t("trophy.title"), icon: "i-trophy", body: `<p>${t("trophy.text")}</p>`, btn: t("trophy.ok") }); }
