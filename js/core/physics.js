// Spielphysik: öffentliche Schnittstelle. Die Logik liegt in js/sim/ (ein Modul pro Thema).
// Läuft beim Host bzw. offline, der Gast bekommt nur Zustände und Ereignisse.
export { DEFAULT_RULES, ballG, gMul, headStats, matchLen } from "./sim/rules.js";
export { AIR, KICK, MOVE } from "./sim/tuning.js";
export { barY, pr, shoePos } from "./sim/base.js";
export { kickoff, newMatch } from "./sim/state.js";
export { emote } from "./sim/player.js";
export { kickKind, kickPreview } from "./sim/kick.js";
export { fireSuper, target as superTarget } from "./sim/supers.js";
export { REPLAY_END, REPLAY_START, TICK, advance, predictPlayer, skipCelebration, step, tick } from "./sim/match.js";
