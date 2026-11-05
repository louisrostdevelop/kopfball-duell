// Server-Konto: Wenn ein Spiel-Server eingesteckt ist, gilt sein Stand für alles, was zählt (Münzen, Juwelen,
// Level, Besitz). Das Spiel rechnet weiter lokal vor (sofortige Anzeige) und übernimmt danach die Zahlen vom Server.
// Ohne Server passiert hier nichts, das Spiel läuft lokal wie bisher.
import { S, save, setHooks } from "./profile.js";
import { has, server } from "./services.js";

const KINDS = { chars: "head", balls: "ball", arenas: "arena" };
export const itemId = (kind, id) => KINDS[kind] + ":" + id;
export const online = () => has("server");
let last = null;

/** Server-Stand ins Profil übernehmen (voll oder kurz, je nachdem was kam) */
export function applyState(st) {
  if (!st) return;
  last = { ...(last || {}), ...st };
  for (const k of ["coins", "gems", "level", "xp"]) if (typeof st[k] === "number") S[k] = st[k];
  if (Array.isArray(st.items)) for (const [kind, pre] of Object.entries(KINDS)) {
    const mine = st.items.filter(i => i.startsWith(pre + ":")).map(i => i.slice(pre.length + 1));
    S[kind] = mine;
    const sel = { chars: "char", balls: "ball", arenas: "arena" }[kind];
    if (mine.length && !mine.includes(S[sel])) S[sel] = mine[0];
  }
  if (st.heads) S.heads = Object.fromEntries(Object.entries(st.heads).map(([k, v]) => [k.replace(/^head:/, ""), v]));
  if (st.name) S.name = st.name;
  if (typeof st.passPoints === "number" && last.season && last.season.pass) last.season.pass.points = st.passPoints;
  if (typeof st.guest === "boolean") S.guest = st.guest;
  S.serverSynced = true;   // ab jetzt gilt der Server, lokaler Stand wird nie wieder übernommen
  save();
}
export const serverState = () => last;

/** Einstecken (main.js, nach provide): Käufe und Tagesbonus laufen dann über den Server */
export function initAccount() {
  if (!online()) return;
  setHooks({ buy: confirmBuy, serverDaily: true });
}

/** Beim Start: Stand holen, einmalig den alten lokalen Spielstand übernehmen, liegengebliebene Meldungen senden */
export async function syncOnStart() {
  if (!online()) return null;
  let st = await server.state();
  if (st && st.imported === false && !S.serverSynced && hasLocalProgress()) {
    try { st = await server.importLocal(S); } catch (_) { /* schon übernommen oder zu groß: Server-Stand gilt */ }
  }
  applyState(st);
  server.flush().then(n => { if (n) server.state().then(applyState).catch(() => {}); }).catch(() => {});
  return st;
}
const hasLocalProgress = () => S.coins > 150 || S.level > 1 || S.chars.length > 3 || S.balls.length > 1 || S.arenas.length > 2;

/** Kaufen mit Münzen: lokal schon gebucht (sofortige Anzeige), Server bestätigt oder es wird zurückgedreht */
export function confirmBuy(kind, id, undo) {
  if (!online()) return;
  server.buy(itemId(kind, id), "coins").then(r => applyState(r.state))
    .catch(e => { if (e && e.status) undo(); server.state().then(applyState).catch(() => {}); });
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
  catch (_) { return null; }   // bleibt gespeichert und geht beim nächsten Start raus
}

/** Lokaler Modus -> Server-Modus. Online-Spiele laufen über die Warteschlange und werden dort gewertet. */
export const serverMode = mode => ({ cpu: "cpu", cup: "cpu", endless: "endless", daily: "daily", local: "local", train: "train" })[mode] || null;

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
export async function startCheckout(product) { location.href = await server.checkout(product); }
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
  const tiers = s.tiers.map((t, i) => ({ i, points: t.points, free: t.free, premium: t.premium, reached: pp.points >= t.points,
    freeClaimed: bit(pp.free, i), premiumClaimed: bit(pp.premiumClaimed, i) }));
  const claimable = tiers.filter(t => t.reached && (!t.freeClaimed || (pp.premium && !t.premiumClaimed))).length;
  return { season: s.id, endsAt: s.endsAt, points: pp.points || 0, premium: !!pp.premium, tiers, claimable };
}
export async function claimPass(tier, premium) { applyState(await server.claimPass(tier, premium)); }
export async function buyPassWithGems() { applyState(await server.buyPassWithGems()); }
export const PASS_GEMS = 500;   // wie api.buy_pass_with_gems
