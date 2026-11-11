// Dialoge: Tagesbonus, Level, neuer Kopf, Pokal
import { RARITY, rarityOf, SUPERS } from "../content/config.js";
import { addCoins, S, save } from "../app/profile.js";
import { LEVEL_SURE_HEAD, levelChest, levelCoins } from "../content/cosmetics.js";
import { chestEl, openChestOverlay } from "./screens/chests.js";
import { avatarCanvas } from "./render/art.js";
import { esc, modal, toast } from "./dom.js";
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
    btn: t("level.openChest"), cancel: t("level.later"), onOk: () => openLevelChest(lvl),
    onShow: c => { const box = c.querySelector(".lvchest"); if (box) box.append(chestEl(tier, 110)); } });
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
  modal({ title: t("unlock.title"), body: `<div class="briefav"></div><p><b>${c.name}</b> · ${RARITY[rar]}</p><p style="font-size:15px">${t("unlock.super", { name: SUPERS[c.super].name })}</p>`, btn: t("unlock.ok"), ribbon: "",
    onShow: m => { const box = m.querySelector(".briefav"); if (box) box.append(avatarCanvas(c.id, 130, { mood: "happy" })); } });
}

// Link aus der Mail in einem Browser geöffnet, der keine Mail angefordert hat (meist: angefordert in der installierten
// App, der Link öffnet aber Safari/Chrome). Bleibt stehen, bis man ihn schließt; wer die App hat, gibt dort den Code ein.
export function foreignLinkModal() {
  modal({ title: t("acc.foreign.title"), icon: "i-user", body: `<p>${t("acc.foreign.text")}</p><p><b>${t("acc.foreign.app")}</b></p><p class="hint">${t("acc.foreign.here")}</p>`, btn: t("acc.foreign.ok"), ribbon: "blue", cls: "foreignlink", sticky: true });
}

/** Link aus der Mail hat nicht geklappt (abgelaufen, schon benutzt, sonstiger Fehler): bleibt bis zum Schließen */
export function linkErrorModal(text) {
  modal({ title: t("acc.linkTitle"), icon: "i-user", body: `<p>${esc(text)}</p>`, btn: t("acc.foreign.ok"), ribbon: "blue", cls: "linkerror", sticky: true });
}

/** Captcha (Cloudflare) lädt nicht, meist wegen eines Werbeblockers: ohne geht kein Server-Konto, das Spiel läuft lokal */
export function captchaBlockedModal() {
  modal({ title: t("acc.captchaBlocked.title"), icon: "i-user", body: `<p>${t("acc.captchaBlocked.text")}</p>`, btn: t("acc.foreign.ok"), ribbon: "blue", cls: "captchablocked", sticky: true });
}

export function trophyModal() { A.sfx("levelup"); modal({ title: t("trophy.title"), icon: "i-trophy", body: `<p>${t("trophy.text")}</p>`, btn: t("trophy.ok") }); }
