-- Rahmen für die Spieler-Karte: Medaillen für Siege-Erfolge, Liga-Rahmen am Ranked-Saisonende.
-- Pass-Rahmen kommen über die Pass-Stufen ({"item": "frame:pass-..."}, siehe supabase/ops/new-season.sql).
-- Die Rahmen selbst stehen im Katalog (catalog.sql, aus js/content/cosmetics.js FRAMES).

alter table game.achievement_defs add column if not exists item text;

-- Erfolg mit Gegenstand (achievement_defs.item): legt ihn ins Inventar
create or replace function game.grant_achievements(p uuid, ids text[]) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare got jsonb := '[]'; a game.achievement_defs; ach jsonb; st jsonb; nheads integer;
begin
  select achievements, stats into ach, st from game.progress where player_id = p for update;
  select count(*) into nheads from game.heads where player_id = p;
  if nheads >= 6 then ids := array_append(ids, 'collector'); end if;
  for a in select * from game.achievement_defs where stat is not null loop
    if coalesce((st->>a.stat)::integer, 0) >= a.goal then ids := array_append(ids, a.id); end if;
  end loop;
  for a in select * from game.achievement_defs where id = any(ids) loop
    if not ach ? a.id then
      ach := ach || jsonb_build_object(a.id, now());
      perform game.book(p, 'coins', a.reward, 'achievement', a.id);
      if a.chest is not null then perform game.grant_chest(p, a.chest, 'ach', a.id); end if;
      if a.item is not null then perform game.give_item(p, a.item, 'ach'); end if;
      got := got || to_jsonb(a.id);
    end if;
  end loop;
  if jsonb_array_length(got) > 0 then update game.progress set achievements = ach where player_id = p; end if;
  return got;
end $$;

-- Saisonende: wie bisher Kiste nach Liga, zusätzlich der Liga-Rahmen
create or replace function game.maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer := 0; c integer; d integer; e integer; f integer; g integer; se integer; m record; rep jsonb; side integer;
begin
  -- Warteschlange: wer seit 30 s nicht mehr fragt, ist weg
  delete from game.match_queue where seen_at < now() - interval '30 seconds' and match_id is null;
  get diagnostics a = row_count;
  delete from game.match_queue where enqueued_at < now() - interval '15 minutes';
  -- Nur eine Seite hat gemeldet (die andere ist weg, Absturz oder Aufgeben): deren Meldung gilt.
  -- Hat sie "Gegner weg" gemeldet, gewinnt sie. So bringt Abhauen vor der Niederlage nichts.
  for m in select id, report1, report2 from game.matches
            where status = 'open' and (report1 is null) <> (report2 is null)
              and coalesce(report1->>'at', report2->>'at')::timestamptz < now() - make_interval(secs => game.cfg_int('forfeit_after_secs'))
            order by created_at limit 200 for update skip locked loop
    side := case when m.report1 is not null then 1 else 2 end; rep := coalesce(m.report1, m.report2);
    perform game.settle(m.id, rep->'score', case when (rep->>'forfeit')::boolean then side end);
    b := b + 1;
  end loop;
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
  -- Gäste ohne Konto, ohne Kauf, 90 Tage nicht da: löschen (hält die Datenbank klein).
  -- Höchstens 500 pro Lauf: alle 10 Minuten = 72.000 am Tag, ohne lange Sperren.
  delete from auth.users u where u.id in (
    select pl.id from game.players pl join auth.users au on au.id = pl.id
     where au.is_anonymous and pl.last_seen_at < now() - interval '90 days'
       and not exists (select 1 from game.purchases pu where pu.player_id = pl.id)
     limit 500);
  get diagnostics e = row_count;
  -- Saisonende: Ranked-Kiste nach erreichter Liga (wer mindestens 5 Spiele hatte), einmal pro Saison
  f := 0;
  for se in select id from game.seasons where ends_at < now() and rewarded_at is null order by id loop
    insert into game.chests (player_id, tier, source, ref)
    select r.player_id, case when r.mmr >= 1700 then 'legend' when r.mmr >= 1250 then 'gold' when r.mmr >= 1100 then 'silver' else 'bronze' end, 'season', se::text
      from game.ratings r where r.season_id = se and r.games >= 5
    on conflict (player_id, source, ref) do nothing;
    get diagnostics g = row_count; f := f + g;
    -- dazu der Rahmen der erreichten Liga (Grenzen wie LEAGUES in js/app/matchmaking.js)
    perform game.give_item(r.player_id, 'frame:league-' || case when r.mmr >= 2000 then 'legend' when r.mmr >= 1700 then 'diamond' when r.mmr >= 1450 then 'platinum'
                                                              when r.mmr >= 1250 then 'gold' when r.mmr >= 1100 then 'silver' else 'bronze' end, 'season')
      from game.ratings r where r.season_id = se and r.games >= 5;
    update game.seasons set rewarded_at = now() where id = se;
  end loop;
  return jsonb_build_object('queue', a, 'oneSided', b, 'void', c, 'requests', d, 'guests', e, 'seasonChests', f);
end $$;
