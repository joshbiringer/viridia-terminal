-- Cycle 3, Phase 4: a daily record of each security's preferred daily count, and weekly alignment
-- for setups.
--
-- analysis_history: one row per security per session (the date of the last daily bar), written by
-- trigger whenever the daily analysis row is stored. A recompute on the same session overwrites that
-- day, so each day holds the latest engine's reading. Kept 180 days (pruned nightly). Small rows:
-- about 4,000 a day.

create table if not exists public.analysis_history (
  security_id bigint not null references public.securities(id) on delete cascade,
  day date not null,
  degree text, pattern text, complete boolean, wave text, wave_dir text, score smallint,
  hold double precision, setup_side text, setup_kind text, close double precision,
  algorithm_version text,
  primary key (security_id, day)
);
alter table public.analysis_history enable row level security;
-- no policies: read through get_analysis_history only

create or replace function public.analysis_history_record()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.timeframe <> '1d' or new.source_last_ts is null then return new; end if;
  insert into analysis_history (security_id, day, degree, pattern, complete, wave, wave_dir, score, hold,
                                setup_side, setup_kind, close, algorithm_version)
  values (new.security_id, (new.source_last_ts at time zone 'America/New_York')::date,
          new.glance_degree, new.glance_pattern, new.glance_complete, new.glance_wave, new.glance_wave_dir,
          new.glance_score, new.glance_hold, new.setup_side, new.setup_kind,
          (new.confluence_zones_json->>'close')::float8, new.algorithm_version)
  on conflict (security_id, day) do update set
    degree = excluded.degree, pattern = excluded.pattern, complete = excluded.complete, wave = excluded.wave,
    wave_dir = excluded.wave_dir, score = excluded.score, hold = excluded.hold, setup_side = excluded.setup_side,
    setup_kind = excluded.setup_kind, close = excluded.close, algorithm_version = excluded.algorithm_version;
  return new;
end $$;
revoke all on function public.analysis_history_record() from public, anon, authenticated;
drop trigger if exists analysis_results_history on public.analysis_results;
create trigger analysis_results_history after insert or update on public.analysis_results
  for each row execute function public.analysis_history_record();

-- Seed today's rows from what is already stored, so "what changed" has a starting point.
insert into public.analysis_history (security_id, day, degree, pattern, complete, wave, wave_dir, score, hold,
                                     setup_side, setup_kind, close, algorithm_version)
select a.security_id, (a.source_last_ts at time zone 'America/New_York')::date, a.glance_degree, a.glance_pattern,
       a.glance_complete, a.glance_wave, a.glance_wave_dir, a.glance_score, a.glance_hold, a.setup_side, a.setup_kind,
       (a.confluence_zones_json->>'close')::float8, a.algorithm_version
from public.analysis_results a
where a.timeframe = '1d' and a.source_last_ts is not null
on conflict (security_id, day) do nothing;

create or replace function public.get_analysis_history(p_symbol text, p_limit integer default 10)
returns table(day date, degree text, pattern text, complete boolean, wave text, wave_dir text, score smallint,
              hold double precision, setup_side text, setup_kind text, close double precision)
language sql stable security definer set search_path to 'public' as $$
  select h.day, h.degree, h.pattern, h.complete, h.wave, h.wave_dir, h.score, h.hold, h.setup_side, h.setup_kind, h.close
  from analysis_history h join securities s on s.id = h.security_id
  where s.symbol = upper(p_symbol)
  order by h.day desc
  limit least(greatest(p_limit, 1), 60)
$$;
grant execute on function public.get_analysis_history(text, integer) to anon, authenticated;

-- Nightly prune (180 days).
select cron.schedule('viridia-history-prune', '17 7 * * *', $$delete from public.analysis_history where day < current_date - 180$$);

-- The analysis worker runs every 2 minutes (was 5) so a full recompute finishes in hours, not a day.
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'viridia-analysis-worker'), schedule := '*/2 * * * *');

-- Setups: the weekly preferred count's direction, so setups can be filtered to the larger trend.
drop function if exists public.setup_scan(text, text, text, text, real, integer, numeric, text, integer, integer);
create or replace function public.setup_scan(
  p_timeframe text default '1d', p_side text default null, p_status text default null, p_kind text default null,
  p_min_rr real default null, p_min_score integer default null, p_min_dollar_volume numeric default null,
  p_sort text default 'rr', p_limit integer default 50, p_offset integer default 0,
  p_aligned boolean default null      -- true: the weekly count's move in progress points the same way as the setup
)
returns table(symbol text, name text, exchange text, asset_subtype text, close double precision, change_pct double precision,
              dollar_volume double precision, last_ts timestamptz, degree text, kind text, side text, status text,
              score smallint, rr real, risk_pct real, setup jsonb, weekly_dir text, total bigint)
language plpgsql stable security definer set search_path to 'public' as $function$
begin
  return query execute $q$
  select s.symbol, s.name, s.exchange, s.asset_subtype, px(x.close)::float8,
         case when x.prev_close > 0 then (x.close / x.prev_close - 1)::float8 end,
         x.adv20::float8, x.last_ts::timestamptz,
         a.setup_degree, a.setup_kind, a.setup_side, a.setup_status, a.glance_score, a.setup_rr, a.setup_risk_pct,
         a.setups_json -> a.setup_degree, w.glance_wave_dir, count(*) over ()
  from analysis_results a
  join securities s on s.id = a.security_id and s.is_active and s.coverage is not null
  join security_snapshot x on x.security_id = a.security_id
  left join analysis_results w on w.security_id = a.security_id and w.timeframe = '1w'
  where a.timeframe = $1 and a.setup_side is not null
    and ($2 is null or a.setup_side = $2)
    and ($3 is null or a.setup_status = $3)
    and ($4 is null or a.setup_kind = $4)
    and ($5 is null or a.setup_rr >= $5)
    and ($6 is null or a.glance_score >= $6)
    and ($7 is null or x.adv20 >= $7)
    and ($11 is null or ($11 = (w.glance_wave_dir = case a.setup_side when 'buy' then 'up' else 'down' end)))
  order by
    case when $8 = 'rr' then a.setup_rr end desc nulls last,
    case when $8 = 'confidence' then a.glance_score end desc nulls last,
    case when $8 = 'risk' then a.setup_risk_pct end asc nulls last,
    case when $8 = 'symbol' then s.symbol end asc,
    x.adv20 desc nulls last
  limit least(greatest($9, 1), 200) offset greatest($10, 0)
$q$ using p_timeframe, p_side, p_status, p_kind, p_min_rr, p_min_score, p_min_dollar_volume, p_sort, p_limit, p_offset, p_aligned;
end $function$;
grant execute on function public.setup_scan(text, text, text, text, real, integer, numeric, text, integer, integer, boolean) to anon, authenticated;
