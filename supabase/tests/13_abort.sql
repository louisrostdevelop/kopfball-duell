-- Abbruch vor dem eigenen Anpfiff (20261110140000_abort.sql): Gast lehnt den Start des Hosts ab, nachdem der Host den
-- Anpfiff schon gemeldet hat
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
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare a uuid; b uuid; host uuid; guest uuid; mb jsonb; m uuid; r jsonb;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into a;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into b;
  update game.players set level = 5 where id in (a, b);

  perform pg_temp.login(a); perform api.queue_join('casual', 'head:kalle'); perform pg_temp.logout();
  perform pg_temp.login(b); perform api.queue_join('casual', 'head:kalle'); mb := api.queue_poll(); perform pg_temp.logout();
  assert (mb->>'matched')::boolean, 'gepaart';
  m := (mb->>'match')::uuid;
  select p1, p2 into host, guest from game.matches where id = m;

  -- Host pfeift an (meldet es), der Gast lehnt den Start ab: Abbruch geht, Spiel ungültig, Paar gesperrt
  perform pg_temp.login(host); r := api.match_started(m); perform pg_temp.logout();
  assert (select p1_started_at from game.matches where id = m) is not null, 'Anpfiff des Hosts gemeldet';
  perform pg_temp.login(host);
  perform pg_temp.expect_error(format('select api.match_abort(%L)', m), 'too_late');   -- Host selbst nicht mehr
  perform pg_temp.logout();
  perform pg_temp.login(guest); r := api.match_abort(m); perform pg_temp.logout();
  assert r->>'status' = 'void', 'Gast bricht ab';
  assert (select status from game.matches where id = m) = 'void', 'Spiel ungültig';
  assert game.avoids(a, b), 'Paar eine Weile gesperrt';

  -- Neues Spiel: beide haben angepfiffen, dann keiner mehr
  delete from game.mm_avoid;
  perform pg_temp.login(a); perform api.queue_join('casual', 'head:kalle'); perform pg_temp.logout();
  perform pg_temp.login(b); perform api.queue_join('casual', 'head:kalle'); mb := api.queue_poll(); perform pg_temp.logout();
  assert (mb->>'matched')::boolean, 'wieder gepaart';
  m := (mb->>'match')::uuid;
  perform pg_temp.login(a); perform api.match_started(m); perform pg_temp.logout();
  perform pg_temp.login(b); perform api.match_started(m); perform pg_temp.logout();
  perform pg_temp.login(a); perform pg_temp.expect_error(format('select api.match_abort(%L)', m), 'too_late'); perform pg_temp.logout();
  perform pg_temp.login(b); perform pg_temp.expect_error(format('select api.match_abort(%L)', m), 'too_late'); perform pg_temp.logout();
  assert (select status from game.matches where id = m) = 'open', 'läuft weiter';

  -- ohne eigenen Anpfiff, aber zu lange her: zu spät
  update game.matches set p2_started_at = null, created_at = now() - interval '5 minutes' where id = m;
  perform pg_temp.login((select p2 from game.matches where id = m));
  perform pg_temp.expect_error(format('select api.match_abort(%L)', m), 'too_late');
  perform pg_temp.logout();
end $$;
rollback;
