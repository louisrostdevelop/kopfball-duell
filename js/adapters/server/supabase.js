// Spiel-Server über Supabase: ruft die Funktionen aus supabase/migrations (Schema api) auf.
// Jede Anfrage, die etwas ändert, trägt einen Schlüssel: wiederholt (Netz weg, Tab zu) wird sie nur einmal gebucht.
// Spielmeldungen, die nicht ankommen (offline gespielt), warten im Browser (bis zu 60) und gehen der Reihe nach raus.
import { safeStorage } from "../storage/safe.js";
const PENDING = "kopfball-duell-pending";
const MAX_PENDING = 60;
// Fortlaufende Nummer je Anfrage, vergeben beim Absenden und am Ergebnis (und an dessen .state) vermerkt: app/account.js
// übernimmt einen Stand nur, wenn er nicht älter ist als der zuletzt übernommene (sonst überschreibt eine verspätete
// Antwort einen neueren Stand). read: reine Abfrage (me), ein verworfener Stand muss dann nicht nachgeholt werden.
export const REQ = Symbol.for("headstars.request");
let reqNo = 0;
const stamp = (r, info) => {
  for (const o of [r, r && r.state]) if (o && typeof o === "object" && !Array.isArray(o) && !(REQ in o)) Object.defineProperty(o, REQ, { value: info });
  return r;
};
const key = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

/** @returns {import("../../ports/server.js").GameServer} */
export function supabaseServer(client, storage = safeStorage()) {
  const load = () => { try { return JSON.parse(storage.getItem(PENDING) || "[]"); } catch (_) { return []; } };
  const store = l => { try { storage.setItem(PENDING, JSON.stringify(l.slice(-MAX_PENDING))); } catch (_) {} };
  const drop = k => store(load().filter(x => x.k !== k));
  // Server sagt nein: nicht wiederholen. Zu viele Anfragen (429) ist kein Nein, nur ein „später“.
  const rpc = (fn, args) => { const info = { n: ++reqNo, read: fn === "me" }; return client.rpc(fn, args).then(r => stamp(r, info)); };
  const final = e => e && e.status >= 400 && e.status < 500 && e.status !== 429 && !["rate_limited", "over_request_rate_limit"].includes(e.code);

  async function send(job) {
    try { const r = await rpc("report_cpu_match", { r: job.r, request_key: job.k }); drop(job.k); return r; }
    catch (e) { if (final(e)) drop(job.k); throw e; }
  }
  return {
    state: () => rpc("me"),
    reportMatch(r) { const job = { k: key(), r }; store([...load(), job]); return send(job); },
    pending: () => load().length,
    // Der Reihe nach (Karriere: Spiel 2 erst nach Spiel 1). Netz weg oder zu schnell: aufhören, später weiter
    async flush() {
      const out = { sent: 0, rejected: 0, results: [], left: 0 };
      for (const job of load()) {
        try { out.results.push(await send(job)); out.sent++; }
        catch (e) { if (final(e)) { out.rejected++; continue; } break; }
      }
      out.left = load().length;
      return out;
    },
    buy: (item, currency) => rpc("buy_item", { item, currency, request_key: key() }),
    upgradeHead: (head, gems) => rpc("upgrade_head", { head, fill_with_gems: !!gems, request_key: key() }),
    async claimDaily() {
      try { return await rpc("claim_daily"); } catch (e) { if (e.code === "already_claimed") return null; throw e; }
    },
    importLocal: profile => rpc("import_local", { local: profile }),
    setName: name => rpc("set_name", { new_name: name }),
    shop: () => rpc("shop"),
    deleteAccount: () => rpc("delete_account", { confirm: "DELETE" }),
    claimPass: (tier, premium) => rpc("claim_pass", { tier, premium }),
    buyPassWithGems: () => rpc("buy_pass_with_gems", { request_key: key() }),
    openChest: chest => rpc("open_chest", { chest }),
    craftItem: item => rpc("craft_item", { item, request_key: key() }),
    shardsToHeadXp: head => rpc("shards_to_head_xp", { head, request_key: key() }),
    // Online mit Warteschlange (Casual / Ranked)
    async queueJoin(mode, head, cos, version) {
      const args = { queue_mode: mode, head, cos: cos || null };
      if (version == null) return rpc("queue_join", args);
      try { return await rpc("queue_join", { ...args, client_version: version }); } catch (e) {
        // Server noch ohne client_version (PostgREST PGRST202 = 404, Funktion unbekannt): einmal ohne Version
        if (!e || e.status !== 404) throw e;
        return rpc("queue_join", args);
      }
    },
    queuePoll: () => rpc("queue_poll"),
    queueLeave: () => rpc("queue_leave"),
    activity: () => rpc("activity"),
    amAdmin: () => client.rpc("am_admin"),
    matchAbort: match => rpc("match_abort", { match }),
    matchStarted: match => rpc("match_started", { match }),
    reportOnline: (match, r) => rpc("report_match", { match, r }),
    matchStatus: match => rpc("match_status", { match }),
    rankedBoard: (n = 50) => rpc("ranked_board", { lim: n, offs: 0 }),
    myRankedRank: () => rpc("my_ranked_rank"),
    leaderboard: (board, n = 50) => rpc("leaderboard", { board, period: "all", lim: n, offs: 0 }),
    myRank: board => rpc("my_rank", { board, period: "all" }),
    around: (board, n = 3) => rpc("leaderboard_around", { board, period: "all", n }),
    submitScore: (board, score) => rpc("submit_score", { board, score }),
    friends: () => rpc("friends"),
    friendRequest: name => rpc("friend_request", { friend_name: name }),
    friendRemove: name => rpc("friend_remove", { friend_name: name }),
    track: (kind, data) => client.rpc("track", { kind, data: data || {} }),
    turn() { return client.fn("turn", {}); },
    async checkout(product, lang) { const r = await client.fn("create-checkout", { product, lang }); return r.url; },
  };
}
