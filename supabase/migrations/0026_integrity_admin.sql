-- Data integrity checks and an internal system view (product sprint, priority 0 and 9).
-- Checks run nightly over the last 45 sessions (plus coverage and master-data checks), so they read
-- a small slice of price_bars. Findings replace the previous run's. The /system page reads them
-- through system_status(), which only app admins can call.

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid())
$$;
grant execute on function public.is_app_admin() to authenticated;

create table if not exists public.data_integrity_findings (
  id bigserial primary key,
  check_name text not null,
  severity text not null check (severity in ('high', 'medium', 'info')),
  security_id bigint references public.securities(id) on delete cascade,
  symbol text,
  ts timestamptz,
  detail jsonb not null default '{}'::jsonb,
  found_at timestamptz not null default now()
);
create index if not exists data_integrity_findings_check_idx on public.data_integrity_findings (check_name, severity);
alter table public.data_integrity_findings enable row level security;

create or replace function public.run_integrity_checks()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_latest timestamptz; v_counts jsonb;
begin
  select max(last_ts) into v_latest from bar_coverage where timeframe = '1d';
  delete from data_integrity_findings;

  -- recent daily bars with the previous close, per security
  create temporary table _recent on commit drop as
  select b.security_id, b.ts, b.open, b.high, b.low, b.close, b.volume,
         lag(b.close) over (partition by b.security_id order by b.ts) as prev_close
  from price_bars b
  where b.timeframe = '1d' and b.ts >= v_latest - interval '65 days';

  -- malformed bars: non-positive prices, or open/close outside the day's range
  insert into data_integrity_findings (check_name, severity, security_id, symbol, ts, detail)
  select 'malformed_bar', 'high', r.security_id, s.symbol, r.ts,
         jsonb_build_object('open', r.open, 'high', r.high, 'low', r.low, 'close', r.close)
  from _recent r join securities s on s.id = r.security_id
  where r.low <= 0 or r.close <= 0 or r.high < r.low
     or r.open > r.high * 1.0001 or r.open < r.low * 0.9999 or r.close > r.high * 1.0001 or r.close < r.low * 0.9999;

  -- split-like jumps: the close moved by a common split ratio, a sign history wasn't adjusted
  insert into data_integrity_findings (check_name, severity, security_id, symbol, ts, detail)
  select 'split_suspect', 'high', r.security_id, s.symbol, r.ts,
         jsonb_build_object('prev_close', r.prev_close, 'close', r.close, 'ratio', round((r.prev_close / r.close)::numeric, 3))
  from _recent r join securities s on s.id = r.security_id
  where r.prev_close > 0 and r.close > 0
    and exists (select 1 from unnest(array[2, 3, 4, 5, 8, 10, 20, 0.5, 1/3.0, 0.25, 0.2, 0.125, 0.1, 0.05]) k
                where abs((r.prev_close / r.close) / k - 1) < 0.03);

  -- abnormal moves over 40% that aren't split-like: real news or a data error, worth a look
  insert into data_integrity_findings (check_name, severity, security_id, symbol, ts, detail)
  select 'abnormal_move', 'medium', r.security_id, s.symbol, r.ts,
         jsonb_build_object('prev_close', r.prev_close, 'close', r.close, 'change', round((r.close / r.prev_close - 1)::numeric, 4))
  from _recent r join securities s on s.id = r.security_id
  where r.prev_close > 0 and abs(r.close / r.prev_close - 1) > 0.4
    and not exists (select 1 from data_integrity_findings f where f.check_name = 'split_suspect' and f.security_id = r.security_id and f.ts = r.ts);

  -- open far from the prior close while the close is not: the open may be on a different adjustment basis
  insert into data_integrity_findings (check_name, severity, security_id, symbol, ts, detail)
  select 'adjustment_mismatch', 'medium', r.security_id, s.symbol, r.ts,
         jsonb_build_object('prev_close', r.prev_close, 'open', r.open, 'close', r.close)
  from _recent r join securities s on s.id = r.security_id
  where r.prev_close > 0 and abs(r.open / r.prev_close - 1) > 0.4 and abs(r.close / r.prev_close - 1) < 0.1;

  -- stale prices: active, fully covered securities more than 5 days behind the latest session
  insert into data_integrity_findings (check_name, severity, security_id, symbol, ts, detail)
  select 'stale_price', 'medium', s.id, s.symbol, c.last_ts, jsonb_build_object('latest_session', v_latest)
  from bar_coverage c join securities s on s.id = c.security_id and s.is_active and s.coverage = 'full'
  where c.timeframe = '1d' and c.last_ts < v_latest - interval '5 days';

  -- duplicate securities: two active listings with the same name on the same exchange
  insert into data_integrity_findings (check_name, severity, security_id, symbol, detail)
  select 'duplicate_security', 'info', min(s.id), string_agg(s.symbol, ', ' order by s.symbol),
         jsonb_build_object('name', s.name, 'exchange', s.exchange, 'count', count(*))
  from securities s where s.is_active and s.name is not null
  group by s.name, s.exchange having count(*) > 1;

  -- ticker changes: a provider symbol that changed in the last 60 days
  insert into data_integrity_findings (check_name, severity, security_id, symbol, ts, detail)
  select 'ticker_change', 'info', m.security_id, s.symbol, m.valid_from,
         jsonb_build_object('provider', m.provider, 'provider_symbol', m.provider_symbol)
  from security_provider_symbols m join securities s on s.id = m.security_id
  where m.valid_from > now() - interval '60 days'
    and exists (select 1 from security_provider_symbols o where o.security_id = m.security_id and o.provider = m.provider and o.provider_symbol <> m.provider_symbol);

  -- corporate actions recorded by the security-master sync in the last 60 days
  insert into data_integrity_findings (check_name, severity, security_id, symbol, ts, detail)
  select 'corporate_action', 'info', e.security_id, s.symbol, coalesce(e.effective_at, e.created_at),
         jsonb_build_object('event', e.event_type, 'old', e.old_value, 'new', e.new_value)
  from security_events e join securities s on s.id = e.security_id
  where e.created_at > now() - interval '60 days';

  select coalesce(jsonb_object_agg(check_name, n), '{}'::jsonb) into v_counts
  from (select check_name, count(*) n from data_integrity_findings group by 1) x;
  insert into ingest_state (key, value, updated_at) values ('integrity', jsonb_build_object('ran_at', now(), 'counts', v_counts), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  return v_counts;
end $$;
revoke all on function public.run_integrity_checks() from public, anon, authenticated;

-- Everything operational in one call, for admins only.
create or replace function public.system_status()
returns jsonb language plpgsql stable security definer set search_path = public, cron as $$
begin
  if not is_app_admin() then raise exception 'not authorized' using errcode = '42501'; end if;
  return jsonb_build_object(
    'db_bytes', pg_database_size(current_database()),
    'tables', (select jsonb_agg(jsonb_build_object('name', c.relname, 'bytes', pg_total_relation_size(c.oid)) order by pg_total_relation_size(c.oid) desc)
               from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'm') and pg_total_relation_size(c.oid) > 1000000),
    'jobs', (select jsonb_agg(jsonb_build_object('name', j.jobname, 'schedule', j.schedule, 'active', j.active,
               'last', (select jsonb_build_object('status', d.status, 'start', d.start_time, 'end', d.end_time, 'message', left(d.return_message, 160))
                        from cron.job_run_details d where d.jobid = j.jobid order by d.start_time desc limit 1)) order by j.jobid) from cron.job j),
    'coverage', (select jsonb_build_object('securities', count(*), 'latest', max(last_ts), 'behind', count(*) filter (where last_ts < (select max(last_ts) from bar_coverage where timeframe = '1d') - interval '5 days'))
                 from bar_coverage where timeframe = '1d'),
    'analysis', (select jsonb_object_agg(timeframe, n) from (select timeframe, count(*) n from analysis_results group by 1) a),
    'backtest', (select jsonb_build_object('securities', count(distinct security_id), 'trials', count(*)) from backtest_trials),
    'queue', (select jsonb_build_object('fetch_jobs_open', count(*) filter (where status not in ('done', 'failed'))) from fetch_jobs),
    'integrity', (select value from ingest_state where key = 'integrity'),
    'findings', (select coalesce(jsonb_agg(to_jsonb(f) order by case f.severity when 'high' then 0 when 'medium' then 1 else 2 end, f.ts desc nulls last), '[]'::jsonb)
                 from (select check_name, severity, symbol, ts, detail from data_integrity_findings order by id limit 300) f)
  );
end $$;
grant execute on function public.system_status() to authenticated;

select cron.schedule('viridia-integrity', '5 23 * * 1-5', $$select public.run_integrity_checks()$$);
