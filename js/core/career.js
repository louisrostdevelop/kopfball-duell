// Karriere-Fortschritt: reine Funktionen über { "<liga>.<spiel>": sterne }
import { CAREER, careerStars } from "../content/career.js";
import { CHALLENGE_SETS } from "../content/config.js";

export const careerKey = (li, gi) => `${CAREER[li].id}.${gi}`;
export const starsOf = (prog, li, gi) => (prog && prog[careerKey(li, gi)]) || 0;
export const leagueStars = (prog, li) => CAREER[li].games.reduce((n, _, gi) => n + starsOf(prog, li, gi), 0);
export const leagueDone = (prog, li) => CAREER[li].games.every((_, gi) => starsOf(prog, li, gi) > 0);
export const leagueOpen = (prog, li) => li === 0 || leagueDone(prog, li - 1);
export const gameOpen = (prog, li, gi) => leagueOpen(prog, li) && (gi === 0 || starsOf(prog, li, gi - 1) > 0);
export const totalStars = prog => CAREER.reduce((n, _, li) => n + leagueStars(prog, li), 0);
export const MAX_STARS = CAREER.reduce((n, l) => n + l.games.length * 3, 0);

/** Nächstes ungeschlagenes, offenes Spiel ({li, gi}) oder null, wenn alles gewonnen ist */
export function nextGame(prog) {
  for (let li = 0; li < CAREER.length; li++) for (let gi = 0; gi < CAREER[li].games.length; gi++)
    if (gameOpen(prog, li, gi) && !starsOf(prog, li, gi)) return { li, gi };
  return null;
}

/** Regeln eines Spiels: Regelsatz + Länge + Hindernisse */
export function gameRules(li, gi) {
  const g = CAREER[li].games[gi], set = g.set && CHALLENGE_SETS.find(s => s.id === g.set);
  return { ...(set ? set.rules : {}), len: g.len, ...(g.obs ? { obs: g.obs } : {}) };
}

/**
 * Ergebnis eintragen. Gibt den neuen Fortschritt zurück (das alte Objekt bleibt unverändert) und was sich getan hat.
 * Ein schlechteres Ergebnis nimmt nie Sterne weg.
 */
export function recordResult(prog, li, gi, mine, theirs) {
  const k = careerKey(li, gi), before = starsOf(prog, li, gi), got = careerStars(mine, theirs);
  const next = { ...(prog || {}) };
  if (got > before) next[k] = got;
  const wasDone = leagueDone(prog, li), nowDone = leagueDone(next, li);
  return { prog: next, stars: got, gained: Math.max(0, got - before), leagueDone: !wasDone && nowDone, unlocked: !wasDone && nowDone && li + 1 < CAREER.length ? li + 1 : -1 };
}
