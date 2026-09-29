-- Setup quality from the track record (Cycle 5, phase 3).
-- Each setup kind and side is graded from its replayed trials, split by date at the median trial
-- date so the two halves are out of sample to each other:
--   positive  average ≥ +0.05R overall and above zero in both halves
--   negative  average ≤ −0.05R overall and below zero in both halves
--   mixed     anything else with enough cases
--   thin      fewer than 100 resolved cases, or fewer than 40 in either half
-- The Setups screen ranks by the kind's record, then confidence, and can leave negative kinds out.

create table if not exists public.setup_kind_quality (
  kind text not null, side text not null,
  n int not null, avg_r real, hit_rate real,
  split_date date, n_early int, r_early real, n_late int, r_late real,
  grade text not null check (grade in ('positive', 'mixed', 'negative', 'thin')),
  updated_at timestamptz not null default now(),
  primary key (kind, side)
);
alter table public.setup_kind_quality enable row level security;

create or replace function public.refresh_setup_quality()
returns int language plpgsql security definer set search_path = public as $$
declare v_split date; v_n int;
begin
  select percentile_disc(0.5) within group (order by ts) into v_split
  from backtest_trials where outcome in ('target', 'stop', 'expired');
  if v_split is null then return 0; end if;
  delete from setup_kind_quality;
  insert into setup_kind_quality (kind, side, n, avg_r, hit_rate, split_date, n_early, r_early, n_late, r_late, grade)
  select kind, side, n, avg_r, hit, v_split, n_e, r_e, n_l, r_l,
    case
      when n < 100 or n_e < 40 or n_l < 40 then 'thin'
      when avg_r >= 0.05 and r_e > 0 and r_l > 0 then 'positive'
      when avg_r <= -0.05 and r_e < 0 and r_l < 0 then 'negative'
      else 'mixed' end
  from (
    select kind, side, count(*)::int n, avg(r)::real avg_r, avg((outcome = 'target')::int)::real hit,
      count(*) filter (where ts < v_split)::int n_e, (avg(r) filter (where ts < v_split))::real r_e,
      count(*) filter (where ts >= v_split)::int n_l, (avg(r) filter (where ts >= v_split))::real r_l
    from backtest_trials where outcome in ('target', 'stop', 'expired')
    group by kind, side
  ) x;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.refresh_setup_quality() from public, anon, authenticated;

create or replace function public.setup_quality()
returns setof public.setup_kind_quality language sql stable security definer set search_path = public as $$
  select * from setup_kind_quality order by side, avg_r desc nulls last
$$;
grant execute on function public.setup_quality() to anon, authenticated;

-- setup_scan: adds the kind's grade and average R to each row, a 'quality' sort (kind record, then
-- confidence) and p_exclude_negative. Drop first because the result columns change.
drop function if exists public.setup_scan(text, text, text, text, real, integer, numeric, text, integer, integer, boolean);
create function public.setup_scan(p_timeframe text default '1d', p_side text default null, p_status text default null, p_kind text default null,
  p_min_rr real default null, p_min_score integer default null, p_min_dollar_volume numeric default null, p_sort text default 'rr',
  p_limit integer default 50, p_offset integer default 0, p_aligned boolean default null, p_exclude_negative boolean default null)
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
  order by
    case when $8 = 'quality' then coalesce(q.avg_r, 0) end desc nulls last,
    case when $8 = 'quality' then a.glance_score end desc nulls last,
    case when $8 = 'rr' then a.setup_rr end desc nulls last,
    case when $8 = 'confidence' then a.glance_score end desc nulls last,
    case when $8 = 'risk' then a.setup_risk_pct end asc nulls last,
    case when $8 = 'symbol' then s.symbol end asc,
    x.adv20 desc nulls last
  limit least(greatest($9, 1), 200) offset greatest($10, 0)
$q$ using p_timeframe, p_side, p_status, p_kind, p_min_rr, p_min_score, p_min_dollar_volume, p_sort, p_limit, p_offset, p_aligned, p_exclude_negative;
end $function$;
grant execute on function public.setup_scan(text, text, text, text, real, integer, numeric, text, integer, integer, boolean, boolean) to anon, authenticated;

select public.refresh_setup_quality();
select cron.schedule('viridia-setup-quality', '47 7 * * 2-6', $$select public.refresh_setup_quality()$$);
