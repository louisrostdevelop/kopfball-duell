// Spielwelt, Charaktere, Arenen, Bälle, Power-ups, Erfolge
// Feldbreite ist pro Spiel einstellbar (Regel "Feldgröße"). W ist eine Live-Bindung, alle Module sehen den aktuellen Wert.
import { has, localize, localizeKeys, money, t } from "./i18n.js";
export const W0 = 1520;
export let W = W0;
export function setFieldW(w) { W = Math.round(w); }
export const H = 720, G = 640;
export const GOAL_W = 112, GOAL_H = 205, BAR_Y = G - GOAL_H, BAR_T = 12;
export const HR = 54, BR = 24, SR = 16, FOOT = 55;
export const KS = HR / 46; // Skalierung der Schuss-Geometrie
export const REST = G - FOOT - SR;
export const STEP = 1 / 120;

export const COL = {
  night: "#0d1b3e", ink: "#0a1230", chalk: "#f7f5ef", p1: "#ff6b1a", p2: "#22d3ee", gold: "#ffe14d", turf: "#1fa84f",
};

// Spezialschüsse
export const SUPERS = {
  fire:    { col: "#ff5a1f" },
  ice:     { col: "#7fe3ff" },
  thunder: { col: "#ffe14d" },
  rocket:  { col: "#ff3d6e" },
  banana:  { col: "#ffd43b" },
  ghost:   { col: "#c8b6ff" },
  giant:   { col: "#ff9f43" },
  tornado: { col: "#5effc8" },
  magnet:  { col: "#ff4fd8" },
  meteor:  { col: "#ff7a1a" },
  bouncy:  { col: "#ff8bd1" },
  clone:   { col: "#ffe14d" },
  // eigene Supers der Meme-Köpfe; Flugbahn baut auf dem Super in Klammern auf (supers.js)
  sad:       { col: "#7f9cff" }, // Eisschuss: Regenwolke, wer abwehrt, wird traurig und langsam
  flex:      { col: "#ffd23f" }, // Bananenflanke: Gold mit Bling, wer abwehrt, ist geblendet
  bassdrop:  { col: "#5effc8" }, // Donnerkeil: Stopp vor dem Drop, dann Zickzack, wer abwehrt, wird weggedrückt
  aimbot:    { col: "#ff3d6e" }, // Magnetschuss: zielt hart nach, wer abwehrt, hat Lag
  copypaste: { col: "#c9d2e3" }, // Dreifach: drei gleiche Bälle
  stone:     { col: "#a3a69c" }, // Meteor: schwerer Stein, rollt nach dem Einschlag weiter
  crypto:    { col: "#f7931a" }, // Rakete: steigt im Zickzack (Pump), stürzt ins Tor (Dump)
  ghosting:  { col: "#b8c0d8" }, // Geisterball: fast ganz unsichtbar, taucht erst vor dem Tor auf
  rizz:      { col: "#ff4f9a" }, // Magnetschuss: Schlangenlinie, der Gegner läuft verliebt hinterher
  brezel:    { col: "#ff7a1a" }, // Feuerball: fliegt einen Looping, brennt ins Tor
};

// hair: spikes | bob | mohawk | goggles | puffs | hood | beard | ponytail | slick | helmet | curly | crown
// Meme-Stile (eigene Gesichter, js/ui/render/meme-heads.js): emo | rapper | raver | gamer | npc | moai | crypto | sigma | chad | brezel
export const CHARS = [
  { id: "kalle",  name: "Kalle",  super: "fire",    price: 0, rarity: "basis",   skin: "#f2c79b", hair: "#2b1a12", acc: "#ff3b30", style: "spikes",   spd: 1.0,  jmp: 1.0,  pow: 1.05 },
  { id: "yuki",   name: "Yuki",   super: "ice",     price: 0, rarity: "basis",   skin: "#ffe0c4", hair: "#1d2b5a", acc: "#7fe3ff", style: "bob",      spd: 1.05, jmp: 1.0,  pow: 0.95 },
  { id: "bolt",   name: "Bolt",   super: "thunder", price: 0, rarity: "basis",   skin: "#d9a374", hair: "#ffd43b", acc: "#ffe14d", style: "mohawk",   spd: 1.12, jmp: 0.95, pow: 0.95 },
  { id: "rocco",  name: "Rocco",  super: "rocket",  price: 1600, rarity: "selten", skin: "#c98b5e", hair: "#3b2416", acc: "#ff3d6e", style: "goggles",  spd: 1.0,  jmp: 1.05, pow: 1.05 },
  { id: "nala",   name: "Nala",   super: "banana",  price: 1800, rarity: "selten", skin: "#8d5a3b", hair: "#1a0f0a", acc: "#3ddc84", style: "puffs",    spd: 1.08, jmp: 1.08, pow: 0.92 },
  { id: "flummi", name: "Flummi", super: "bouncy",  price: 2000, rarity: "selten", skin: "#ffd9c2", hair: "#ff6fb5", acc: "#ff8bd1", style: "ponytail", spd: 1.02, jmp: 1.15, pow: 0.9 },
  { id: "phantom",name: "Phantom",super: "ghost",   price: 2800, rarity: "episch", skin: "#dfe6f5", hair: "#5b4b8a", acc: "#c8b6ff", style: "hood",     spd: 1.06, jmp: 1.02, pow: 0.98 },
  { id: "tank",   name: "Tank",   super: "giant",   price: 3000, rarity: "episch", skin: "#e0a77a", hair: "#7a3e1d", acc: "#ff9f43", style: "beard",    spd: 0.88, jmp: 0.92, pow: 1.2 },
  { id: "tina",   name: "Tina",   super: "tornado", price: 3200, rarity: "episch", skin: "#f5c6a0", hair: "#14b8a6", acc: "#5effc8", style: "curly",    spd: 1.05, jmp: 1.06, pow: 0.98 },
  { id: "magnus", name: "Magnus", super: "magnet",  price: 3400, rarity: "episch", skin: "#eac09a", hair: "#9aa3b5", acc: "#ff4fd8", style: "slick",    spd: 0.98, jmp: 1.0,  pow: 1.08 },
  { id: "max",    name: "Max",    super: "meteor",  price: 5200, rarity: "legend", skin: "#b8794f", hair: "#222",    acc: "#ff7a1a", style: "helmet",   spd: 1.0,  jmp: 1.1,  pow: 1.05 },
  { id: "kaiser", name: "Kaiser", super: "clone",   price: 6000, rarity: "legend", skin: "#f0c090", hair: "#e8e3d6", acc: "#ffe14d", style: "crown",    spd: 1.06, jmp: 1.06, pow: 1.08 },
  // Meme- und Szene-Köpfe: Werte im Budget 3,0-3,2 und passend zum Gag (Gamer sitzt viel, NPC ist exakt Durchschnitt)
  { id: "emo",    name: "Emo",        super: "sad",       price: 1600,  rarity: "selten", skin: "#f3ddd2", hair: "#15141c", acc: "#ff2e88", style: "emo",    spd: 1.06, jmp: 1.02, pow: 0.96 },
  { id: "rapper", name: "Rapper",     super: "flex",      price: 1700,  rarity: "selten", skin: "#8a5634", hair: "#1d1f2b", acc: "#ffcf3a", style: "rapper", spd: 1.04, jmp: 1.04, pow: 1.0 },
  { id: "raver",  name: "Raver",      super: "bassdrop",  price: 1800,  rarity: "selten", skin: "#f1c6a8", hair: "#ff4fd8", acc: "#5effc8", style: "raver",  spd: 1.1,  jmp: 1.08, pow: 0.9 },
  { id: "gamer",  name: "Gamer",      super: "aimbot",    price: 1900,  rarity: "selten", skin: "#f0c9a6", hair: "#5a3a22", acc: "#22d3ee", style: "gamer",  spd: 0.94, jmp: 0.98, pow: 1.1 },
  { id: "npc",    name: "NPC",        super: "copypaste", price: 2800,  rarity: "episch", skin: "#b4b9c1", hair: "#8a9099", acc: "#7c8591", style: "npc",    spd: 1.03, jmp: 1.03, pow: 1.03 },
  { id: "moai",   name: "Steinkopf",  super: "stone",     price: 3000,  rarity: "episch", skin: "#8c8f87", hair: "#6e716a", acc: "#b4553d", style: "moai",   spd: 0.9,  jmp: 0.92, pow: 1.2 },
  { id: "crypto", name: "Krypto-Bro", super: "crypto",    price: 3200,  rarity: "episch", skin: "#f1c8a0", hair: "#e9c46a", acc: "#f7931a", style: "crypto", spd: 1.02, jmp: 1.1,  pow: 1.0 },
  { id: "sigma",  name: "Sigma",      super: "ghosting",  price: 3400,  rarity: "episch", skin: "#e7bf98", hair: "#16161a", acc: "#1f2430", style: "sigma",  spd: 1.06, jmp: 1.02, pow: 1.04 },
  { id: "chad",   name: "Kinn-Chad",  super: "rizz",      price: 5200, rarity: "legend", skin: "#e9b98b", hair: "#3a2a1c", acc: "#2f80ed", style: "chad",   spd: 1.0,  jmp: 1.02, pow: 1.15 },
  { id: "brezel", name: "Brezelini Kickerini", super: "brezel", price: 6000, rarity: "legend", skin: "#c87a35", hair: "#8a4515", acc: "#e63946", style: "brezel", spd: 1.04, jmp: 1.04, pow: 1.12 },
];
export const charById = id => CHARS.find(c => c.id === id) || CHARS[0];

// Arenen: g = Schwerkraft-Faktor, bounce = Ballabprall am Boden, grip = Beschleunigung der Spieler, vDrag = Bremsen des Balls
// nach oben/unten (Wasser). Freischalten: level = kostenlos ab Spieler-Level; season = neue Arena, die in der n-ten Saison
// im Pass steckt und danach im Shop zu kaufen ist (price, Level-Sperre nach rarity). Ohne beides: von Anfang an da.
export const ARENAS = [
  { id: "stadion",   price: 0, g: 1,    bounce: 0.7,  grip: 1,    roll: 0.97,  spd: 1,    maxB: 1,    ballDrag: 0.12 },
  { id: "strand",    price: 0, g: 1,    bounce: 0.5,  grip: 0.9,  roll: 0.93,  spd: 0.96, maxB: 1,    ballDrag: 0.14 },
  { id: "neon",      price: 0, rarity: "selten", level: 5,  g: 1.05, bounce: 0.75, grip: 1.1, roll: 0.975, spd: 1.08, maxB: 1.12, ballDrag: 0.1 },
  { id: "eis",       price: 0, rarity: "selten", level: 10, g: 1,    bounce: 0.72, grip: 0.18, roll: 0.995, spd: 1.05, maxB: 1.05, ballDrag: 0.06 },
  { id: "mond",      price: 0, rarity: "episch", level: 15, g: 0.6,  bounce: 0.8,  grip: 0.8,  roll: 0.985, spd: 1,    maxB: 1,    ballDrag: 0.03 },
  { id: "vulkan",    price: 2500, rarity: "episch", season: 1, g: 1.05, bounce: 0.84, grip: 1,    roll: 0.97,  spd: 1,    maxB: 1.06, ballDrag: 0.12 },
  { id: "skate",     price: 2500, rarity: "episch", season: 2, g: 1,    bounce: 0.72, grip: 1.08, roll: 0.99,  spd: 1.05, maxB: 1.05, ballDrag: 0.07 },
  { id: "tiefsee",   price: 2500, rarity: "episch", season: 3, g: 0.72, bounce: 0.45, grip: 0.82, roll: 0.95,  spd: 0.9,  maxB: 0.92, ballDrag: 0.4, vDrag: 0.35 },
  { id: "backrooms", price: 2500, rarity: "episch", season: 4, g: 1,    bounce: 0.6,  grip: 0.96, roll: 0.93,  spd: 1,    maxB: 1,    ballDrag: 0.13 },
];
/** Arena ist frei: von Anfang an oder ab dem Spieler-Level */
export const arenaFree = (a, level) => !a.season && (!a.level || level >= a.level);
export const arenaById = id => ARENAS.find(a => a.id === id) || ARENAS[0];

// Bälle: reine Optik (js/ui/render/balls.js). Preis nach Seltenheit (BALL_PRICE), Level-Sperre wie alles im Shop
// (SHOP_LEVEL). Nur Shop und Saison-Pass, nicht aus Kisten (entschieden 06.11.2026, docs/BALANCE.md).
export const BALL_PRICE = { basis: 0, selten: 500, episch: 1200, legend: 2500 };
export const BALLS = [
  ["klassik", "basis"], ["retro", "selten"], ["beach", "selten"], ["neon", "selten"], ["pixel", "selten"],
  ["planet", "episch"], ["disco", "episch"], ["gold", "legend"],
  ["auge", "selten"], ["graffiti", "selten"], ["slime", "selten"], ["blase", "selten"],
  ["glitch", "episch"], ["vapor", "episch"], ["chrom", "episch"], ["candy", "episch"],
  ["galaxie", "legend"], ["iceout", "legend"], ["rgb", "legend"], ["orakel", "legend"],
].map(([id, rarity]) => ({ id, rarity, price: BALL_PRICE[rarity] }));

export const POWERUPS = {
  bighead: { icon: "big",    col: "#ff9f43", self: true },
  mini:    { icon: "mini",   col: "#c8b6ff", self: false },
  freeze:  { icon: "freeze", col: "#7fe3ff", self: false },
  speed:   { icon: "speed",  col: "#ffe14d", self: true },
  jump:    { icon: "jump",   col: "#3ddc84", self: true },
  fire:    { icon: "fire",   col: "#ff5a1f", self: true },
  wall:    { icon: "wall",   col: "#9aa3b5", self: true },
  biggoal: { icon: "goal",   col: "#ff4fd8", self: false },
  meter:   { icon: "meter",  col: "#ffe14d", self: true },
  confuse: { icon: "confuse", col: "#b28cff", self: false },
  dbljump: { icon: "dbljump", col: "#5effc8", self: true },
  wind:    { icon: "wind",   col: "#9fe8ff", self: true },
};
export const PU_KEYS = Object.keys(POWERUPS);

export const MODS = [
  { id: "bigball" },
  { id: "minihead" },
  { id: "turbo" },
  { id: "lowgrav" },
  { id: "pu2" },
  { id: "superfast" },
];

export const DIFFS = [
  { id: 0, react: 0.22, err: 60, spd: 0.82, jumpSkill: 0.35, kickSkill: 0.5, superUse: 0.3, coins: 1 },
  { id: 1, react: 0.14, err: 32, spd: 0.93, jumpSkill: 0.6,  kickSkill: 0.75, superUse: 0.6, coins: 1.3 },
  { id: 2, react: 0.08, err: 14, spd: 1.0,  jumpSkill: 0.85, kickSkill: 0.92, superUse: 0.85, coins: 1.7 },
  { id: 3, react: 0.04, err: 4,  spd: 1.06, jumpSkill: 1,    kickSkill: 1,    superUse: 1,    coins: 2.4 },
];

export const ACHIEVEMENTS = [
  { id: "firstwin",  reward: 50 },
  { id: "hattrick",  reward: 80 },
  { id: "cleansheet",reward: 80 },
  { id: "header10",  reward: 120, goal: 10, stat: "headGoals", series: "header", tier: 1, chest: "bronze" },
  { id: "supergoal", reward: 60 },
  { id: "lastsec",   reward: 100 },
  { id: "longshot",  reward: 80 },
  { id: "comeback",  reward: 150 },
  { id: "cup",       reward: 200 },
  { id: "legend",    reward: 250 },
  { id: "online",    reward: 100 },
  { id: "collector", reward: 150 },
  { id: "powerups",  reward: 100, goal: 25, stat: "pus", series: "pus", tier: 1, chest: "bronze" },
  { id: "goals50",   reward: 200, goal: 50, stat: "goals", series: "goals", tier: 1, chest: "bronze" },
  { id: "stomp",     reward: 80, goal: 10, stat: "stomps", series: "stomp", tier: 1, chest: "bronze" },
  { id: "wins25",    reward: 300, goal: 25, stat: "wins", series: "wins", tier: 1, chest: "bronze", item: "frame:medal-bronze" },
  // Stufen 2 und 3 (Kiste je Stufe, docs/PROGRESSION.md)
  { id: "header100", reward: 250, goal: 100, stat: "headGoals", series: "header", tier: 2, chest: "silver" },
  { id: "header500", reward: 500, goal: 500, stat: "headGoals", series: "header", tier: 3, chest: "gold" },
  { id: "pus150",    reward: 200, goal: 150, stat: "pus", series: "pus", tier: 2, chest: "silver" },
  { id: "pus500",    reward: 400, goal: 500, stat: "pus", series: "pus", tier: 3, chest: "gold" },
  { id: "goals500",  reward: 400, goal: 500, stat: "goals", series: "goals", tier: 2, chest: "silver" },
  { id: "goals2000", reward: 800, goal: 2000, stat: "goals", series: "goals", tier: 3, chest: "gold" },
  { id: "stomp50",   reward: 200, goal: 50, stat: "stomps", series: "stomp", tier: 2, chest: "silver" },
  { id: "stomp200",  reward: 400, goal: 200, stat: "stomps", series: "stomp", tier: 3, chest: "gold" },
  { id: "wins250",   reward: 600, goal: 250, stat: "wins", series: "wins", tier: 2, chest: "silver", item: "frame:medal-silver" },
  { id: "wins1000",  reward: 1000, goal: 1000, stat: "wins", series: "wins", tier: 3, chest: "gold", item: "frame:medal-gold" },
];

export const EMOTES = ["😂", "🔥", "😤", "😎", "🤡", "GG"];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rand = (a, b) => a + Math.random() * (b - a);

// Seltenheit: Köpfe fest (rarity), Bälle und Arenen nach Preis
export const RARITY = localizeKeys({ basis: 0, selten: 0, episch: 0, legend: 0 }, "rarity");
export const rarityOf = c => c.rarity || (!c.price ? "basis" : c.price <= 300 ? "selten" : c.price <= 500 ? "episch" : "legend");
/** Shop: ab welchem Level eine Seltenheit kaufbar ist (Kisten sind nicht gesperrt) */
export const SHOP_LEVEL = { basis: 1, selten: 1, episch: 5, legend: 10 };
// Juwelen-Preis von Köpfen nach Seltenheit (Basis-Köpfe gibt es nur für Münzen). Gilt auch auf dem Server (catalog.sql).
// Kopf-Level 1 bis 10 (Server: head_max_level). Stufe 10 = +25 % Schusskraft, +25 % schnellere Super-Ladung, +5 % Tempo.
// Sprung bleibt gleich (höhere Sprünge verändern das Timing, das hilft kaum und fühlt sich fremd an).
// Messung: tools/balance/levels.mjs
export const HEAD_MAX_LEVEL = 10;
export const headBonus = lvl => Math.max(0, Math.min(1, ((lvl || 1) - 1) / (HEAD_MAX_LEVEL - 1))) * 0.25;
export function leveledStats(c, lvl) {
  const b = headBonus(lvl);
  return b ? { ...c, pow: c.pow * (1 + b), spd: c.spd * (1 + b * 0.2) } : c;
}
export const GEM_PRICE = { basis: null, selten: 450, episch: 700, legend: 900 };
export const gemPrice = c => GEM_PRICE[rarityOf(c)];
// Echtgeld-Käufe (Juwelen-Pakete, Starter-Paket, Premium-Pass für Euro). Aus: kein Juwelen-Tab, keine Euro-Preise,
// der Server-Katalog (tools/gen-catalog.mjs) stellt alle Produkte auf inaktiv, dann lehnt auch create-checkout ab.
// Juwelen gibt es weiter im Spiel (Pass, Erfolge, Kisten), der Premium-Pass bleibt für Juwelen kaufbar.
// Zum Start aus (entschieden 06.11.2026), später einschalten: hier true, Katalog neu erzeugen und einspielen.
export const PAYMENTS = false;
// Euro-Wert von Juwelen, bei Echtgeld immer neben Juwelen-Preisen angezeigt (Basis: kleinstes Paket, 100 Juwelen = 0,99 €)
export const gemsInEuro = n => money(Math.round(n * 0.99));

// Spielmodi (Reihenfolge = Reihenfolge der Karten)
export const MODES = [
  { id: "quick",   icon: "i-play",   c1: "#6b9bff", c2: "#2348d6" },
  { id: "cup",     icon: "i-trophy", c1: "#ffd84a", c2: "#e88a00" },
  { id: "career",  icon: "i-star",   c1: "#7fd17f", c2: "#2f8f3a", isNew: true },
  // nur mit Server (Gegnersuche): zufälliger Gegner ohne Wertung / mit Liga und Wertung
  { id: "casual",  icon: "i-globe", c1: "#5fd0ff", c2: "#1773d6", server: true, isNew: true },
  { id: "ranked",  icon: "i-crown", c1: "#ffd84a", c2: "#d97706", server: true, isNew: true },
  { id: "online",  icon: "i-globe",  c1: "#b28cff", c2: "#5f33dc" },
  { id: "local",   icon: "i-users",  c1: "#ffa06b", c2: "#e04d00" },
  { id: "daily",   icon: "i-cal", c1: "#ff7f8f", c2: "#d61f5a", isNew: true },
  { id: "endless", icon: "i-inf",    c1: "#6ff094", c2: "#179b45", isNew: true },
  { id: "train",   icon: "i-target", c1: "#5fe3e8", c2: "#0b8fa6" },
];

// Eigene Regeln: wenige Einstellungen mit klaren Stufen. "more" = unter „Mehr“ eingeklappt
export const RULE_OPTS = [
  { k: "kick",   opts: [[0.8], [1], [1.2], [1.45]] },
  { k: "bounce", opts: [[0.7], [1], [1.2], [1.4]] },
  { k: "ball",   opts: [[0.75], [1], [1.35], [1.8]] },
  { k: "goal",   opts: [[0.8], [1], [1.25], [1.5]] },
  { k: "speed",  opts: [[0.85], [1], [1.25]] },
  { k: "len",    opts: [[60], [90], [120], ["w3"], ["w5"]] },
  { k: "field",  opts: [[0.82], [1], [1.18]], more: true },
  { k: "grav",   opts: [[0.55], [1], [1.35]], more: true },
  { k: "floor",  opts: [["normal"], ["ice"]], more: true },
  { k: "pu",     opts: [["off"], ["normal"], ["many"]], more: true },
  { k: "supers", opts: [[true], [false]], more: true },
];
export const RULE_KEYS = RULE_OPTS.map(o => o.k);
// Schnellwahl (max. 3). Die Spiellänge bleibt beim Anwenden, wie sie ist.
export const RULE_PRESETS = [
  { id: "chaos", c1: "#ff8cc2", c2: "#d9267a", rules: { kick: 1.2, bounce: 1.2, ball: 1.35, pu: "many" } },
  { id: "moon",  c1: "#9aa0c0", c2: "#4b4f78", rules: { grav: 0.55, bounce: 1.2 } },
  { id: "ice",   c1: "#7eeaff", c2: "#0a95c4", rules: { floor: "ice", speed: 1.25 } },
];
// Feste Regelsätze für die Tages-Challenge (dürfen mehr als der Editor)
export const CHALLENGE_SETS = [
  { id: "chaos",  rules: { kick: 1.2, bounce: 1.2, ball: 1.35, pu: "many" } },
  { id: "moon",   rules: { grav: 0.55, bounce: 1.2 } },
  { id: "ice",    rules: { floor: "ice", speed: 1.25 } },
  { id: "giants", rules: { head: 1.3, goal: 1.25 } },
  { id: "mini",   rules: { goal: 0.8, ball: 0.75 } },
  { id: "heavy",  rules: { weight: "heavy", goal: 1.25, ball: 1.35 } },
  { id: "brutal", rules: { kick: 1.45, bounce: 1.2 } },
  { id: "pure",   rules: { pu: "off", supers: false } },
];

// ---------- Texte: kommen aus js/content/i18n/<sprache>.js (Schlüssel = Präfix.id.Feld) ----------
localize(Object.entries(SUPERS).map(([id, o]) => Object.assign(o, { id })), "super", ["name", "desc"]);
localize(ARENAS, "arena", ["name", "desc"]);
localize(BALLS, "ball", ["name"]);
localize(Object.entries(POWERUPS).map(([id, o]) => Object.assign(o, { id })), "pu", ["name"]);
localize(MODS, "mod", ["name"]);
localize(DIFFS, "diff", ["name"]);
localize(ACHIEVEMENTS, "ach", ["name", "desc"]);
localize(MODES, "mode", ["name", "desc"]);
for (const m of MODES) Object.defineProperty(m, "tags", { enumerable: true, get: () => { const out = []; for (let i = 0; has(`mode.${m.id}.tags.${i}`); i++) out.push(t(`mode.${m.id}.tags.${i}`)); return out; } });
localize(RULE_OPTS, "rule", ["name"], "k");
for (const r of RULE_OPTS) r.opts.forEach((o, i) => Object.defineProperty(o, 1, { enumerable: true, get: () => t(`rule.${r.k}.opt.${i}`) }));
localize(RULE_PRESETS, "preset", ["name", "desc"]);
localize(CHALLENGE_SETS, "chset", ["name"]);
