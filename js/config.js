// Spielwelt, Charaktere, Arenen, Bälle, Power-ups, Erfolge
export const W = 1520, H = 720, G = 640;
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
  fire:    { name: "Feuerball",     desc: "Brennt durch alles. Wer im Weg steht, fliegt um.", col: "#ff5a1f" },
  ice:     { name: "Eisschuss",     desc: "Friert den Gegner bei Berührung ein.", col: "#7fe3ff" },
  thunder: { name: "Donnerkeil",    desc: "Zuckt im Zickzack aufs Tor.", col: "#ffe14d" },
  rocket:  { name: "Rakete",        desc: "Kurz schweben, dann schnurgerade ins Eck.", col: "#ff3d6e" },
  banana:  { name: "Bananenflanke", desc: "Krasser Effet, dreht sich ins Tor.", col: "#ffd43b" },
  ghost:   { name: "Geisterball",   desc: "Wird mitten im Flug unsichtbar.", col: "#c8b6ff" },
  giant:   { name: "Riesenball",    desc: "Der Ball wird riesig und rollt alles platt.", col: "#ff9f43" },
  tornado: { name: "Tornado",       desc: "Wirbelt hoch und stürzt sich aufs Tor.", col: "#5effc8" },
  magnet:  { name: "Magnetschuss",  desc: "Der Ball zieht es magisch ins Netz.", col: "#ff4fd8" },
  meteor:  { name: "Meteor",        desc: "Ab ins All, dann Einschlag vor dem Tor.", col: "#ff7a1a" },
  bouncy:  { name: "Flummi",        desc: "Springt wie verrückt und wird immer schneller.", col: "#ff8bd1" },
  clone:   { name: "Dreifach",      desc: "Drei Bälle fliegen. Nur einer ist echt.", col: "#ffe14d" },
};

// hair: spikes | bob | mohawk | goggles | puffs | hood | beard | ponytail | slick | helmet | curly | crown
export const CHARS = [
  { id: "kalle",  name: "Kalle",  super: "fire",    price: 0,   skin: "#f2c79b", hair: "#2b1a12", acc: "#ff3b30", style: "spikes",   spd: 1.0,  jmp: 1.0,  pow: 1.05 },
  { id: "yuki",   name: "Yuki",   super: "ice",     price: 0,   skin: "#ffe0c4", hair: "#1d2b5a", acc: "#7fe3ff", style: "bob",      spd: 1.05, jmp: 1.0,  pow: 0.95 },
  { id: "bolt",   name: "Bolt",   super: "thunder", price: 0,   skin: "#d9a374", hair: "#ffd43b", acc: "#ffe14d", style: "mohawk",   spd: 1.12, jmp: 0.95, pow: 0.95 },
  { id: "rocco",  name: "Rocco",  super: "rocket",  price: 200, skin: "#c98b5e", hair: "#3b2416", acc: "#ff3d6e", style: "goggles",  spd: 1.0,  jmp: 1.05, pow: 1.05 },
  { id: "nala",   name: "Nala",   super: "banana",  price: 250, skin: "#8d5a3b", hair: "#1a0f0a", acc: "#3ddc84", style: "puffs",    spd: 1.08, jmp: 1.08, pow: 0.92 },
  { id: "flummi", name: "Flummi", super: "bouncy",  price: 300, skin: "#ffd9c2", hair: "#ff6fb5", acc: "#ff8bd1", style: "ponytail", spd: 1.02, jmp: 1.15, pow: 0.9 },
  { id: "phantom",name: "Phantom",super: "ghost",   price: 350, skin: "#dfe6f5", hair: "#5b4b8a", acc: "#c8b6ff", style: "hood",     spd: 1.06, jmp: 1.02, pow: 0.98 },
  { id: "tank",   name: "Tank",   super: "giant",   price: 400, skin: "#e0a77a", hair: "#7a3e1d", acc: "#ff9f43", style: "beard",    spd: 0.88, jmp: 0.92, pow: 1.2 },
  { id: "tina",   name: "Tina",   super: "tornado", price: 450, skin: "#f5c6a0", hair: "#14b8a6", acc: "#5effc8", style: "curly",    spd: 1.05, jmp: 1.06, pow: 0.98 },
  { id: "magnus", name: "Magnus", super: "magnet",  price: 500, skin: "#eac09a", hair: "#9aa3b5", acc: "#ff4fd8", style: "slick",    spd: 0.98, jmp: 1.0,  pow: 1.08 },
  { id: "max",    name: "Max",    super: "meteor",  price: 600, skin: "#b8794f", hair: "#222",    acc: "#ff7a1a", style: "helmet",   spd: 1.0,  jmp: 1.1,  pow: 1.05 },
  { id: "kaiser", name: "Kaiser", super: "clone",   price: 900, skin: "#f0c090", hair: "#e8e3d6", acc: "#ffe14d", style: "crown",    spd: 1.06, jmp: 1.06, pow: 1.08 },
];
export const charById = id => CHARS.find(c => c.id === id) || CHARS[0];

// Arenen: g = Schwerkraft-Faktor, bounce = Ballabprall am Boden, grip = Beschleunigung der Spieler
export const ARENAS = [
  { id: "stadion", name: "Flutlicht",  desc: "Der Klassiker unter Flutlicht.",        price: 0,   g: 1,    bounce: 0.7,  grip: 1,    roll: 0.97,  spd: 1,    maxB: 1,    ballDrag: 0.12 },
  { id: "strand",  name: "Strand",     desc: "Sonnenuntergang. Sand bremst den Ball.", price: 0,   g: 1,    bounce: 0.5,  grip: 0.9,  roll: 0.93,  spd: 0.96, maxB: 1,    ballDrag: 0.14 },
  { id: "neon",    name: "Neon City",  desc: "Dachterrasse über der Stadt. Alles schneller.", price: 300, g: 1.05, bounce: 0.75, grip: 1.1, roll: 0.975, spd: 1.08, maxB: 1.12, ballDrag: 0.1 },
  { id: "eis",     name: "Eishalle",   desc: "Spiegelglatt. Bremsen ist Glückssache.", price: 400, g: 1,    bounce: 0.72, grip: 0.18, roll: 0.995, spd: 1.05, maxB: 1.05, ballDrag: 0.06 },
  { id: "mond",    name: "Mond",       desc: "Wenig Schwerkraft, riesige Sprünge.",    price: 600, g: 0.5,  bounce: 0.8,  grip: 0.8,  roll: 0.985, spd: 1,    maxB: 1,    ballDrag: 0.03 },
];
export const arenaById = id => ARENAS.find(a => a.id === id) || ARENAS[0];

export const BALLS = [
  { id: "klassik", name: "Klassik",    price: 0 },
  { id: "retro",   name: "Leder",      price: 100 },
  { id: "beach",   name: "Wasserball", price: 150 },
  { id: "neon",    name: "Neon",       price: 200 },
  { id: "pixel",   name: "Pixel",      price: 200 },
  { id: "planet",  name: "Planet",     price: 300 },
  { id: "disco",   name: "Disco",      price: 350 },
  { id: "gold",    name: "Gold",       price: 600 },
];

export const POWERUPS = {
  bighead: { name: "Riesenkopf",  icon: "big",    col: "#ff9f43", self: true },
  mini:    { name: "Mini-Gegner", icon: "mini",   col: "#c8b6ff", self: false },
  freeze:  { name: "Einfrieren",  icon: "freeze", col: "#7fe3ff", self: false },
  speed:   { name: "Turbo",       icon: "speed",  col: "#ffe14d", self: true },
  jump:    { name: "Sprungfeder", icon: "jump",   col: "#3ddc84", self: true },
  fire:    { name: "Feuerschuss", icon: "fire",   col: "#ff5a1f", self: true },
  wall:    { name: "Torwand",     icon: "wall",   col: "#9aa3b5", self: true },
  biggoal: { name: "Riesentor",   icon: "goal",   col: "#ff4fd8", self: false },
  meter:   { name: "Super voll",  icon: "meter",  col: "#ffe14d", self: true },
  confuse: { name: "Verwirrung",  icon: "confuse", col: "#b28cff", self: false },
  dbljump: { name: "Doppelsprung",icon: "dbljump", col: "#5effc8", self: true },
  wind:    { name: "Rückenwind",  icon: "wind",   col: "#9fe8ff", self: true },
};
export const PU_KEYS = Object.keys(POWERUPS);

export const MODS = [
  { id: "bigball", name: "Riesenball" },
  { id: "minihead", name: "Mini-Köpfe" },
  { id: "turbo", name: "Turbo" },
  { id: "lowgrav", name: "Schwerelos" },
  { id: "pu2", name: "Power-up-Regen" },
  { id: "superfast", name: "Super lädt doppelt" },
];

export const DIFFS = [
  { id: 0, name: "Locker",  react: 0.22, err: 60, spd: 0.82, jumpSkill: 0.35, kickSkill: 0.5, superUse: 0.3, coins: 1 },
  { id: 1, name: "Normal",  react: 0.14, err: 32, spd: 0.93, jumpSkill: 0.6,  kickSkill: 0.75, superUse: 0.6, coins: 1.3 },
  { id: 2, name: "Schwer",  react: 0.08, err: 14, spd: 1.0,  jumpSkill: 0.85, kickSkill: 0.92, superUse: 0.85, coins: 1.7 },
  { id: 3, name: "Legende", react: 0.04, err: 4,  spd: 1.06, jumpSkill: 1,    kickSkill: 1,    superUse: 1,    coins: 2.4 },
];

export const ACHIEVEMENTS = [
  { id: "firstwin",  name: "Erster Sieg",        desc: "Gewinne ein Spiel.",                         reward: 50 },
  { id: "hattrick",  name: "Hattrick",           desc: "Schieß 3 Tore in einem Spiel.",              reward: 80 },
  { id: "cleansheet",name: "Zu null",            desc: "Gewinne ohne Gegentor.",                     reward: 80 },
  { id: "header10",  name: "Kopfballungeheuer",  desc: "Erziele insgesamt 10 Kopfballtore.",         reward: 120, goal: 10, stat: "headGoals" },
  { id: "supergoal", name: "Super!",             desc: "Triff mit einem Spezialschuss.",             reward: 60 },
  { id: "lastsec",   name: "Last Second",        desc: "Triff in den letzten 3 Sekunden.",           reward: 100 },
  { id: "longshot",  name: "Fernschuss",         desc: "Triff aus der eigenen Hälfte.",              reward: 80 },
  { id: "comeback",  name: "Comeback",           desc: "Gewinne nach 2 Toren Rückstand.",            reward: 150 },
  { id: "cup",       name: "Pokalheld",          desc: "Gewinne den Cup.",                           reward: 200 },
  { id: "legend",    name: "Legendenkiller",     desc: "Besiege die KI auf Legende.",                reward: 250 },
  { id: "online",    name: "Online-König",       desc: "Gewinne ein Online-Spiel.",                  reward: 100 },
  { id: "collector", name: "Sammler",            desc: "Schalte 6 Köpfe frei.",                      reward: 150 },
  { id: "powerups",  name: "Power-Spieler",      desc: "Sammle insgesamt 25 Power-ups.",             reward: 100, goal: 25, stat: "pus" },
  { id: "goals50",   name: "Torjäger",           desc: "Erziele insgesamt 50 Tore.",                 reward: 200, goal: 50, stat: "goals" },
  { id: "stomp",     name: "Draufgänger",        desc: "Spring 10-mal auf einen Gegnerkopf.",        reward: 80, goal: 10, stat: "stomps" },
  { id: "wins25",    name: "Seriensieger",       desc: "Gewinne 25 Spiele.",                         reward: 300, goal: 25, stat: "wins" },
];

export const EMOTES = ["😂", "🔥", "😤", "😎", "🤡", "GG"];
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rand = (a, b) => a + Math.random() * (b - a);

// Seltenheit nach Preis (für Karten und Shop)
export const RARITY = { basis: "Basis", selten: "Selten", episch: "Episch", legend: "Legendär" };
export const rarityOf = c => !c.price ? "basis" : c.price <= 300 ? "selten" : c.price <= 500 ? "episch" : "legend";

// Spielmodi (Reihenfolge = Reihenfolge der Karten)
export const MODES = [
  { id: "quick",   name: "Schnelles Spiel",  desc: "Gegen den Computer. Du stellst alles ein.", icon: "i-play",   c1: "#6b9bff", c2: "#2348d6", tags: ["1 Spieler"] },
  { id: "cup",     name: "Cup",              desc: "Drei Gegner, drei Siege, ein Pokal.",        icon: "i-trophy", c1: "#ffd84a", c2: "#e88a00", tags: ["+300 Pokal"] },
  { id: "online",  name: "Online",           desc: "Link schicken, Kumpel spielt mit.",          icon: "i-globe",  c1: "#b28cff", c2: "#5f33dc", tags: ["2 Spieler"] },
  { id: "local",   name: "Zu zweit",         desc: "Ein Gerät, zwei Spieler.",                   icon: "i-users",  c1: "#ffa06b", c2: "#e04d00", tags: ["2 Spieler"] },
  { id: "daily",   name: "Tages-Challenge",  desc: "Jeden Tag ein fester Gegner mit eigenen Regeln.", icon: "i-cal", c1: "#ff7f8f", c2: "#d61f5a", tags: ["+150 pro Tag"], isNew: true },
  { id: "endless", name: "Endlos",           desc: "Sieg um Sieg. Die Gegner werden härter.",    icon: "i-inf",    c1: "#6ff094", c2: "#179b45", tags: ["Rekord jagen"], isNew: true },
  { id: "train",   name: "Training",         desc: "Ohne Zeit gegen einen Torwart. Supers üben.", icon: "i-target", c1: "#5fe3e8", c2: "#0b8fa6", tags: ["Üben"] },
];

// Eigene Regeln
export const RULE_OPTS = [
  { k: "goal",   name: "Tore",           opts: [[0.8, "Klein"], [1, "Normal"], [1.25, "Groß"], [1.5, "Riesig"]] },
  { k: "ball",   name: "Ball",           opts: [[0.75, "Klein"], [1, "Normal"], [1.35, "Groß"], [1.8, "Riesig"]] },
  { k: "weight", name: "Ballgewicht",    opts: [["light", "Leicht"], ["normal", "Normal"], ["heavy", "Schwer"]], hint: "Leicht prallt mehr ab und fliegt weiter" },
  { k: "floor",  name: "Boden",          opts: [["normal", "Griffig"], ["ice", "Rutschig"]] },
  { k: "grav",   name: "Schwerkraft",    opts: [[0.55, "Wenig"], [1, "Normal"], [1.35, "Viel"]] },
  { k: "speed",  name: "Tempo",          opts: [[0.85, "Gemütlich"], [1, "Normal"], [1.25, "Turbo"]] },
  { k: "head",   name: "Köpfe",          opts: [[0.75, "Mini"], [1, "Normal"], [1.3, "Riesig"]] },
  { k: "pu",     name: "Power-ups",      opts: [["off", "Aus"], ["normal", "Normal"], ["many", "Viele"]] },
  { k: "supers", name: "Spezialschüsse", opts: [[true, "An"], [false, "Aus"]] },
  { k: "win",    name: "Sieg",           opts: [[0, "Nach Zeit"], [3, "Erster bis 3"], [5, "Erster bis 5"], [7, "Erster bis 7"]] },
];
export const RULE_PRESETS = [
  { id: "std",    name: "Standard",    desc: "Wie gewohnt",                   c1: "#6b9bff", c2: "#2348d6", rules: {} },
  { id: "chaos",  name: "Chaos",       desc: "Viele Power-ups, großer Ball",  c1: "#ff8cc2", c2: "#d9267a", rules: { pu: "many", ball: 1.35, weight: "light" } },
  { id: "moon",   name: "Mondfußball", desc: "Kaum Schwerkraft",              c1: "#9aa0c0", c2: "#4b4f78", rules: { grav: 0.55, weight: "light" } },
  { id: "ice",    name: "Eisfläche",   desc: "Alles rutscht",                 c1: "#7eeaff", c2: "#0a95c4", rules: { floor: "ice" } },
  { id: "giants", name: "Riesenköpfe", desc: "Große Köpfe, große Tore",       c1: "#ffa06b", c2: "#e04d00", rules: { head: 1.3, goal: 1.25 } },
  { id: "mini",   name: "Mini-Tore",   desc: "Präzision zählt",               c1: "#6ff094", c2: "#179b45", rules: { goal: 0.8, ball: 0.75 } },
  { id: "heavy",  name: "Medizinball", desc: "Schwerer Ball, große Tore",     c1: "#c79a6b", c2: "#7a4a22", rules: { weight: "heavy", goal: 1.25, ball: 1.35 } },
  { id: "turbo",  name: "Turbo",       desc: "Alles schneller",               c1: "#ffd84a", c2: "#e88a00", rules: { speed: 1.25 } },
  { id: "pure",   name: "Puristen",    desc: "Ohne Power-ups und Supers",     c1: "#b28cff", c2: "#5f33dc", rules: { pu: "off", supers: false } },
];
