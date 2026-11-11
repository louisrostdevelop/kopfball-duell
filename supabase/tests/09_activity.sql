-- Aktivität: Zählt suchende (je Modus, nur frisch), spielende (beide angepfiffen, noch nicht gemeldet) und andere
-- Spieler online (ohne den Aufrufer); nur für angemeldete Clients
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare a uuid; b uuid; c uuid; m uuid; n int; r0 jsonb; r jsonb;
begin
  assert not has_function_privilege('anon', 'api.activity()', 'execute'), 'anon darf nicht';
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into a;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into b;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into c;
  update game.players set level = 5 where id in (a, b, c);
  perform pg_temp.login(c); r0 := api.activity(); perform pg_temp.logout();

  -- A sucht Casual: einer mehr
  perform pg_temp.login(a); perform api.queue_join('casual', 'head:kalle'); perform pg_temp.logout();
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'casual')::int = (r0->>'casual')::int + 1, 'Casual-Suche gezählt';
  assert (r->>'ranked')::int = (r0->>'ranked')::int, 'Ranked unverändert';
  assert (r->>'active')::int >= 2, 'aktive Spieler';
  -- der Aufrufer zählt nicht mit: geht C offline, sieht C dieselbe Zahl, A eine weniger
  n := (r->>'active')::int;
  update game.players set last_seen_at = now() - interval '1 hour' where id = c;
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'active')::int = n, 'sich selbst nicht mitgezählt';
  perform pg_temp.login(a); r := api.activity(); perform pg_temp.logout();
  assert (r->>'active')::int = n - 1, 'C offline: einer weniger';
  update game.players set last_seen_at = now() where id = c;

  -- Veraltete Suche zählt nicht
  update game.match_queue set seen_at = now() - interval '1 minute' where player_id = a;
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'casual')::int = (r0->>'casual')::int, 'alte Suche nicht gezählt';

  -- Gepaart: zwei spielen, keiner sucht mehr
  update game.match_queue set seen_at = now() where player_id = a;
  perform pg_temp.login(b); perform api.queue_join('casual', 'head:kalle'); r := api.queue_poll(); perform pg_temp.logout();
  assert (r->>'matched')::boolean, 'gepaart';
  m := (r->>'match')::uuid;
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'casual')::int = (r0->>'casual')::int, 'Gepaarte suchen nicht mehr';
  -- noch nicht angepfiffen (Verbindung steht vielleicht nie): spielt nicht
  assert (r->>'playing')::int = (r0->>'playing')::int, 'nicht angepfiffen zählt nicht';
  perform pg_temp.login(a); perform api.match_started(m); perform pg_temp.logout();
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'playing')::int = (r0->>'playing')::int, 'nur einer angepfiffen zählt nicht';
  perform pg_temp.login(b); perform api.match_started(m); perform pg_temp.logout();
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'playing')::int = (r0->>'playing')::int + 2, 'zwei spielen';
  -- Ergebnis gemeldet: Spiel vorbei, auch wenn die Gegenseite noch nicht gemeldet hat
  update game.matches set report1 = '{}'::jsonb where id = m;
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'playing')::int = (r0->>'playing')::int, 'gemeldet zählt nicht';
  -- hängengeblieben (lange angepfiffen, nie gemeldet): zählt nicht
  update game.matches set report1 = null, p1_started_at = now() - interval '11 minutes', p2_started_at = now() - interval '11 minutes' where id = m;
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'playing')::int = (r0->>'playing')::int, 'alte Spiele zählen nicht';
  raise notice 'Aktivität ok';
end $$;
rollback;
