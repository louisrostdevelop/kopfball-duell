-- Relay-Zugangsdaten (20261111120000_activity_turn.sql): api.turn_allowed begrenzt je Spieler, nur angemeldet
begin;
create function pg_temp.login(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, true); execute 'set local role authenticated'; end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare a uuid; b uuid; ok int := 0; blocked boolean := false;
begin
  assert not has_function_privilege('anon', 'api.turn_allowed()', 'execute'), 'anon darf nicht';
  assert has_function_privilege('authenticated', 'api.turn_allowed()', 'execute'), 'angemeldet darf';
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into a;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true) returning id into b;

  -- so lange erlaubt, bis die Grenze greift; dann rate_limited
  perform pg_temp.login(a);
  for i in 1..100 loop
    begin perform api.turn_allowed(); ok := ok + 1;
    exception when others then assert sqlerrm = 'rate_limited', 'falscher Fehler: ' || sqlerrm; blocked := true; exit; end;
  end loop;
  perform pg_temp.logout();
  assert blocked and ok >= 5, 'Grenze greift erst nach einigen Abrufen';

  -- je Spieler: B ist davon nicht betroffen
  perform pg_temp.login(b); perform api.turn_allowed(); perform pg_temp.logout();

  -- nach Ablauf des Fensters wieder erlaubt
  update game.rate_limits set window_start = now() - interval '2 hours' where player_id = a and action = 'turn';
  perform pg_temp.login(a); perform api.turn_allowed(); perform pg_temp.logout();
  raise notice 'Relay-Grenze ok';
end $$;
rollback;
