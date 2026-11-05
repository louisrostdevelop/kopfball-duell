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

-- ---------- Erstattung: Juwelen zurückbuchen (soweit noch vorhanden), Kauf markieren ----------
create or replace function api.refund_purchase(provider text, provider_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pu game.purchases; pr game.products; have bigint;
begin
  select * into pu from game.purchases where purchases.provider = refund_purchase.provider and purchases.provider_ref = refund_purchase.provider_ref for update;
  if pu.id is null or pu.status = 'refunded' then return jsonb_build_object('ok', false); end if;
  select * into pr from game.products where id = pu.product_id;
  select gems into have from game.wallets where player_id = pu.player_id for update;
  if pr.gems > 0 and least(have, pr.gems) > 0 then perform game.book(pu.player_id, 'gems', -least(have, pr.gems)::integer, 'refund', pu.id::text); end if;
  update game.purchases set status = 'refunded' where id = pu.id;
  return jsonb_build_object('ok', true, 'clawedBack', least(have, pr.gems));
end $$;

-- ---------- Wartung (alle 10 Minuten) ----------
create or replace function game.maintenance() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare a integer; b integer; c integer; d integer; e integer;
begin
  -- Warteschlange: wer seit 30 s nicht mehr fragt, ist weg
  delete from game.match_queue where seen_at < now() - interval '30 seconds' and match_id is null;
  get diagnostics a = row_count;
  delete from game.match_queue where enqueued_at < now() - interval '15 minutes';
  -- Spiele, bei denen nach 5 Minuten nur eine Seite gemeldet hat: zur Prüfung
  update game.matches set status = 'review'
   where status = 'open' and created_at < now() - interval '5 minutes' and (report1 is not null or report2 is not null);
  get diagnostics b = row_count;
  -- Spiele ganz ohne Meldung nach 30 Minuten: verfallen
  update game.matches set status = 'void', settled_at = now()
   where status = 'open' and created_at < now() - interval '30 minutes' and report1 is null and report2 is null;
  get diagnostics c = row_count;
  -- Doppelt-Schutz-Einträge nach 2 Tagen löschen, Zeitfenster nach 1 Tag
  delete from game.requests where created_at < now() - interval '2 days';
  get diagnostics d = row_count;
  delete from game.rate_limits where window_start < now() - interval '1 day';
  -- Tages-Bestenlisten älter als 30 Tage
  delete from game.scores where period <> 'all' and period < (current_date - 30)::text;
  -- Gäste ohne Konto, ohne Kauf, 90 Tage nicht da: löschen (hält die Datenbank klein)
  delete from auth.users u
   using game.players pl
   where pl.id = u.id and u.is_anonymous and pl.last_seen_at < now() - interval '90 days'
     and not exists (select 1 from game.purchases pu where pu.player_id = u.id);
  get diagnostics e = row_count;
  return jsonb_build_object('queue', a, 'review', b, 'void', c, 'requests', d, 'guests', e);
end $$;

-- Niemand außer ausdrücklich Berechtigten darf Funktionen ausführen
revoke execute on all functions in schema api, game from public;

grant execute on function api.grant_purchase(uuid, text, text, text, integer, text), api.refund_purchase(text, text) to service_role;
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
