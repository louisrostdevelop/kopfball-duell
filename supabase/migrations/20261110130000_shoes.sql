-- =====================================================================================
-- Schuhe immer im Shop (eigener Reiter): api.buy_item lässt Schuhe ohne Wochenangebot zu,
-- das Wochenangebot (game.cos_offer) nimmt nur noch Torexplosionen, Emotes und Emojis (6 Stück).
-- Gleich im Client: cosOffer in js/core/economy.js. Kisten und Herstellen unverändert.
-- Vor dem Client einspielen. Das laufende Wochenangebot wechselt dabei mitten in der Woche.
-- =====================================================================================

-- Wie 20261105120200_core.sql, ohne Schuhe
create or replace function game.cos_offer() returns text[]
language sql stable security definer set search_path = '' as $$
  select array(select id from game.items where kind in ('goalfx', 'emote', 'emoji') and active and meta->>'src' is distinct from 'mastery'
                order by md5(game.week() || id) limit 6)
$$;

-- Wie 20261105120300_api_economy.sql, Schuhe ohne Wochenangebot
create or replace function api.buy_item(item text, currency text, request_key text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare p uuid := game.me(); prev jsonb; it game.items; price integer; res jsonb;
begin
  prev := game.idem_begin(p, request_key); if prev is not null then return prev; end if;
  perform game.limit_rate(p, 'buy', 20, interval '1 minute');
  select * into it from game.items where id = item and active;
  if it.id is null then perform game.fail('unknown_item'); end if;
  price := case currency when 'coins' then it.price_coins when 'gems' then it.price_gems end;
  if price is null then perform game.fail('not_for_sale', currency); end if;
  -- Seltenes erst ab einem Level; Schuhe immer, übrige Kosmetik nur im Wochenangebot
  if (select level from game.players where id = p) < coalesce((game.cfg('shop_level')->>it.rarity)::integer, 1) then
    perform game.fail('level_required', (game.cfg('shop_level')->>it.rarity));
  end if;
  if it.kind in ('goalfx', 'emote', 'emoji') and not (item = any(game.cos_offer())) then perform game.fail('not_in_offer'); end if;
  -- Neue Arena: erst im Saison-Pass ihrer Saison, danach im Shop (wie arenaInShop in js/app/profile.js)
  if it.kind = 'arena' and it.meta ? 'season' and game.current_season() is not null and game.current_season() <= (it.meta->>'season')::integer then
    perform game.fail('not_yet', it.meta->>'season');
  end if;
  if exists (select 1 from game.inventory where player_id = p and item_id = item) then perform game.fail('already_owned'); end if;
  if price > 0 then perform game.book(p, currency, -price, 'buy', item); end if;
  perform game.give_item(p, item, 'buy_' || currency);
  perform game.grant_achievements(p, '{}');
  res := jsonb_build_object('item', item, 'price', price, 'currency', currency, 'state', game.state_brief(p));
  return game.idem_end(p, request_key, res);
end $$;

revoke execute on all functions in schema api, game from public;
grant execute on function api.buy_item(text, text, text) to authenticated;
