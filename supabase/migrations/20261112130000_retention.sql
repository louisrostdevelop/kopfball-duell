-- =====================================================================================
-- Aufbewahrung kürzer: Nutzungsereignisse 30 Tage (danach nur Tagessummen ohne Spielerbezug), Protokoll von pg_cron
-- 7 Tage. Sonst wie 20261112120000_stats.sql.
-- =====================================================================================

create or replace function game.maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer := 0; c integer; d integer; e integer; f integer; g integer; h integer; ev integer; se integer; m record; rep jsonb; side integer;
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
              and game.desync_of(coalesce(report1, report2)) is null
            order by created_at limit 200 for update skip locked loop
    side := case when m.report1 is not null then 1 else 2 end; rep := coalesce(m.report1, m.report2);
    perform game.settle(m.id, rep->'score', case when (rep->>'forfeit')::boolean then side end);
    b := b + 1;
  end loop;
  -- einseitig „nicht synchron“ gemeldet (die andere Seite meldet nichts): verfällt (keine Wertung, keine Aufgabe)
  update game.matches set status = 'void', settled_at = now()
   where status = 'open' and (report1 is null) <> (report2 is null) and game.desync_of(coalesce(report1, report2)) is not null
     and coalesce(report1->>'at', report2->>'at')::timestamptz < now() - make_interval(secs => game.cfg_int('forfeit_after_secs'));
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
  -- Nutzungsereignisse älter als 30 Tage: in Tagessummen (ohne Spieler) übernehmen und löschen, 20000 pro Lauf.
  -- Löschen und Zählen in einer Anweisung: nichts wird doppelt oder gar nicht gezählt. Admins und Staff zählen nicht.
  with gone as (
    delete from game.events where id in (select id from game.events where created_at < now() - interval '30 days' order by id limit 20000)
    returning player_id, kind, data, created_at),
  sums as (
    select game.berlin_day(created_at) as day, kind,
           coalesce(case kind when 'first_visit' then coalesce(data->>'src', data->>'ref')
                              when 'match_end' then (data->>'mode') || ':' || (data->>'done')
                              when 'search_end' then (data->>'mode') || ':' || (data->>'outcome')
                              when 'net_result' then (data->>'mode') || ':' || (data->>'path')
                              when 'lobby' then data->>'action'
                              when 'abort' then (data->>'mode') || ':' || (data->>'reason')
                              else data->>'mode' end, '') as key,
           count(*)::integer as n
      from gone where not game.stat_hidden(player_id) group by 1, 2, 3),
  ins as (
    insert into game.event_days as x (day, kind, key, n) select day, kind, key, n from sums
    on conflict (day, kind, key) do update set n = x.n + excluded.n)
  select count(*) into ev from gone;
  delete from game.staff_tokens where until < now();
  -- Protokoll von pg_cron (ein Eintrag je Lauf, pg_cron räumt es selbst nie auf): 7 Tage reichen zur Fehlersuche.
  -- Die lokale Test-Datenbank hat kein pg_cron.
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where end_time < now() - interval ''7 days''';
  end if;
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
  return jsonb_build_object('queue', a, 'oneSided', b, 'void', c, 'requests', d, 'guests', e, 'seasonChests', f, 'oldMatches', h, 'oldEvents', ev);
end $$;
