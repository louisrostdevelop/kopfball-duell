// Stripe meldet Zahlungen hierher. Nur signierte Meldungen werden angenommen.
// Gutschrift über api.grant_purchase (doppelte Meldungen = einmal gebucht), Erstattung über api.refund_purchase.
// Kennung des Kaufs ist die PaymentIntent-ID: dieselbe bei Zahlung und Erstattung.
import { createClient } from "jsr:@supabase/supabase-js@2";
import type Stripe from "npm:stripe@17.7.0";
import { cryptoProvider, json, stripe } from "../_shared/stripe.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
  db: { schema: "api" },
});
const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

async function grant(s: Stripe.Checkout.Session) {
  if (s.payment_status !== "paid") return "not_paid";   // z. B. Überweisung: kommt später als async_payment_succeeded
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  const player = s.metadata?.player_id, product = s.metadata?.product_id;
  if (!pi || !player || !product) return "no_metadata";
  const { error } = await db.rpc("grant_purchase", {
    player, provider: "stripe", provider_ref: pi, product,
    amount_cents: s.amount_subtotal ?? s.amount_total ?? 0, currency: (s.currency ?? "eur").toUpperCase(),
  });
  if (!error) return "granted";
  // Kauf, der nicht gutgeschrieben werden kann (z. B. Starterpaket zweimal in zwei Tabs): Geld sofort zurück
  if (["already_owned", "unknown_product", "amount_mismatch"].includes(error.message)) {
    await stripe.refunds.create({ payment_intent: pi, reason: "duplicate" }, { idempotencyKey: `refund:${pi}` });
    return `refunded:${error.message}`;
  }
  throw new Error(error.message);   // Datenbank-Problem: 500, Stripe versucht es bis zu 3 Tage lang erneut
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const sig = req.headers.get("stripe-signature");
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig ?? "", SECRET, undefined, cryptoProvider);
  } catch {
    return json({ error: "signature" }, 400);
  }
  try {
    let result = "ignored";
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        result = await grant(event.data.object as Stripe.Checkout.Session);
        break;
      case "charge.refunded":
      case "charge.dispute.created": {   // Erstattung oder Rückbuchung: Juwelen zurück, soweit noch da
        const o = event.data.object as Stripe.Charge | Stripe.Dispute;
        const pi = typeof o.payment_intent === "string" ? o.payment_intent : o.payment_intent?.id;
        if (pi) {
          const { error } = await db.rpc("refund_purchase", { provider: "stripe", provider_ref: pi });
          if (error) throw new Error(error.message);
          result = "refunded";
        }
        break;
      }
    }
    return json({ ok: true, result }, 200);
  } catch (e) {
    console.error(event.type, event.id, e);
    return json({ error: "retry" }, 500);
  }
});
