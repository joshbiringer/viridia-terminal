-- Scanner 2.0: structure filters on the preferred daily wave count (Phase 7 glance columns).
-- The return type changes (structure columns added), so the function is replaced, not altered.
-- Existing callers keep working: the new parameters come last and default to "no filter".

-- Nearest confluence zone distance as a column (filled on write), so structure scans stay fast.
-- Rows fill as the worker recomputes them; no backfill rewrite of the table.
alter table public.analysis_results add column if not exists zone_dist double precision;
create or replace function public.analysis_results_zone_dist()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.zone_dist := (select min(abs((e->>'distancePct')::float8)) from jsonb_array_elements(new.confluence_zones_json->'zones') e);
  return new;
end $$;
revoke all on function public.analysis_results_zone_dist() from public, anon, authenticated;
drop trigger if exists analysis_results_zone_dist on public.analysis_results;
create trigger analysis_results_zone_dist before insert or update of confluence_zones_json on public.analysis_results
  for each row execute function public.analysis_results_zone_dist();

drop function if exists public.scan_securities(text, text, text, numeric, numeric, numeric, text, text, integer, integer);

create or replace function public.scan_securities(
  p_trend text default null, p_exchange text default null, p_type text default null,
  p_min_price numeric default null, p_max_price numeric default null, p_min_dollar_volume numeric default null,
  p_near text default null, p_sort text default 'dollar_volume', p_limit integer default 50, p_offset integer default 0,
  p_structure text default null,      -- wave3 | wave5 | wave_c | abc_done | five_done | near_zone | near_invalidation
  p_direction text default null,      -- up | down: direction of the wave in progress (or the next move)
  p_min_score integer default null    -- minimum Pattern Confidence of the preferred count
)
returns table(symbol text, name text, exchange text, asset_subtype text, close double precision, change_pct double precision,
              trend text, vs_sma50 double precision, vs_sma200 double precision, from_high double precision,
              range_pos double precision, dollar_volume double precision, last_ts timestamptz,
              glance_degree text, glance_pattern text, glance_complete boolean, glance_wave text, glance_wave_dir text,
              glance_score smallint, glance_alt_score smallint, glance_hold double precision, hold_dist double precision,
              zone_dist double precision, total bigint)
language plpgsql stable security definer set search_path to 'public' as $function$
-- Dynamic SQL so every call is planned with its actual filters: a single generic plan for all
-- filter combinations was 50x slower on structure scans.
begin
  return query execute $q$
  with base as (
    select s.symbol, s.name, s.exchange, s.asset_subtype, px(x.close)::float8 as close,
           case when x.prev_close > 0 then (x.close / x.prev_close - 1)::float8 end as change_pct,
           x.trend,
           case when x.n50 >= 50 then (x.close / x.sma50 - 1)::float8 end as vs_sma50,
           case when x.n200 >= 200 then (x.close / x.sma200 - 1)::float8 end as vs_sma200,
           case when x.bars >= 250 and x.high_52w > 0 then (x.close / x.high_52w - 1)::float8 end as from_high,
           case when x.bars >= 250 and x.high_52w > x.low_52w then ((x.close - x.low_52w) / (x.high_52w - x.low_52w))::float8 end as range_pos,
           x.adv20::float8 as dollar_volume, x.last_ts::timestamptz,
           a.glance_degree, a.glance_pattern, a.glance_complete, a.glance_wave, a.glance_wave_dir, a.glance_score,
           a.glance_alt_score, a.glance_hold,
           case when a.glance_hold > 0 and x.close > 0 then (a.glance_hold / x.close - 1)::float8 end as hold_dist,
           a.zone_dist
    from security_snapshot x
    join securities s on s.id = x.security_id
    left join analysis_results a on a.security_id = x.security_id and a.timeframe = '1d'
    where s.is_active and s.coverage is not null
      and ($1 is null or x.trend = $1)
      and ($2 is null or s.exchange = $2)
      and ($3 is null or s.asset_subtype = $3)
      and ($4 is null or x.close >= $4)
      and ($5 is null or x.close <= $5)
      and ($6 is null or x.adv20 >= $6)
      and ($12 is null or a.glance_wave_dir = $12)
      and ($13 is null or a.glance_score >= $13)
  ), filtered as (
    select * from base b
    where ($7 is null
       or ($7 = 'high' and b.from_high >= -0.03)
       or ($7 = 'low' and b.range_pos <= 0.03))
      and ($11 is null
       or ($11 = 'wave3' and b.glance_pattern in ('impulse','leading_diagonal','ending_diagonal') and not b.glance_complete and b.glance_wave = '3')
       or ($11 = 'wave5' and b.glance_pattern in ('impulse','leading_diagonal','ending_diagonal') and not b.glance_complete and b.glance_wave = '5')
       or ($11 = 'wave_c' and b.glance_pattern in ('zigzag','flat') and not b.glance_complete and b.glance_wave = 'C')
       or ($11 = 'abc_done' and b.glance_pattern in ('zigzag','flat') and b.glance_complete)
       or ($11 = 'five_done' and b.glance_pattern in ('impulse','leading_diagonal','ending_diagonal') and b.glance_complete)
       or ($11 = 'near_zone' and b.zone_dist <= 0.03)
       or ($11 = 'near_invalidation' and abs(b.hold_dist) <= 0.03))
  )
  select f.symbol, f.name, f.exchange, f.asset_subtype, f.close, f.change_pct, f.trend, f.vs_sma50, f.vs_sma200,
         f.from_high, f.range_pos, f.dollar_volume, f.last_ts,
         f.glance_degree, f.glance_pattern, f.glance_complete, f.glance_wave, f.glance_wave_dir, f.glance_score,
         f.glance_alt_score, f.glance_hold, f.hold_dist, f.zone_dist, count(*) over () as total
  from filtered f
  order by
    case when $8 = 'change' then f.change_pct end desc nulls last,
    case when $8 = 'change_asc' then f.change_pct end asc nulls last,
    case when $8 = 'vs_sma200' then f.vs_sma200 end desc nulls last,
    case when $8 = 'from_high' then f.from_high end desc nulls last,
    case when $8 = 'confidence' then f.glance_score end desc nulls last,
    case when $8 = 'invalidation' then abs(f.hold_dist) end asc nulls last,
    case when $8 = 'zone' then f.zone_dist end asc nulls last,
    case when $8 = 'symbol' then f.symbol end asc,
    f.dollar_volume desc nulls last
  limit least(greatest($9, 1), 200) offset greatest($10, 0)
$q$ using p_trend, p_exchange, p_type, p_min_price, p_max_price, p_min_dollar_volume, p_near, p_sort, p_limit, p_offset, p_structure, p_direction, p_min_score;
end $function$;

grant execute on function public.scan_securities(text, text, text, numeric, numeric, numeric, text, text, integer, integer, text, text, integer) to anon, authenticated;

-- How much of the universe has a ranked structure summary (the scanner says so while a recompute runs).
create or replace function public.structure_coverage(p_version text)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  select jsonb_build_object(
    'ranked', count(*) filter (where a.algorithm_version = p_version),
    'with_count', count(*) filter (where a.algorithm_version = p_version and a.glance_score is not null),
    'total', count(*))
  from analysis_results a join securities s on s.id = a.security_id and s.is_active and s.coverage is not null
  where a.timeframe = '1d'
$function$;
grant execute on function public.structure_coverage(text) to anon, authenticated;
