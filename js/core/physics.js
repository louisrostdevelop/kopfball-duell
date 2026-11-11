// Spielphysik: öffentliche Schnittstelle. Die Logik liegt in js/sim/ (ein Modul pro Thema).
// Läuft offline und online auf beiden Seiten (Rollback).
export { DEFAULT_RULES, ballG, gMul, headStats, matchLen } from "./sim/rules.js";
export { AIR, KICK, MOVE, SHOE } from "./sim/tuning.js";
export { footH, shoeGeo, shoeGeoAt, swingAt } from "./sim/shoe.js";
export { barY, pr, shoePos } from "./sim/base.js";
export { kickoff, mkStats, newMatch } from "./sim/state.js";
export { emote } from "./sim/player.js";
export { fireSuper, target as superTarget } from "./sim/supers.js";
export { REPLAY_END, REPLAY_START, TICK, advance, skipCelebration, step, tick } from "./sim/match.js";
