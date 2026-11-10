-- PENDING (Nov 10 2026): written, awaiting Supabase approval. Ingest stalled Nov 7-10: the planner ran the weekly coverage refresh inline, under the
-- worker's 8 s statement timeout. Once the refresh was due (7 days after Oct 31) every plan timed out and no new
-- sessions were queued. The refresh now runs in its own weekly pg_cron job, outside the API role's limit.

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

    -- refresh_coverage_universe() moved to its own weekly job (0043): inside the planner it ran under the
    -- worker's 8 s statement limit, timed out, never recorded its run, and blocked every plan from Nov 7.
  end if;

  return jsonb_build_object('nightly', n_nightly, 'backfill', n_backfill, 'splits', n_splits, 'promotion', n_promote,
                            'latest_session', v_latest, 'floor', v_floor);
end $function$;

select cron.schedule('viridia-universe-refresh', '40 8 * * 0', $$select public.refresh_coverage_universe()$$);
