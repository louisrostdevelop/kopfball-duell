// Gemeinsam für die Zahlungs-Funktionen. Schlüssel kommen aus den Secrets (supabase secrets set ...).
import Stripe from "npm:stripe@17.7.0";

export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  httpClient: Stripe.createFetchHttpClient(), // Deno: fetch statt Node-http
});
export const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Erlaubte Herkunft für Aufrufe aus dem Browser (die Spiel-Seite), kommagetrennt
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://louisrostdevelop.github.io,http://localhost:8765").split(",");
export function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
