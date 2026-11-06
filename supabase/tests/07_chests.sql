-- Kisten: Level-Up vergibt, Server würfelt, Garantien, doppelte -> Splitter / Kopf-XP, Herstellen
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
-- Kiste vergeben und gleich öffnen (als Spieler)
create function pg_temp.open_new(u uuid, t text, r text) returns jsonb language plpgsql as $$
declare c uuid; res jsonb;
begin
  c := game.grant_chest(u, t, 'test', r);
  perform pg_temp.login(u); res := api.open_chest(c); perform pg_temp.logout();
  return res->'result';
end $$;

do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare u uuid; v uuid; r jsonb; c uuid; c5 uuid; n integer; i integer; s0 integer; it text;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into u;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into v;

  -- Level 1 -> 6: fünf Kisten (2 sicher selten, 5 Silber sicher episch), XP-Kurve wie im Client
  perform game.add_xp(u, 120 + 180 + 240 + 300 + 360);
  assert (select level from game.players where id = u) = 6, 'Level 6';
  assert (select count(*) from game.chests where player_id = u and source = 'level') = 5, '5 Kisten';
  assert (select tier || ':' || coalesce(sure_head, '') from game.chests where player_id = u and ref = '5') = 'silver:episch', 'Level 5 = Silber mit epischem Kopf';
  perform game.add_xp(u, 0);
  -- Level 2 öffnen: neuer seltener Kopf
  c := (select id from game.chests where player_id = u and ref = '2');
  c5 := (select id from game.chests where player_id = u and ref = '5');
  perform pg_temp.login(u);
  r := api.open_chest(c);
  assert exists (select 1 from jsonb_array_elements(r->'result'->'items') x where x->>'id' like 'head:%' and x->>'rarity' = 'selten' and not (x->>'dup')::boolean), 'neuer seltener Kopf: ' || r::text;
  assert jsonb_array_length(r->'state'->'chests') = 4, 'noch 4 zu';
  -- zweimal öffnen = gleiches Ergebnis, nichts doppelt
  assert api.open_chest(c)->'result' = r->'result', 'gleiches Ergebnis';
  r := api.open_chest(c5);
  assert exists (select 1 from jsonb_array_elements(r->'result'->'items') x where x->>'id' like 'head:%' and x->>'rarity' = 'episch' and not (x->>'dup')::boolean), 'neuer epischer Kopf: ' || r::text;
  assert (api.me()->'pity'->>'head')::int = 0, 'Garantie-Zähler Kopf zurück';
  perform pg_temp.logout();
  assert (select count(*) from game.ledger where player_id = u and reason = 'chest') >= 2, 'Münzen gebucht';

  -- Fremde Kiste: gibt es nicht
  c := game.grant_chest(v, 'bronze', 'test', 'fremd');
  perform pg_temp.login(u);
  perform pg_temp.expect_error(format('select api.open_chest(%L)', c), 'unknown_chest');
  perform pg_temp.logout();

  -- Garantie Episch (10.) und Legendär (40.)
  update game.progress set pity = '{"epic": 9, "legend": 0, "head": 0, "legendHead": 0}' where player_id = u;
  r := pg_temp.open_new(u, 'bronze', 'p1');
  assert exists (select 1 from jsonb_array_elements(r->'items') x where x->>'rarity' in ('episch', 'legend')), '10. Kiste mind. Episch: ' || r::text;
  assert ((select pity from game.progress where player_id = u)->>'epic')::int = 0, 'Zähler zurück';
  update game.progress set pity = '{"epic": 0, "legend": 39, "head": 0, "legendHead": 0}' where player_id = u;
  r := pg_temp.open_new(u, 'bronze', 'p2');
  assert exists (select 1 from jsonb_array_elements(r->'items') x where x->>'rarity' = 'legend' and x->>'id' not like 'head:%'), '40. Kiste Legendär: ' || r::text;
  -- Garantie neuer Kopf (50.) und legendärer Kopf (90.)
  update game.progress set pity = '{"epic": 0, "legend": 0, "head": 49, "legendHead": 0}' where player_id = u;
  r := pg_temp.open_new(u, 'bronze', 'p3');
  assert exists (select 1 from jsonb_array_elements(r->'items') x where x->>'id' like 'head:%' and not (x->>'dup')::boolean), '50. Kiste neuer Kopf: ' || r::text;
  update game.progress set pity = '{"epic": 0, "legend": 0, "head": 0, "legendHead": 89}' where player_id = u;
  r := pg_temp.open_new(u, 'bronze', 'p4');
  assert exists (select 1 from jsonb_array_elements(r->'items') x where x->>'id' like 'head:%' and x->>'rarity' = 'legend' and not (x->>'dup')::boolean), '90. Kiste legendärer Kopf: ' || r::text;

  -- Legendär-Kiste: sicher ein Kopf, Juwelen
  r := pg_temp.open_new(u, 'legend', 'l1');
  assert (r->>'gems')::int = 30 and exists (select 1 from jsonb_array_elements(r->'items') x where x->>'id' like 'head:%'), 'Legendär-Kiste: ' || r::text;

  -- Doppelte Kosmetik -> Splitter (alle seltenen schon da, Bronze-Kiste immer mit Kosmetik)
  insert into game.inventory (player_id, item_id, source) select u, id, 'test' from game.items where kind in ('hat', 'shoes', 'goalfx', 'emote', 'emoji') and rarity = 'selten' on conflict do nothing;
  update game.chest_defs set cos_p = 1, head = '{}' where tier = 'bronze';
  update game.progress set pity = '{}' where player_id = u;
  s0 := (select shards from game.wallets where player_id = u);
  r := pg_temp.open_new(u, 'bronze', 'd1');
  assert (r->>'shards')::int = 10 and (select shards from game.wallets where player_id = u) = s0 + 10, 'Splitter: ' || r::text;
  -- Doppelter Kopf -> Kopf-XP
  update game.chest_defs set cos_p = 0, head = '{"selten": 1}' where tier = 'bronze';
  insert into game.inventory (player_id, item_id, source) select u, id, 'test' from game.items where kind = 'head' on conflict do nothing;
  insert into game.heads (player_id, head_id) select u, id from game.items where kind = 'head' on conflict do nothing;
  r := pg_temp.open_new(u, 'bronze', 'd2');
  assert (r->'items'->0->>'headXp')::int = 40, 'Kopf-XP: ' || r::text;
  assert (select xp from game.heads where player_id = u and head_id = r->'items'->0->>'id') >= 40, 'Kopf-XP gebucht';
  -- auf Level 10: Splitter statt XP
  update game.heads set level = 10 where player_id = u;
  r := pg_temp.open_new(u, 'bronze', 'd3');
  assert (r->'items'->0->>'shards')::int = 10, 'Kopf auf 10 -> Splitter: ' || r::text;

  -- Herstellen
  update game.wallets set shards = 160 where player_id = u;
  it := (select id from game.items where kind = 'shoes' and rarity = 'episch' and id not in (select item_id from game.inventory where player_id = u) limit 1);
  perform pg_temp.login(u);
  perform pg_temp.expect_error($q$select api.craft_item('head:max', 'craft-0001')$q$, 'not_craftable');
  perform pg_temp.expect_error($q$select api.craft_item('hat:1', 'craft-0002')$q$, 'already_owned');
  r := api.craft_item(it, 'craft-0003');
  assert (r->>'shards')::int = 150 and (r->'state'->>'shards')::int = 10, 'hergestellt: ' || r::text;
  perform pg_temp.expect_error($q$select api.craft_item('goalfx:5', 'craft-0004')$q$, 'insufficient_funds');
  perform pg_temp.logout();

  -- Kosmetik in der Gegnersuche: nur Besessenes der passenden Art
  update game.players set level = 10 where id = u;
  perform pg_temp.login(u);
  perform api.queue_join('casual', 'head:kalle', '{"hat": "hat:1", "shoes": "hat:2", "goalfx": "goalfx:8", "emotes": ["GG", "emoji:1", "emoji:12", "x:y"]}');
  perform pg_temp.logout();
  r := (select cos from game.match_queue where player_id = u);
  perform pg_temp.login(u); perform api.queue_leave(); perform pg_temp.logout();
  assert r->>'hat' = 'hat:1' and r->'shoes' is null and r->'goalfx' is null, 'nur Besessenes: ' || r::text;
  assert r->'emotes' = '["GG", "emoji:1"]'::jsonb, 'Emotes geprüft: ' || r::text;

  -- Ohne Anmeldung nichts
  perform pg_temp.expect_error(format('select api.open_chest(%L)', c), 'not_authenticated');
end $$;
rollback;
