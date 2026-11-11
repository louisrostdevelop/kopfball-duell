// Server-Verbindung. Leer = Spiel läuft komplett lokal (wie bisher).
// Zum Einschalten: Projekt-URL und anon-Schlüssel aus Supabase (Dashboard -> Project Settings -> API) eintragen.
// Der anon-Schlüssel ist öffentlich gedacht: Rechte regelt der Server, nicht der Schlüssel.
// Auf localhost läuft das Spiel immer ohne Server (Tests, Entwicklung), außer mit ?backend=http://localhost:54321.
export const BACKEND = {
  url: "https://usobpjzoupofuhbryhum.supabase.co",   // Projekt "headstars" (EU, Irland)
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVzb2JwanpvdXBvZnVoYnJ5aHVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5ODYzNDUsImV4cCI6MjEwOTU2MjM0NX0.8BKuiS9ArsaHCAOOkyiozhxvOGK9px_a2zmjXVG00IQ",
  captchaSiteKey: "0x4AAAAAAF4Ufx9ayyvu94Or",   // Cloudflare Turnstile (öffentlich); Secret nur im Supabase-Dashboard unter Attack Protection
};
