-- Portfolio X-Ray workspace (flagship redesign).
--   portfolio_closes     up to two years of daily closes for up to 130 symbols (holdings, benchmarks,
--                        factor and sector proxies) in one call, as [[date, close], ...]
--   portfolio_structure  each holding's nearest Fibonacci confluence zone from the latest analysis
--   portfolio_snapshots  saved X-Ray snapshots per portfolio, for "what changed between reviews"
--   portfolios.kind / household / benchmark   Advisor Mode hooks, not exposed in the product yet

create or replace function public.portfolio_closes(p_symbols text[], p_limit integer default 504)
returns table(symbol text, closes jsonb)
language sql stable security definer set search_path = public as $$
  select s.symbol,
         (select coalesce(jsonb_agg(jsonb_build_array(to_char(x.ts at time zone 'UTC', 'YYYY-MM-DD'), x.c) order by x.ts), '[]'::jsonb)
          from (select b.ts, px(b.close) as c from price_bars b
                where b.security_id = s.id and b.timeframe = '1d' and b.close > 0
                order by b.ts desc limit least(greatest(p_limit, 20), 520)) x)
  from securities s
  where s.is_active and s.symbol = any (select distinct upper(trim(u)) from unnest(p_symbols[1:130]) u)
$$;
grant execute on function public.portfolio_closes(text[], integer) to anon, authenticated;

create or replace function public.portfolio_structure(p_symbols text[])
returns table(symbol text, zone_low real, zone_high real, analysis_day date)
language sql stable security definer set search_path = public as $$
  select s.symbol, h.zone_low, h.zone_high, h.day
  from securities s
  left join lateral (select zone_low, zone_high, day from analysis_history where security_id = s.id order by day desc limit 1) h on true
  where s.is_active and s.symbol = any (select distinct upper(trim(u)) from unnest(p_symbols[1:100]) u)
$$;
grant execute on function public.portfolio_structure(text[]) to anon, authenticated;

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text check (label is null or char_length(label) <= 80),
  snapshot jsonb not null check (pg_column_size(snapshot) < 200000),
  created_at timestamptz not null default now()
);
create index if not exists portfolio_snapshots_idx on public.portfolio_snapshots (portfolio_id, created_at desc);
alter table public.portfolio_snapshots enable row level security;
drop policy if exists "own snapshots" on public.portfolio_snapshots;
create policy "own snapshots" on public.portfolio_snapshots for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.portfolios p where p.id = portfolio_id and p.user_id = (select auth.uid())));
grant select, insert, delete on public.portfolio_snapshots to authenticated;

-- at most 60 snapshots per portfolio
create or replace function public.limit_portfolio_snapshots() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from portfolio_snapshots where portfolio_id = new.portfolio_id) >= 60 then
    raise exception 'A portfolio can keep up to 60 snapshots. Delete an older one first.';
  end if;
  return new;
end $$;
revoke all on function public.limit_portfolio_snapshots() from public, anon, authenticated;
drop trigger if exists portfolio_snapshots_limit on public.portfolio_snapshots;
create trigger portfolio_snapshots_limit before insert on public.portfolio_snapshots for each row execute function public.limit_portfolio_snapshots();

-- Advisor Mode hooks (see src/lib/portfolio/advisor.ts). kind: personal | client | model.
alter table public.portfolios
  add column if not exists kind text not null default 'personal' check (kind in ('personal', 'client', 'model')),
  add column if not exists household text check (household is null or char_length(household) <= 80),
  add column if not exists benchmark jsonb check (benchmark is null or jsonb_typeof(benchmark) = 'object');
