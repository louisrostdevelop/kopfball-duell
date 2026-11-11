// Gemeinsam für die Zahlungs-Funktionen. Schlüssel kommen aus den Secrets (supabase secrets set ...).
import Stripe from "npm:stripe@17.7.0";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(), // Deno: fetch statt Node-http
});
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

// CORS und JSON-Antworten liegen in http.ts (auch für Funktionen ohne Stripe)
export { cors, json } from "./http.ts";
