-- Scanner filters (product sprint, priority 7): swing structure by degree, candidate pattern and wave
-- position of the preferred count, distance to and strength of Fibonacci confluence, and 52-week
-- position range. Same result columns; new optional parameters, so the function is recreated.

drop function if exists public.scan_securities(text, text, text, numeric, numeric, numeric, text, text, integer, integer, text, text, integer);
create function public.scan_securities(
  p_trend text default null, p_exchange text default null, p_type text default null, p_min_price numeric default null,
  p_max_price numeric default null, p_min_dollar_volume numeric default null, p_near text default null, p_sort text default 'dollar_volume',
  p_limit integer default 50, p_offset integer default 0, p_structure text default null, p_direction text default null, p_min_score integer default null,
  p_swing_primary text default null, p_swing_intermediate text default null, p_swing_minor text default null,
  p_pattern text default null, p_wave text default null, p_zone_max_dist double precision default null, p_zone_min_strength double precision default null,
  p_range_min double precision default null, p_range_max double precision default null)
returns table(symbol text, name text, exchange text, asset_subtype text, close double precision, change_pct double precision, trend text,
  vs_sma50 double precision, vs_sma200 double precision, from_high double precision, range_pos double precision, dollar_volume double precision,
  last_ts timestamptz, glance_degree text, glance_pattern text, glance_complete boolean, glance_wave text, glance_wave_dir text,
  glance_score smallint, glance_alt_score smallint, glance_hold double precision, hold_dist double precision, zone_dist double precision, total bigint)
language plpgsql stable security definer set search_path = public as $function$
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
           a.zone_dist, a.swing_structure, a.confluence_zones_json
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
      and ($14 is null or a.swing_structure->>'primary' = $14)
      and ($15 is null or a.swing_structure->>'intermediate' = $15)
      and ($16 is null or a.swing_structure->>'minor' = $16)
      and ($17 is null or a.glance_pattern = $17)
      and ($18 is null or ($18 = 'complete' and a.glance_complete) or (not coalesce(a.glance_complete, true) and a.glance_wave = $18))
      and ($19 is null or a.zone_dist <= $19)
  ), filtered as (
    select * from base b
    where ($7 is null
       or ($7 = 'high' and b.from_high >= -0.03)
       or ($7 = 'low' and b.range_pos <= 0.03))
      and ($21 is null or b.range_pos >= $21)
      and ($22 is null or b.range_pos <= $22)
      and ($11 is null
       or ($11 = 'wave3' and b.glance_pattern in ('impulse','leading_diagonal','ending_diagonal') and not b.glance_complete and b.glance_wave = '3')
       or ($11 = 'wave5' and b.glance_pattern in ('impulse','leading_diagonal','ending_diagonal') and not b.glance_complete and b.glance_wave = '5')
       or ($11 = 'wave_c' and b.glance_pattern in ('zigzag','flat') and not b.glance_complete and b.glance_wave = 'C')
       or ($11 = 'abc_done' and b.glance_pattern in ('zigzag','flat') and b.glance_complete)
       or ($11 = 'five_done' and b.glance_pattern in ('impulse','leading_diagonal','ending_diagonal') and b.glance_complete)
       or ($11 = 'near_zone' and b.zone_dist <= 0.03)
       or ($11 = 'near_invalidation' and abs(b.hold_dist) <= 0.03))
      -- strongest confluence zone within the distance cap (3% when no cap is set)
      and ($20 is null or exists (
        select 1 from jsonb_array_elements(coalesce(b.confluence_zones_json->'zones', '[]')) z
        where abs((z->>'distancePct')::float8) <= coalesce($19, 0.03) and (z->>'strength')::float8 >= $20))
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
$q$ using p_trend, p_exchange, p_type, p_min_price, p_max_price, p_min_dollar_volume, p_near, p_sort, p_limit, p_offset, p_structure, p_direction, p_min_score,
          p_swing_primary, p_swing_intermediate, p_swing_minor, p_pattern, p_wave, p_zone_max_dist, p_zone_min_strength, p_range_min, p_range_max;
end $function$;
grant execute on function public.scan_securities(text, text, text, numeric, numeric, numeric, text, text, integer, integer, text, text, integer,
  text, text, text, text, text, double precision, double precision, double precision, double precision) to anon, authenticated;
