// Spielerprofil zur Laufzeit: Münzen, Level, Freischaltungen, Statistik, Erfolge, Einstellungen.
// Wo gespeichert wird, entscheidet der eingesteckte ProfileStore (siehe ports/storage.js):
// heute der Browser-Speicher, später zusätzlich ein Server. Die Regeln selbst liegen in core/economy.js.
import { ACHIEVEMENTS } from "../content/config.js";
import { defaultProfile, migrateProfile, xpFor, today, yesterday, dailyBonus, dailyTaskList, taskText, challengeFor, dealFor, earnedAchievements } from "../core/economy.js";

/** @type {import("../ports/storage.js").ProfileStore | null} */
let store = null;
/** Das aktuelle Profil. Wird nur über die Funktionen hier verändert und dann mit save() gesichert. */
export let S = defaultProfile();

/** Lädt das Profil aus dem Speicher (vor allem anderen beim Start aufrufen). */
export async function initProfile(profileStore) {
  store = profileStore;
  let raw = null;
  try { raw = await store.load(); } catch (_) {}
  S = migrateProfile(raw);
  // Ein Server-Speicher kann später ein neueres Profil nachliefern (anderes Gerät)
  if (store.onRemoteChange) store.onRemoteChange(p => { S = migrateProfile(p); });
  return S;
}
export function save() {
  if (!store) return;
  S.updatedAt = Date.now();
  try { const r = store.save(S); if (r && r.catch) r.catch(() => {}); } catch (_) {}
}
export async function reset() { S = defaultProfile(); S.updatedAt = Date.now(); if (store) await store.save(S); }

export { xpFor };
export function addXP(n) {
  S.xp += n; const ups = [];
  while (S.xp >= xpFor(S.level)) { S.xp -= xpFor(S.level); S.level++; ups.push(S.level); }
  return ups;
}
export function addCoins(n) { S.coins += n; if (n > 0) S.earned += n; }
export function owns(kind, id) { return S[kind].includes(id); }
// Mit Server (app/account.js) bestätigt der Server jeden Kauf, sonst wird er zurückgedreht
const hooks = { buy: null, serverDaily: false };
export function setHooks(h) { Object.assign(hooks, h); }
export function buy(kind, id, price) {
  if (owns(kind, id) || S.coins < price) return false;
  S.coins -= price; S[kind].push(id); save();
  if (hooks.buy) hooks.buy(kind, id, () => { S.coins += price; S[kind] = S[kind].filter(x => x !== id); save(); });
  return true;
}

// Tagesbonus: einmal am Tag, Serie steigt bis 7 Tage
export function dailyCheck() {
  if (hooks.serverDaily) return null;   // holt app/account.js beim Server ab
  const d = today();
  if (S.daily.last === d) return null;
  S.daily.streak = S.daily.last === yesterday() ? Math.min(7, S.daily.streak + 1) : 1;
  S.daily.last = d;
  const amount = dailyBonus(S.daily.streak);
  addCoins(amount); save();
  return { amount, streak: S.daily.streak };
}

// Erfolge prüfen; ctx enthält die Fakten des Spiels
export function checkAch(ctx) {
  const got = [];
  for (const id of earnedAchievements(ctx, S, ACHIEVEMENTS)) {
    if (S.ach[id]) continue;
    S.ach[id] = Date.now(); const a = ACHIEVEMENTS.find(x => x.id === id); addCoins(a.reward); got.push(a);
  }
  save();
  return got;
}
export function achProgress(a) { if (S.ach[a.id]) return 1; if (a.stat) return Math.min(1, (S.stats[a.stat] || 0) / a.goal); return 0; }

// Tagesaufgaben
export function tasks() {
  const d = today();
  if (!S.tasks || S.tasks.date !== d) { S.tasks = { date: d, list: dailyTaskList(d) }; save(); }
  return S.tasks.list.map(t => ({ ...t, text: taskText(t) }));
}
// inc: { wins, goals, ... } -> gibt neu erledigte Aufgaben zurück
export function taskProgress(inc) {
  tasks();
  const done = [];
  S.tasks.list.forEach(t => {
    if (t.done || !inc[t.id]) return;
    t.prog = Math.min(t.n, t.prog + inc[t.id]);
    if (t.prog >= t.n) { t.done = true; addCoins(t.reward); done.push({ ...t, text: taskText(t) }); }
  });
  save();
  return done;
}

// Tages-Challenge
export function challenge() { const d = today(); return { ...challengeFor(d), done: S.chDone === d }; }
export function challengeDone() { S.chDone = today(); save(); }

// Angebot des Tages
export function deal() {
  if (hooks.buy) return null;   // Rabatt gibt es (noch) nicht auf dem Server
  const d = today();
  if (S.dealBought === d) return null;
  return dealFor(d, S);
}
export function buyDeal(dl) {
  if (!dl || S.coins < dl.price || owns(dl.kind, dl.id)) return false;
  S.coins -= dl.price; S[dl.kind].push(dl.id); S.dealBought = today(); save(); return true;
}
