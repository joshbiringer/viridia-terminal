-- Watchlist detail (product sprint, priority 8): notes per watched security, a place for alert
-- preferences (stored only; alert delivery isn't built yet, so the product doesn't expose them),
-- and my_watchlist returns the preferred count, the nearest Fibonacci zone and the latest structural event.

alter table public.watchlist_items
  add column if not exists notes text check (notes is null or char_length(notes) <= 1000),
  add column if not exists alert_prefs jsonb not null default '{}'::jsonb;

drop function if exists public.my_watchlist(uuid);
create function public.my_watchlist(p_watchlist uuid default null)
returns table(watchlist_id uuid, security_id bigint, symbol text, name text, exchange text, asset_type text,
  close double precision, prev_close double precision, change_pct double precision, trend text,
  high_52w double precision, low_52w double precision, adv20 double precision, last_ts timestamptz,
  swing text, zones integer, added_at timestamptz, notes text,
  pattern text, complete boolean, wave text, wave_dir text, score smallint,
  zone_low real, zone_high real, event_type text, event_day date, event_detail jsonb)
language sql stable security definer set search_path = public as $$
  select i.watchlist_id, s.id, s.symbol, s.name, s.exchange, s.asset_type,
         sn.close::float8, sn.prev_close::float8,
         case when sn.prev_close > 0 then (sn.close / sn.prev_close - 1)::float8 end,
         sn.trend, sn.high_52w::float8, sn.low_52w::float8, sn.adv20::float8, sn.last_ts,
         a.swing_structure->>'intermediate', coalesce(jsonb_array_length(a.confluence_zones_json->'zones'), 0), i.added_at, i.notes,
         a.glance_pattern, a.glance_complete, a.glance_wave, a.glance_wave_dir, a.glance_score,
         h.zone_low, h.zone_high, e.type, e.day, e.detail
  from watchlist_items i
  join watchlists w on w.id = i.watchlist_id
  join securities s on s.id = i.security_id
  left join security_snapshot sn on sn.security_id = s.id
  left join analysis_results a on a.security_id = s.id and a.timeframe = '1d'
  left join lateral (select zone_low, zone_high from analysis_history where security_id = s.id order by day desc limit 1) h on true
  left join lateral (select type, day, detail from structure_events where security_id = s.id order by day desc, weight desc limit 1) e on true
  where w.user_id = auth.uid() and (p_watchlist is null or i.watchlist_id = p_watchlist)
  order by i.position, i.added_at
$$;
grant execute on function public.my_watchlist(uuid) to authenticated;
revoke execute on function public.my_watchlist(uuid) from anon;
