// Kosmetik und Kisten (Konzept: docs/PROGRESSION.md).
// Die Kosmetik ist vorerst PLATZHALTER: nummerierte Varianten mit einfachen Formen und Farben. Die echten Inhalte
// ersetzen später nur diese Liste (gleiche Felder). Kisten-Tabellen gelten auch auf dem Server (supabase/catalog.sql).
import { t } from "./i18n.js";
import { CHARS } from "./config.js";

/** Arten in Reihenfolge der Sammlung (aus Kisten); OWN_KINDS: alles, was man besitzen kann (dazu Titel, Rahmen) */
export const COS_KINDS = ["shoes", "goalfx", "emote", "emoji"];
export const OWN_KINDS = [...COS_KINDS, "title", "frame"];

// Platzhalter-Farben und -Zeichen
const PAL = ["#ff5a4f", "#ffd84a", "#4fd1ff", "#7fd17f", "#c8a2ff", "#ff9bd2", "#ff9f40", "#ffffff", "#3b3b58", "#2fd6b0", "#e8c170", "#9aa7ff"];
const EMOJI = ["😂", "🔥", "😤", "😎", "🤡", "👏", "😱", "💪", "🙈", "👑", "⚽", "💤"];
// Seltenheit je Art: so viele Selten / Episch / Legendär
const MIX = { shoes: [5, 4, 3], goalfx: [3, 3, 2], emote: [4, 3, 1], emoji: [6, 4, 2] };
// Preise im Shop (Münzen / Juwelen), Freischalt-Level im Shop
export const COS_PRICE = { selten: { coins: 150, gems: 60 }, episch: { coins: 400, gems: 150 }, legend: { coins: 900, gems: 350 } };

function make(kind) {
  const [s, e, l] = MIX[kind], rar = [...Array(s).fill("selten"), ...Array(e).fill("episch"), ...Array(l).fill("legend")];
  return rar.map((rarity, i) => {
    const o = { id: `${kind}:${i + 1}`, kind, n: i + 1, rarity, col: PAL[i % PAL.length], v: i };
    if (kind === "emoji") o.glyph = EMOJI[i % EMOJI.length];
    Object.defineProperty(o, "name", { get: () => t("cos.name", { kind: t("cos.kind." + kind), n: i + 1 }), enumerable: true });
    return o;
  });
}

/** Alle Kosmetik-Gegenstände aus Kisten und Herstellen. id = "art:nummer" (gleich auf dem Server) */
export const COSMETICS = COS_KINDS.flatMap(make);

// ---------- Meisterschaft pro Kopf: 5 Stufen, Belohnungen nur hier (nicht aus Kisten, nicht herstellbar) ----------
// need: Spiele / Siege / Tore / Super-Tore / Siege mit diesem Kopf. Belohnung: Gegenstand und/oder Kiste.
export const MASTERY = [
  { stat: "games", n: 5, item: "title:fan" },
  { stat: "wins", n: 10, item: "frame" },
  { stat: "goals", n: 30, item: "emote", chest: "silver" },
  { stat: "supers", n: 10, item: "goalfx" },
  { stat: "wins", n: 50, item: "title:master", chest: "gold" },
];
const masteryId = (kind, head) => (kind === "title:fan" ? `title:fan-${head}` : kind === "title:master" ? `title:master-${head}` : `${kind}:m-${head}`);
/** Belohnungen der Meisterschaft (PLATZHALTER-Grafik in der Farbe des Kopfes) */
export const MASTERY_ITEMS = CHARS.flatMap((c, hi) => MASTERY.map((m, si) => {
  const id = masteryId(m.item, c.id), kind = id.split(":")[0];
  const o = { id, kind, head: c.id, stage: si + 1, rarity: "legend", col: c.acc, v: hi, n: "M", mastery: true };
  Object.defineProperty(o, "name", { get: () => (kind === "title" ? t(m.item === "title:fan" ? "mastery.titleFan" : "mastery.titleMaster", { name: c.name }) : t("mastery.item." + kind, { name: c.name })), enumerable: true });
  return o;
}));
export const masteryReward = (head, stage) => masteryId(MASTERY[stage - 1].item, head);
const ALL = [...COSMETICS, ...MASTERY_ITEMS];
export const cosById = id => ALL.find(c => c.id === id);

// ---------- Kisten ----------
// coins: [von, bis]; cos: Chance auf einen Kosmetik-Gegenstand und Verteilung der Seltenheit;
// head: Chance je Seltenheit auf einen Kopf (doppelter Kopf = Kopf-XP); sure: sicher ein Kopf
export const CHESTS = {
  bronze: { coins: [40, 80], gems: 0, cos: { p: 0.35, rar: { selten: 1 } }, head: { selten: 0.05, episch: 0.01, legend: 0.002 }, c1: "#e0a36a", c2: "#9a5b2c" },
  silver: { coins: [100, 160], gems: 0, cos: { p: 0.7, rar: { selten: 0.7, episch: 0.3 } }, head: { selten: 0.12, episch: 0.05, legend: 0.01 }, c1: "#e4ecf5", c2: "#8a99ad" },
  gold: { coins: [250, 250], gems: 0, cos: { p: 1, rar: { episch: 0.8, legend: 0.2 } }, head: { selten: 0.25, episch: 0.18, legend: 0.06 }, c1: "#ffe27a", c2: "#d89400" },
  legend: { coins: [0, 0], gems: 30, cos: { p: 1, rar: { legend: 1 } }, head: { episch: 0.5, legend: 0.5 }, sure: true, c1: "#d6b4ff", c2: "#7a3fe0" },
};
export const CHEST_TIERS = ["bronze", "silver", "gold", "legend"];

/** Garantien: spätestens nach so vielen Kisten */
export const PITY = { epic: 10, legend: 40, head: 50, legendHead: 90 };
/** Doppelte Kosmetik -> Splitter; Herstellen kostet Splitter. Doppelter Kopf -> Kopf-XP (auf Level 10: Splitter) */
export const SHARDS = { dup: { selten: 10, episch: 30, legend: 80 }, craft: { selten: 50, episch: 150, legend: 400 } };
export const HEAD_DUP_XP = { selten: 40, episch: 100, legend: 250 };

/** Kiste für ein Level-Up; Level 2 und 5 bringen sicher einen Kopf dieser Seltenheit */
export const levelChest = lvl => (lvl % 25 === 0 ? "legend" : lvl % 10 === 0 ? "gold" : lvl % 5 === 0 ? "silver" : "bronze");
export const LEVEL_SURE_HEAD = { 2: "selten", 5: "episch" };
/** XP für das nächste Level: wächst bis Level 50, danach gleich */
export const xpForLevel = lvl => 120 + (Math.min(lvl, 50) - 1) * 60;
/** Münzen fürs Level-Up (ab Level 50 fest), alle 5 Level Juwelen */
export const levelCoins = lvl => 50 + Math.min(lvl, 50) * 10;
export const LEVEL_GEMS = 20;
