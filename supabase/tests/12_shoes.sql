-- Migration 20261110130000_shoes.sql: Schuhe immer im Shop, Wochenangebot ohne Schuhe
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
create function pg_temp.expect_error(stmt text, want text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ASSERT: kein Fehler bei: %', stmt;
exception when others then
  if sqlerrm like 'ASSERT:%' then raise; end if;
  if sqlstate <> want and sqlerrm <> want then raise exception 'ASSERT: falscher Fehler bei % -> % %', stmt, sqlstate, sqlerrm; end if;
end $$;
-- als Spieler kaufen
create function pg_temp.buy(u uuid, item text, cur text, k text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.login(u); r := api.buy_item(item, cur, k); perform pg_temp.logout();
  return r;
end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare u uuid; r jsonb; c0 integer; g0 integer; off text[] := game.cos_offer(); it text;
begin
  -- ---------- 1. Wochenangebot: 6 Stück, keine Schuhe, nichts aus der Meisterschaft ----------
  assert cardinality(off) = 6, 'Wochenangebot 6: ' || off::text;
  assert not exists (select 1 from game.items i where i.id = any(off) and (i.kind not in ('goalfx', 'emote', 'emoji') or i.meta->>'src' = 'mastery')), 'nur Torexplosion, Emote, Emoji: ' || off::text;
  assert (select count(*) from game.items where kind = 'shoes' and active) = 10, '10 Schuhe im Katalog';

  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into u;
  perform pg_temp.login(u); r := api.me(); perform pg_temp.logout();
  assert not exists (select 1 from jsonb_array_elements_text(r->'offer') x where x like 'shoes:%'), 'Zustand: Angebot ohne Schuhe';
  perform game.book(u, 'coins', 5000, 'test'); perform game.book(u, 'gems', 1000, 'test');
  update game.players set level = 1 where id = u;

  -- ---------- 2. Schuhe immer kaufbar, Preis nach Seltenheit, Level-Sperre wie Kosmetik ----------
  select coins, gems into c0, g0 from game.wallets where player_id = u;
  r := pg_temp.buy(u, 'shoes:1', 'coins', 'shoe-buy-0001');
  assert r->>'item' = 'shoes:1' and (r->>'price')::int = 150, 'selten 150 Münzen: ' || r::text;
  assert exists (select 1 from game.inventory where player_id = u and item_id = 'shoes:1'), 'Schuh im Besitz';
  assert (select coins from game.wallets where player_id = u) = c0 - 150, 'Münzen abgebucht';
  assert pg_temp.buy(u, 'shoes:1', 'coins', 'shoe-buy-0001') = r, 'gleicher Schlüssel: gleiche Antwort';
  perform pg_temp.login(u);
  perform pg_temp.expect_error($q$select api.buy_item('shoes:1', 'coins', 'shoe-buy-0002')$q$, 'already_owned');
  perform pg_temp.expect_error($q$select api.buy_item('shoes:6', 'coins', 'shoe-buy-0003')$q$, 'level_required');
  perform pg_temp.expect_error($q$select api.buy_item('shoes:10', 'gems', 'shoe-buy-0004')$q$, 'level_required');
  perform pg_temp.logout();
  update game.players set level = 5 where id = u;
  r := pg_temp.buy(u, 'shoes:6', 'gems', 'shoe-buy-0005');
  assert (r->>'price')::int = 150 and r->>'currency' = 'gems', 'episch 150 Juwelen: ' || r::text;
  assert (select gems from game.wallets where player_id = u) = g0 - 150, 'Juwelen abgebucht';
  perform pg_temp.login(u);
  perform pg_temp.expect_error($q$select api.buy_item('shoes:10', 'coins', 'shoe-buy-0006')$q$, 'level_required');
  perform pg_temp.logout();
  update game.players set level = 10 where id = u;
  r := pg_temp.buy(u, 'shoes:10', 'coins', 'shoe-buy-0007');
  assert (r->>'price')::int = 900, 'legendär 900 Münzen: ' || r::text;
  -- zu wenig Geld
  update game.wallets set coins = 10 where player_id = u;
  perform pg_temp.login(u);
  perform pg_temp.expect_error($q$select api.buy_item('shoes:2', 'coins', 'shoe-buy-0008')$q$, 'insufficient_funds');
  perform pg_temp.logout();
  assert not exists (select 1 from game.inventory where player_id = u and item_id = 'shoes:2'), 'nichts gegeben';

  -- ---------- 3. Übrige Kosmetik weiter nur im Wochenangebot ----------
  update game.wallets set coins = 5000 where player_id = u;
  it := (select id from game.items where kind in ('goalfx', 'emote', 'emoji') and active and meta->>'src' is distinct from 'mastery' and not (id = any(off)) limit 1);
  perform pg_temp.login(u);
  perform pg_temp.expect_error(format('select api.buy_item(%L, ''coins'', ''shoe-buy-0009'')', it), 'not_in_offer');
  perform pg_temp.logout();
  it := (select x from unnest(off) x where x not in (select item_id from game.inventory where player_id = u) limit 1);
  r := pg_temp.buy(u, it, 'coins', 'shoe-buy-0010');
  assert exists (select 1 from game.inventory where player_id = u and item_id = it), 'Angebot weiter kaufbar';

  -- ---------- 4. Ohne Anmeldung nichts ----------
  perform pg_temp.expect_error($q$select api.buy_item('shoes:3', 'coins', 'shoe-buy-0011')$q$, 'not_authenticated');
  raise notice 'Schuhe ok';
end $$;
rollback;
