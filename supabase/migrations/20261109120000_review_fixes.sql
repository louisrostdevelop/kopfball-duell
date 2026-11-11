-- =====================================================================================
-- Korrekturen an Anpfiff, Kauf-Gutschrift, Erstattung und Wartung:
--  1. „Gegner weg“ (forfeit) nur nach einem Anpfiff, den beide Seiten gemeldet haben (Anpfiff je Seite gespeichert)
--  2. Kauf-Gutschrift: doppelte Stripe-Meldung zuerst erkennen
--  3. Erstattung nach Konto-Löschung bricht nicht mehr ab
--  4. Wartung: einseitige Meldung zählt nur nach dem Anpfiff beider Seiten (sonst verfällt das Spiel)
--  5. laufende Spiele beim Einspielen: Anpfiff je Seite aus dem alten started_at übernehmen
-- =====================================================================================

alter table game.matches add column if not exists p1_started_at timestamptz;
alter table game.matches add column if not exists p2_started_at timestamptz;
-- Spiele, die beim Einspielen laufen, hätten sonst keinen Anpfiff je Seite (ihr „Gegner weg“ würde abgelehnt)
update game.matches set p1_started_at = coalesce(p1_started_at, started_at), p2_started_at = coalesce(p2_started_at, started_at)
 where status = 'open' and started_at is not null and (p1_started_at is null or p2_started_at is null);

-- Anpfiff melden, jetzt je Seite (match_abort sieht weiter started_at)
create or replace function api.match_started(match uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me();
begin
  perform game.limit_rate(p, 'match_started', 30, interval '10 minutes');
  update game.matches set started_at = coalesce(started_at, now()),
         p1_started_at = case when p1 = p then coalesce(p1_started_at, now()) else p1_started_at end,
         p2_started_at = case when p2 = p then coalesce(p2_started_at, now()) else p2_started_at end
   where id = match and p in (p1, p2) and status = 'open';
  if not found then perform game.fail('unknown_match'); end if;
  return jsonb_build_object('status', 'started');
end $$;

-- Wie 20261105120400_api_online.sql, dazu die Anpfiff-Prüfung bei „Gegner weg“
create or replace function api.report_match(match uuid, r jsonb) returns jsonb
-- r: { score: [host, gast], duration: s, forfeit?: true (Gegner ist mitten im Spiel weg) }
-- Gewertet wird, wenn beide dasselbe melden; meldet nur einer, gilt seine Meldung nach forfeit_after_secs (Wartung).
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); mt game.matches; mine jsonb; theirs jsonb; side integer; dur integer := coalesce((r->>'duration')::integer, 0);
begin
  perform game.limit_rate(p, 'report_match', 10, interval '1 minute');
  if jsonb_typeof(r->'score') <> 'array' or jsonb_array_length(r->'score') <> 2 then perform game.fail('bad_report'); end if;
  if (r->'score'->>0)::integer not between 0 and 50 or (r->'score'->>1)::integer not between 0 and 50 then perform game.fail('bad_report'); end if;
  if dur not between 10 and 900 then perform game.fail('bad_report', 'duration'); end if;
  -- Tore passen zur Dauer (wie bei Computer-Spielen): 50:0 in 30 Sekunden ist eine Absprache, kein Spiel
  if (r->'score'->>0)::integer + (r->'score'->>1)::integer > dur / 3 + 2 then perform game.fail('implausible', 'goal_rate'); end if;
  select * into mt from game.matches where id = match for update;
  if mt.id is null or p not in (mt.p1, mt.p2) then perform game.fail('unknown_match'); end if;
  if mt.status <> 'open' then return jsonb_build_object('status', mt.status, 'result', mt.result); end if;
  -- Ein Spiel kann nicht schneller vorbei sein, als es gedauert hat (Schutz vor Absprachen im Sekundentakt)
  if now() - mt.created_at < make_interval(secs => greatest(game.cfg_int('online_min_secs'), dur * 0.8)) and not coalesce((r->>'forfeit')::boolean, false) then
    perform game.fail('implausible', 'too_early');
  end if;
  -- „Gegner weg“ zählt nur nach einem echten Anpfiff: beide haben ihn gemeldet, und seitdem sind mindestens 10 s vergangen
  -- (sonst ließe sich sofort nach dem Paaren melden, ohne je zu verbinden, und nach 3 min als Sieger gewertet werden)
  if coalesce((r->>'forfeit')::boolean, false)
     and (mt.p1_started_at is null or mt.p2_started_at is null or now() - greatest(mt.p1_started_at, mt.p2_started_at) < interval '10 seconds') then
    perform game.fail('implausible', 'forfeit_unstarted');
  end if;
  side := case when mt.p1 = p then 1 else 2 end;
  mine := jsonb_build_object('score', r->'score', 'duration', dur, 'forfeit', coalesce((r->>'forfeit')::boolean, false), 'at', now());
  if side = 1 then
    if mt.report1 is not null then perform game.fail('already_reported'); end if;
    update game.matches set report1 = mine where id = match; theirs := mt.report2;
  else
    if mt.report2 is not null then perform game.fail('already_reported'); end if;
    update game.matches set report2 = mine where id = match; theirs := mt.report1;
  end if;
  delete from game.match_queue where player_id = p and match_id = match;
  if theirs is null then return jsonb_build_object('status', 'waiting'); end if;
  if theirs->'score' = mine->'score' and (theirs->>'forfeit')::boolean is not distinct from (mine->>'forfeit')::boolean then
    return game.settle(match, mine->'score', null);
  end if;
  update game.matches set status = 'disputed' where id = match;
  return jsonb_build_object('status', 'disputed');
end $$;

-- Wie 20261105120500_service.sql, dazu Duplikat zuerst
create or replace function api.grant_purchase(player uuid, provider text, provider_ref text, product text, amount_cents integer, currency text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare pr game.products; pid uuid; it text; s integer;
begin
  -- dieselbe Zahlung noch einmal (Stripe stellt mindestens einmal zu): zuerst erkennen, vor allen anderen Prüfungen
  -- (sonst würfe das zweite Mal already_owned beim Starterpaket, und der Webhook erstattete den echten Kauf)
  if exists (select 1 from game.purchases x where x.provider = grant_purchase.provider and x.provider_ref = grant_purchase.provider_ref) then
    return jsonb_build_object('duplicate', true);
  end if;
  select * into pr from game.products where id = product;
  if pr.id is null then perform game.fail('unknown_product'); end if;
  if amount_cents < pr.price_cents or upper(currency) <> upper(pr.currency) then perform game.fail('amount_mismatch'); end if;
  -- Käufe eines Spielers nacheinander: sonst kommen zwei Webhooks für ein Einmal-Paket gleichzeitig durch die Prüfung
  perform 1 from game.wallets where player_id = player for update;
  -- gleichzeitig zugestellte Duplikate: die zweite Meldung wartet oben auf die Sperre und sieht den Kauf erst jetzt
  if exists (select 1 from game.purchases x where x.provider = grant_purchase.provider and x.provider_ref = grant_purchase.provider_ref) then
    return jsonb_build_object('duplicate', true);
  end if;
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

-- Wie 20261105120500_service.sql, dazu gelöschte Konten
create or replace function api.refund_purchase(provider text, provider_ref text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare pu game.purchases; pr game.products; have bigint; back bigint; debt bigint := 0; it text; s integer;
begin
  select * into pu from game.purchases where purchases.provider = refund_purchase.provider and purchases.provider_ref = refund_purchase.provider_ref for update;
  if pu.id is null or pu.status = 'refunded' then return jsonb_build_object('ok', false); end if;
  select * into pr from game.products where id = pu.product_id;
  -- Konto inzwischen gelöscht: nur den Kauf als erstattet markieren (sonst Fehler und Stripe versucht es tagelang erneut)
  if pu.player_id is null then
    update game.purchases set status = 'refunded' where id = pu.id;
    return jsonb_build_object('ok', true, 'clawedBack', 0, 'debt', 0);
  end if;
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

-- Wie 20261105120500_service.sql, dazu: einseitige Meldung nur nach beidseitigem Anpfiff
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
  return jsonb_build_object('queue', a, 'oneSided', b, 'void', c, 'requests', d, 'guests', e, 'seasonChests', f);
end $$;
