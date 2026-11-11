// Ausrüstung: was der Spieler trägt (Schuhe, Torexplosion, Titel, Rahmen, 4 Emote-Plätze). Nur Aussehen, kein Einfluss aufs Spiel.
import { EMOTES } from "../content/config.js";
import { cosById } from "../content/cosmetics.js";
import { S, save } from "./profile.js";

const owns = id => !!id && S.cos.includes(id);

/** Was zum Anpfiff mitgeschickt wird (nur Besessenes) */
export function myCos() {
  const e = S.equip || {};
  const o = k => (owns(e[k]) ? e[k] : null);
  return { shoes: o("shoes"), goalfx: o("goalfx"), title: o("title"), frame: o("frame"), emotes: emoteSlots() };
}

/** Die 4 Emote-Plätze: Ausgerüstetes, leere Plätze mit den Standard-Emotes aufgefüllt */
export function emoteSlots() {
  const slots = (S.equip?.emotes || []).slice(0, 4);
  const free = EMOTES.filter(e => !slots.includes(e));
  return [0, 1, 2, 3].map(i => (owns(slots[i]) ? slots[i] : free.shift()));
}

/** Ausrüsten / ablegen. Emotes: in Platz slot */
export function equip(id, slot = 0) {
  const c = cosById(id); if (!c || !owns(id)) return false;
  if (c.kind === "emote" || c.kind === "emoji") {
    const em = [...(S.equip.emotes || [null, null, null, null])];
    const at = em.indexOf(id); if (at >= 0) em[at] = null;
    em[slot] = at === slot ? null : id;
    S.equip.emotes = em;
  } else S.equip[c.kind] = S.equip[c.kind] === id ? null : id;
  save();
  return true;
}
export const isEquipped = id => { const c = cosById(id); if (!c) return false; return c.kind === "emote" || c.kind === "emoji" ? (S.equip.emotes || []).includes(id) : S.equip[c.kind] === id; };

/** Gültiges Emote? Standard-Emote oder Emote/Emoji aus der Kosmetik */
export const validEmote = e => EMOTES.includes(e) || ["emote", "emoji"].includes(cosById(e)?.kind);

/** Kosmetik eines Gegners prüfen (nur bekannte IDs der passenden Art) */
export function cleanCos(o) {
  const ok = (id, k) => (id && cosById(id)?.kind === k ? id : null);
  if (!o || typeof o !== "object") return {};
  return { shoes: ok(o.shoes, "shoes"), goalfx: ok(o.goalfx, "goalfx"), title: ok(o.title, "title"), frame: ok(o.frame, "frame"), emotes: Array.isArray(o.emotes) ? o.emotes.filter(validEmote).slice(0, 4) : [] };
}
