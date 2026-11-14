// Push-Mitteilungen an die Geräte der Admins (Web Push mit VAPID). Zwei Wege:
//  - Zeitplan (pg_cron alle 10 Minuten, supabase/ops/admin-push-cron.sql): Kopfzeile x-cron-secret = Geheimnis aus dem Vault,
//    holt mit dem Service-Schlüssel api.admin_push_digest (bündelt, bremst, Nachtruhe: alles in der Datenbank).
//  - Probe aus der Admin-Seite: mit dem Token des Admins api.admin_push_test (prüft Admin und Grenze selbst).
// verify_jwt ist aus (der Zeitplan hat kein Nutzer-Token); jeder Weg prüft selbst.
// Adressen, die der Push-Dienst nicht mehr kennt (404/410), werden gelöscht.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { cors, json } from "../_shared/http.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const VAPID_SUBJECT = (Deno.env.get("VAPID_SUBJECT") ?? "").trim() || "mailto:support@headstars.app";
// Sekunden: was länger nicht zugestellt werden kann (Gerät aus), ist ohnehin überholt. Dringlichkeit hoch: sonst hält
// Android die Mitteilung im Energiesparmodus zurück, bis das Gerät aufwacht oder der Browser geöffnet wird
const TTL = 6 * 3600;

const service = () => createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false }, db: { schema: "api" } });

// VAPID-Schlüssel und Zeitplan-Geheimnis aus dem Vault (api.admin_push_secrets), einmal je Instanz geladen.
// Funktions-Secrets gleichen Namens haben Vorrang (z. B. lokal ohne Vault).
let keys: { cron: string; ok: boolean } | null = null;
async function config() {
  if (keys) return keys;
  const env = (k: string) => (Deno.env.get(k) ?? "").trim();
  let cron = env("ADMIN_PUSH_CRON_SECRET"), pub = env("VAPID_PUBLIC_KEY"), priv = env("VAPID_PRIVATE_KEY");
  if (!cron || !pub || !priv) {
    const { data, error } = await service().rpc("admin_push_secrets");
    if (error) { console.error("admin-push: Schlüssel nicht lesbar", error.message); return { cron: "", ok: false }; }
    const v = (data ?? {}) as Record<string, string>;
    cron ||= (v.admin_push_cron ?? "").trim(); pub ||= (v.admin_push_vapid_public ?? "").trim(); priv ||= (v.admin_push_vapid_private ?? "").trim();
  }
  let ok = false;
  if (pub && priv) {
    try { webpush.setVapidDetails(VAPID_SUBJECT, pub, priv); ok = true; } catch (e) { console.error("admin-push: VAPID-Schlüssel ungültig", String(e)); }
  }
  keys = { cron, ok };
  return keys;
}

type Msg = { endpoint: string; p256dh: string; auth: string; title: string; body: string; tag: string; url: string };

// gleich lange Laufzeit, egal wo der Unterschied liegt
function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0;
}

async function deliver(list: Msg[]) {
  const gone: string[] = [], ok: string[] = [];
  let failed = 0;
  await Promise.all(list.map(async (m) => {
    try {
      await webpush.sendNotification({ endpoint: m.endpoint, keys: { p256dh: m.p256dh, auth: m.auth } },
        JSON.stringify({ title: m.title, body: m.body, tag: m.tag, url: m.url }), { TTL, urgency: "high" });
      ok.push(m.endpoint);
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? 0;
      if (status === 404 || status === 410) gone.push(m.endpoint);
      else {
        failed++;
        // nur Status und Host ins Log: die Adresse selbst ist ein Zugangsschlüssel zum Gerät
        let host = ""; try { host = new URL(m.endpoint).host; } catch (_) { /* egal */ }
        console.error("admin-push: Versand fehlgeschlagen", status, host, String((e as { body?: string }).body ?? e).slice(0, 200));
      }
    }
  }));
  if (gone.length || ok.length) {
    const db = service();
    if (gone.length) { const { error } = await db.rpc("admin_push_gone", { endpoints: gone }); if (error) console.error("admin-push: Löschen fehlgeschlagen", error.message); }
    if (ok.length) { const { error } = await db.rpc("admin_push_ok", { endpoints: ok }); if (error) console.error("admin-push: Vermerk fehlgeschlagen", error.message); }
  }
  return { sent: ok.length, failed, removed: gone.length };
}

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return json({ error: "method" }, 405, h);
  const cfg = await config();
  if (!cfg.ok) { keys = null; return json({ error: "not_configured" }, 503, h); }

  const cron = req.headers.get("x-cron-secret");
  if (cron !== null) {
    if (!cfg.cron) return json({ error: "not_configured" }, 503, h);
    if (!sameSecret(cron.trim(), cfg.cron)) return json({ error: "forbidden" }, 403, h);
    const { data, error } = await service().rpc("admin_push_digest");
    if (error) { console.error("admin-push: Digest fehlgeschlagen", error.message); return json({ error: "db" }, 500, h); }
    return json(await deliver((data ?? []) as Msg[]), 200, h);
  }

  // Probe: mit dem Token des Aufrufers, game.me() ist der Admin
  const authz = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(authz)) return json({ error: "not_authenticated" }, 401, h);
  const db = createClient(SB_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authz } },
    auth: { persistSession: false },
    db: { schema: "api" },
  });
  const { data, error } = await db.rpc("admin_push_test");
  if (error) {
    if (error.message === "forbidden") return json({ error: "forbidden" }, 403, h);
    if (error.message === "rate_limited") return json({ error: "rate_limited" }, 429, h);
    // ungültiges oder abgelaufenes Token (PostgREST) und fehlende Anmeldung
    if (error.message === "not_authenticated" || error.code === "PGRST301" || error.code === "PGRST303" || /jwt/i.test(error.message)) {
      return json({ error: "not_authenticated" }, 401, h);
    }
    console.error("admin-push: Probe fehlgeschlagen", error.message);
    return json({ error: "db" }, 500, h);
  }
  return json(await deliver((data ?? []) as Msg[]), 200, h);
});
