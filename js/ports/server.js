// Schnittstelle: Spiel-Server für alles, was zählt (Münzen, Juwelen, Käufe, Level, Belohnungen).
// Ist kein Server eingesteckt, rechnet das Spiel lokal wie bisher. Umgesetzt von adapters/server/supabase.js.

/**
 * Zustand vom Server: { level, xp, coins, gems, items: ["head:kalle", ...], heads: { "head:kalle": { level, xp } }, name, guest, ... }
 * @typedef {Object} ServerState
 */
/**
 * @typedef {Object} GameServer
 * @property {() => Promise<ServerState>} state                        voller Zustand (beim Start)
 * @property {(r: object) => Promise<{ coins: number, state: object }>} reportMatch   Spiel gegen den Computer melden
 * @property {(item: string, currency: "coins"|"gems") => Promise<{ state: object }>} buy
 * @property {() => Promise<{ amount: number, streak: number, state?: object }|null>} claimDaily   null = heute schon abgeholt
 * @property {(profile: object) => Promise<object>} importLocal        einmalig: lokalen Spielstand übernehmen
 * @property {() => Promise<object[]>} shop                             Echtgeld-Produkte
 * @property {(product: string) => Promise<string>} checkout            URL zur Bezahlseite
 * @property {() => Promise<number>} flush                              noch nicht gesendete Meldungen nachschicken
 */
export {};
