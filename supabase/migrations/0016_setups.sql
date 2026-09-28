-- Wave setups (engine setup-1.0.0): the buy or sell setup each preferred count implies, with entry,
-- stop and target. setups_json holds one per degree; the plain columns describe the setup at the
-- glance degree so the Setups screen can filter and sort without unpacking JSON.

alter table public.analysis_results
  add column if not exists setups_json jsonb,
  add column if not exists setup_degree text,
  add column if not exists setup_kind text,
  add column if not exists setup_side text check (setup_side in ('buy','sell')),
  add column if not exists setup_status text check (setup_status in ('active','waiting')),
  add column if not exists setup_rr real,
  add column if not exists setup_risk_pct real;

create index if not exists analysis_results_setup_idx on public.analysis_results (timeframe, setup_rr desc)
  where setup_side is not null;

create or replace function public.store_analysis_results(p_rows jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_n int;
begin
  insert into analysis_results (security_id, timeframe, algorithm_version, analysis_timestamp, source_first_ts, source_last_ts,
                                input_bars, computed_at, expires_at, swing_structure, pivots_json, candidate_counts_json, candidate_count,
                                fib_levels_json, confluence_zones_json,
                                glance_degree, glance_pattern, glance_complete, glance_wave, glance_wave_dir, glance_score,
                                glance_alt_score, glance_hold, glance_hold_side, glance_target,
                                setups_json, setup_degree, setup_kind, setup_side, setup_status, setup_rr, setup_risk_pct)
  select x.security_id, x.timeframe, x.algorithm_version, x.analysis_timestamp, x.source_first_ts, x.source_last_ts,
         x.input_bars, now(), x.expires_at, x.swing_structure, x.pivots_json, x.candidate_counts_json, x.candidate_count,
         x.fib_levels_json, x.confluence_zones_json,
         x.glance_degree, x.glance_pattern, x.glance_complete, x.glance_wave, x.glance_wave_dir, x.glance_score,
         x.glance_alt_score, x.glance_hold, x.glance_hold_side, x.glance_target,
         x.setups_json, x.setup_degree, x.setup_kind, x.setup_side, x.setup_status, x.setup_rr, x.setup_risk_pct
  from jsonb_to_recordset(p_rows) as x(security_id bigint, timeframe text, algorithm_version text, analysis_timestamp timestamptz,
                                       source_first_ts timestamptz, source_last_ts timestamptz, input_bars int,
                                       expires_at timestamptz, swing_structure jsonb, pivots_json jsonb,
                                       candidate_counts_json jsonb, candidate_count int,
                                       fib_levels_json jsonb, confluence_zones_json jsonb,
                                       glance_degree text, glance_pattern text, glance_complete boolean, glance_wave text,
                                       glance_wave_dir text, glance_score smallint, glance_alt_score smallint,
                                       glance_hold double precision, glance_hold_side text, glance_target double precision,
                                       setups_json jsonb, setup_degree text, setup_kind text, setup_side text, setup_status text,
                                       setup_rr real, setup_risk_pct real)
  on conflict (security_id, timeframe) do update set
    algorithm_version = excluded.algorithm_version, analysis_timestamp = excluded.analysis_timestamp,
    source_first_ts = excluded.source_first_ts, source_last_ts = excluded.source_last_ts, input_bars = excluded.input_bars,
    computed_at = excluded.computed_at, expires_at = excluded.expires_at, swing_structure = excluded.swing_structure,
    pivots_json = excluded.pivots_json, candidate_counts_json = excluded.candidate_counts_json,
    candidate_count = excluded.candidate_count, fib_levels_json = excluded.fib_levels_json,
    confluence_zones_json = excluded.confluence_zones_json,
    glance_degree = excluded.glance_degree, glance_pattern = excluded.glance_pattern, glance_complete = excluded.glance_complete,
    glance_wave = excluded.glance_wave, glance_wave_dir = excluded.glance_wave_dir, glance_score = excluded.glance_score,
    glance_alt_score = excluded.glance_alt_score, glance_hold = excluded.glance_hold, glance_hold_side = excluded.glance_hold_side,
    glance_target = excluded.glance_target,
    setups_json = excluded.setups_json, setup_degree = excluded.setup_degree, setup_kind = excluded.setup_kind,
    setup_side = excluded.setup_side, setup_status = excluded.setup_status, setup_rr = excluded.setup_rr,
    setup_risk_pct = excluded.setup_risk_pct;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;

-- The Setups screen: every security whose preferred count (at the glance degree) defines a setup.
create or replace function public.setup_scan(
  p_timeframe text default '1d',
  p_side text default null,             -- buy | sell
  p_status text default null,           -- active | waiting
  p_kind text default null,             -- a setup kind (engine setup.ts)
  p_min_rr real default null,
  p_min_score integer default null,
  p_min_dollar_volume numeric default null,
  p_sort text default 'rr',             -- rr | confidence | risk | dollar_volume | symbol
  p_limit integer default 50,
  p_offset integer default 0
)
returns table(symbol text, name text, exchange text, asset_subtype text, close double precision, change_pct double precision,
              dollar_volume double precision, last_ts timestamptz, degree text, kind text, side text, status text,
              score smallint, rr real, risk_pct real, setup jsonb, total bigint)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  return query execute $q$
  select s.symbol, s.name, s.exchange, s.asset_subtype, px(x.close)::float8,
         case when x.prev_close > 0 then (x.close / x.prev_close - 1)::float8 end,
         x.adv20::float8, x.last_ts::timestamptz,
         a.setup_degree, a.setup_kind, a.setup_side, a.setup_status, a.glance_score, a.setup_rr, a.setup_risk_pct,
         a.setups_json -> a.setup_degree, count(*) over ()
  from analysis_results a
  join securities s on s.id = a.security_id and s.is_active and s.coverage is not null
  join security_snapshot x on x.security_id = a.security_id
  where a.timeframe = $1 and a.setup_side is not null
    and ($2 is null or a.setup_side = $2)
    and ($3 is null or a.setup_status = $3)
    and ($4 is null or a.setup_kind = $4)
    and ($5 is null or a.setup_rr >= $5)
    and ($6 is null or a.glance_score >= $6)
    and ($7 is null or x.adv20 >= $7)
  order by
    case when $8 = 'rr' then a.setup_rr end desc nulls last,
    case when $8 = 'confidence' then a.glance_score end desc nulls last,
    case when $8 = 'risk' then a.setup_risk_pct end asc nulls last,
    case when $8 = 'symbol' then s.symbol end asc,
    x.adv20 desc nulls last
  limit least(greatest($9, 1), 200) offset greatest($10, 0)
$q$ using p_timeframe, p_side, p_status, p_kind, p_min_rr, p_min_score, p_min_dollar_volume, p_sort, p_limit, p_offset;
end $function$;
grant execute on function public.setup_scan(text, text, text, text, real, integer, numeric, text, integer, integer) to anon, authenticated;
