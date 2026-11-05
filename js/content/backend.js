// Server-Verbindung. Leer = Spiel läuft komplett lokal (wie bisher).
// Zum Einschalten: Projekt-URL und anon-Schlüssel aus Supabase (Dashboard -> Project Settings -> API) eintragen.
// Der anon-Schlüssel ist öffentlich gedacht: Rechte regelt der Server, nicht der Schlüssel.
// Ausnahme für Tests und lokale Entwicklung: ?backend=http://localhost:54321 in der Adresse.
export const BACKEND = {
  url: "",
  anonKey: "",
  captchaSiteKey: "",   // Cloudflare Turnstile, wenn im Projekt unter Attack Protection eingeschaltet
};
