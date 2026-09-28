-- Mission Control (the /terminal home): a market pulse with 1D/1W/1M returns and sparklines, and a
-- compact per-security preview for the right-side drawer. Read-only; no new tables.

-- Pulse: latest close, the close 1, 5 and 21 sessions back, the snapshot trend, the last 30 closes and
-- the preferred daily count, for up to 60 symbols in the order given.
create or replace function public.market_pulse(p_symbols text[])
returns table(symbol text, name text, close float8, prev_close float8, close_5 float8, close_21 float8,
              trend text, last_ts timestamptz, spark float8[],
              glance_pattern text, glance_complete boolean, glance_wave text, glance_wave_dir text, glance_score smallint,
              setup_side text, setup_kind text, setup_status text)
language sql stable security definer set search_path = public as $$
  select s.symbol, s.name,
         b.closes[1], b.closes[2], b.closes[6], b.closes[22],
         sn.trend, b.last_ts,
         array(select b.closes[i] from generate_series(least(array_length(b.closes, 1), 30), 1, -1) i),
         a.glance_pattern, a.glance_complete, a.glance_wave, a.glance_wave_dir, a.glance_score,
         a.setup_side, a.setup_kind, a.setup_status
  from unnest(p_symbols[1:60]) with ordinality u(sym, ord)
  join securities s on s.symbol = upper(trim(u.sym)) and s.is_active
  join lateral (
    select array_agg(z.close::float8 order by z.ts desc) closes, max(z.ts) last_ts
    from (select pb.close, pb.ts from price_bars pb
          where pb.security_id = s.id and pb.timeframe = '1d' order by pb.ts desc limit 30) z
  ) b on b.closes is not null
  left join security_snapshot sn on sn.security_id = s.id
  left join analysis_results a on a.security_id = s.id and a.timeframe = '1d'
  order by u.ord
$$;

-- Preview for the drawer: snapshot, returns, daily and weekly preferred counts, the active setup and the
-- nearest Fibonacci confluence zone, plus the latest structure change on record.
create or replace function public.security_preview(p_symbol text)
returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (select * from securities where symbol = upper(trim(p_symbol)) and is_active limit 1),
  bars as (
    select array_agg(z.close::float8 order by z.ts desc) closes
    from (select pb.close, pb.ts from price_bars pb, s where pb.security_id = s.id and pb.timeframe = '1d'
          order by pb.ts desc limit 60) z
  ),
  d as (select a.* from analysis_results a, s where a.security_id = s.id and a.timeframe = '1d'),
  w as (select a.* from analysis_results a, s where a.security_id = s.id and a.timeframe = '1w'),
  zone as (
    select zz from d, jsonb_array_elements(coalesce(d.confluence_zones_json->'zones', '[]')) zz
    order by abs((zz->>'distancePct')::float8) nulls last limit 1
  ),
  hist as (
    select h.day, h.pattern, h.wave, h.wave_dir, h.score, h.setup_side, h.setup_kind
    from analysis_history h, s where h.security_id = s.id order by h.day desc limit 2
  )
  select (select jsonb_build_object(
    'id', s.id, 'symbol', s.symbol, 'name', s.name, 'exchange', s.exchange, 'asset_type', s.asset_type,
    'close', sn.close, 'prev_close', sn.prev_close, 'last_ts', sn.last_ts, 'trend', sn.trend,
    'sma50', sn.sma50, 'sma200', sn.sma200, 'high_52w', sn.high_52w, 'low_52w', sn.low_52w, 'adv20', sn.adv20,
    'close_5', (select closes[6] from bars), 'close_21', (select closes[22] from bars),
    'spark', (select to_jsonb(array(select closes[i] from generate_series(array_length(closes, 1), 1, -1) i)) from bars),
    'daily', (select jsonb_build_object('degree', glance_degree, 'pattern', glance_pattern, 'complete', glance_complete,
                'wave', glance_wave, 'wave_dir', glance_wave_dir, 'score', glance_score, 'alt_score', glance_alt_score,
                'hold', glance_hold, 'hold_side', glance_hold_side, 'target', glance_target, 'version', algorithm_version) from d),
    'weekly', (select jsonb_build_object('pattern', glance_pattern, 'complete', glance_complete, 'wave', glance_wave,
                'wave_dir', glance_wave_dir, 'score', glance_score) from w),
    'setup', (select case when setup_degree is not null then setups_json->setup_degree end from d),
    'zone', (select zz from zone),
    'history', (select coalesce(jsonb_agg(to_jsonb(hist) order by hist.day desc), '[]') from hist)
  ) from s left join security_snapshot sn on sn.security_id = s.id)
$$;

grant execute on function public.market_pulse(text[]) to anon, authenticated;
grant execute on function public.security_preview(text) to anon, authenticated;
