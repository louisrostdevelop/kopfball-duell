// Server-Konto: Wenn ein Spiel-Server eingesteckt ist, gilt sein Stand für alles, was zählt (Münzen, Juwelen,
// Level, Besitz). Das Spiel rechnet weiter lokal vor (sofortige Anzeige) und übernimmt danach die Zahlen vom Server.
// Ohne Server passiert hier nichts, das Spiel läuft lokal wie bisher.
import { applyChestItems, craftLocal, openChestLocal, S, save, setHooks } from "./profile.js";
import { COS_KINDS } from "../content/cosmetics.js";
import { has, server } from "./services.js";
import { t, lang } from "../content/i18n.js";
import { CAREER } from "../content/career.js";
import { toast } from "../ui/dom.js";

const KINDS = { chars: "head", balls: "ball", arenas: "arena" };
export const itemId = (kind, id) => KINDS[kind] + ":" + id;
export const online = () => has("server");
let last = null;
let netDown = false;   // letzter Server-Aufruf kam nicht durch (offline)
const listeners = [];
/** Wird nach jedem neuen Server-Stand aufgerufen (Anzeige auffrischen) */
export const onSync = fn => { listeners.push(fn); };
/** Server gerade erreichbar? (Käufe gehen nur dann) */
export const reachable = () => online() && !netDown && globalThis.navigator?.onLine !== false;
// Karriere: höchste Sterne aus beiden Ständen (solange noch Offline-Spiele unterwegs sind)
const maxMerge = (a, b) => { const o = { ...a }; for (const [k, v] of Object.entries(b || {})) o[k] = Math.max(o[k] || 0, v); return o; };

/** Server-Stand ins Profil übernehmen (voll oder kurz, je nachdem was kam) */
export function applyState(st) {
  if (!st) return;
  netDown = false;
  last = { ...(last || {}), ...st };
  for (const k of ["coins", "gems", "level", "xp"]) if (typeof st[k] === "number") S[k] = st[k];
  if (Array.isArray(st.items)) for (const [kind, pre] of Object.entries(KINDS)) {
    const mine = st.items.filter(i => i.startsWith(pre + ":")).map(i => i.slice(pre.length + 1));
    S[kind] = mine;
    const sel = { chars: "char", balls: "ball", arenas: "arena" }[kind];
    if (mine.length && !mine.includes(S[sel])) S[sel] = mine[0];
  }
  if (Array.isArray(st.items)) {
    S.cos = st.items.filter(i => COS_KINDS.includes(i.split(":")[0]));
    // Ausgerüstetes, das man nicht (mehr) hat, ablegen
    for (const k of ["hat", "shoes", "goalfx"]) if (S.equip[k] && !S.cos.includes(S.equip[k])) S.equip[k] = null;
    S.equip.emotes = S.equip.emotes.map(e => (e && S.cos.includes(e) ? e : null));
  }
  if (Array.isArray(st.chests)) S.chests = st.chests.map(c => ({ id: c.id, tier: c.tier, source: c.source, ref: c.ref, sure: c.sure || null }));
  if (typeof st.shards === "number") S.shards = st.shards;
  if (st.pity && typeof st.pity === "object") S.pity = st.pity;
  if (st.heads) S.heads = Object.fromEntries(Object.entries(st.heads).map(([k, v]) => [k.replace(/^head:/, ""), v]));
  if (st.name) S.name = st.name;
  if (typeof st.passPoints === "number" && last.season && last.season.pass) last.season.pass.points = st.passPoints;
  if (typeof st.guest === "boolean") S.guest = st.guest;
  // Karriere: der Server zählt. Warten noch Offline-Spiele, bleibt lokal Erspieltes bis zum Abgleich sichtbar
  if (st.career && typeof st.career === "object") S.career = server.pending && server.pending() ? maxMerge(st.career, S.career) : { ...st.career };
  S.serverSynced = true;   // ab jetzt gilt der Server, lokaler Stand wird nie wieder übernommen
  save();
  listeners.forEach(fn => { try { fn(); } catch (_) { /* Anzeige */ } });
}
export const serverState = () => last;

/** Einstecken (main.js, nach provide): Käufe und Tagesbonus laufen dann über den Server */
export function initAccount() {
  if (!online()) return;
  setHooks({ buy: confirmBuy, canBuy, serverDaily: true, serverChests: true });
  globalThis.addEventListener?.("online", () => { netDown = false; syncPending(); });
  globalThis.document?.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") syncPending(); });
}

/** Ohne Verbindung keine Münz-Käufe: der Server würde sie später zurückdrehen */
function canBuy() {
  if (reachable()) return true;
  toast(t("sync.buyOffline"), "i-lock");
  return false;
}

/** Liga-Bonus aus einer Server-Antwort anzeigen */
export function careerNotice(res) {
  const b = res && res.career && res.career.bonus;
  if (!b) return;
  const lg = CAREER.find(l => l.id === b.league);
  toast(t(b.gems ? "career.bonusGems" : "career.bonus", { name: lg ? lg.name : b.league, coins: b.coins, gems: b.gems }), "i-trophy", true);
}

let flushing = null, retryT = 0;
/** Offline Gespieltes der Reihe nach nachschicken. Meldet Liga-Boni und nicht gewertete Spiele. */
export function syncPending() {
  if (!online() || flushing || !server.pending || !server.pending()) return flushing || Promise.resolve(null);
  flushing = server.flush().then(async out => {
    if (out.sent || out.rejected) { try { applyState(await server.state()); } catch (_) { netDown = true; } }
    out.results.forEach(careerNotice);
    if (out.rejected) toast(t("sync.rejected", { n: out.rejected }), "i-clock");
    else if (out.sent > 1) toast(t("sync.sent", { n: out.sent }), "i-check", true);
    clearTimeout(retryT);
    if (out.left) retryT = setTimeout(syncPending, 30000);   // Netz weg oder zu schnell: gleich nochmal
    return out;
  }).catch(() => null).finally(() => { flushing = null; });
  return flushing;
}

/** Beim Start: Stand holen, einmalig den alten lokalen Spielstand übernehmen, liegengebliebene Meldungen senden */
export async function syncOnStart() {
  if (!online()) return null;
  let st;
  try { st = await server.state(); } catch (e) { netDown = true; throw e; }
  if (st && st.imported === false && !S.serverSynced && hasLocalProgress()) {
    try { st = await server.importLocal(S); } catch (_) { /* schon übernommen oder zu groß: Server-Stand gilt */ }
  }
  applyState(st);
  syncPending();
  return st;
}
const hasLocalProgress = () => S.coins > 150 || S.level > 1 || S.chars.length > 3 || S.balls.length > 1 || S.arenas.length > 2 || Object.keys(S.career || {}).length > 0;

/** Kaufen mit Münzen: lokal schon gebucht (sofortige Anzeige), Server bestätigt oder es wird zurückgedreht */
export function confirmBuy(kind, id, undo) {
  if (!online()) return;
  server.buy(itemId(kind, id), "coins").then(r => applyState(r.state))
    .catch(e => { undo(); if (!(e && e.status)) netDown = true; server.state().then(applyState).catch(() => {}); });
}

/** Tagesbonus vom Server; null = heute schon abgeholt oder offline */
export async function claimDaily() {
  try { const d = await server.claimDaily(); if (!d) return null; applyState(d.state); return { amount: d.amount, streak: d.streak }; }
  catch (_) { return null; }
}

/** Spiel gegen den Computer oder zu zweit melden. Gibt die Server-Antwort zurück (oder null, wenn offline). */
export async function reportMatch(r) {
  if (!online() || !r.mode) return null;
  try { const res = await server.reportMatch(r); applyState(res.state); return res; }
  catch (e) { if (!(e && e.status)) netDown = true; return null; }   // bleibt gespeichert und geht später raus (syncPending)
}

/** Lokaler Modus -> Server-Modus. Online-Spiele laufen über die Warteschlange und werden dort gewertet. */
export const serverMode = mode => ({ cpu: "cpu", cup: "cpu", career: "career", endless: "endless", daily: "daily", local: "local", train: "train" })[mode] || null;

// ---------- Juwelen und Echtgeld ----------
/** Kopf mit Juwelen kaufen. Gibt true zurück, wenn der Server gebucht hat. */
export async function buyWithGems(kind, id) {
  const r = await server.buy(itemId(kind, id), "gems");
  applyState(r.state);
  if (!S[kind].includes(id)) S[kind].push(id);
  save();
  return true;
}
/** Echtgeld-Produkte vom Server (mit "buyable" für diesen Spieler) */
export const shopProducts = () => server.shop();
/** Zur Bezahlseite (Stripe). Kommt mit ?kauf=ok oder ?kauf=abgebrochen zurück. */
export async function startCheckout(product) { location.href = await server.checkout(product, lang()); }
/** Nach der Rückkehr von der Bezahlseite: ein paar Mal nachsehen, bis die Juwelen da sind */
export async function awaitPurchase(before, tries = 10) {
  for (let i = 0; i < tries; i++) {
    await new Promise(r => { setTimeout(r, 1500); });
    try { const st = await server.state(); applyState(st); if (st.gems > before) return st.gems - before; } catch (_) {}
  }
  return 0;
}

// ---------- Kopf-Level ----------
// wie auf dem Server (game.config: head_xp_per_level, head_coins_per_level, head_gems_per_10xp)
export const HEAD_COST = { xp: 100, coins: 200, gemsPer10xp: 1 };
/** Was kostet der nächste Level? null = Höchststufe oder kein Server-Kopf */
export function upgradeCost(id, maxLevel) {
  const h = S.heads && S.heads[id]; if (!h || h.level >= maxLevel) return null;
  const need = HEAD_COST.xp * h.level, missing = Math.max(0, need - h.xp);
  return { level: h.level, xp: h.xp, need, missing, coins: HEAD_COST.coins * h.level, gems: Math.ceil(missing / 10) * HEAD_COST.gemsPer10xp };
}
export async function upgradeHead(id, withGems) {
  const r = await server.upgradeHead("head:" + id, withGems);
  applyState(r.state);
  return r;
}

// ---------- Saison-Pass ----------
const bit = (mask, i) => Math.floor((mask || 0) / 2 ** i) % 2 === 1;
/** Pass der laufenden Saison für die Anzeige: Stufen mit Status, oder null (keine Saison / kein Server) */
export function passView() {
  const s = last && last.season; if (!s || !Array.isArray(s.tiers)) return null;
  const pp = s.pass || { points: 0, premium: false, free: 0, premiumClaimed: 0 };
  const tiers = s.tiers.map((x, i) => ({ i, points: x.points, free: x.free, premium: x.premium, reached: pp.points >= x.points,
    freeClaimed: bit(pp.free, i), premiumClaimed: bit(pp.premiumClaimed, i) }));
  const claimable = tiers.filter(x => x.reached && (!x.freeClaimed || (pp.premium && !x.premiumClaimed))).length;
  return { season: s.id, endsAt: s.endsAt, points: pp.points || 0, premium: !!pp.premium, tiers, claimable };
}
export async function claimPass(tier, premium) { applyState(await server.claimPass(tier, premium)); }
export async function buyPassWithGems() { applyState(await server.buyPassWithGems()); }
export const PASS_GEMS = 500;   // wie api.buy_pass_with_gems

// ---------- Name, Bestenlisten, Freunde ----------
const NAME_ERR = ["name_taken", "name_length", "name_chars", "name_blocked", "rate_limited"];
/** Name auf dem Server setzen (für Bestenlisten und Freunde). Gibt eine Fehlermeldung zurück oder "" */
export async function setServerName(name) {
  try { applyState(await server.setName(name)); return ""; } catch (e) { return NAME_ERR.includes(e && e.code) ? t("err.name." + e.code) : t("err.name.other"); }
}
/** Endlos-Rekord melden (der Server prüft gegen die gemeldeten Siege) */
export function submitEndless(streak) { if (online() && streak > 0) server.submitScore("endless", streak).catch(() => {}); }
export const boards = {
  endless: async () => ({ top: await server.leaderboard("endless", 50), me: await server.myRank("endless").catch(() => null) }),
  ranked: async () => ({ top: await server.rankedBoard(50), me: await server.myRankedRank().catch(() => null) }),
};
export const friendsList = () => server.friends();
const FR_ERR = ["unknown_player", "too_many_friends", "rate_limited"];
export async function addFriend(name) {
  try { const r = await server.friendRequest(name); return { ok: true, accepted: r.status === "accepted" }; }
  catch (e) { return { ok: false, msg: FR_ERR.includes(e && e.code) ? t("err.friend." + e.code) : t("err.generic") }; }
}
export const removeFriend = name => server.friendRemove(name);
/** Konto mit allen Spielerdaten löschen (Käufe bleiben ohne Personenbezug für die Buchhaltung) */
export const deleteAccount = () => server.deleteAccount();

// ---------- Kisten ----------
/** Kiste öffnen: mit Server würfelt der Server, sonst lokal. Ergebnis: { tier, coins, gems, shards, items } */
export async function openChest(id) {
  if (!online()) return openChestLocal(id);
  if (!reachable()) throw Object.assign(new Error("offline"), { code: "offline" });
  const r = await server.openChest(id);
  applyChestItems(r.result.items || []);
  applyState(r.state);
  S.chests = S.chests.filter(c => c.id !== id);
  save();
  return r.result;
}
/** Kosmetik mit Splittern herstellen */
export async function craft(id) {
  if (!online()) return craftLocal(id);
  if (!reachable()) throw Object.assign(new Error("offline"), { code: "offline" });
  const r = await server.craftItem(id);
  if (!S.cos.includes(id)) S.cos.push(id);
  applyState(r.state); save();
  return true;
}
