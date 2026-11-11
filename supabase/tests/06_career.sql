-- Karriere auf dem Server: Reihenfolge, Schwierigkeit, Sterne, Liga-Bonus genau einmal, Import ohne Bonus
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
create function pg_temp.sudo(q text) returns void language plpgsql security definer as $$ begin execute q; end $$;
create function pg_temp.stage_diff(stage text) returns int language sql security definer as $$ select diff from game.career_stages where id = stage $$;
-- Ein Karriere-Spiel melden (Schwierigkeit aus dem Katalog)
create function pg_temp.career(stage text, goals int, conceded int, k text) returns jsonb language plpgsql as $$
declare d int;
begin
  perform pg_temp.sudo('delete from game.rate_limits');
  d := pg_temp.stage_diff(stage);
  return api.report_cpu_match(jsonb_build_object('mode', 'career', 'stage', stage, 'won', goals > conceded, 'goals', goals, 'conceded', conceded,
    'duration', 60, 'head', 'head:kalle', 'diff', d), k);
end $$;

do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare u uuid; v uuid; r jsonb; c0 bigint; i integer;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into u;
  assert (select count(*) from game.career_stages) = 20 and (select count(*) from game.career_leagues) = 4, 'Katalog eingespielt';
  perform pg_temp.login(u);

  -- Falsche Schwierigkeit oder unbekanntes Spiel: abgelehnt
  perform pg_temp.expect_error($q$select api.report_cpu_match('{"mode":"career","stage":"district.0","won":true,"goals":2,"conceded":0,"duration":60,"head":"head:kalle","diff":3}', 'car-bad-01')$q$, 'implausible');
  perform pg_temp.expect_error($q$select api.report_cpu_match('{"mode":"career","stage":"nope.9","won":true,"goals":2,"conceded":0,"duration":60,"head":"head:kalle","diff":1}', 'car-bad-02')$q$, 'implausible');

  -- Spiel 2 vor Spiel 1: gewertet wie ein normales Spiel, aber keine Sterne
  r := pg_temp.career('district.1', 2, 0, 'car-skip-01');
  assert not (r->'career'->>'open')::boolean and (r->'state'->'career') = '{}'::jsonb and (r->>'coins')::int > 0, 'gesperrt: ' || r::text;

  -- Spiel 1: knapp gewonnen = 1 Stern, dann zu null = 3, verlieren nimmt nichts weg
  r := pg_temp.career('district.0', 2, 1, 'car-a-0001');
  assert (r->'career'->>'stars')::int = 1 and (r->'state'->'career'->>'district.0')::int = 1, 'ein Stern: ' || r::text;
  r := pg_temp.career('district.0', 3, 0, 'car-a-0002');
  r := pg_temp.career('district.0', 0, 4, 'car-a-0003');
  assert (r->'state'->'career'->>'district.0')::int = 3, 'drei Sterne bleiben';

  -- Liga durchspielen: Bonus genau einmal
  perform pg_temp.logout(); c0 := (select coins from game.wallets where player_id = u); perform pg_temp.login(u);
  for i in 1..3 loop r := pg_temp.career('district.' || i, 2, 1, 'car-b-000' || i); assert r->'career'->'bonus' is null, 'noch kein Bonus'; end loop;
  r := pg_temp.career('district.4', 2, 1, 'car-b-0004');
  assert r->'career'->'bonus'->>'league' = 'district' and (r->'career'->'bonus'->>'coins')::int = 200, 'Bonus: ' || r::text;
  r := pg_temp.career('district.4', 3, 0, 'car-b-0005');
  assert r->'career'->'bonus' is null, 'Bonus nur einmal';
  perform pg_temp.logout();
  assert (select count(*) from game.ledger where player_id = u and reason = 'career_league') = 1, 'eine Bonus-Buchung';
  assert (select tier from game.chests where player_id = u and source = 'career' and ref = 'district') = 'silver', 'Kiste für die Liga';
  assert (select coins from game.wallets where player_id = u) > c0 + 200, 'Münzen gebucht';

  -- Nächste Liga ist jetzt offen
  perform pg_temp.login(u);
  r := pg_temp.career('regional.0', 2, 0, 'car-c-0001');
  assert (r->'career'->>'open')::boolean, 'Landesliga offen';
  -- Wiederholte Anfrage (Netz): gleiche Antwort, keine zweite Buchung
  r := pg_temp.career('regional.0', 2, 0, 'car-c-0001');
  perform pg_temp.logout();
  assert (select count(*) from game.ledger where player_id = u and reason = 'match_career' and ref = 'car-c-0001') = 1, 'einmal gebucht';
  -- Zustand enthält die Karriere (für andere Geräte)
  perform pg_temp.login(u);
  assert (api.me()->'career'->>'regional.0')::int = 3, 'im vollen Zustand';
  perform pg_temp.logout();

  -- Tagesgrenze erreicht: keine Münzen, aber Sterne und Bonus zählen trotzdem
  update game.progress set cap_matches = 80, cap_day = game.today() where player_id = u;
  update game.progress set career = career || '{"regional.1":1,"regional.2":1,"regional.3":1}' where player_id = u;
  perform pg_temp.login(u);
  r := pg_temp.career('regional.4', 1, 0, 'car-d-0001');
  assert (r->>'capReached')::boolean and (r->>'coins')::int = 0 and (r->'career'->'bonus'->>'coins')::int = 350, 'Bonus trotz Tagesgrenze: ' || r::text;
  perform pg_temp.logout();

  -- Import: Sterne übernommen, komplette Ligen ohne Bonus
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into v;
  perform pg_temp.login(v);
  r := api.import_local('{"coins": 150, "career": {"district.0": 3, "district.1": 1, "district.2": 2, "district.3": 1, "district.4": 1, "regional.0": 9, "x.y": 3}}');
  assert (r->'career'->>'district.2')::int = 2 and r->'career'->'regional.0' is null and r->'career'->'x.y' is null, 'nur Gültiges: ' || r::text;
  r := pg_temp.career('district.4', 3, 0, 'car-e-0001');
  assert r->'career'->'bonus' is null, 'importierte Liga bringt keinen Bonus';
  r := pg_temp.career('regional.0', 2, 1, 'car-e-0002');
  assert (r->'career'->>'open')::boolean, 'nach Import ist die nächste Liga offen';
  perform pg_temp.logout();
end $$;
rollback;
