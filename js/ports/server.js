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
 * @property {(item: string) => Promise<object>} [upgradeHead]
 * @property {(mode: "casual"|"ranked", head: string) => Promise<object>} queueJoin   in die Warteschlange
 * @property {() => Promise<{ matched: boolean, waited?: number, match?: string, role?: "host"|"guest", opponent?: object }>} queuePoll
 * @property {() => Promise<object>} queueLeave
 * @property {(match: string, r: { score: number[], duration: number }) => Promise<{ status: string, result?: object }>} reportOnline
 * @property {(match: string) => Promise<{ status: string, result?: object }>} matchStatus
 */
export {};
