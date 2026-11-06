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
 * @property {() => Promise<object>} deleteAccount                   Konto und Spielerdaten löschen (DSGVO)
 * @property {() => Promise<object[]>} shop                             Echtgeld-Produkte
 * @property {(product: string, lang?: string) => Promise<string>} checkout  URL zur Bezahlseite (lang: Sprache der Bezahlseite)
 * @property {() => Promise<{ sent: number, rejected: number, results: object[], left: number }>} flush   offline Gespieltes nachschicken
 * @property {() => number} [pending]                                    wie viele Meldungen noch warten
 * @property {(item: string) => Promise<object>} [upgradeHead]
 * @property {(tier: number, premium: boolean) => Promise<object>} claimPass   Pass-Stufe abholen, gibt vollen Zustand
 * @property {() => Promise<object>} buyPassWithGems
 * @property {(chest: string) => Promise<{ result: object, state: object }>} openChest   Kiste öffnen (Server würfelt)
 * @property {(item: string) => Promise<{ state: object }>} craftItem                    Kosmetik mit Splittern herstellen
 * @property {(head: string) => Promise<{ state: object, shards: number, xp: number }>} shardsToHeadXp  fehlende Kopf-XP mit Splittern füllen
 * @property {(mode: "casual"|"ranked", head: string, cos?: object) => Promise<object>} queueJoin   in die Warteschlange (Kosmetik prüft der Server)
 * @property {() => Promise<{ matched: boolean, waited?: number, match?: string, role?: "host"|"guest", opponent?: object }>} queuePoll
 * @property {() => Promise<object>} queueLeave
 * @property {(match: string, r: { score: number[], duration: number }) => Promise<{ status: string, result?: object }>} reportOnline
 * @property {(match: string) => Promise<{ status: string, result?: object }>} matchStatus
 * @property {(board: "endless") => Promise<object[]>} leaderboard          Bestenliste (Top 50)
 * @property {(board: "endless") => Promise<{ rank: number|null, score?: number }>} myRank
 * @property {(board: "endless", score: number) => Promise<object>} submitScore
 * @property {() => Promise<object[]>} rankedBoard
 * @property {() => Promise<{ rank: number|null, mmr?: number }>} myRankedRank
 * @property {() => Promise<{ friends: object[], incoming: string[] }>} friends
 * @property {(name: string) => Promise<{ status: string }>} friendRequest
 * @property {(name: string) => Promise<object>} friendRemove
 * @property {(name: string) => Promise<object>} setName
 */
export {};
