-- PENDING: awaiting Supabase approval.
-- Phase 2, step 1-2 (Nov 10 2026): what the track-record page needs to be honest about itself.
--   backtest_freshness()      when the replay last ran, the signal window, and whether the job is on
--   backtest_score_buckets()  outcomes by Pattern Confidence bucket and side, so the page can show whether
--                             a higher score actually did better before anyone filters on it
-- and the replay job back on at a gentle pace (it was switched off after the Nov 5 disk I/O incident).

create or replace function public.backtest_freshness()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'last_run', (select max(computed_at) from backtest_runs),
    'first_signal', (select min(ts) from backtest_trials),
    'last_signal', (select max(ts) from backtest_trials),
    'securities', (select count(distinct security_id) from backtest_trials),
    'job_active', coalesce((select active from cron.job where jobname = 'viridia-backtest'), false))
$$;
grant execute on function public.backtest_freshness() to anon, authenticated;

create or replace function public.backtest_score_buckets(p_min_rr real default null)
returns table(bucket int, side text, trials bigint, resolved bigint, targets bigint, positive bigint, avg_r double precision)
language sql stable security definer set search_path to 'public' as $$
  select greatest(least((t.score / 10) * 10, 90), 40)::int, t.side, count(*),
         count(*) filter (where outcome in ('target','stop','expired')),
         count(*) filter (where outcome = 'target'),
         count(*) filter (where outcome in ('target','stop','expired') and r > 0),
         avg(r) filter (where outcome in ('target','stop','expired'))::float8
  from backtest_trials t
  where p_min_rr is null or t.rr >= p_min_rr
  group by 1, 2
  order by 1, 2
$$;
grant execute on function public.backtest_score_buckets(real) to anon, authenticated;

-- Replay back on: every 15 minutes, 2 securities in flight (was every 3 minutes with 6).
select cron.alter_job((select jobid from cron.job where jobname = 'viridia-backtest'),
  schedule => '*/15 * * * *', command => $$select public.backtest_tick('backtest-1.0.0', 2)$$, active => true);
