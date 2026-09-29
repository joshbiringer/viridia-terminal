-- setup_scan gains p_max_risk: the distance from entry to stop as a fraction of price. Mission Control
-- uses 20% so setups whose stop sits far from the entry (common for wave C setups) don't headline.
drop function if exists public.setup_scan(text, text, text, text, real, integer, numeric, text, integer, integer, boolean, boolean);
create function public.setup_scan(p_timeframe text default '1d', p_side text default null, p_status text default null, p_kind text default null,
  p_min_rr real default null, p_min_score integer default null, p_min_dollar_volume numeric default null, p_sort text default 'rr',
  p_limit integer default 50, p_offset integer default 0, p_aligned boolean default null, p_exclude_negative boolean default null,
  p_max_risk real default null)
returns table(symbol text, name text, exchange text, asset_subtype text, close double precision, change_pct double precision,
  dollar_volume double precision, last_ts timestamptz, degree text, kind text, side text, status text, score smallint, rr real,
  risk_pct real, setup jsonb, weekly_dir text, grade text, kind_avg_r real, total bigint)
language plpgsql stable security definer set search_path = public as $function$
begin
  return query execute $q$
  select s.symbol, s.name, s.exchange, s.asset_subtype, px(x.close)::float8,
         case when x.prev_close > 0 then (x.close / x.prev_close - 1)::float8 end,
         x.adv20::float8, x.last_ts::timestamptz,
         a.setup_degree, a.setup_kind, a.setup_side, a.setup_status, a.glance_score, a.setup_rr, a.setup_risk_pct,
         a.setups_json -> a.setup_degree, w.glance_wave_dir, q.grade, q.avg_r, count(*) over ()
  from analysis_results a
  join securities s on s.id = a.security_id and s.is_active and s.coverage is not null
  join security_snapshot x on x.security_id = a.security_id
  left join analysis_results w on w.security_id = a.security_id and w.timeframe = '1w'
  left join setup_kind_quality q on q.kind = a.setup_kind and q.side = a.setup_side
  where a.timeframe = $1 and a.setup_side is not null
    and ($2 is null or a.setup_side = $2)
    and ($3 is null or a.setup_status = $3)
    and ($4 is null or a.setup_kind = $4)
    and ($5 is null or a.setup_rr >= $5)
    and ($6 is null or a.glance_score >= $6)
    and ($7 is null or x.adv20 >= $7)
    and ($11 is null or ($11 = (w.glance_wave_dir = case a.setup_side when 'buy' then 'up' else 'down' end)))
    and ($12 is not true or q.grade is distinct from 'negative')
    and ($13 is null or a.setup_risk_pct <= $13)
  order by
    case when $8 = 'quality' then coalesce(q.avg_r, 0) end desc nulls last,
    case when $8 = 'quality' then a.glance_score end desc nulls last,
    case when $8 = 'rr' then a.setup_rr end desc nulls last,
    case when $8 = 'confidence' then a.glance_score end desc nulls last,
    case when $8 = 'risk' then a.setup_risk_pct end asc nulls last,
    case when $8 = 'symbol' then s.symbol end asc,
    x.adv20 desc nulls last
  limit least(greatest($9, 1), 200) offset greatest($10, 0)
$q$ using p_timeframe, p_side, p_status, p_kind, p_min_rr, p_min_score, p_min_dollar_volume, p_sort, p_limit, p_offset, p_aligned, p_exclude_negative, p_max_risk;
end $function$;
grant execute on function public.setup_scan(text, text, text, text, real, integer, numeric, text, integer, integer, boolean, boolean, real) to anon, authenticated;
