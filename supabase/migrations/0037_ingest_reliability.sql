-- Nightly ingest reliability.
--
-- What went wrong (sessions of Nov 2–4 2026 never loaded):
--  1. ingest_grouped_daily() hit the 8s statement_timeout under contention and was retried until it
--     ran out of attempts.
--  2. The Massive (Polygon) free plan refuses a day's grouped bars until after midnight Eastern
--     ("Attempted to request today's data before end of day"). The planner queued the session at
--     18:30 ET, so every evening job used up its six attempts on 403s.
--  3. A failed session was locked out for a full day before being planned again.

-- (A role-wide service_role timeout of 120s was tried here and reverted the same day: it let the
-- analysis worker's heavy batches hold connections for minutes and saturated the database. The
-- nightly load finishes in 1–2 s on an idle database; the timeouts came from contention, which the
-- 00:30 ET schedule and 2-hour re-plan below address.)

-- A session is eligible once the provider has closed its day: 00:30 ET the following morning.
create or replace function public.latest_eligible_session()
returns date language sql stable set search_path to 'public' as $$
  with d as (
    select case when (now() at time zone 'America/New_York')::time >= time '00:30'
                then public.et_today() - 1 else public.et_today() - 2 end as d
  )
  select max(x)::date from d, generate_series(d.d - 6, d.d, interval '1 day') x where extract(isodow from x) < 6
$$;

-- Re-plan a failed nightly session after 2 hours instead of a day.
create or replace function public.plan_market_data_jobs()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_latest date := latest_eligible_session();
  v_floor  date := history_floor();
  v_min date; v_max date; v_ready boolean; v_refreshed timestamptz;
  v_pending_backfill int; n_nightly int := 0; n_backfill int := 0; n_splits int := 0; n_promote int := 0;
begin
  update fetch_jobs set status = 'pending', run_after = now()
  where status = 'running' and started_at < now() - interval '10 minutes';
  delete from fetch_jobs where status in ('done','skipped') and finished_at < now() - interval '7 days';
  delete from provider_calls where called_at < now() - interval '1 day';

  select min(session_date), max(session_date) into v_min, v_max from market_sessions;
  select coalesce((value->>'ready')::boolean, false), (value->>'refreshed_at')::timestamptz
    into v_ready, v_refreshed from ingest_state where key = 'universe';

  insert into fetch_jobs (kind, job_date, priority, requested_by)
  select 'grouped_daily', d::date, 20, 'nightly'
  from generate_series(greatest(coalesce(v_min, v_latest - 9), v_floor), v_latest, interval '1 day') d
  where extract(isodow from d) < 6
    and not exists (select 1 from market_sessions m where m.session_date = d::date)
    and not exists (select 1 from fetch_jobs j where j.kind = 'grouped_daily' and j.job_date = d::date
                    and j.status = 'failed' and j.finished_at > now() - interval '2 hours')
  on conflict do nothing;
  get diagnostics n_nightly = row_count;

  select count(*) into v_pending_backfill from fetch_jobs
  where kind = 'grouped_daily' and requested_by = 'backfill' and status in ('pending','running');
  if v_min is not null and v_min > v_floor and v_pending_backfill < 3 then
    insert into fetch_jobs (kind, job_date, priority, requested_by)
    select 'grouped_daily', d::date, 50, 'backfill'
    from generate_series(v_min - 1, greatest(v_floor, v_min - 14), interval '-1 day') d
    where extract(isodow from d) < 6
      and not exists (select 1 from market_sessions m where m.session_date = d::date)
      and not exists (select 1 from fetch_jobs j where j.kind = 'grouped_daily' and j.job_date = d::date
                      and (j.status in ('pending','running') or (j.status = 'failed' and j.finished_at > now() - interval '1 day')))
    order by d desc
    limit 3 - v_pending_backfill
    on conflict do nothing;
    get diagnostics n_backfill = row_count;
  end if;

  if v_ready then
    insert into fetch_jobs (kind, job_date, priority, requested_by)
    select 'splits', m.session_date, 25, 'nightly' from market_sessions m
    where m.is_open and not m.splits_checked
    on conflict do nothing;
    get diagnostics n_splits = row_count;

    if v_min <= v_floor + 7 then
      insert into fetch_jobs (kind, security_id, timeframe, priority, requested_by)
      select 'ticker_history', s.id, '1d', 60, 'promotion'
      from securities s
      left join bar_coverage c on c.security_id = s.id and c.timeframe = '1d'
      where s.coverage = 'full' and s.is_active
        and not coalesce(c.history_complete, false)
        and (c.first_ts is null or c.first_ts > (v_floor + 10)::timestamp at time zone 'UTC')
        and not exists (select 1 from fetch_jobs j where j.kind = 'ticker_history' and j.security_id = s.id
                        and j.status = 'failed' and j.finished_at > now() - interval '1 day')
      limit 10
      on conflict do nothing;
      get diagnostics n_promote = row_count;
    end if;

    if v_refreshed is null or v_refreshed < now() - interval '7 days' then
      perform refresh_coverage_universe();
    end if;
  end if;

  return jsonb_build_object('nightly', n_nightly, 'backfill', n_backfill, 'splits', n_splits, 'promotion', n_promote,
                            'latest_session', v_latest, 'floor', v_floor);
end $function$;

-- What the app shows about data freshness: the last session loaded, the last one the provider has
-- closed, and when the nightly load last ran.
create or replace function public.data_status()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'last_session', (select max(session_date) from market_sessions where is_open),
    'expected_session', latest_eligible_session(),
    'ingested_at', (select max(ingested_at) from market_sessions where is_open),
    'analysed_at', (select value->>'finished_at' from ingest_state where key = 'analysis_last_run'),
    'pending_sessions', (select count(*) from fetch_jobs where kind = 'grouped_daily' and status in ('pending','running')),
    'failed_sessions', (select coalesce(jsonb_agg(distinct job_date), '[]'::jsonb) from fetch_jobs j
                        where kind = 'grouped_daily' and status = 'failed' and finished_at > now() - interval '3 days'
                          and not exists (select 1 from market_sessions m where m.session_date = j.job_date)),
    'coverage', (select count(*) from bar_coverage where timeframe = '1d' and status = 'ready')
  )
$$;
grant execute on function public.data_status() to anon, authenticated;

-- The market snapshot refreshes only once a new session has loaded; check every 15 minutes rather
-- than hourly so scans and setups follow a fresh session within minutes (a no-op check costs ~10 ms).
select cron.alter_job((select jobid from cron.job where jobname = 'viridia-snapshot-refresh'), schedule => '*/15 * * * *');

-- Temporary, Nov 5 2026: slower workers while the database's disk I/O budget recovers from the
-- catch-up load. Restore to '*/2 * * * *' (analysis) and '* * * * *' (market data) once healthy.
select cron.alter_job((select jobid from cron.job where jobname = 'viridia-analysis-worker'), schedule => '*/10 * * * *');
select cron.alter_job((select jobid from cron.job where jobname = 'kestrel-market-data-worker'), schedule => '*/5 * * * *');
