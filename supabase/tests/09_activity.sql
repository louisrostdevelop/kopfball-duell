-- Aktivität: Zählt suchende (je Modus, nur frisch), spielende und aktive Spieler; nur für angemeldete Clients
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare a uuid; b uuid; c uuid; r0 jsonb; r jsonb;
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
  assert (r->>'active')::int >= 3, 'aktive Spieler';

  -- Veraltete Suche zählt nicht
  update game.match_queue set seen_at = now() - interval '1 minute' where player_id = a;
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'casual')::int = (r0->>'casual')::int, 'alte Suche nicht gezählt';

  -- Gepaart: zwei spielen, keiner sucht mehr
  update game.match_queue set seen_at = now() where player_id = a;
  perform pg_temp.login(b); perform api.queue_join('casual', 'head:kalle'); r := api.queue_poll(); perform pg_temp.logout();
  assert (r->>'matched')::boolean, 'gepaart';
  perform pg_temp.login(c); r := api.activity(); perform pg_temp.logout();
  assert (r->>'casual')::int = (r0->>'casual')::int, 'Gepaarte suchen nicht mehr';
  assert (r->>'playing')::int = (r0->>'playing')::int + 2, 'zwei spielen';
  raise notice 'Aktivität ok';
end $$;
rollback;
