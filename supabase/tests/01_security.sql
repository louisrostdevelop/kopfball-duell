-- Sicherheit: Clients kommen an keine Tabelle, nur an freigegebene Funktionen.
begin;
create function pg_temp.login(u uuid, r text default 'authenticated') returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(u::text, ''), true); execute format('set local role %I', r); end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;
-- erwartet einen Fehler mit diesem SQLSTATE bzw. dieser Meldung
create function pg_temp.expect_error(stmt text, want text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ASSERT: kein Fehler bei: %', stmt;
exception when others then
  if sqlerrm like 'ASSERT:%' then raise; end if;
  if sqlstate <> want and sqlerrm <> want then raise exception 'ASSERT: falscher Fehler bei % -> % %', stmt, sqlstate, sqlerrm; end if;
end $$;

-- Hilfen dürfen auch als Spieler laufen (Funktionen sind sonst standardmäßig gesperrt)
do $g$ begin execute format('grant execute on all functions in schema %I to public', pg_my_temp_schema()::regnamespace); end $g$;

do $$
declare t record; f record; u uuid; v uuid;
begin
  -- Struktur: jede Tabelle in game hat RLS, api hat keine Tabellen
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'game' and c.relkind = 'r' loop
    assert (select relrowsecurity from pg_class where oid = ('game.' || quote_ident(t.relname))::regclass), 'RLS fehlt: ' || t.relname;
  end loop;
  assert not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'api' and c.relkind in ('r', 'v', 'm')), 'Tabellen/Views in api';

  -- Jede Funktion in api und game: security definer (außer reinen Hilfen) mit festem search_path, keine PUBLIC-Ausführung
  for f in select p.oid, n.nspname, p.proname, p.prosecdef, p.proconfig, p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname in ('api', 'game') loop
    assert f.proconfig is not null and exists (select 1 from unnest(f.proconfig) c where c like 'search_path=%'), 'search_path fehlt: ' || f.nspname || '.' || f.proname;
    assert f.proacl is not null and not exists (select 1 from unnest(f.proacl) a where a::text like '=%'), 'PUBLIC darf ausführen: ' || f.nspname || '.' || f.proname;
    if f.nspname = 'api' then assert f.prosecdef, 'api-Funktion nicht security definer: ' || f.proname; end if;
  end loop;

  -- Keine Rechte auf Tabellen für anon/authenticated
  for t in select tablename from pg_tables where schemaname = 'game' loop
    assert not has_table_privilege('authenticated', 'game.' || quote_ident(t.tablename), 'select'), 'authenticated liest ' || t.tablename;
    assert not has_table_privilege('anon', 'game.' || quote_ident(t.tablename), 'select'), 'anon liest ' || t.tablename;
    assert not has_table_privilege('authenticated', 'game.' || quote_ident(t.tablename), 'insert,update,delete'), 'authenticated schreibt ' || t.tablename;
  end loop;
  assert not has_schema_privilege('authenticated', 'game', 'usage'), 'authenticated sieht Schema game';
  assert not has_schema_privilege('anon', 'game', 'usage'), 'anon sieht Schema game';

  -- Dienst-Funktionen sind für Spieler gesperrt
  assert not has_function_privilege('authenticated', 'api.grant_purchase(uuid, text, text, text, integer, text)', 'execute'), 'Spieler kann Käufe gutschreiben';
  assert not has_function_privilege('authenticated', 'api.settle_match(uuid, jsonb)', 'execute'), 'Spieler kann Spiele entscheiden';
  assert not has_function_privilege('authenticated', 'api.refund_purchase(text, text)', 'execute'), 'Spieler kann erstatten';
  assert not has_function_privilege('anon', 'api.me()', 'execute'), 'anon kann api.me';
  assert has_function_privilege('anon', 'api.leaderboard(text, text, integer, integer)', 'execute'), 'Bestenliste öffentlich';

  insert into auth.users (is_anonymous) values (true) returning id into u;
  insert into auth.users (is_anonymous) values (true) returning id into v;
  -- Als Spieler: direkter Tabellenzugriff scheitert
  perform pg_temp.login(u);
  perform pg_temp.expect_error('select * from game.wallets', '42501');
  perform pg_temp.expect_error('update game.wallets set coins = 999999', '42501');
  perform pg_temp.expect_error('select api.grant_purchase(auth.uid(), ''x'', ''y'', ''gems_100'', 99, ''EUR'')', '42501');
  perform pg_temp.expect_error('select game.book(auth.uid(), ''coins'', 1000, ''hack'')', '42501');
  -- Eigener Zustand ja, und nur der eigene
  assert (api.me()->>'id')::uuid = u, 'api.me liefert eigenen Spieler';
  perform pg_temp.logout();
  -- Ohne Anmeldung
  perform pg_temp.login(null, 'anon');
  perform pg_temp.expect_error('select api.me()', '42501');
  perform api.leaderboard('endless', 'all', 10, 0);
  perform pg_temp.logout();
  -- Angemeldet, aber ohne Nutzer-ID im Token
  perform pg_temp.login(null);
  perform pg_temp.expect_error('select api.me()', 'not_authenticated');
  perform pg_temp.logout();
end $$;
rollback;
