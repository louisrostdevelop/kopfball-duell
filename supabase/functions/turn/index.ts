// Kurzlebige Zugangsdaten für den Relay-Server (TURN, Cloudflare Realtime). Online-Spiele laufen direkt zwischen den
// Geräten; geht das nicht (Mobilfunk, Router, die Geräte im selben WLAN voneinander abschirmen), reicht der Relay die
// verschlüsselten Daten durch. Der dauerhafte Schlüssel bleibt hier in den Secrets (CF_TURN_KEY_ID, CF_TURN_API_TOKEN);
// der Browser bekommt nur Zugangsdaten, die nach TTL ablaufen. Nur für angemeldete Spieler (auch Gäste): verify_jwt;
// wie oft ein Spieler welche holen darf, begrenzt api.turn_allowed (jede Anfrage kostet, Zugangsdaten lassen sich weitergeben).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json } from "../_shared/http.ts";

// trim: beim Einfügen ins Dashboard rutschen leicht Leerzeichen oder Zeilenumbrüche mit
const KEY_ID = (Deno.env.get("CF_TURN_KEY_ID") ?? "").trim();
const TOKEN = (Deno.env.get("CF_TURN_API_TOKEN") ?? "").trim();
// Sekunden: reicht für eine Sitzung unter Freunden mit Revanchen; kurz, damit weitergegebene Zugangsdaten bald nichts
// mehr taugen. Der Client holt nach der halben Zeit neue.
const TTL = 2 * 3600;

type Ice = { urls: string | string[]; username?: string; credential?: string };
// Port 53 blocken Browser (läuft sonst in eine Zeitüberschreitung, siehe Cloudflare-Doku): weglassen
const usable = (u: string) => !/:53(\?|$)/.test(u);

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return json({ error: "method" }, 405, h);
  if (!KEY_ID || !TOKEN) return json({ error: "not_configured" }, 503, h);

  // Mit dem Token des Spielers: game.me() ist der Spieler, die Grenze gilt je Konto
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
    db: { schema: "api" },
  });
  const { error: limited } = await db.rpc("turn_allowed");
  if (limited) {
    if (limited.message === "not_authenticated") return json({ error: "not_authenticated" }, 401, h);
    if (limited.message !== "rate_limited") console.error("turn: Grenze nicht prüfbar", limited.message);
    return json({ error: "rate_limited" }, 429, h);   // auch wenn die Prüfung scheitert: lieber direkt verbinden als unbegrenzt
  }

  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: TTL }),
  }).catch((e) => { console.error("turn: Cloudflare nicht erreichbar", String(e)); return null; });
  if (!r || !r.ok) {
    // Ursache ins Funktions-Log (ohne Schlüssel): 401/403 = Token falsch, 404 = Key-ID falsch
    if (r) console.error("turn: Cloudflare antwortet", r.status, (await r.text().catch(() => "")).slice(0, 300), "key-id-länge", KEY_ID.length);
    return json({ error: "relay_unavailable", status: r ? r.status : 0 }, 502, h);
  }
  const d = await r.json().catch(() => null) as { iceServers?: Ice | Ice[] } | null;
  const list = d && d.iceServers ? (Array.isArray(d.iceServers) ? d.iceServers : [d.iceServers]) : [];
  const iceServers = list
    .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter(usable) }))
    .filter((s) => s.urls.length > 0);
  if (!iceServers.length) return json({ error: "relay_unavailable" }, 502, h);
  return json({ iceServers, ttl: TTL }, 200, { ...h, "Cache-Control": "no-store" });
});
