-- =====================================================================================
-- Aktivität auf der Plattform (js/app/activity.js): wie viele Spieler gerade suchen (je Modus), spielen und in den
-- letzten 15 Minuten aktiv waren. Nur Zahlen, keine Namen. Dient der Anzeige in der Modus-Auswahl und bei der
-- Gegnersuche, damit niemand endlos sucht, wenn gerade keiner da ist.
-- „Aktiv“ stützt sich auf players.last_seen_at (api.me setzt es höchstens alle 10 Minuten neu).
-- =====================================================================================

create or replace function api.activity() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform game.me();   -- nur angemeldete Clients (auch Gäste)
  return jsonb_build_object(
    'active',  (select count(*) from game.players where last_seen_at > now() - interval '15 minutes'),
    'casual',  (select count(*) from game.match_queue where mode = 'casual' and match_id is null and seen_at > now() - interval '10 seconds'),
    'ranked',  (select count(*) from game.match_queue where mode = 'ranked' and match_id is null and seen_at > now() - interval '10 seconds'),
    'playing', 2 * (select count(*) from game.matches where status = 'open' and mode in ('casual', 'ranked')
                      and coalesce(started_at, created_at) > now() - interval '3 minutes'));
end $$;

revoke all on function api.activity() from public, anon;
grant execute on function api.activity() to authenticated;
