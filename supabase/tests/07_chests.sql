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
declare u uuid; v uuid; w uuid; r jsonb; c uuid; c5 uuid; n integer; i integer; s0 integer; it text;
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
  insert into game.inventory (player_id, item_id, source) select u, id, 'test' from game.items where kind in ('shoes', 'goalfx', 'emote', 'emoji') and rarity = 'selten' and active and meta->>'src' is distinct from 'mastery' on conflict do nothing;
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
  delete from game.inventory where player_id = u and item_id = 'goalfx:5';
  it := (select id from game.items where kind = 'shoes' and rarity = 'episch' and id not in (select item_id from game.inventory where player_id = u) limit 1);
  perform pg_temp.login(u);
  perform pg_temp.expect_error($q$select api.craft_item('head:max', 'craft-0001')$q$, 'not_craftable');
  perform pg_temp.expect_error($q$select api.craft_item('shoes:1', 'craft-0002')$q$, 'already_owned');
  r := api.craft_item(it, 'craft-0003');
  assert (r->>'shards')::int = 150 and (r->'state'->>'shards')::int = 10, 'hergestellt: ' || r::text;
  perform pg_temp.expect_error($q$select api.craft_item('goalfx:5', 'craft-0004')$q$, 'insufficient_funds');
  perform pg_temp.logout();

  -- Kosmetik in der Gegnersuche: nur Besessenes der passenden Art
  update game.players set level = 10 where id = u;
  delete from game.inventory where player_id = u and item_id in ('emoji:12', 'goalfx:8');   -- sicher nicht besessen (Kisten oben sind Zufall)
  insert into game.inventory (player_id, item_id, source) values (u, 'emoji:1', 'test'), (u, 'shoes:1', 'test') on conflict do nothing;
  perform pg_temp.login(u);
  perform api.queue_join('casual', 'head:kalle', '{"shoes": "shoes:1", "goalfx": "shoes:2", "frame": "goalfx:8", "emotes": ["GG", "emoji:1", "emoji:12", "x:y"]}');
  perform pg_temp.logout();
  r := (select cos from game.match_queue where player_id = u);
  perform pg_temp.login(u); perform api.queue_leave(); perform pg_temp.logout();
  assert r->>'shoes' = 'shoes:1' and r->'goalfx' is null and r->'frame' is null, 'nur Besessenes der passenden Art: ' || r::text;
  assert r->'emotes' = '["GG", "emoji:1"]'::jsonb, 'Emotes geprüft: ' || r::text;

  -- Weitere Quellen: alle Tagesaufgaben geschafft = Bronze (einmal am Tag)
  perform game.progress_tasks(v, '{"wins": 99, "goals": 99, "headGoals": 99, "supers": 99, "pus": 99, "stomps": 99, "online": 99, "hard": 99, "cupRound": 99}');
  perform game.progress_tasks(v, '{"wins": 99}');
  assert (select count(*) from game.chests where player_id = v and source = 'tasks' and tier = 'bronze') = 1, 'Tagesaufgaben-Kiste';

  -- Tages-Challenge gewonnen = Bronze (und 15 Juwelen), einmal am Tag
  update game.progress set cpu_credit = 1800 where player_id = v;
  perform pg_temp.login(v);
  r := api.report_cpu_match('{"mode":"daily","won":true,"goals":2,"conceded":0,"duration":60,"head":"head:kalle","diff":2}', 'daily-chest-1');
  perform pg_temp.logout();
  assert exists (select 1 from game.chests where player_id = v and source = 'challenge' and tier = 'bronze'), 'Challenge-Kiste';
  assert jsonb_array_length(r->'state'->'chests') >= 1, 'im Zustand';

  -- Wochenaufgaben: 5 Stück, "verschiedene Köpfe" zählt Köpfe, alle 5 = Silber-Kiste
  perform pg_temp.login(v); r := api.me(); perform pg_temp.logout();
  assert jsonb_array_length(r->'weekly'->'list') = 5 and r->'weekly'->>'week' = game.week(), 'Wochenaufgaben im Zustand: ' || (r->'weekly')::text;
  perform game.progress_weekly(v, '{"wins": 1}', 'head:kalle');
  perform game.progress_weekly(v, '{}', 'head:kalle');
  assert ((select weekly from game.progress where player_id = v)->'heads') = '["head:kalle"]'::jsonb, 'Köpfe einmal gezählt';
  perform game.progress_weekly(v, '{"wins": 99, "goals": 99, "career": 99, "supers": 99, "online": 99, "clean": 99, "headGoals": 99}', 'head:yuki');
  perform game.progress_weekly(v, '{}', 'head:bolt');
  assert not exists (select 1 from jsonb_array_elements((select weekly from game.progress where player_id = v)->'list') x where not (x->>'done')::boolean), 'alle 5 geschafft';
  assert (select count(*) from game.chests where player_id = v and source = 'weekly' and tier = 'silver') = 1, 'Wochen-Kiste';
  assert (select count(*) from game.ledger where player_id = v and reason = 'weekly') = 5, '5 Belohnungen';

  -- Erfolgs-Stufen: 600 Tore = Stufe 1 (Bronze) und 2 (Silber)
  update game.progress set stats = stats || '{"goals": 600}' where player_id = v;
  perform game.grant_achievements(v, '{}');
  assert (select string_agg(tier, ',' order by tier) from game.chests where player_id = v and source = 'ach' and ref like 'goals%') = 'bronze,silver', 'Erfolgs-Kisten';
  -- Siege-Erfolg Stufe 1 gibt die Bronze-Medaille als Rahmen (einmal)
  update game.progress set stats = stats || '{"wins": 30}' where player_id = v;
  perform game.grant_achievements(v, '{}');
  perform game.grant_achievements(v, '{}');
  assert (select count(*) from game.inventory where player_id = v and item_id = 'frame:medal-bronze') = 1, 'Bronze-Medaille';
  assert not exists (select 1 from game.inventory where player_id = v and item_id = 'frame:medal-silver'), 'Silber erst ab 250 Siegen';

  -- Meisterschaft: Stufen nacheinander, Belohnung je Stufe einmal, Kisten bei 3 und 5, nicht herstellbar, nicht aus Kisten
  update game.heads set games = 4, wins = 0, goals = 0, supers = 0, mastery = 0 where player_id = v and head_id = 'head:kalle';
  r := game.progress_mastery(v, 'head:kalle', false, 0, 0);
  assert r = '[]'::jsonb, 'noch nicht: ' || r::text;
  update game.heads set games = 5 where player_id = v and head_id = 'head:kalle';
  r := game.progress_mastery(v, 'head:kalle', true, 30, 0);
  assert jsonb_array_length(r) = 1 and r->0->>'item' = 'title:fan-kalle', 'Stufe 1: ' || r::text;
  update game.heads set wins = 60, goals = 100, supers = 20 where player_id = v and head_id = 'head:kalle';
  r := game.progress_mastery(v, 'head:kalle', false, 0, 0);
  assert jsonb_array_length(r) = 4 and r->3->>'item' = 'title:master-kalle', 'Stufen 2-5 auf einmal: ' || r::text;
  assert (select mastery from game.heads where player_id = v and head_id = 'head:kalle') = 5;
  assert (select string_agg(tier, ',' order by tier) from game.chests where player_id = v and source = 'mastery') = 'gold,silver', 'Kisten bei 3 und 5';
  assert (select count(*) from game.inventory where player_id = v and item_id in ('title:fan-kalle', 'frame:m-kalle', 'emote:m-kalle', 'goalfx:m-kalle', 'title:master-kalle')) = 5, 'alle 5 Belohnungen';
  assert game.progress_mastery(v, 'head:kalle', true, 5, 5) = '[]'::jsonb, 'nichts doppelt';
  perform pg_temp.login(u);
  perform pg_temp.expect_error($q$select api.craft_item('goalfx:m-yuki', 'craft-0009')$q$, 'not_craftable');
  perform pg_temp.logout();

  -- Kosmetik im Shop: nur das Wochenangebot (6 Stück, im Zustand), Legendäres erst ab Level 10
  perform pg_temp.login(v); r := api.me(); perform pg_temp.logout();
  assert jsonb_array_length(r->'offer') = 6, 'Wochenangebot im Zustand: ' || (r->'offer')::text;
  perform game.book(v, 'coins', 5000, 'test');
  update game.players set level = 4 where id = v;
  -- ein Gegenstand außerhalb des Angebots
  it := (select id from game.items where kind = 'shoes' and not (id = any(game.cos_offer())) and id not in (select item_id from game.inventory where player_id = v) limit 1);
  perform pg_temp.login(v);
  perform pg_temp.expect_error(format('select api.buy_item(%L, ''coins'', ''cos-buy-0002'')', it), 'not_in_offer');
  perform pg_temp.logout();
  it := (select x from unnest(game.cos_offer()) x join game.items i on i.id = x where i.rarity <> 'legend' and x not in (select item_id from game.inventory where player_id = v) limit 1);
  if it is not null then
    perform pg_temp.login(v); r := api.buy_item(it, 'coins', 'cos-buy-0003'); perform pg_temp.logout();
    assert exists (select 1 from game.inventory where player_id = v and item_id = it), 'Angebot gekauft';
  end if;

  -- Saisonende: Kiste nach Liga (mind. 5 Spiele), einmal; Pass-Stufe mit Kiste
  insert into game.seasons (id, starts_at, ends_at, pass) values (900, now() - interval '60 days', now() - interval '30 days', '[]');
  insert into game.ratings (player_id, season_id, mmr, games, wins) values (u, 900, 1300, 20, 12), (v, 900, 1800, 4, 4);
  -- u hat gegen 5 verschiedene Gegner gespielt; w hat 20 Spiele, aber nur gegen 2 Gegner (hochgespielt): nichts
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into w;
  insert into game.ratings (player_id, season_id, mmr, games, wins) values (w, 900, 2100, 20, 20);
  for i in 1..5 loop
    insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into c5;
    insert into game.matches (mode, season_id, p1, p2, status) values ('ranked', 900, u, c5, 'settled');
    if i <= 2 then insert into game.matches (mode, season_id, p1, p2, status) select 'ranked', 900, w, c5, 'settled' from generate_series(1, 10); end if;
  end loop;
  r := game.maintenance();
  assert not exists (select 1 from game.chests where player_id = w and source = 'season'), 'nur 2 verschiedene Gegner: keine Kiste';
  assert not exists (select 1 from game.inventory where player_id = w and item_id like 'frame:league-%'), 'nur 2 verschiedene Gegner: kein Rahmen';
  assert (select tier from game.chests where player_id = u and source = 'season' and ref = '900') = 'gold', 'Gold-Liga: Gold-Kiste';
  assert not exists (select 1 from game.chests where player_id = v and source = 'season'), 'zu wenige Spiele: keine';
  assert exists (select 1 from game.inventory where player_id = u and item_id = 'frame:league-gold'), 'Gold-Liga: Liga-Rahmen';
  assert not exists (select 1 from game.inventory where player_id = v and item_id like 'frame:league-%'), 'zu wenige Spiele: kein Rahmen';
  perform game.maintenance();
  assert (select count(*) from game.chests where player_id = u and source = 'season') = 1, 'nur einmal';
  perform game.give_reward(v, '{"chest": "bronze"}', 'pass_free', '1:2');
  perform game.give_reward(v, '{"chest": "bronze"}', 'pass_free', '1:2');
  assert (select count(*) from game.chests where player_id = v and source = 'pass_free') = 1, 'Pass-Kiste einmal';

  -- Ohne Anmeldung nichts
  perform pg_temp.expect_error(format('select api.open_chest(%L)', c), 'not_authenticated');
end $$;
rollback;
