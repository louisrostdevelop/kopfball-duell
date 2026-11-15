-- =====================================================================================
-- Spielstand und Dauer beim Spielende (match_end): eigene Tore, Gegentore, Dauer in Sekunden.
-- Zeigt, ob neue Spieler gegen den Computer schnell zurückliegen und deshalb abbrechen.
-- Alle drei Felder sind freiwillig: ältere App-Versionen (Service-Worker-Cache) melden sie noch nicht, und ohne eigene
-- Seite (zu zweit an einem Gerät) gibt es keine eigenen Tore. Nur ganze Zahlen in festen Bereichen, nie freier Text.
-- Sonst unverändert gegenüber 20261112120000_stats.sql.
-- =====================================================================================

create or replace function api.track(kind text, data jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); k text := track.kind; d jsonb := coalesce(track.data, '{}'); c jsonb := '{}'; f text; v jsonb;
  allowed text[]; need text[];
  match_modes constant text[] := array['cpu', 'cup', 'career', 'endless', 'daily', 'training', 'local', 'friends', 'casual', 'ranked', 'other'];
  net_modes constant text[] := array['friends', 'casual', 'ranked'];
  refs constant text[] := array['direct', 'invite', 'reddit', 'google', 'bing', 'duckduckgo', 'youtube', 'tiktok', 'instagram', 'facebook', 'x', 'discord', 'other'];
begin
  perform game.limit_rate(p, 'track', 200, interval '1 hour');
  if jsonb_typeof(d) <> 'object' or octet_length(d::text) > 300 then perform game.fail('bad_event'); end if;
  case k
    when 'first_visit'  then allowed := array['src', 'ref'];          need := array['ref'];
    when 'visit'        then allowed := array[]::text[];              need := array[]::text[];
    when 'match_start'  then allowed := array['mode'];                need := allowed;
    when 'match_end'    then allowed := array['mode', 'done', 'goals', 'conceded', 'dur_s']; need := array['mode', 'done'];
    when 'search_start' then allowed := array['mode'];                need := allowed;
    when 'search_end'   then allowed := array['mode', 'outcome', 'wait_s']; need := allowed;
    when 'net_result'   then allowed := array['mode', 'path'];        need := allowed;
    when 'lobby'        then allowed := array['action'];              need := allowed;
    when 'abort'        then allowed := array['mode', 'reason'];      need := allowed;
    else perform game.fail('bad_event');
  end case;
  for f, v in select * from jsonb_each(d) loop
    if not f = any (allowed) then perform game.fail('bad_event'); end if;
    if not (case
      when f = 'mode' and k in ('match_start', 'match_end') then v #>> '{}' = any (match_modes)
      when f = 'mode' and k in ('search_start', 'search_end') then v #>> '{}' in ('casual', 'ranked')
      when f = 'mode' then v #>> '{}' = any (net_modes)
      when f = 'done' then jsonb_typeof(v) = 'boolean'
      when f = 'outcome' then v #>> '{}' in ('matched', 'cancel', 'error')
      when f in ('goals', 'conceded') then case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric between 0 and 99 and (v #>> '{}')::numeric = trunc((v #>> '{}')::numeric) else false end
      when f = 'dur_s' then case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric between 0 and 3600 else false end
      when f = 'wait_s' then case when jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric between 0 and 3600 else false end
      when f = 'path' then v #>> '{}' in ('direct', 'relay', 'failed')
      when f = 'action' then v #>> '{}' in ('created', 'joined', 'started')
      when f = 'reason' then v #>> '{}' in ('dropped', 'opp_gone', 'void', 'desync')
      when f = 'src' then case when jsonb_typeof(v) = 'string' then v #>> '{}' ~ '^[a-z0-9_-]{1,40}$' else false end
      when f = 'ref' then v #>> '{}' = any (refs)
      else false end)
    then perform game.fail('bad_event'); end if;
    -- Warte- und Spielzeit als ganze Sekunden, alles andere wie geprüft
    c := c || jsonb_build_object(f, case when f in ('wait_s', 'dur_s') then to_jsonb(round((v #>> '{}')::numeric)::integer) else v end);
  end loop;
  if exists (select 1 from unnest(need) x where not c ? x) then perform game.fail('bad_event'); end if;
  if k = 'first_visit' and (exists (select 1 from game.events e where e.player_id = p and e.kind = 'first_visit')
                            or (select created_at from game.players where id = p) < now() - interval '1 day') then
    return jsonb_build_object('ok', true, 'stored', false);
  end if;
  if k = 'visit' and exists (select 1 from game.events e where e.player_id = p and e.kind = 'visit'
                              and e.created_at >= game.berlin_start(game.berlin_day(now()))) then
    return jsonb_build_object('ok', true, 'stored', false);
  end if;
  insert into game.events (player_id, kind, data) values (p, k, c);
  return jsonb_build_object('ok', true, 'stored', true);
end $$;

revoke all on function api.track(text, jsonb) from public, anon;
grant execute on function api.track(text, jsonb) to authenticated;
