-- Cycle 4, Phase 1: setup track record. The app's /api/backtest/[symbol] route replays the engine over
-- a security's daily history (engine backtest.ts, no look-ahead); Postgres calls it through pg_net once
-- a minute (backtest_tick) and stores every setup the engine would have shown, with its outcome.
-- Running it on Vercel keeps it off the analysis worker's CPU budget and deploys with every push.

create table if not exists public.backtest_trials (
  security_id bigint not null references public.securities(id) on delete cascade,
  ts date not null,
  degree text not null, kind text not null, side text not null, status text not null,
  score smallint, rr real, entry double precision, stop double precision, target double precision,
  outcome text not null check (outcome in ('target','stop','expired','missed','pending')),
  r real, bars smallint,
  primary key (security_id, ts, kind)
);
create index if not exists backtest_trials_kind_idx on public.backtest_trials (kind, outcome);
alter table public.backtest_trials enable row level security;

create table if not exists public.backtest_runs (
  security_id bigint primary key references public.securities(id) on delete cascade,
  version text not null,
  source_last_ts timestamptz,
  trials int not null default 0,
  computed_at timestamptz not null default now()
);
alter table public.backtest_runs enable row level security;

-- Replace a security's trials in one go.
create or replace function public.store_backtest(p_security_id bigint, p_version text, p_source_last_ts timestamptz, p_trials jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_n int;
begin
  delete from backtest_trials where security_id = p_security_id;
  insert into backtest_trials (security_id, ts, degree, kind, side, status, score, rr, entry, stop, target, outcome, r, bars)
  select p_security_id, (x.ts)::date, x.degree, x.kind, x.side, x.status, x.score, x.rr, x.entry, x.stop, x.target, x.outcome, x.r, x.bars
  from jsonb_to_recordset(p_trials) as x(ts timestamptz, degree text, kind text, side text, status text, score smallint, rr real,
                                          entry double precision, stop double precision, target double precision,
                                          outcome text, r real, bars smallint)
  on conflict (security_id, ts, kind) do nothing;
  get diagnostics v_n = row_count;
  insert into backtest_runs (security_id, version, source_last_ts, trials, computed_at)
  values (p_security_id, p_version, p_source_last_ts, v_n, now())
  on conflict (security_id) do update set version = excluded.version, source_last_ts = excluded.source_last_ts,
    trials = excluded.trials, computed_at = excluded.computed_at;
  return v_n;
end $function$;
revoke all on function public.store_backtest(bigint, text, timestamptz, jsonb) from public, anon, authenticated;

-- Track record by setup kind and side (optionally a minimum Pattern Confidence and reward:risk).
create or replace function public.backtest_stats(p_min_score integer default null, p_min_rr real default null)
returns table(kind text, side text, trials bigint, resolved bigint, targets bigint, stops bigint, expired bigint,
              missed bigint, pending bigint, hit_rate double precision, avg_r double precision, median_bars double precision)
language sql stable security definer set search_path to 'public' as $$
  select t.kind, t.side, count(*),
         count(*) filter (where outcome in ('target','stop','expired')),
         count(*) filter (where outcome = 'target'), count(*) filter (where outcome = 'stop'),
         count(*) filter (where outcome = 'expired'), count(*) filter (where outcome = 'missed'),
         count(*) filter (where outcome = 'pending'),
         (count(*) filter (where outcome = 'target'))::float8 / nullif(count(*) filter (where outcome in ('target','stop','expired')), 0),
         avg(r) filter (where outcome in ('target','stop','expired'))::float8,
         percentile_cont(0.5) within group (order by bars) filter (where outcome in ('target','stop','expired'))::float8
  from backtest_trials t
  where (p_min_score is null or t.score >= p_min_score) and (p_min_rr is null or t.rr >= p_min_rr)
  group by t.kind, t.side
  order by count(*) desc
$$;
grant execute on function public.backtest_stats(integer, real) to anon, authenticated;

-- One security's trials, newest first.
create or replace function public.backtest_symbol(p_symbol text, p_limit integer default 40)
returns table(ts date, degree text, kind text, side text, status text, score smallint, rr real, entry double precision,
              stop double precision, target double precision, outcome text, r real, bars smallint)
language sql stable security definer set search_path to 'public' as $$
  select t.ts, t.degree, t.kind, t.side, t.status, t.score, t.rr, t.entry, t.stop, t.target, t.outcome, t.r, t.bars
  from backtest_trials t join securities s on s.id = t.security_id
  where s.symbol = upper(p_symbol)
  order by t.ts desc
  limit least(greatest(p_limit, 1), 200)
$$;
grant execute on function public.backtest_symbol(text, integer) to anon, authenticated;

create or replace function public.backtest_coverage(p_version text)
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'done', (select count(*) from backtest_runs where version = p_version),
    'total', (select count(*) from securities where is_active and coverage = 'full'),
    'trials', (select count(*) from backtest_trials))
$$;
grant execute on function public.backtest_coverage(text) to anon, authenticated;

-- ------------------------------------------------------------------ scheduling through pg_net
create table if not exists public.backtest_queue (
  request_id bigint primary key,
  security_id bigint not null references public.securities(id) on delete cascade,
  requested_at timestamptz not null default now()
);
alter table public.backtest_queue enable row level security;

create or replace function public.backtest_tick(p_version text default 'backtest-1.0.0', p_parallel integer default 6)
returns jsonb language plpgsql security definer set search_path to 'public', 'extensions' as $function$
declare q record; v_body jsonb; v_stored int := 0; v_sent int := 0; r record;
begin
  -- 1. collect finished responses
  for q in
    select b.request_id, b.security_id, b.requested_at, h.status_code, h.content, h.timed_out, h.error_msg
    from backtest_queue b left join net._http_response h on h.id = b.request_id
  loop
    if q.status_code = 200 then
      begin
        v_body := q.content::jsonb;
        if v_body->>'version' = p_version then
          perform store_backtest(q.security_id, p_version, (v_body->>'source_last_ts')::timestamptz, coalesce(v_body->'trials', '[]'::jsonb));
          v_stored := v_stored + 1;
        end if;
      exception when others then null;  -- a bad body is retried on a later tick
      end;
      delete from backtest_queue where request_id = q.request_id;
    elsif q.status_code is not null or q.timed_out or q.error_msg is not null or q.requested_at < now() - interval '5 minutes' then
      delete from backtest_queue where request_id = q.request_id;
    end if;
  end loop;
  -- 2. send the next requests: most-traded first, missing, older engine, or a week of new data
  for r in
    select s.id, s.symbol
    from bar_coverage c
    join securities s on s.id = c.security_id and s.is_active and s.coverage = 'full'
    left join backtest_runs b on b.security_id = s.id
    left join security_snapshot sn on sn.security_id = s.id
    where c.timeframe = '1d' and c.last_ts is not null
      and not exists (select 1 from backtest_queue x where x.security_id = s.id)
      and (b.security_id is null or b.version <> p_version or b.source_last_ts < c.last_ts - interval '7 days')
    order by (b.security_id is null) desc, sn.adv20 desc nulls last, s.id
    limit greatest(p_parallel - (select count(*) from backtest_queue), 0)
  loop
    insert into backtest_queue (request_id, security_id)
    values (net.http_get(url := 'https://viridia-terminal-ten.vercel.app/api/backtest/' || replace(r.symbol, '/', '%2F'),
                         timeout_milliseconds := 60000), r.id);
    v_sent := v_sent + 1;
  end loop;
  return jsonb_build_object('stored', v_stored, 'sent', v_sent);
end $function$;
revoke all on function public.backtest_tick(text, integer) from public, anon, authenticated;

select cron.schedule('viridia-backtest', '* * * * *', $$select public.backtest_tick('backtest-1.0.0', 15)$$);
