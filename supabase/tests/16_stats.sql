-- Nutzungsstatistik (20261112120000_stats.sql): api.track prüft Art, Felder und Werte, begrenzt je Spieler, first_visit
-- und visit nur einmal; api.admin_stats nur für Admins mit gesichertem Konto, ohne Admins und Staff; Einmal-Links für
-- Staff; die Wartung fasst alte Ereignisse zu Tagessummen zusammen und löscht sie
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
-- erwartet genau diesen Fehler
create function pg_temp.fails(stmt text, want text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ASSERT: kein Fehler bei: %', stmt;
exception when others then
  if sqlerrm like 'ASSERT:%' then raise; end if;
  if sqlerrm <> want then raise exception 'ASSERT: falscher Fehler bei % -> %', stmt, sqlerrm; end if;
end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

-- ---------- api.track ----------
do $$
declare a uuid; old uuid; r jsonb; ok int := 0; blocked boolean := false;
begin
  assert not has_function_privilege('anon', 'api.track(text, jsonb)', 'execute'), 'anon darf nicht melden';
  assert has_function_privilege('authenticated', 'api.track(text, jsonb)', 'execute'), 'angemeldet darf melden';
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into a;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into old;
  update game.players set created_at = now() - interval '3 days' where id = old;

  perform pg_temp.login(a);
  -- gültig, nur geprüfte Felder landen in der Tabelle
  r := api.track('match_start', '{"mode":"cpu"}');
  assert (r->>'stored')::boolean, 'match_start gespeichert';
  perform api.track('match_end', '{"mode":"career","done":true}');
  perform api.track('search_end', '{"mode":"ranked","outcome":"matched","wait_s":12.6}');
  perform api.track('net_result', '{"mode":"friends","path":"relay"}');
  perform api.track('lobby', '{"action":"created"}');
  perform api.track('abort', '{"mode":"casual","reason":"desync"}');
  -- abgelehnt: unbekannte Art, unbekanntes Feld, falscher Wert, fehlendes Pflichtfeld, freier Text, zu groß
  perform pg_temp.fails($q$select api.track('page_view', '{}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('match_start', '{"mode":"cpu","name":"x"}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('match_start', '{"mode":"hack"}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('match_start', '{}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('match_end', '{"mode":"cpu","done":"ja"}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('search_start', '{"mode":"friends"}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('search_end', '{"mode":"casual","outcome":"matched","wait_s":-1}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('search_end', '{"mode":"casual","outcome":"matched","wait_s":"5"}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('first_visit', '{"ref":"direct","src":"Max Mustermann"}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('first_visit', '{"ref":"evil.example"}')$q$, 'bad_event');
  perform pg_temp.fails($q$select api.track('lobby', '[1,2]')$q$, 'bad_event');
  perform pg_temp.fails(format('select api.track(%L, %L)', 'lobby', jsonb_build_object('action', repeat('x', 400))), 'bad_event');
  -- first_visit einmal je Konto
  r := api.track('first_visit', '{"ref":"reddit","src":"launch_post-1"}');
  assert (r->>'stored')::boolean, 'erster Besuch gespeichert';
  r := api.track('first_visit', '{"ref":"google"}');
  assert not (r->>'stored')::boolean, 'zweiter erster Besuch nicht gespeichert';
  -- visit einmal je Tag
  assert (api.track('visit', '{}')->>'stored')::boolean, 'Besuch gespeichert';
  assert not (api.track('visit', null)->>'stored')::boolean, 'zweiter Besuch am selben Tag nicht';
  perform pg_temp.logout();
  assert (select count(*) from game.events where player_id = a and kind = 'first_visit') = 1, 'genau ein erster Besuch';
  assert (select data from game.events where player_id = a and kind = 'first_visit') = '{"ref":"reddit","src":"launch_post-1"}', 'Herkunft gespeichert';
  assert (select data->>'wait_s' from game.events where player_id = a and kind = 'search_end') = '13', 'Wartezeit in ganzen Sekunden';
  assert (select count(*) from game.events where player_id = a) = 8, 'nur gültige Ereignisse gespeichert';

  -- altes Konto: erster Besuch zählt nicht (Herkunft wäre falsch)
  perform pg_temp.login(old);
  assert not (api.track('first_visit', '{"ref":"direct"}')->>'stored')::boolean, 'altes Konto: kein erster Besuch';
  perform pg_temp.logout();

  -- Grenze je Spieler
  perform pg_temp.login(old);
  for i in 1..300 loop
    begin perform api.track('match_start', '{"mode":"cpu"}'); ok := ok + 1;
    exception when others then assert sqlerrm = 'rate_limited', 'falscher Fehler: ' || sqlerrm; blocked := true; exit; end;
  end loop;
  perform pg_temp.logout();
  assert blocked and ok between 100 and 250, 'Grenze greift: ' || ok;
  raise notice 'track ok';
end $$;

-- ---------- Admin, Staff, Dashboard ----------
do $$
declare adm uuid; u1 uuid; u2 uuid; st uuid; g uuid; r jsonb; r0 jsonb; tok text; tok2 text; cpu jsonb;
begin
  foreach tok in array array['admin_stats(integer)', 'admin_staff_link()', 'staff_claim(text)'] loop
    assert not has_function_privilege('anon', 'api.' || tok, 'execute'), 'anon darf nicht: ' || tok;
  end loop;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into adm;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into u1;

  -- kein Admin: verboten; Admin mit Gast-Konto: auch verboten
  perform pg_temp.login(u1);
  perform pg_temp.fails('select api.admin_stats()', 'forbidden');
  perform pg_temp.fails('select api.admin_staff_link()', 'forbidden');
  perform pg_temp.logout();
  insert into game.admins (player_id) values (adm);
  update auth.users set is_anonymous = true where id = adm;
  perform pg_temp.login(adm); perform pg_temp.fails('select api.admin_stats()', 'forbidden'); perform pg_temp.logout();
  update auth.users set is_anonymous = false where id = adm;

  perform pg_temp.login(adm); r0 := api.admin_stats(30); perform pg_temp.logout();
  assert jsonb_array_length(r0->'series') = 30, 'eine Zeile je Tag';
  assert r0 ? 'kpi' and r0 ? 'retention' and r0 ? 'sources' and r0 ? 'funnel' and r0 ? 'modes' and r0 ? 'online', 'alle Teile da';
  perform pg_temp.login(adm); assert jsonb_array_length(api.admin_stats(1000)->'series') = 90, 'höchstens 90 Tage'; perform pg_temp.logout();

  -- Einmal-Link: ein Gast (frisches Gerät) zählt danach nicht mehr
  perform pg_temp.login(adm); tok := api.admin_staff_link()->>'token'; tok2 := api.admin_staff_link()->>'token'; perform pg_temp.logout();
  assert length(tok) >= 32 and tok <> tok2, 'zufälliger Link';
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into st;
  perform pg_temp.login(st);
  perform pg_temp.fails(format('select api.staff_claim(%L)', 'falsch'), 'bad_token');
  assert (api.staff_claim(tok)->>'ok')::boolean, 'Link eingelöst';
  perform pg_temp.fails(format('select api.staff_claim(%L)', tok), 'bad_token');   -- nur einmal
  perform pg_temp.logout();
  assert exists (select 1 from game.staff where player_id = st), 'als Staff vermerkt';
  -- abgelaufen: gilt nicht, die Wartung räumt ihn weg
  update game.staff_tokens set until = now() - interval '1 minute' where token = tok2;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into g;
  perform pg_temp.login(g); perform pg_temp.fails(format('select api.staff_claim(%L)', tok2), 'bad_token'); perform pg_temp.logout();
  perform game.maintenance();
  assert not exists (select 1 from game.staff_tokens where token = tok2), 'abgelaufener Link gelöscht';
  assert not exists (select 1 from game.staff where player_id = g), 'abgelaufener Link macht niemanden zu Staff';

  -- Zählen ohne Admin und Staff: neu angelegt sind (außer Admin und Staff) u1, g und u2
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into u2;
  perform pg_temp.login(u2); perform api.track('match_start', '{"mode":"cpu"}'); perform api.track('match_end', '{"mode":"cpu","done":true}');
  perform api.track('first_visit', '{"ref":"youtube","src":"clip7"}'); perform api.track('lobby', '{"action":"started"}'); perform pg_temp.logout();
  perform pg_temp.login(st); perform api.track('match_start', '{"mode":"cpu"}'); perform api.track('first_visit', '{"ref":"youtube","src":"clip7"}'); perform pg_temp.logout();
  perform pg_temp.login(adm); perform api.track('match_start', '{"mode":"cpu"}'); r := api.admin_stats(); perform pg_temp.logout();
  assert (r->'kpi'->'new'->>0)::int = (r0->'kpi'->'new'->>0)::int + 2, 'neue ohne Admin und Staff: ' || (r->'kpi'->>'new') || ' vorher ' || (r0->'kpi'->>'new');
  select m into cpu from jsonb_array_elements(r->'modes') m where m->>'mode' = 'cpu';
  assert (cpu->>'started')::int = coalesce((select (m->>'started')::int from jsonb_array_elements(r0->'modes') m where m->>'mode' = 'cpu'), 0) + 1, 'Spiele von Admin und Staff zählen nicht';
  assert (select (s->>'new')::int from jsonb_array_elements(r->'sources') s where s->>'src' = 'clip7') = 1, 'Herkunft ohne Staff';
  assert (select (s->>'played')::int from jsonb_array_elements(r->'sources') s where s->>'src' = 'clip7') = 1, 'gespielt';
  assert (r->'kpi'->'online'->>0)::int = (r0->'kpi'->'online'->>0)::int + 1, 'Freunde-Anpfiff zählt als Online-Spiel';
  assert (r->'funnel'->>'finished')::int >= 1 and (r->'funnel'->>'created')::int >= (r->'funnel'->>'started')::int, 'Trichter';
  assert r->>'since' is not null, 'Daten seit';
  raise notice 'Dashboard ok';
end $$;

-- ---------- Wartung: alte Ereignisse in Tagessummen ----------
do $$
declare a uuid; s uuid; x jsonb; d date := game.berlin_day(now() - interval '40 days');
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into a;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into s;
  insert into game.staff (player_id) values (s);
  delete from game.event_days where day = d;
  insert into game.events (player_id, kind, data, created_at) values
    (a, 'match_start', '{"mode":"cpu"}', now() - interval '40 days'),
    (a, 'match_start', '{"mode":"cpu"}', now() - interval '40 days'),
    (a, 'net_result', '{"mode":"ranked","path":"relay"}', now() - interval '40 days'),
    (a, 'visit', '{}', now() - interval '40 days'),
    (s, 'match_start', '{"mode":"cpu"}', now() - interval '40 days'),
    (a, 'match_start', '{"mode":"cpu"}', now() - interval '29 days');
  x := game.maintenance();
  assert (x->>'oldEvents')::int >= 5, 'alte Ereignisse gelöscht: ' || x;
  assert not exists (select 1 from game.events where created_at < now() - interval '30 days'), 'nichts Altes übrig';
  assert exists (select 1 from game.events where player_id = a and created_at > now() - interval '90 days'), 'jüngere bleiben';
  assert (select n from game.event_days where day = d and kind = 'match_start' and key = 'cpu') = 2, 'Tagessumme ohne Staff';
  assert (select n from game.event_days where day = d and kind = 'net_result' and key = 'ranked:relay') = 1, 'Schlüssel mit Weg';
  assert (select n from game.event_days where day = d and kind = 'visit' and key = '') = 1, 'ohne Schlüssel';
  -- zweiter Lauf zählt nichts doppelt
  perform game.maintenance();
  assert (select n from game.event_days where day = d and kind = 'match_start' and key = 'cpu') = 2, 'nicht doppelt';
  raise notice 'Wartung ok';
end $$;
rollback;
