-- Verbindungs-Check: Spiel vor dem Anpfiff abbrechen, dasselbe Paar wird eine Weile nicht wieder gepaart
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
declare a uuid; b uuid; c uuid; ma jsonb; mb jsonb; mc jsonb; m uuid; r jsonb;
begin
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into a;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into b;
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false) returning id into c;
  update game.players set level = 5 where id in (a, b, c);

  -- A und B werden gepaart
  perform pg_temp.login(a); perform api.queue_join('casual', 'head:kalle'); perform pg_temp.logout();
  perform pg_temp.login(b); perform api.queue_join('casual', 'head:kalle'); mb := api.queue_poll(); perform pg_temp.logout();
  assert (mb->>'matched')::boolean, 'gepaart';
  m := (mb->>'match')::uuid;

  -- Fremde dürfen nicht abbrechen
  perform pg_temp.login(c);
  perform pg_temp.expect_error(format('select api.match_abort(%L)', m), 'unknown_match');
  perform pg_temp.logout();

  -- Host bricht ab (schlechte Verbindung): Spiel ungültig, beide aus der Warteschlange; der Gast darf auch noch
  perform pg_temp.login(a); r := api.match_abort(m); perform pg_temp.logout();
  assert r->>'status' = 'void', 'abgebrochen';
  assert (select status from game.matches where id = m) = 'void', 'Spiel ungültig';
  assert not exists (select 1 from game.match_queue where player_id in (a, b)), 'beide aus der Warteschlange';
  perform pg_temp.login(b); r := api.match_abort(m); perform pg_temp.logout();
  assert r->>'status' = 'void', 'zweiter Abbruch schadet nicht';

  -- Beide suchen neu: nicht wieder miteinander, aber mit jemand Neuem
  perform pg_temp.login(a); perform api.queue_join('casual', 'head:kalle'); perform pg_temp.logout();
  perform pg_temp.login(b); perform api.queue_join('casual', 'head:kalle'); mb := api.queue_poll(); perform pg_temp.logout();
  assert not (mb->>'matched')::boolean, 'dasselbe Paar nicht sofort wieder';
  perform pg_temp.login(c); perform api.queue_join('casual', 'head:kalle'); mc := api.queue_poll(); perform pg_temp.logout();
  assert (mc->>'matched')::boolean, 'mit jemand anderem klappt es';
  perform pg_temp.login(a); ma := api.queue_poll(); perform pg_temp.logout();
  assert ma->>'match' = mc->>'match', 'A spielt gegen C';

  -- Nach Ablauf der Sperre geht es wieder
  update game.mm_avoid set until = now() - interval '1 second';
  assert not game.avoids(a, b), 'Sperre abgelaufen';

  -- Zu spät: nach dem Melden oder lange nach dem Paaren kein Abbruch mehr
  m := (mc->>'match')::uuid;
  update game.matches set created_at = now() - interval '5 minutes' where id = m;
  perform pg_temp.login(c);
  perform pg_temp.expect_error(format('select api.match_abort(%L)', m), 'too_late');
  perform pg_temp.logout();
end $$;
rollback;
