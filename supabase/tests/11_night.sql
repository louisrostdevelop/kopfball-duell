-- Migration 20261110120000_night.sql: Gegnersuche nach Version, Aufbewahrung alter Spiele, Gast-Import plausibel
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
create function pg_temp.player(anon boolean default false, lvl int default 5) returns uuid language plpgsql as $$
declare u uuid;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), anon) returning id into u;
  update game.players set level = lvl where id = u;
  return u;
end $$;
-- beitreten (ver null = alter Client ohne Version) und einmal suchen
create function pg_temp.join(u uuid, mode text, ver int) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  perform pg_temp.login(u);
  if ver is null then perform api.queue_join(mode, 'head:kalle'); else perform api.queue_join(mode, 'head:kalle', null, ver); end if;
  r := api.queue_poll();
  perform pg_temp.logout();
  return r;
end $$;
-- Gast anlegen und Spielstand importieren
create function pg_temp.import(loc jsonb) returns jsonb language plpgsql as $$
declare u uuid := pg_temp.player(true, 1); r jsonb;
begin
  perform pg_temp.login(u); r := api.import_local(loc); perform pg_temp.logout();
  return r;
end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

-- ---------- 1. Gegnersuche nur mit gleicher Version ----------
do $$
declare a uuid := pg_temp.player(); b uuid := pg_temp.player(); c uuid := pg_temp.player(); d uuid := pg_temp.player(); e uuid := pg_temp.player();
  x uuid := pg_temp.player(); y uuid := pg_temp.player(); z uuid := pg_temp.player(); w uuid := pg_temp.player(); r jsonb; r0 jsonb;
begin
  perform pg_temp.login(w); r0 := api.activity(); perform pg_temp.logout();
  r := pg_temp.join(a, 'casual', 12);
  assert not (r->>'matched')::boolean, 'allein';
  assert (select ver from game.match_queue where player_id = a) = 12, 'Version gespeichert';
  r := pg_temp.join(c, 'casual', 13);
  assert not (r->>'matched')::boolean, 'andere Version: nicht mit A gepaart';
  r := pg_temp.join(d, 'casual', null);
  assert not (r->>'matched')::boolean, 'ohne Version: nicht mit Versionierten gepaart';
  assert (select ver from game.match_queue where player_id = d) = 0, 'ohne Version = 0';
  -- Aktivität zählt alle Suchenden, egal welche Version
  perform pg_temp.login(w); r := api.activity(); perform pg_temp.logout();
  assert (r->>'casual')::int = (r0->>'casual')::int + 3, 'Aktivität zählt alle Versionen: ' || r::text;
  r := pg_temp.join(b, 'casual', 12);
  assert (r->>'matched')::boolean and (select p1 from game.matches where id = (r->>'match')::uuid) = a, 'gleiche Version gepaart (A hostet)';
  r := pg_temp.join(e, 'casual', null);
  assert (r->>'matched')::boolean and (select p1 from game.matches where id = (r->>'match')::uuid) = d, 'alte Clients untereinander';
  assert (select match_id from game.match_queue where player_id = c) is null, 'C wartet weiter';
  -- Ranked genauso
  r := pg_temp.join(x, 'ranked', 12);
  r := pg_temp.join(y, 'ranked', 13);
  assert not (r->>'matched')::boolean, 'Ranked: andere Version nicht gepaart';
  r := pg_temp.join(z, 'ranked', 12);
  assert (r->>'matched')::boolean and (select p1 from game.matches where id = (r->>'match')::uuid) = x, 'Ranked: gleiche Version gepaart';
  -- Neu beitreten mit anderer Version überschreibt die alte
  r := pg_temp.join(y, 'ranked', 12);
  assert (select ver from game.match_queue where player_id = y) = 12, 'Version beim erneuten Beitreten aktualisiert';
  -- Unsinnige Version
  perform pg_temp.login(c);
  perform pg_temp.expect_error($q$select api.queue_join('casual', 'head:kalle', null, 0)$q$, 'bad_version');
  perform pg_temp.expect_error($q$select api.queue_join('casual', 'head:kalle', null, -5)$q$, 'bad_version');
  perform pg_temp.logout();
  assert not has_function_privilege('anon', 'api.queue_join(text, text, jsonb, integer)', 'execute'), 'anon darf nicht';
  assert has_function_privilege('authenticated', 'api.queue_join(text, text, jsonb, integer)', 'execute'), 'angemeldet darf';
  assert not exists (select 1 from pg_proc where proname = 'queue_join' and pronargs = 3), 'alte Fassung entfernt';
  raise notice 'Version ok';
end $$;

-- ---------- 2. Aufbewahrung: alte Spiele löschen ----------
do $$
declare u uuid := pg_temp.player(); v uuid := pg_temp.player(); o uuid[] := '{}'; i int; r jsonb; recent uuid; old911 uuid; old_q uuid; n int;
begin
  for i in 1..5 loop o := o || pg_temp.player(); end loop;
  -- 910: lange vorbei, Kisten noch nicht vergeben; 911: vorbei und vergeben
  insert into game.seasons (id, starts_at, ends_at, pass, rewarded_at) values
    (910, now() - interval '15 months', now() - interval '14 months', '[]', null),
    (911, now() - interval '14 months', now() - interval '13 months', '[]', now() - interval '13 months');
  insert into game.ratings (player_id, season_id, mmr, games, wins) values (u, 910, 1300, 5, 3);
  -- u hat in 910 gegen 5 verschiedene Gegner gespielt (Spiele 14 Monate alt): Kiste braucht diese Spiele
  insert into game.matches (mode, season_id, p1, p2, status, created_at, settled_at)
  select 'ranked', 910, u, o[k], 'settled', now() - interval '14 months 1 day', now() - interval '14 months 1 day' from generate_series(1, 5) k;
  insert into game.matches (mode, season_id, p1, p2, status, created_at, settled_at)
  values ('ranked', 911, u, v, 'settled', now() - interval '13 months 1 day', now() - interval '13 months 1 day') returning id into old911;
  -- 5002 alte Casual-Spiele (mehr als ein Häppchen), ein junges
  insert into game.matches (mode, p1, p2, status, created_at, settled_at)
  select 'casual', u, v, case when k % 2 = 0 then 'settled' else 'void' end, now() - interval '13 months', now() - interval '13 months' from generate_series(1, 5002) k;
  insert into game.matches (mode, p1, p2, status, created_at, settled_at)
  values ('casual', v, u, 'settled', now() - interval '11 months', now() - interval '11 months') returning id into recent;
  -- Platz in der Warteschlange, der auf ein altes Spiel zeigt: Fremdschlüssel wird null, nichts blockiert
  select id into old_q from game.matches where p1 = u and mode = 'casual' and created_at < now() - interval '12 months' limit 1;
  insert into game.match_queue (player_id, mode, mmr, head_id, match_id) values (v, 'casual', 0, 'head:kalle', old_q);
  select count(*) into n from game.ledger;

  r := game.maintenance();
  assert (r->>'oldMatches')::int = 5000, 'ein Häppchen: ' || r::text;
  assert (select count(*) from game.matches where season_id = 910) = 5, 'Saison ohne Abrechnung: Spiele bleiben';
  assert exists (select 1 from game.chests where player_id = u and source = 'season' and ref = '910'), 'Saison-Kiste trotz alter Spiele';
  assert exists (select 1 from game.matches where id = recent), 'junges Spiel bleibt';
  r := game.maintenance();
  r := game.maintenance();
  assert not exists (select 1 from game.matches where p1 in (u, v) and created_at < now() - interval '12 months'), 'alle alten weg';
  assert not exists (select 1 from game.matches where id = old911), 'abgerechnete Saison: gelöscht';
  assert exists (select 1 from game.matches where id = recent), 'junges Spiel bleibt';
  assert (select mmr from game.ratings where player_id = u and season_id = 910) = 1300, 'Wertung bleibt';
  assert exists (select 1 from game.chests where player_id = u and source = 'season' and ref = '910'), 'Kiste bleibt';
  assert exists (select 1 from game.players where id = u) and exists (select 1 from game.progress where player_id = u), 'Spieler und Statistik bleiben';
  assert (select count(*) from game.ledger) >= n, 'Buchungen bleiben';
  assert not exists (select 1 from game.match_queue where player_id = v and match_id is not null), 'Warteschlange: Verweis gelöst';
  raise notice 'Aufbewahrung ok';
end $$;

-- ---------- 3. Gast-Import: Karriere lückenlos, Felder nur gültig ----------
do $$
declare u uuid; r jsonb; c0 bigint;
begin
  -- ehrlicher Stand: Liga 1 komplett, Liga 2 angefangen; Sterne als Zahl oder Text
  r := pg_temp.import('{"coins": 400, "career": {"district.0": 3, "district.1": 1, "district.2": "2", "district.3": 1, "district.4": 2, "regional.0": 1}}');
  assert (r->'career'->>'district.4')::int = 2 and (r->'career'->>'regional.0')::int = 1 and (r->'career'->>'district.2')::int = 2, 'ehrlich: alles übernommen ' || r::text;
  assert (r->>'coins')::int = 400, 'Münzen';
  assert (select career_paid from game.progress where player_id = (r->>'id')::uuid) = '{district}', 'komplette Liga ohne Bonus';

  -- Lücke: nach dem ersten Spiel ohne Sterne nichts mehr
  r := pg_temp.import('{"career": {"district.0": 3, "district.1": 1, "district.3": 3, "district.4": 3, "regional.0": 3}}');
  assert r->'career' = '{"district.0": 3, "district.1": 1}', 'nur bis zur Lücke: ' || (r->'career')::text;
  assert (select career_paid from game.progress where player_id = (r->>'id')::uuid) = '{}', 'unvollständige Liga: nicht als bezahlt markiert';

  -- spätere Liga ohne die vorige: nichts
  r := pg_temp.import('{"career": {"regional.0": 3, "regional.1": 3, "world.0": 3}}');
  assert r->'career' = '{}', 'spätere Liga allein: nichts';
  r := pg_temp.import('{"career": {"district.0": 0, "district.1": 3}}');
  assert r->'career' = '{}', '0 Sterne = Lücke';

  -- Server-Sterne zählen mit (Lücke lokal, auf dem Server gespielt), nie weniger als auf dem Server
  u := pg_temp.player(true, 1);
  update game.progress set career = '{"district.0": 2, "district.1": 3}' where player_id = u;
  perform pg_temp.login(u);
  r := api.import_local('{"career": {"district.0": 3, "district.1": 1, "district.2": 1, "district.4": 3}}');
  perform pg_temp.logout();
  assert r->'career' = '{"district.0": 3, "district.1": 3, "district.2": 1}', 'mit Server-Stand zusammen: ' || (r->'career')::text;

  -- Felder in falscher Form: kein Abbruch, nichts übernommen
  r := pg_temp.import('{"coins": "99999", "chars": "tank", "balls": {"a": 1}, "career": [1, 2], "name": 12345}');
  assert (r->>'coins')::int = 150 and r->'career' = '{}' and r->>'name' is null, 'falsche Form ignoriert: ' || r::text;
  r := pg_temp.import('[1, 2, 3]');
  assert (r->>'coins')::int = 150, 'kein Objekt: nichts';
  r := pg_temp.import('{"coins": 650.7}');
  assert (r->>'coins')::int = 650, 'Kommazahl abgerundet';
  r := pg_temp.import('{"coins": -500}');
  assert (r->>'coins')::int = 150, 'negativ: nichts abgezogen';

  -- Name wie api.set_name: Gültiges übernommen, Ungültiges still verworfen
  r := pg_temp.import('{"name": "Nacht_Eule"}');
  assert r->>'name' = 'Nacht_Eule', 'Name übernommen';
  r := pg_temp.import('{"name": "nacht_eule"}');
  assert r->>'name' is null, 'vergebener Name (Groß/Klein egal): verworfen';
  r := pg_temp.import('{"name": "Hallo Welt"}');
  assert r->>'name' is null, 'Leerzeichen: verworfen';
  r := pg_temp.import('{"name": "ab"}');
  assert r->>'name' is null, 'zu kurz: verworfen';
  raise notice 'Import ok';
end $$;
rollback;
