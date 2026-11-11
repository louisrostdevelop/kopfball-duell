-- =====================================================================================
-- Versionsabgleich in der Gegnersuche, Aufbewahrung, Gast-Import:
--  1. Gegnersuche nur mit gleicher App-Version (api.queue_join nimmt client_version; ohne = alte Clients, nur untereinander)
--  2. Aufbewahrung: abgerechnete/verfallene Spiele älter als 12 Monate löscht die Wartung (in Häppchen).
--     Käufe, Wertungen, Bestenlisten, Statistik und Kisten liegen in eigenen Tabellen und bleiben.
--     Ranked-Spiele erst, wenn ihre Saison abgerechnet ist (game.season_opponents braucht sie bis dahin).
--  3. Gast-Import: Karriere-Sterne nur lückenlos ab dem ersten Spiel, Zahlen und Felder nur in gültiger Form
-- =====================================================================================

-- ---------- 1. Version in der Warteschlange ----------
alter table game.match_queue add column if not exists ver integer not null default 0;   -- 0 = Client ohne Versionsangabe

drop function if exists api.queue_join(text, text, jsonb);
-- Wie 20261105120400_api_online.sql, dazu die Version (gepaart wird nur Gleiches)
create or replace function api.queue_join(queue_mode text, head text, cos jsonb default null, client_version integer default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); lvl integer; anon boolean; s integer := game.current_season(); disputes integer; last_dispute timestamptz;
begin
  perform game.limit_rate(p, 'queue_join', 20, interval '1 minute');
  if queue_mode not in ('ranked', 'casual') then perform game.fail('bad_mode'); end if;
  if client_version is not null and client_version not between 1 and 1000000 then perform game.fail('bad_version'); end if;
  select level into lvl from game.players where id = p;
  select is_anonymous into anon from auth.users where id = p;
  if queue_mode = 'ranked' then
    if coalesce(anon, true) then perform game.fail('account_required'); end if;
    if lvl < game.cfg_int('ranked_min_level') then perform game.fail('level_required', game.cfg_int('ranked_min_level')::text); end if;
    if s is null then perform game.fail('no_season'); end if;
    -- Viele strittige Spiele (beide haben gemeldet, Ergebnisse passen nicht zusammen): Ranked-Pause
    select count(*), max(created_at) into disputes, last_dispute from (
      select created_at, status, report1, report2 from game.matches where p1 = p and created_at > now() - interval '24 hours'
      union all
      select created_at, status, report1, report2 from game.matches where p2 = p and created_at > now() - interval '24 hours') x
     where status = 'disputed' or (status = 'void' and report1 is not null and report2 is not null);
    if disputes >= game.cfg_int('dispute_limit') and last_dispute > now() - make_interval(hours => game.cfg_int('dispute_cooldown_hours')) then
      perform game.fail('cooldown');
    end if;
  elsif lvl < game.cfg_int('casual_min_level') then perform game.fail('level_required', game.cfg_int('casual_min_level')::text);
  end if;
  if not exists (select 1 from game.heads where player_id = p and head_id = head) then perform game.fail('head_not_owned'); end if;
  insert into game.match_queue as q (player_id, mode, mmr, head_id, cos, ver)
  values (p, queue_mode, case when queue_mode = 'ranked' then game.rating_of(p, s) else 0 end, head, game.clean_cos(p, coalesce(cos, '{}')), coalesce(client_version, 0))
  on conflict (player_id) do update set mode = excluded.mode, mmr = excluded.mmr, head_id = excluded.head_id, cos = excluded.cos, ver = excluded.ver,
    enqueued_at = now(), seen_at = now(), match_id = null;
  return jsonb_build_object('queued', true);
end $$;

-- Wie 20261107120000_net_check.sql, dazu: nur gleiche Version (q.ver = me.ver)
create or replace function api.queue_poll() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); me game.match_queue; other game.match_queue; up game.match_queue; down game.match_queue; waited numeric; win integer; m uuid; s integer;
  h1 game.heads; h2 game.heads;
begin
  select * into me from game.match_queue where player_id = p for update;
  if me.player_id is null then perform game.fail('not_queued'); end if;
  if me.match_id is not null then return game.match_info(me.match_id, p); end if;
  -- Bremse ohne eigene Schreibzugriffe: höchstens alle 0,5 s suchen (seen_at wird ohnehin aktualisiert)
  if me.seen_at > now() - interval '500 milliseconds' and me.seen_at > me.enqueued_at then
    return jsonb_build_object('matched', false, 'waited', round(extract(epoch from now() - me.enqueued_at)));
  end if;
  update game.match_queue set seen_at = now() where player_id = p;
  waited := extract(epoch from now() - me.enqueued_at);
  win := case when me.mode = 'ranked' then least(600, 100 + (waited * 25)::integer) else 1000000 end;
  if me.mode = 'casual' then
    -- Casual: wer am längsten wartet (Index auf Wartezeit)
    select * into other from game.match_queue q
     where q.mode = 'casual' and q.match_id is null and q.player_id <> p and q.ver = me.ver and q.seen_at > now() - interval '10 seconds'
       and not game.avoids(p, q.player_id)
     order by q.enqueued_at limit 1 for update skip locked;
  else
    -- Ranked: nächster Gegner darüber und darunter über den Wertungs-Index, der nähere gewinnt
    select * into up from game.match_queue q
     where q.mode = 'ranked' and q.match_id is null and q.player_id <> p and q.ver = me.ver and q.mmr >= me.mmr and q.mmr <= me.mmr + win
       and q.seen_at > now() - interval '10 seconds' and not game.avoids(p, q.player_id)
     order by q.mmr limit 1 for update skip locked;
    select * into down from game.match_queue q
     where q.mode = 'ranked' and q.match_id is null and q.player_id <> p and q.ver = me.ver and q.mmr < me.mmr and q.mmr >= me.mmr - win
       and q.seen_at > now() - interval '10 seconds' and not game.avoids(p, q.player_id)
     order by q.mmr desc limit 1 for update skip locked;
    other := case when up.player_id is null then down when down.player_id is null then up
                  when up.mmr - me.mmr <= me.mmr - down.mmr then up else down end;
  end if;
  if other.player_id is null then return jsonb_build_object('matched', false, 'waited', round(waited)); end if;
  s := case when me.mode = 'ranked' then game.current_season() end;
  select * into h1 from game.heads where player_id = other.player_id and head_id = other.head_id;
  select * into h2 from game.heads where player_id = p and head_id = me.head_id;
  -- Wer länger wartet, hostet (hat meist die stabilere Verbindung schon offen)
  insert into game.matches (mode, season_id, p1, p2, heads)
  values (me.mode, s, other.player_id, p,
          jsonb_build_object('p1', jsonb_build_object('head', h1.head_id, 'level', h1.level, 'cos', other.cos),
                             'p2', jsonb_build_object('head', h2.head_id, 'level', h2.level, 'cos', me.cos)))
  returning id into m;
  update game.match_queue set match_id = m where player_id in (p, other.player_id);
  -- Der Wartende erfährt es sofort über seinen Kanal (sonst bei seiner nächsten Abfrage)
  perform game.notify('user:' || other.player_id, 'matched', jsonb_build_object('match', m));
  return game.match_info(m, p);
end $$;

-- ---------- 2. Aufbewahrung ----------
-- Fremdschlüssel auf game.matches: nur match_queue.match_id (on delete set null). Alles andere (ratings, ledger, chests,
-- scores, progress, purchases) hängt nicht an einzelnen Spielen. Eingabe-Protokolle im Storage (match-logs) bleiben.
-- Teilindex für das Löschen, damit die Wartung ohne Treffer nicht die ganze Tabelle liest
-- (ein BRIN-Index auf created_at wird vom Planer nicht genommen)
create index if not exists matches_done_time on game.matches (created_at) where status in ('settled', 'void');

-- Wie 20261109120000_review_fixes.sql, dazu: alte Spiele löschen (h)
create or replace function game.maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer := 0; c integer; d integer; e integer; f integer; g integer; h integer; se integer; m record; rep jsonb; side integer;
begin
  -- Warteschlange: wer seit 30 s nicht mehr fragt, ist weg
  delete from game.match_queue where seen_at < now() - interval '30 seconds' and match_id is null;
  get diagnostics a = row_count;
  delete from game.match_queue where enqueued_at < now() - interval '15 minutes';
  -- Nur eine Seite hat gemeldet (die andere ist weg, Absturz oder Aufgeben): deren Meldung gilt.
  -- Hat sie "Gegner weg" gemeldet, gewinnt sie. So bringt Abhauen vor der Niederlage nichts.
  -- Nur nach dem Anpfiff beider Seiten (sonst ließe sich melden, ohne je zu verbinden, und nach 3 min gewinnen)
  for m in select id, report1, report2 from game.matches
            where status = 'open' and (report1 is null) <> (report2 is null)
              and p1_started_at is not null and p2_started_at is not null
              and coalesce(report1->>'at', report2->>'at')::timestamptz < now() - make_interval(secs => game.cfg_int('forfeit_after_secs'))
            order by created_at limit 200 for update skip locked loop
    side := case when m.report1 is not null then 1 else 2 end; rep := coalesce(m.report1, m.report2);
    perform game.settle(m.id, rep->'score', case when (rep->>'forfeit')::boolean then side end);
    b := b + 1;
  end loop;
  -- einseitig gemeldet, aber nie von beiden angepfiffen: verfällt (keine Wertung)
  update game.matches set status = 'void', settled_at = now()
   where status = 'open' and (report1 is null) <> (report2 is null) and (p1_started_at is null or p2_started_at is null)
     and coalesce(report1->>'at', report2->>'at')::timestamptz < now() - make_interval(secs => game.cfg_int('forfeit_after_secs'));
  -- Strittige oder einseitige Spiele, die der Prüfdienst nach 24 h nicht entschieden hat: verfallen (keine Wertung)
  update game.matches set status = 'void', settled_at = now()
   where status in ('disputed', 'review') and created_at < now() - interval '24 hours';
  -- Spiele ganz ohne Meldung nach 30 Minuten: verfallen
  update game.matches set status = 'void', settled_at = now()
   where status = 'open' and created_at < now() - interval '30 minutes' and report1 is null and report2 is null;
  get diagnostics c = row_count;
  -- Doppelt-Schutz-Einträge nach 2 Tagen löschen, Zeitfenster nach 1 Tag
  delete from game.requests where ctid in (select ctid from game.requests where created_at < now() - interval '2 days' limit 5000);
  get diagnostics d = row_count;
  delete from game.rate_limits where window_start < now() - interval '1 day';
  -- Tages-Bestenlisten älter als 30 Tage (in Häppchen, damit nichts lange sperrt)
  delete from game.scores where ctid in (select ctid from game.scores where period <> 'all' and period < (game.today() - 30)::text limit 5000);
  delete from game.score_counts where period <> 'all' and period < (game.today() - 30)::text;
  -- Spiele älter als 12 Monate (abgerechnet oder verfallen), 5000 pro Lauf. Ranked erst nach dem Saisonende-Lauf unten
  -- (rewarded_at): der zählt die verschiedenen Gegner aus den Spielen. Wertung, Statistik, Käufe stehen woanders.
  delete from game.matches where ctid in (
    select x.ctid from game.matches x
     where x.created_at < now() - interval '12 months' and x.status in ('settled', 'void')
       and (x.season_id is null or exists (select 1 from game.seasons sn where sn.id = x.season_id and sn.rewarded_at is not null))
     limit 5000);
  get diagnostics h = row_count;
  -- Gäste ohne Konto, ohne Kauf, 90 Tage nicht da: löschen (hält die Datenbank klein).
  -- Höchstens 500 pro Lauf: alle 10 Minuten = 72.000 am Tag, ohne lange Sperren.
  delete from auth.users u where u.id in (
    select pl.id from game.players pl join auth.users au on au.id = pl.id
     where au.is_anonymous and pl.last_seen_at < now() - interval '90 days'
       and not exists (select 1 from game.purchases pu where pu.player_id = pl.id)
     limit 500);
  get diagnostics e = row_count;
  -- Saisonende: Ranked-Kiste nach erreichter Liga (wer mindestens 5 Spiele gegen mindestens 5 verschiedene Gegner hatte:
  -- hochgespielte Zweitkonten bringen so wenig), einmal pro Saison
  f := 0;
  for se in select id from game.seasons where ends_at < now() and rewarded_at is null order by id loop
    insert into game.chests (player_id, tier, source, ref)
    select r.player_id, case when r.mmr >= 1700 then 'legend' when r.mmr >= 1250 then 'gold' when r.mmr >= 1100 then 'silver' else 'bronze' end, 'season', se::text
      from game.ratings r where r.season_id = se and r.games >= 5 and game.season_opponents(r.player_id, se) >= 5
    on conflict (player_id, source, ref) do nothing;
    get diagnostics g = row_count; f := f + g;
    -- dazu der Rahmen der erreichten Liga (Grenzen wie LEAGUES in js/app/matchmaking.js)
    perform game.give_item(r.player_id, 'frame:league-' || case when r.mmr >= 2000 then 'legend' when r.mmr >= 1700 then 'diamond' when r.mmr >= 1450 then 'platinum'
                                                              when r.mmr >= 1250 then 'gold' when r.mmr >= 1100 then 'silver' else 'bronze' end, 'season')
      from game.ratings r where r.season_id = se and r.games >= 5 and game.season_opponents(r.player_id, se) >= 5;
    update game.seasons set rewarded_at = now() where id = se;
  end loop;
  return jsonb_build_object('queue', a, 'oneSided', b, 'void', c, 'requests', d, 'guests', e, 'seasonChests', f, 'oldMatches', h);
end $$;

-- ---------- 3. Gast-Import ----------
-- Wie 20261105120300_api_economy.sql. Neu:
--  - Karriere: Sterne nur lückenlos in Spielreihenfolge (Liga für Liga, Spiel für Spiel), wie das Spiel freischaltet;
--    Server-Sterne zählen mit (kein Spiel verliert Sterne). Nach der ersten Lücke wird nichts mehr übernommen.
--  - Münzen nur als Zahl (Text o. Ä.: 0 statt Abbruch), Listen nur als Listen, Name nur als Text (Prüfung wie api.set_name)
create or replace function api.import_local(local jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); it record; budget integer := game.cfg_int('import_coin_cap'); c integer; done boolean; born timestamptz;
  loc jsonb := case when jsonb_typeof(local) = 'object' then local else '{}' end; lc jsonb; srv_car jsonb; car jsonb := '{}'; got text[] := '{}';
  st record; srv integer; mine integer;
begin
  select pr.imported, pl.created_at, pr.career into done, born, srv_car from game.progress pr join game.players pl on pl.id = pr.player_id where pr.player_id = p for update of pr;
  if done then perform game.fail('already_imported'); end if;
  if born < now() - interval '24 hours' then perform game.fail('import_too_late'); end if;
  if octet_length(local::text) > 65536 then perform game.fail('too_large'); end if;
  for it in select i.id, i.price_coins from game.items i
             where i.active and i.price_coins is not null and i.price_coins > 0
               and i.id in (select 'head:' || x from jsonb_array_elements_text(case when jsonb_typeof(loc->'chars') = 'array' then loc->'chars' else '[]' end) x
                            union select 'ball:' || x from jsonb_array_elements_text(case when jsonb_typeof(loc->'balls') = 'array' then loc->'balls' else '[]' end) x
                            union select 'arena:' || x from jsonb_array_elements_text(case when jsonb_typeof(loc->'arenas') = 'array' then loc->'arenas' else '[]' end) x)
               and not exists (select 1 from game.inventory v where v.player_id = p and v.item_id = i.id)
             order by i.price_coins loop
    exit when it.price_coins > budget;
    perform game.give_item(p, it.id, 'import');
    budget := budget - it.price_coins;
  end loop;
  -- Startguthaben hat das Server-Konto schon: nur was darüber hinaus lokal erspielt wurde, im Rest des Budgets
  c := case when jsonb_typeof(loc->'coins') = 'number' then least(greatest(floor((loc->>'coins')::numeric), 0), 1000000000)::integer else 0 end;
  c := least(greatest(c - game.cfg_int('start_coins'), 0), budget);
  perform game.book(p, 'coins', c, 'import');
  -- Karriere: Sterne 1-3 (Zahl oder Text wie bisher) in Spielreihenfolge, bis zum ersten Spiel ohne Sterne (lokal und Server)
  lc := case when jsonb_typeof(loc->'career') = 'object' then loc->'career' else '{}' end;
  for st in select s.id from game.career_stages s join game.career_leagues l on l.id = s.league order by l.ord, s.idx loop
    srv := case when (srv_car->>st.id) ~ '^[123]$' then (srv_car->>st.id)::integer else 0 end;
    mine := case when (lc->>st.id) ~ '^[123]$' then (lc->>st.id)::integer else 0 end;
    exit when srv = 0 and mine = 0;
    if mine > 0 then got := array_append(got, st.id); end if;
    if mine > srv then car := car || jsonb_build_object(st.id, mine); end if;
  end loop;
  -- schon komplette Ligen (lokal, im übernommenen Teil) bringen keinen Bonus mehr
  update game.progress pr set imported = true,
    career = pr.career || car,
    career_paid = array(select distinct unnest(pr.career_paid || array(select l.id from game.career_leagues l
                    where not exists (select 1 from game.career_stages x where x.league = l.id and not (x.id = any(got))))))
   where pr.player_id = p;
  if jsonb_typeof(loc->'name') = 'string' and loc->>'name' <> '' then
    begin perform api.set_name(left(loc->>'name', 16)); exception when others then null; end;
  end if;
  return game.state(p);
end $$;

revoke execute on all functions in schema api, game from public;
revoke all on function api.queue_join(text, text, jsonb, integer) from anon;
grant execute on function api.queue_join(text, text, jsonb, integer) to authenticated;
