// Kosmetik und Kisten (Konzept: docs/PROGRESSION.md).
// Schuhe sind echte Skins (SHOES, gezeichnet in js/ui/render/shoes.js), Emotes und Torexplosionen nach Meme-Trends
// (EMOTE_DEFS, GOALFX_DEFS). Rahmen und Meisterschafts-Inhalte sind noch PLATZHALTER; echte Inhalte ersetzen nur die
// Listen (gleiche Felder). Kisten-Tabellen gelten auch auf dem Server (supabase/catalog.sql).
import { t } from "./i18n.js";
import { CHARS, SUPERS } from "./config.js";

/** Arten in Reihenfolge der Sammlung (aus Kisten); OWN_KINDS: alles, was man besitzen kann (dazu Titel, Rahmen) */
export const COS_KINDS = ["shoes", "goalfx", "emote", "emoji"];
export const OWN_KINDS = [...COS_KINDS, "title", "frame"];

// Platzhalter-Farben und -Zeichen
const PAL = ["#ff5a4f", "#ffd84a", "#4fd1ff", "#7fd17f", "#c8a2ff", "#ff9bd2", "#ff9f40", "#ffffff", "#3b3b58", "#2fd6b0", "#e8c170", "#9aa7ff"];
// Emoji (die freien 😂 🔥 😤 😎 🤡 GG hat jeder schon): 6 selten, 4 episch, 2 legendär
const EMOJI = ["😭", "💀", "👀", "🫠", "🤯", "🙃", "🧢", "💅", "🤫", "🫡", "🗿", "🐐"];
// Figur-Emotes nach internationalen Meme-Trends 2025/26 (Animation: render.js EMOTE_FX). fx = Animation, label = Text in der Sprechblase,
// ic = Symbol in der Sammlung. Reihenfolge: 4 selten, 3 episch, 1 legendär
export const EMOTE_DEFS = [
  { fx: "67", label: "6-7", ic: "6-7" },
  { fx: "crash", label: "CRASH OUT", ic: "💢" },
  { fx: "lockin", label: "LOCKED IN", ic: "🔒" },
  { fx: "peak", label: "PEAK", ic: "⛰️" },
  { fx: "bait", label: "RAGEBAIT", ic: "🎣" },
  { fx: "unbothered", label: "…", ic: "🕶️" },
  { fx: "mog", label: "MOG", ic: "📏" },
  { fx: "aura", label: "+1000 AURA", ic: "✨" },
];
// Torexplosionen nach internationalen Meme-Trends 2025/26 (Animation: render.js GFX). 3 selten, 3 episch, 2 legendär
export const GOALFX_DEFS = [
  { fx: "67", ic: "6-7" },
  { fx: "crash", ic: "💢" },
  { fx: "peak", ic: "⛰️" },
  { fx: "brainrot", ic: "🦈" },
  { fx: "dank", ic: "🕶️" },
  { fx: "ko", ic: "🥊" },
  { fx: "aura", ic: "✨" },
  { fx: "glitch", ic: "👾" },
];
/** Schriftzüge der Torexplosionen: Meme-Wörter, in allen Sprachen gleich */
export const GOALFX_TEXT = { crash: "CRASH OUT", peak: "PEAK", ko: "K.O.", aura: "AURA", dank: ["wow", "such goal", "very dank"], glitch: ["GOAOOL", "GOOAL", "G0AL", "GOAAAOL", "GAOL", "GOAOOL"] };
// Seltenheit je Art: so viele Selten / Episch / Legendär (Schuhe: aus SHOES)
const MIX = { goalfx: [3, 3, 2], emote: [4, 3, 1], emoji: [6, 4, 2] };
/** Schuh-Skins in fester Reihenfolge: id bleibt "shoes:<Platz>" (gleich auf dem Server). skin = Zeichnung, col = Kartenfarbe */
export const SHOES = [
  { skin: "klassiker", rarity: "selten", col: "#f4f5f7" },
  { skin: "stollen",   rarity: "selten", col: "#2b2f3d" },
  { skin: "chunky",    rarity: "selten", col: "#c7ccd6" },
  { skin: "canvas",    rarity: "selten", col: "#e63946" },
  { skin: "latschen",  rarity: "selten", col: "#3557c7" },
  { skin: "neon",      rarity: "episch", col: "#ff7a1a" },
  { skin: "clog",      rarity: "episch", col: "#6ccc45" },
  { skin: "blink",     rarity: "episch", col: "#2f6fe0" },
  { skin: "zehen",     rarity: "episch", col: "#3ddc84" },
  { skin: "gold",      rarity: "legend", col: "#ffd23f" },
];
// Preise im Shop (Münzen / Juwelen), Freischalt-Level im Shop
export const COS_PRICE = { selten: { coins: 150, gems: 60 }, episch: { coins: 400, gems: 150 }, legend: { coins: 900, gems: 350 } };

function makeShoes() {
  return SHOES.map((sh, i) => {
    const o = { id: `shoes:${i + 1}`, kind: "shoes", n: i + 1, rarity: sh.rarity, col: sh.col, v: i, skin: sh.skin };
    Object.defineProperty(o, "name", { get: () => t("shoe." + sh.skin), enumerable: true });
    return o;
  });
}

function make(kind) {
  if (kind === "shoes") return makeShoes();
  const [s, e, l] = MIX[kind], rar = [...Array(s).fill("selten"), ...Array(e).fill("episch"), ...Array(l).fill("legend")];
  return rar.map((rarity, i) => {
    const o = { id: `${kind}:${i + 1}`, kind, n: i + 1, rarity, col: PAL[i % PAL.length], v: i };
    if (kind === "emoji") o.glyph = EMOJI[i % EMOJI.length];
    if (kind === "emote") Object.assign(o, EMOTE_DEFS[i % EMOTE_DEFS.length]);
    if (kind === "goalfx") Object.assign(o, GOALFX_DEFS[i % GOALFX_DEFS.length]);
    const name = () => (kind === "emote" ? t("emote." + o.fx) : kind === "goalfx" ? t("goalfx." + o.fx) : kind === "emoji" ? t("cos.kind.emoji") + " " + o.glyph : t("cos.name", { kind: t("cos.kind." + kind), n: i + 1 }));
    Object.defineProperty(o, "name", { get: name, enumerable: true });
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
  if (kind === "emote") Object.assign(o, EMOTE_DEFS[hi % EMOTE_DEFS.length], { label: c.name.toUpperCase(), ic: "★" });
  if (kind === "goalfx") Object.assign(o, { fx: "mastery", ic: "★" }); // Szene pro Kopf: goalfx.js HEAD_FX
  // Meister-Rahmen: Ring in der Kopffarbe, Edelstein in der Farbe seines Supers (js/ui/render/frames.js)
  if (kind === "frame") Object.assign(o, { style: "mastery", badge: SUPERS[c.super].col });
  Object.defineProperty(o, "name", { get: () => (kind === "title" ? t(m.item === "title:fan" ? "mastery.titleFan" : "mastery.titleMaster", { name: c.name }) : t("mastery.item." + kind, { name: c.name })), enumerable: true });
  return o;
}));
export const masteryReward = (head, stage) => masteryId(MASTERY[stage - 1].item, head);

// ---------- Rahmen aus Erfolgen, Pass und Liga: nicht aus Kisten, nicht herstellbar ----------
// style = Zeichnung in js/ui/render/frames.js. src: ach = Siege-Erfolge (ACHIEVEMENTS.item), pass = Pass-Stufe
// (supabase/ops/new-season.sql), league = Ranked-Saisonende nach Liga (game.maintenance)
export const LEAGUE_IDS = ["bronze", "silver", "gold", "platinum", "diamond", "legend"];
const LEAGUE_COL = ["#c47a3f", "#c9d2e3", "#ffcb2b", "#9ef0ea", "#8cc2ff", "#b98cff"];
export const FRAMES = [
  { id: "frame:medal-bronze", style: "medal", metal: "bronze", rarity: "selten", src: "ach", col: "#c47a3f" },
  { id: "frame:medal-silver", style: "medal", metal: "silver", rarity: "episch", src: "ach", col: "#c9d2e3" },
  { id: "frame:medal-gold",   style: "medal", metal: "gold",   rarity: "legend", src: "ach", col: "#ffcb2b" },
  { id: "frame:pass-flood",   style: "flood", rarity: "episch", src: "pass", col: "#3a4470" },
  { id: "frame:pass-neon",    style: "neon",  rarity: "episch", src: "pass", col: "#ff4fd8" },
  { id: "frame:pass-turf",    style: "turf",  rarity: "episch", src: "pass", col: "#2fc463" },
  { id: "frame:pass-net",     style: "net",   rarity: "episch", src: "pass", col: "#e9eef8" },
  { id: "frame:pass-flame",   style: "flame", rarity: "legend", src: "pass", col: "#ff8a1c" },
  { id: "frame:pass-pixel",   style: "pixel", rarity: "legend", src: "pass", col: "#22d3ee" },
  ...LEAGUE_IDS.map((l, i) => ({ id: `frame:league-${l}`, style: "league", league: l, rarity: i < 3 ? "episch" : "legend", src: "league", col: LEAGUE_COL[i] })),
].map(f => {
  const o = { ...f, kind: "frame" };
  Object.defineProperty(o, "name", { get: () => t("frame." + f.id.slice(6)), enumerable: true });
  return o;
});
const ALL = [...COSMETICS, ...MASTERY_ITEMS, ...FRAMES];
export const cosById = id => ALL.find(c => c.id === id);

// ---------- Kisten ----------
// coins: [von, bis]; cos: Chance auf einen Kosmetik-Gegenstand und Verteilung der Seltenheit;
// head: Chance je Seltenheit auf einen Kopf (doppelter Kopf = Kopf-XP); sure: sicher ein Kopf
export const CHESTS = {
  bronze: { coins: [20, 40], gems: 0, cos: { p: 0.21, rar: { selten: 1 } }, head: { selten: 0.05, episch: 0.01, legend: 0.002 }, c1: "#e0a36a", c2: "#9a5b2c" },
  silver: { coins: [50, 80], gems: 0, cos: { p: 0.42, rar: { selten: 0.7, episch: 0.3 } }, head: { selten: 0.12, episch: 0.05, legend: 0.01 }, c1: "#e4ecf5", c2: "#8a99ad" },
  gold: { coins: [125, 125], gems: 0, cos: { p: 0.6, rar: { episch: 0.8, legend: 0.2 } }, head: { selten: 0.25, episch: 0.18, legend: 0.06 }, c1: "#ffe27a", c2: "#d89400" },
  legend: { coins: [0, 0], gems: 30, cos: { p: 0.6, rar: { legend: 1 } }, head: { episch: 0.5, legend: 0.5 }, sure: true, c1: "#d6b4ff", c2: "#7a3fe0" },
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
export const levelCoins = lvl => 25 + Math.min(lvl, 50) * 5;
export const LEVEL_GEMS = 20;
