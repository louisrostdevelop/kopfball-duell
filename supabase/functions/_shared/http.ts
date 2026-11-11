// Gemeinsam für Funktionen, die der Browser aufruft: erlaubte Herkunft (CORS) und JSON-Antworten.
const ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "https://headstars.app,https://louisrostdevelop.github.io,http://localhost:8765").split(",");
export function cors(req: Request): Record<string, string> {
  const o = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(o) ? o : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
export function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}
