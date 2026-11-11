// Welcher Server? Live aus content/backend.js; für Tests und Entwicklung auch ?backend=<url>&key=<anon> (nur localhost).
// Geteilt von main.js und der Admin-Seite (admin.html), damit beide dieselbe Sitzung im selben Speicher finden.

/** loc: window.location; live: { url, anonKey, captchaSiteKey } aus content/backend.js. null = ohne Server */
export function backendConfig(loc, live) {
  const q = new URLSearchParams(loc.search), u = q.get("backend");
  // as=2: zweites Konto im selben Browser (Tests mit zwei Tabs)
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
  // nur, wenn die Seite selbst lokal läuft, und mit eigenem Sitzungsschlüssel (die Live-Sitzung geht nie an einen anderen Server)
  if (local && u && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(u)) return { url: u, anonKey: q.get("key") || "dev", sessionKey: "kopfball-duell-session-dev" + (q.get("as") ? "-" + q.get("as").replace(/\W/g, "") : "") };
  // lokal ohne ?backend=: ohne Server. Tests und Entwicklung reden so nie mit dem Live-Server
  if (local) return null;
  return live && live.url && live.anonKey ? live : null;
}
