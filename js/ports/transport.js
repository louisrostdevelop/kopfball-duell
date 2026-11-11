// Schnittstelle: Verbindung zwischen zwei Spielern für Online-Spiele.
// Der Host rechnet das Spiel, der Gast schickt Eingaben und bekommt Zustände (siehe app/online.js).
// Umgesetzt von adapters/net/peerjs.js. Ein anderer Weg (eigener Server, Supabase Realtime für den
// Verbindungsaufbau) muss nur diese Funktionen anbieten.

/**
 * @typedef {Object} TransportHandlers
 * @property {(code: string) => void} [onReady]   Host: Raum offen, Code steht fest
 * @property {() => void} [onConn]                Verbindung steht
 * @property {(msg: object) => void} [onData]     Nachricht vom anderen Spieler
 * @property {() => void} [onClose]               Verbindung weg
 * @property {(type: string, wasOpen?: boolean) => void} [onError]
 * @property {(firstMsg: object) => boolean} [onKnock]   Host: neue Verbindung, obwohl eine offen ist (z. B. Gast nach App-Neustart); true = alte ersetzen
 */
/**
 * @typedef {Object} Transport
 * @property {() => boolean} available
 * @property {(h: TransportHandlers, opts?: { code?: string, retries?: number }) => string} host   Raum öffnen (optional mit festem Code, retries: so oft versuchen, falls die ID noch belegt ist), gibt den Code zurück
 * @property {(code: string, h: TransportHandlers) => void} join
 * @property {(msg: object) => void} send                  zuverlässig und geordnet (Lobby, Ereignisse, Statistik)
 * @property {(msg: object) => void} [sendFast]            häufige Daten (Zustände, Eingaben): darf verloren gehen, kommt dafür ohne Warten
 * @property {(after?: number) => void} close              after: erst nach so vielen ms schließen (letzte Nachricht kommt noch an)
 * @property {() => void} [drop]                          nur die Verbindung trennen (Host behält den Raum), löst onClose aus
 * @property {() => boolean} isOpen
 * @property {() => "host"|"guest"|null} role
 * @property {(servers: object[]) => void} [setIce]      Relay-Server (TURN) für die nächsten Verbindungen
 * @property {() => Promise<"direct"|"relay"|null>} [path]   Weg der offenen Verbindung (null = unbekannt), für die Nutzungsstatistik
 */
export {};
