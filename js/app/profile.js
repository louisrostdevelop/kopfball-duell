// Spielerprofil zur Laufzeit: Münzen, Level, Freischaltungen, Statistik, Erfolge, Einstellungen.
// Wo gespeichert wird, entscheidet der eingesteckte ProfileStore (siehe ports/storage.js):
// heute der Browser-Speicher, später zusätzlich ein Server. Die Regeln selbst liegen in core/economy.js.
import { ACHIEVEMENTS, ARENAS, arenaById, arenaFree, BALLS, CHARS, rarityOf, SHOP_LEVEL } from "../content/config.js";
import { COSMETICS, cosById, COS_PRICE, LEVEL_SURE_HEAD, levelChest, MASTERY, masteryReward, SHARDS } from "../content/cosmetics.js";
import { rollChest } from "../core/chests.js";
import { defaultProfile, migrateProfile, xpFor, today, yesterday, dailyBonus, dailyTaskList, taskText, challengeFor, dealFor, earnedAchievements, weekOf, weeklyList, weeklyText } from "../core/economy.js";

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
  // Kiste je Level-Up; mit Server vergibt der Server (kommt mit dem nächsten Zustand)
  if (!hooks.serverChests) for (const l of ups) grantChest(levelChest(l), "level", String(l), LEVEL_SURE_HEAD[l]);
  return ups;
}

// ---------- Kisten (ohne Server: lokal; mit Server: app/account.js) ----------
export function grantChest(tier, source, ref, sure = null) {
  if (hooks.serverChests) return null;   // mit Server vergibt der Server
  if (S.chests.some(c => c.source === source && c.ref === ref)) return null;
  const c = { id: `${source}:${ref}`, tier, source, ref, sure };
  S.chests.push(c); save();
  return c;
}
/** Kiste lokal öffnen: würfeln, gutschreiben. Gibt das Ergebnis wie der Server zurück. */
export function openChestLocal(id) {
  const c = S.chests.find(x => x.id === id); if (!c) return null;
  const owned = new Set([...S.chars.map(x => "head:" + x), ...S.cos]);
  const heads = Object.fromEntries(Object.entries(S.heads || {}).map(([k, v]) => [k, v.level]));
  const r = rollChest(c.tier, { owned, heads, pity: S.pity }, Math.random, c.sure);
  S.pity = r.pity; addCoins(r.coins); S.gems = (S.gems || 0) + r.gems; S.shards += r.shards;
  applyChestItems(r.items);
  S.chests = S.chests.filter(x => x.id !== id); save();
  return { tier: c.tier, coins: r.coins, gems: r.gems, shards: r.shards, items: r.items };
}
/** Neue Gegenstände aus einer Kiste ins Profil (auch nach Server-Antwort) */
export function applyChestItems(items) {
  for (const it of items) {
    const [kind, id] = it.id.split(":");
    if (kind === "head") {
      if (!it.dup && !S.chars.includes(id)) S.chars.push(id);
      if (it.headXp) { S.heads = S.heads || {}; const h = S.heads[id] || (S.heads[id] = { level: 1, xp: 0 }); h.xp += it.headXp; }
    } else if (!it.dup && !S.cos.includes(it.id)) S.cos.push(it.id);
  }
}
// ---------- Meisterschaft pro Kopf (ohne Server lokal; mit Server zählt der Server) ----------
export const headStat = id => ({ level: 1, xp: 0, games: 0, wins: 0, goals: 0, supers: 0, mastery: 0, ...((S.heads && S.heads[id]) || {}) });
/** Zähler des Kopfes erhöhen, erreichte Stufen belohnen. Gibt [{ head, stage, item, chest }] zurück. */
export function masteryProgress(head, won, goals, supers) {
  if (hooks.serverChests) return [];
  S.heads = S.heads || {};
  const h = S.heads[head] = { level: 1, xp: 0, games: 0, wins: 0, goals: 0, supers: 0, mastery: 0, ...(S.heads[head] || {}) };
  h.games++; h.wins += won ? 1 : 0; h.goals += goals || 0; h.supers += supers || 0;
  const got = [];
  while (h.mastery < MASTERY.length && h[MASTERY[h.mastery].stat] >= MASTERY[h.mastery].n) {
    h.mastery++;
    const m = MASTERY[h.mastery - 1], item = masteryReward(head, h.mastery);
    if (!S.cos.includes(item)) S.cos.push(item);
    if (m.chest) grantChest(m.chest, "mastery", `${head}:${h.mastery}`);
    got.push({ head: "head:" + head, stage: h.mastery, item, chest: m.chest || null });
  }
  save();
  return got;
}

/** Mit Splittern herstellen (lokal) */
export function craftLocal(id) {
  const c = cosById(id); if (!c || c.mastery || S.cos.includes(id)) return false;
  const cost = SHARDS.craft[c.rarity]; if (S.shards < cost) return false;
  S.shards -= cost; S.cos.push(id); save();
  return true;
}
export function addCoins(n) { S.coins += n; if (n > 0) S.earned += n; }
export function owns(kind, id) {
  if (kind === "cos") return S.cos.includes(id);
  return S[kind].includes(id) || (kind === "arenas" && arenaFree(arenaById(id), S.level));
}
/** Kosmetik aus dem Wochenangebot kaufen (lokal; mit Server: account.buyCos) */
export function buyCosLocal(id) {
  const c = cosById(id); if (!c || S.cos.includes(id) || S.level < shopLevel("cos", id)) return false;
  const price = COS_PRICE[c.rarity].coins; if (S.coins < price) return false;
  S.coins -= price; S.cos.push(id); save();
  return true;
}
// Mit Server (app/account.js) bestätigt der Server jeden Kauf, sonst wird er zurückgedreht
const hooks = { buy: null, canBuy: null, serverDaily: false, serverChests: false, season: null };
export function setHooks(h) { Object.assign(hooks, h); }
/** Ab welchem Level ist ein Gegenstand im Shop kaufbar (0 = sofort) */
export function shopLevel(kind, id) {
  const it = (kind === "chars" ? CHARS : kind === "balls" ? BALLS : kind === "arenas" ? ARENAS : COSMETICS).find(x => x.id === id);
  if (it && kind === "arenas" && it.level) return it.level;
  return it ? SHOP_LEVEL[rarityOf(it)] || 1 : 1;
}
/** Neue Arena: erst im Saison-Pass ihrer Saison, danach im Shop. Ohne Server (keine Saisons) gleich im Shop. */
export const seasonNow = () => (hooks.season ? hooks.season() : null);
export function arenaInShop(a) {
  if (!a.season) return true;
  const cur = seasonNow();
  return cur == null || cur > a.season;
}
export function buy(kind, id, price) {
  if (owns(kind, id) || S.coins < price || S.level < shopLevel(kind, id)) return false;
  if (kind === "arenas" && !arenaInShop(arenaById(id))) return false;
  if (hooks.canBuy && !hooks.canBuy()) return false;
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
    S.ach[id] = Date.now(); const a = ACHIEVEMENTS.find(x => x.id === id); addCoins(a.reward); if (a.chest) grantChest(a.chest, "ach", a.id);
    if (a.item && !S.cos.includes(a.item)) S.cos.push(a.item);
    got.push(a);
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
  if (done.length && S.tasks.list.every(t => t.done)) grantChest("bronze", "tasks", S.tasks.date);
  save();
  return done;
}

// Wochenaufgaben (mit Server zählt der Server, Stand kommt mit dem Zustand)
export function weekly() {
  const wk = weekOf();
  if (!S.weekly || S.weekly.week !== wk || !Array.isArray(S.weekly.list)) { S.weekly = { week: wk, list: weeklyList(wk), heads: [] }; save(); }
  return { ...S.weekly, list: S.weekly.list.map(w => ({ ...w, text: weeklyText(w) })) };
}
export function weeklyProgress(inc, head) {
  if (hooks.serverChests) return [];
  weekly();
  const w = S.weekly, done = [];
  if (head && !w.heads.includes(head)) w.heads.push(head);
  for (const x of w.list) {
    if (x.done) continue;
    x.prog = Math.min(x.n, x.id === "heads" ? w.heads.length : x.prog + (inc[x.id] || 0));
    if (x.prog >= x.n) { x.done = true; addCoins(x.reward); done.push({ ...x, text: weeklyText(x) }); }
  }
  if (done.length && w.list.every(x => x.done)) grantChest("silver", "weekly", w.week);
  save();
  return done;
}

// Tages-Challenge
export function challenge() { const d = today(); return { ...challengeFor(d), done: S.chDone === d }; }
export function challengeDone() { S.chDone = today(); grantChest("bronze", "challenge", S.chDone); save(); }

// Angebot des Tages
export function deal() {
  if (hooks.buy) return null;   // Rabatt gibt es auf dem Server nicht
  const d = today();
  if (S.dealBought === d) return null;
  return dealFor(d, S);
}
export function buyDeal(dl) {
  if (!dl || S.coins < dl.price || owns(dl.kind, dl.id)) return false;
  S.coins -= dl.price; S[dl.kind].push(dl.id); S.dealBought = today(); save(); return true;
}
