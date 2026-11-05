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
 */
/**
 * @typedef {Object} Transport
 * @property {() => boolean} available
 * @property {(h: TransportHandlers) => string} host        Raum öffnen, gibt den Code zurück
 * @property {(code: string, h: TransportHandlers) => void} join
 * @property {(msg: object) => void} send
 * @property {() => void} close
 * @property {() => boolean} isOpen
 * @property {() => "host"|"guest"|null} role
 */
export {};
