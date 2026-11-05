// Startet einen Kauf: prüft Konto und Produkt beim Server, legt eine Stripe-Checkout-Sitzung an und gibt deren URL zurück.
// Der Preis kommt aus der Datenbank, nie vom Client. Gutgeschrieben wird erst im Webhook, wenn Stripe "bezahlt" meldet.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { cors, json, stripe } from "../_shared/stripe.ts";

const SITE = Deno.env.get("SITE_URL") ?? "https://louisrostdevelop.github.io/kopfball-duell/";

Deno.serve(async (req) => {
  const h = cors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: h });
  if (req.method !== "POST") return json({ error: "method" }, 405, h);

  // Mit dem Token des Spielers: RLS/Rechte gelten wie im Spiel, auth.uid() ist der Spieler
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    auth: { persistSession: false },
    db: { schema: "api" },
  });
  const { data: { user } } = await db.auth.getUser();
  if (!user) return json({ error: "not_authenticated" }, 401, h);
  if (user.is_anonymous) return json({ error: "account_required" }, 403, h);

  let product = "";
  try { product = String((await req.json()).product ?? ""); } catch { /* leer */ }
  const { data: shop, error } = await db.rpc("shop");
  if (error) return json({ error: "shop" }, 500, h);
  const p = (shop as Array<{ id: string; gems: number; priceCents: number; currency: string; buyable: boolean }>).find((x) => x.id === product);
  if (!p) return json({ error: "unknown_product" }, 404, h);
  if (!p.buyable) return json({ error: "already_owned" }, 409, h);

  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: p.currency.toLowerCase(),
        unit_amount: p.priceCents,
        product_data: { name: p.gems ? `${p.gems} Juwelen` : product },
      },
    }],
    client_reference_id: user.id,
    customer_email: user.email ?? undefined,
    metadata: { player_id: user.id, product_id: p.id },
    payment_intent_data: { metadata: { player_id: user.id, product_id: p.id } },
    success_url: `${SITE}?kauf=ok`,
    cancel_url: `${SITE}?kauf=abgebrochen`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  }, { idempotencyKey: `${user.id}:${p.id}:${req.headers.get("x-request-key") ?? crypto.randomUUID()}` });

  return json({ url: session.url }, 200, h);
});
