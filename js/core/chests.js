// Kisten öffnen als reine Regel (kein Speicher). Mit Server würfelt der Server (game.roll_chest, gleiche Tabellen);
// ohne Server würfelt das Spiel hiermit lokal. Ergebnis: was es gibt und die neuen Garantie-Zähler.
import { CHARS, HEAD_MAX_LEVEL, rarityOf } from "../content/config.js";
import { CHESTS, COSMETICS, HEAD_DUP_XP, PITY, SHARDS } from "../content/cosmetics.js";

const RANK = { basis: 0, selten: 1, episch: 2, legend: 3 };
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
const headsOf = rar => CHARS.filter(c => rarityOf(c) === rar);

/** Seltenheit aus { selten: 0.7, episch: 0.3 } */
function rollRar(dist, rnd) {
  let x = rnd();
  for (const [r, p] of Object.entries(dist)) { if (x < p) return r; x -= p; }
  return Object.keys(dist).pop();
}

/**
 * @param {string} tier         bronze | silver | gold | legend
 * @param {object} st           { owned: Set("head:kalle", "shoes:3", ...), heads: { kalle: level }, pity: { epic, legend, head, legendHead } }
 * @param {() => number} rnd    Zufall 0..1
 * @param {string} [sure]       sicher ein neuer Kopf dieser Seltenheit (Level 2 / 5)
 * @returns {{ coins: number, gems: number, shards: number, items: object[], pity: object }}
 */
export function rollChest(tier, st, rnd = Math.random, sure = null) {
  const C = CHESTS[tier], pity = { epic: 0, legend: 0, head: 0, legendHead: 0, ...(st.pity || {}) };
  const own = new Set(st.owned);
  const out = { coins: 0, gems: C.gems || 0, shards: 0, items: [], pity };
  out.coins = C.coins[0] + Math.floor(rnd() * (C.coins[1] - C.coins[0] + 1));
  pity.epic++; pity.legend++; pity.head++; pity.legendHead++;

  // Kosmetik: Chance, Seltenheit, Garantien (Episch / Legendär)
  let cosRar = rnd() < C.cos.p ? rollRar(C.cos.rar, rnd) : null;
  if (pity.legend >= PITY.legend) cosRar = "legend";
  else if (pity.epic >= PITY.epic && (!cosRar || RANK[cosRar] < 2)) cosRar = "episch";

  // Kopf: Chance je Seltenheit; Garantien (neuer Kopf, legendärer Kopf); sicher bei Level 2 / 5
  let headRar = null, headNew = false;
  const hx = rnd(); let acc = 0;
  for (const [r, p] of Object.entries(C.head)) { acc += p; if (hx < acc) { headRar = r; break; } }
  if (C.sure && !headRar) headRar = rollRar(C.head, rnd);
  const unowned = r => headsOf(r).filter(c => !own.has("head:" + c.id));
  if (sure && unowned(sure).length) { headRar = sure; headNew = true; }
  else if (pity.legendHead >= PITY.legendHead && unowned("legend").length) { headRar = "legend"; headNew = true; }
  else if (pity.head >= PITY.head) {
    const pool = ["selten", "episch", "legend"].filter(r => unowned(r).length);
    if (pool.length) { headRar = pool[0]; headNew = true; }
  }

  if (cosRar) {
    const c = pick(COSMETICS.filter(x => x.rarity === cosRar), rnd);
    if (own.has(c.id)) { out.items.push({ id: c.id, kind: c.kind, rarity: cosRar, dup: true, shards: SHARDS.dup[cosRar] }); out.shards += SHARDS.dup[cosRar]; }
    else { own.add(c.id); out.items.push({ id: c.id, kind: c.kind, rarity: cosRar, dup: false }); }
  }
  if (headRar) {
    const h = pick(headNew ? unowned(headRar) : headsOf(headRar), rnd), id = "head:" + h.id;
    if (!own.has(id)) { own.add(id); out.items.push({ id, kind: "head", rarity: headRar, dup: false }); }
    else if ((st.heads?.[h.id] || 1) >= HEAD_MAX_LEVEL) { out.items.push({ id, kind: "head", rarity: headRar, dup: true, shards: SHARDS.dup[headRar] }); out.shards += SHARDS.dup[headRar]; }
    else out.items.push({ id, kind: "head", rarity: headRar, dup: true, headXp: HEAD_DUP_XP[headRar] });
  }

  // Zähler zurücksetzen, wenn erfüllt
  const best = Math.max(-1, ...out.items.map(i => RANK[i.rarity]));
  if (best >= 2) pity.epic = 0;
  if (best >= 3) pity.legend = 0;
  if (out.items.some(i => i.kind === "head" && !i.dup)) pity.head = 0;
  if (out.items.some(i => i.kind === "head" && !i.dup && i.rarity === "legend")) pity.legendHead = 0;
  return out;
}
