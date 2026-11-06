-- =====================================================================================
-- Nur für Server-Dienste (Service-Schlüssel): Käufe gutschreiben, Erstattungen, Aufräumen.
-- Dazu Regeln für Realtime-Kanäle (Matchmaking-Signal) und regelmäßige Wartung.
-- =====================================================================================

-- ---------- Kauf gutschreiben (vom Zahlungs-Webhook, doppelt ausgeführt = einmal gebucht) ----------
create or replace function api.grant_purchase(player uuid, provider text, provider_ref text, product text, amount_cents integer, currency text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pr game.products; pid uuid; it text; s integer;
begin
  select * into pr from game.products where id = product;
  if pr.id is null then perform game.fail('unknown_product'); end if;
  if amount_cents < pr.price_cents or upper(currency) <> upper(pr.currency) then perform game.fail('amount_mismatch'); end if;
  -- Käufe eines Spielers nacheinander: sonst kommen zwei Webhooks für ein Einmal-Paket gleichzeitig durch die Prüfung
  perform 1 from game.wallets where player_id = player for update;
  if pr.once_per_player and exists (select 1 from game.purchases where player_id = player and product_id = product and status = 'paid') then
    perform game.fail('already_owned');
  end if;
  insert into game.purchases (player_id, provider, provider_ref, product_id, amount_cents, currency)
  values (player, grant_purchase.provider, grant_purchase.provider_ref, product, amount_cents, currency)
  on conflict on constraint purchases_provider_provider_ref_key do nothing returning id into pid;
  if pid is null then return jsonb_build_object('duplicate', true); end if;
  if pr.gems > 0 then perform game.book(player, 'gems', pr.gems, 'purchase', pid::text); end if;
  foreach it in array pr.items loop
    if it = 'premium_pass' then
      s := game.current_season();
      if s is not null then
        insert into game.pass_progress as pp (player_id, season_id, premium) values (player, s, true)
        on conflict (player_id, season_id) do update set premium = true;
      end if;
    else
      perform game.give_item(player, it, 'purchase');
    end if;
  end loop;
  return jsonb_build_object('purchase', pid);
end $$;

-- ---------- Shop: Echtgeld-Produkte; "buyable" sagt, ob der Aufrufer es (noch) kaufen kann ----------
-- Gäste sehen die Preise, kaufen geht nur mit verknüpftem Konto. create-checkout prüft genau hiermit.
create or replace function api.shop() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'gems', p.gems, 'items', p.items, 'priceCents', p.price_cents, 'currency', p.currency,
    'buyable', auth.uid() is not null
      and not coalesce((select u.is_anonymous from auth.users u where u.id = auth.uid()), true)
      and not (p.once_per_player and exists (select 1 from game.purchases x where x.player_id = auth.uid() and x.product_id = p.id and x.status = 'paid'))
  ) order by p.price_cents), '[]')
  from game.products p where p.active
$$;

-- ---------- Erstattung: Juwelen zurückbuchen (soweit noch vorhanden), Kauf markieren ----------
-- Erstattung oder Rückbuchung: alles zurück, was der Kauf gebracht hat.
--  - Juwelen: so viele wie noch da sind, der Rest wird Schuld (neue Juwelen tilgen sie zuerst)
--  - Gegenstände aus dem Produkt und der Premium-Pass werden entzogen
--  - das Konto wird markiert (chargebacks), zum Prüfen bei Wiederholung
create or replace function api.refund_purchase(provider text, provider_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pu game.purchases; pr game.products; have bigint; back bigint; debt bigint := 0; it text; s integer;
begin
  select * into pu from game.purchases where purchases.provider = refund_purchase.provider and purchases.provider_ref = refund_purchase.provider_ref for update;
  if pu.id is null or pu.status = 'refunded' then return jsonb_build_object('ok', false); end if;
  select * into pr from game.products where id = pu.product_id;
  select gems into have from game.wallets where player_id = pu.player_id for update;
  back := least(have, pr.gems);
  if back > 0 then perform game.book(pu.player_id, 'gems', -back::integer, 'refund', pu.id::text); end if;
  debt := pr.gems - back;
  if debt > 0 then update game.wallets set gem_debt = gem_debt + debt where player_id = pu.player_id; end if;
  foreach it in array pr.items loop
    if it = 'premium_pass' then
      s := (select g.season_id from game.pass_progress g where g.player_id = pu.player_id and g.premium order by g.season_id desc limit 1);
      update game.pass_progress set premium = false where player_id = pu.player_id and season_id = s;
    else
      delete from game.inventory where player_id = pu.player_id and item_id = it and source = 'purchase';
    end if;
  end loop;
  update game.players set chargebacks = chargebacks + 1 where id = pu.player_id;
  update game.purchases set status = 'refunded' where id = pu.id;
  return jsonb_build_object('ok', true, 'clawedBack', back, 'debt', debt);
end $$;

-- ---------- Wartung (alle 10 Minuten) ----------
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

-- Niemand außer ausdrücklich Berechtigten darf Funktionen ausführen
revoke execute on all functions in schema api, game from public;

-- Zähler für "Mein Rang" aus den Einträgen neu aufbauen (nach Importen oder falls je etwas auseinanderläuft)
create or replace function game.rebuild_score_counts() returns integer
language plpgsql security definer set search_path = '' as $$
declare k integer;
begin
  lock table game.score_counts in exclusive mode;
  delete from game.score_counts;
  insert into game.score_counts (board, period, score, n) select board, period, score, count(*) from game.scores group by 1, 2, 3;
  get diagnostics k = row_count;
  return k;
end $$;

grant execute on function api.grant_purchase(uuid, text, text, text, integer, text), api.refund_purchase(text, text) to service_role;
grant execute on function game.rebuild_score_counts() to service_role;
grant execute on function api.shop() to anon, authenticated, service_role;
grant execute on function game.maintenance() to service_role;

-- ---------- Regelmäßig ausführen (pg_cron gibt es auf Supabase; lokal ohne Docker evtl. nicht) ----------
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.unschedule(jobid) from cron.job where jobname = 'kopfball-maintenance';
    perform cron.schedule('kopfball-maintenance', '*/10 * * * *', 'select game.maintenance()');
  end if;
end $$;

-- ---------- Realtime: private Kanäle nur für Berechtigte ----------
-- match:<id>  nur die beiden Spieler dieses Spiels (Verbindungsaufbau, Emotes)
-- user:<id>   nur der Spieler selbst (Einladungen, Freundesanfragen)
create or replace function api.can_use_channel(topic text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); mid uuid;
begin
  if u is null or topic is null then return false; end if;
  if topic = 'user:' || u::text then return true; end if;
  if topic like 'match:%' then
    begin mid := substr(topic, 7)::uuid; exception when others then return false; end;
    return exists (select 1 from game.matches m where m.id = mid and u in (m.p1, m.p2) and m.status = 'open');
  end if;
  return false;
end $$;
grant execute on function api.can_use_channel(text) to authenticated;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'realtime' and table_name = 'messages') then
    execute $p$ drop policy if exists "kopfball: eigene Kanäle lesen" on realtime.messages $p$;
    execute $p$ drop policy if exists "kopfball: eigene Kanäle senden" on realtime.messages $p$;
    execute $p$
      create policy "kopfball: eigene Kanäle lesen" on realtime.messages for select to authenticated using (
        api.can_use_channel(realtime.topic())
      ) $p$;
    execute $p$
      create policy "kopfball: eigene Kanäle senden" on realtime.messages for insert to authenticated with check (
        api.can_use_channel(realtime.topic())
      ) $p$;
  end if;
end $$;


revoke execute on all functions in schema api, game from public;

-- ---------- Storage: Eingabe-Protokolle von Online-Spielen für die Nachprüfung ----------
-- Pfad: <Spiel-ID>/<Spieler-ID>.json. Hochladen darf nur ein Spieler dieses Spiels, und nur seine eigene Datei,
-- bis 1 Stunde nach Spielbeginn. Lesen darf nur der Prüfdienst (Service-Schlüssel).
create or replace function api.can_upload_log(object_name text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid(); parts text[] := string_to_array(object_name, '/'); mid uuid;
begin
  if u is null or array_length(parts, 1) <> 2 or parts[2] <> u::text || '.json' then return false; end if;
  begin mid := parts[1]::uuid; exception when others then return false; end;
  return exists (select 1 from game.matches m where m.id = mid and u in (m.p1, m.p2) and m.created_at > now() - interval '1 hour');
end $$;
grant execute on function api.can_upload_log(text) to authenticated;

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('match-logs', 'match-logs', false, 262144, array['application/json'])
    on conflict (id) do update set public = false, file_size_limit = 262144, allowed_mime_types = array['application/json'];
    execute $p$ drop policy if exists "kopfball: eigenes Spielprotokoll hochladen" on storage.objects $p$;
    execute $p$
      create policy "kopfball: eigenes Spielprotokoll hochladen" on storage.objects for insert to authenticated
      with check (bucket_id = 'match-logs' and api.can_upload_log(name)) $p$;
  end if;
end $$;

revoke execute on all functions in schema api, game from public;
