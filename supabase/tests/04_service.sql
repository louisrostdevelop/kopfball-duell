-- Dienste: Käufe gutschreiben (doppelt = einmal), Erstattung, Wartung räumt auf
begin;
create function pg_temp.expect_error(stmt text, want text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ASSERT: kein Fehler bei: %', stmt;
exception when others then
  if sqlerrm like 'ASSERT:%' then raise; end if;
  if sqlstate <> want and sqlerrm <> want then raise exception 'ASSERT: falscher Fehler bei % -> % %', stmt, sqlstate, sqlerrm; end if;
end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare u uuid; old_guest uuid; buyer_guest uuid; r jsonb;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into u;
  set local role service_role;
  r := api.grant_purchase(u, 'stripe', 'cs_test_1', 'gems_550', 499, 'EUR');
  assert r ? 'purchase', 'Kauf gebucht';
  r := api.grant_purchase(u, 'stripe', 'cs_test_1', 'gems_550', 499, 'EUR');
  assert (r->>'duplicate')::boolean, 'Webhook doppelt: nur einmal';
  r := api.grant_purchase(u, 'stripe', 'cs_test_2', 'starter', 299, 'EUR');
  perform pg_temp.expect_error($q$select api.grant_purchase('$q$ || u || $q$', 'stripe', 'cs_test_3', 'starter', 299, 'EUR')$q$, 'already_owned');
  r := api.grant_purchase(u, 'stripe', 'cs_test_4', 'premium_pass', 499, 'EUR');
  reset role;
  assert (select gems from game.wallets where player_id = u) = 850, 'Juwelen 550 + 300';
  assert (select premium from game.pass_progress where player_id = u and season_id = game.current_season()), 'Premium-Pass aktiv';

  -- Erstattung: Juwelen zurück, soweit noch da
  perform game.book(u, 'gems', -500, 'test');
  set local role service_role;
  r := api.refund_purchase('stripe', 'cs_test_1');
  reset role;
  assert (r->>'clawedBack')::int = 350, 'nur vorhandene Juwelen zurückgeholt: ' || r::text;
  assert (select gems from game.wallets where player_id = u) = 0, 'Juwelen nie negativ';
  assert (select status from game.purchases where provider_ref = 'cs_test_1') = 'refunded', 'als erstattet markiert';

  -- Wartung
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into old_guest;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into buyer_guest;
  update game.players set last_seen_at = now() - interval '120 days' where id in (old_guest, buyer_guest);
  insert into game.purchases (player_id, provider, provider_ref, product_id, amount_cents, currency) values (buyer_guest, 'stripe', 'cs_guest', 'gems_100', 99, 'EUR');
  insert into game.match_queue (player_id, mode, mmr, head_id, seen_at) values (u, 'casual', 0, 'head:kalle', now() - interval '1 minute');
  insert into game.requests (player_id, key, created_at) values (u, 'old-request-key', now() - interval '3 days');
  r := game.maintenance();
  assert not exists (select 1 from auth.users where id = old_guest), 'alter Gast gelöscht';
  assert exists (select 1 from auth.users where id = buyer_guest), 'Gast mit Kauf bleibt';
  assert not exists (select 1 from game.players where id = old_guest), 'Spielerdaten mitgelöscht';
  assert not exists (select 1 from game.match_queue where player_id = u), 'verwaister Platz in der Warteschlange weg';
  assert not exists (select 1 from game.requests where key = 'old-request-key'), 'alte Doppelt-Schutz-Einträge weg';
end $$;
rollback;
