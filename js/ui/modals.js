// Dialoge: Tagesbonus, Level, neuer Kopf, Pokal
import { CHARS, RARITY, rarityOf, SUPERS } from "../content/config.js";
import { addCoins, owns, save } from "../app/profile.js";
import { avatarCanvas } from "./render/art.js";
import { modal } from "./dom.js";
import { refreshTop } from "./screens/home.js";
import { audio as A } from "../app/services.js";

export function dailyModal(d) {
  const days = Array.from({ length: 7 }, (_, n) => `<i class="${n < d.streak ? "on" : ""}">${n + 1}</i>`).join("");
  modal({ title: "Tagesbonus", icon: "i-gift", body: `<p>Tag ${d.streak} in Folge: <b>+${d.amount} Münzen</b></p><div class="streak">${days}</div><p style="font-size:14px;opacity:.7">Morgen gibt's mehr.</p>`, btn: "Einsammeln", onOk: () => { A.sfx("coin"); refreshTop(); } });
}

export function levelModal(lvl) {
  A.sfx("levelup");
  const bonus = 50 + lvl * 10; addCoins(bonus); save(); refreshTop();
  const next = CHARS.find(c => !owns("chars", c.id));
  modal({ title: "Level " + lvl, icon: "i-star", body: `<p>Bonus: <b>+${bonus} Münzen</b></p>` + (next ? `<p style="font-size:15px;opacity:.75">Nächster Kopf im Shop: ${next.name} (${next.price})</p>` : "") });
}

export function unlockModal(c) {
  const rar = rarityOf(c);
  modal({ title: "Neuer Kopf!", body: `<div class="briefav"></div><p><b>${c.name}</b> · ${RARITY[rar]}</p><p style="font-size:15px">Super: ${SUPERS[c.super].name}</p>`, btn: "Nice", ribbon: "" });
  const box = document.querySelector(".briefav"); if (box) box.append(avatarCanvas(c.id, 130, { mood: "happy" }));
}

export function trophyModal() { A.sfx("levelup"); modal({ title: "Pokalsieger!", icon: "i-trophy", body: "<p>Drei Gegner, drei Siege. Der Pokal gehört dir.</p>", btn: "Feiern" }); }
