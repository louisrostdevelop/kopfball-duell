// Spiel-Server über Supabase: ruft die Funktionen aus supabase/migrations (Schema api) auf.
// Jede Anfrage, die etwas ändert, trägt einen Schlüssel: wiederholt (Netz weg, Tab zu) wird sie nur einmal gebucht.
// Spielmeldungen, die nicht ankommen (offline gespielt), warten im Browser (bis zu 60) und gehen der Reihe nach raus.
const PENDING = "kopfball-duell-pending";
const MAX_PENDING = 60;
const key = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 12));

/** @returns {import("../../ports/server.js").GameServer} */
export function supabaseServer(client, storage = globalThis.localStorage) {
  const load = () => { try { return JSON.parse(storage.getItem(PENDING) || "[]"); } catch (_) { return []; } };
  const store = l => { try { storage.setItem(PENDING, JSON.stringify(l.slice(-MAX_PENDING))); } catch (_) {} };
  const drop = k => store(load().filter(x => x.k !== k));
  const final = e => e && e.status >= 400 && e.status < 500 && e.code !== "rate_limited";   // Server sagt nein: nicht wiederholen

  async function send(job) {
    try { const r = await client.rpc("report_cpu_match", { r: job.r, request_key: job.k }); drop(job.k); return r; }
    catch (e) { if (final(e)) drop(job.k); throw e; }
  }
  return {
    state: () => client.rpc("me"),
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
    buy: (item, currency) => client.rpc("buy_item", { item, currency, request_key: key() }),
    upgradeHead: (head, gems) => client.rpc("upgrade_head", { head, fill_with_gems: !!gems, request_key: key() }),
    async claimDaily() {
      try { return await client.rpc("claim_daily"); } catch (e) { if (e.code === "already_claimed") return null; throw e; }
    },
    importLocal: profile => client.rpc("import_local", { local: profile }),
    setName: name => client.rpc("set_name", { new_name: name }),
    shop: () => client.rpc("shop"),
    deleteAccount: () => client.rpc("delete_account", { confirm: "DELETE" }),
    claimPass: (tier, premium) => client.rpc("claim_pass", { tier, premium }),
    buyPassWithGems: () => client.rpc("buy_pass_with_gems", { request_key: key() }),
    openChest: chest => client.rpc("open_chest", { chest }),
    craftItem: item => client.rpc("craft_item", { item, request_key: key() }),
    shardsToHeadXp: head => client.rpc("shards_to_head_xp", { head, request_key: key() }),
    // Online mit Warteschlange (Casual / Ranked)
    queueJoin: (mode, head, cos) => client.rpc("queue_join", { queue_mode: mode, head, cos: cos || null }),
    queuePoll: () => client.rpc("queue_poll"),
    queueLeave: () => client.rpc("queue_leave"),
    activity: () => client.rpc("activity"),
    matchAbort: match => client.rpc("match_abort", { match }),
    matchStarted: match => client.rpc("match_started", { match }),
    reportOnline: (match, r) => client.rpc("report_match", { match, r }),
    matchStatus: match => client.rpc("match_status", { match }),
    rankedBoard: (n = 50) => client.rpc("ranked_board", { lim: n, offs: 0 }),
    myRankedRank: () => client.rpc("my_ranked_rank"),
    leaderboard: (board, n = 50) => client.rpc("leaderboard", { board, period: "all", lim: n, offs: 0 }),
    myRank: board => client.rpc("my_rank", { board, period: "all" }),
    around: (board, n = 3) => client.rpc("leaderboard_around", { board, period: "all", n }),
    submitScore: (board, score) => client.rpc("submit_score", { board, score }),
    friends: () => client.rpc("friends"),
    friendRequest: name => client.rpc("friend_request", { friend_name: name }),
    friendRemove: name => client.rpc("friend_remove", { friend_name: name }),
    async checkout(product, lang) { const r = await client.fn("create-checkout", { product, lang }); return r.url; },
  };
}
