// Spiel-Server über Supabase: ruft die Funktionen aus supabase/migrations (Schema api) auf.
// Jede Anfrage, die etwas ändert, trägt einen Schlüssel: wiederholt (Netz weg, Tab zu) wird sie nur einmal gebucht.
// Spielmeldungen, die nicht ankommen, warten im Browser und gehen beim nächsten Mal raus.
const PENDING = "kopfball-duell-pending";
const key = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

/** @returns {import("../../ports/server.js").GameServer} */
export function supabaseServer(client, storage = globalThis.localStorage) {
  const load = () => { try { return JSON.parse(storage.getItem(PENDING) || "[]"); } catch (_) { return []; } };
  const store = l => { try { storage.setItem(PENDING, JSON.stringify(l.slice(-20))); } catch (_) {} };
  const drop = k => store(load().filter(x => x.k !== k));
  const final = e => e && e.status >= 400 && e.status < 500 && e.code !== "rate_limited";   // Server sagt nein: nicht wiederholen

  async function send(job) {
    try { const r = await client.rpc("report_cpu_match", { r: job.r, request_key: job.k }); drop(job.k); return r; }
    catch (e) { if (final(e)) drop(job.k); throw e; }
  }
  return {
    state: () => client.rpc("me"),
    reportMatch(r) { const job = { k: key(), r }; store([...load(), job]); return send(job); },
    async flush() { let n = 0; for (const job of load()) { try { await send(job); n++; } catch (_) { /* später */ } } return n; },
    buy: (item, currency) => client.rpc("buy_item", { item, currency, request_key: key() }),
    upgradeHead: (head, gems) => client.rpc("upgrade_head", { head, fill_with_gems: !!gems, request_key: key() }),
    async claimDaily() {
      try { return await client.rpc("claim_daily"); } catch (e) { if (e.code === "already_claimed") return null; throw e; }
    },
    importLocal: profile => client.rpc("import_local", { local: profile }),
    setName: name => client.rpc("set_name", { new_name: name }),
    shop: () => client.rpc("shop"),
    async checkout(product) { const r = await client.fn("create-checkout", { product }); return r.url; },
  };
}
