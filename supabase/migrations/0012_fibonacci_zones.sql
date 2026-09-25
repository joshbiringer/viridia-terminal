-- Phase 6: Fibonacci levels and confluence zones.
-- confluence_zones_json: { close, tolerance, zones: ConfluenceZone[] } (see _shared/engine/fib.ts).
-- fib_levels_json: count of live levels per degree (the full list is recomputable from the same inputs).
-- Per-count Fibonacci targets are stored inside candidate_counts_json (field "tg").
create or replace function public.store_analysis_results(p_rows jsonb)
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare v_n int;
begin
  insert into analysis_results (security_id, timeframe, algorithm_version, analysis_timestamp, source_first_ts, source_last_ts,
                                input_bars, computed_at, expires_at, swing_structure, pivots_json, candidate_counts_json, candidate_count,
                                fib_levels_json, confluence_zones_json)
  select x.security_id, x.timeframe, x.algorithm_version, x.analysis_timestamp, x.source_first_ts, x.source_last_ts,
         x.input_bars, now(), x.expires_at, x.swing_structure, x.pivots_json, x.candidate_counts_json, x.candidate_count,
         x.fib_levels_json, x.confluence_zones_json
  from jsonb_to_recordset(p_rows) as x(security_id bigint, timeframe text, algorithm_version text, analysis_timestamp timestamptz,
                                       source_first_ts timestamptz, source_last_ts timestamptz, input_bars int,
                                       expires_at timestamptz, swing_structure jsonb, pivots_json jsonb,
                                       candidate_counts_json jsonb, candidate_count int,
                                       fib_levels_json jsonb, confluence_zones_json jsonb)
  on conflict (security_id, timeframe) do update set
    algorithm_version = excluded.algorithm_version, analysis_timestamp = excluded.analysis_timestamp,
    source_first_ts = excluded.source_first_ts, source_last_ts = excluded.source_last_ts, input_bars = excluded.input_bars,
    computed_at = excluded.computed_at, expires_at = excluded.expires_at, swing_structure = excluded.swing_structure,
    pivots_json = excluded.pivots_json, candidate_counts_json = excluded.candidate_counts_json,
    candidate_count = excluded.candidate_count, fib_levels_json = excluded.fib_levels_json,
    confluence_zones_json = excluded.confluence_zones_json;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.store_analysis_results(jsonb) from public, anon, authenticated;

create or replace function public.get_analysis(p_symbol text, p_timeframe text default '1d')
returns jsonb
language sql stable security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'symbol', s.symbol, 'timeframe', a.timeframe, 'algorithm_version', a.algorithm_version,
    'analysis_timestamp', a.analysis_timestamp, 'computed_at', a.computed_at, 'input_bars', a.input_bars,
    'current', (a.source_last_ts is not distinct from c.last_ts and a.source_first_ts is not distinct from c.first_ts),
    'swing_structure', a.swing_structure, 'pivots', a.pivots_json,
    'candidates', a.candidate_counts_json, 'candidate_count', a.candidate_count,
    'zones', a.confluence_zones_json)
  from securities s
  join analysis_results a on a.security_id = s.id and a.timeframe = p_timeframe
  left join bar_coverage c on c.security_id = s.id and c.timeframe = '1d'
  where s.symbol = upper(trim(p_symbol))
  order by s.is_active desc
  limit 1
$$;

-- Market-wide list: for each active security, its strongest daily confluence zone within p_max_distance
-- of the close. Read-only over cached engine output; strength is a weighted count, not a probability.
create or replace function public.fib_zone_scan(
  p_max_distance double precision default 0.03, p_min_count int default 2,
  p_min_dollar_volume double precision default null, p_side text default null, p_limit int default 50)
returns table (symbol text, name text, exchange text, close double precision, low double precision, high double precision,
               mid double precision, strength double precision, relationships int, degrees jsonb, side text,
               distance_pct double precision, adv20 double precision, analysis_timestamp timestamptz)
language sql stable security definer
set search_path to 'public'
as $$
  with z as (
    select distinct on (a.security_id)
      s.symbol, s.name, s.exchange, (a.confluence_zones_json->>'close')::float8 as close,
      (e->>'low')::float8 as low, (e->>'high')::float8 as high, (e->>'mid')::float8 as mid,
      (e->>'strength')::float8 as strength, (e->>'count')::int as relationships, e->'degrees' as degrees,
      e->>'side' as side, (e->>'distancePct')::float8 as distance_pct, sn.adv20::float8 as adv20, a.analysis_timestamp
    from analysis_results a
    join securities s on s.id = a.security_id and s.is_active
    left join security_snapshot sn on sn.security_id = a.security_id
    cross join lateral jsonb_array_elements(a.confluence_zones_json->'zones') e
    where a.timeframe = '1d' and a.confluence_zones_json is not null
      and abs((e->>'distancePct')::float8) <= p_max_distance
      and (e->>'count')::int >= p_min_count
      and (p_side is null or e->>'side' = p_side)
      and (p_min_dollar_volume is null or sn.adv20 >= p_min_dollar_volume)
    order by a.security_id, (e->>'strength')::float8 desc, abs((e->>'distancePct')::float8)
  )
  select * from z order by strength desc, abs(distance_pct), adv20 desc nulls last
  limit least(greatest(p_limit, 1), 200)
$$;
