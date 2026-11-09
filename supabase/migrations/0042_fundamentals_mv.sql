-- Applied Nov 9 2026. sector_medians (3.2s) exceeded the anon role's 3s statement timeout, so both heavy
-- fundamentals functions now read hourly-refreshed materialized views. Also: SIC 3021 (footwear) is Consumer Discretionary.
alter function public.sector_medians() rename to sector_medians_live;
alter function public.fundamentals_universe() rename to fundamentals_universe_live;
revoke all on function public.sector_medians_live(), public.fundamentals_universe_live() from public, anon, authenticated;
create materialized view if not exists public.mv_sector_medians as select * from public.sector_medians_live();
create materialized view if not exists public.mv_fundamentals_universe as select * from public.fundamentals_universe_live();
create unique index if not exists mv_sector_medians_pk on public.mv_sector_medians (sector);
create unique index if not exists mv_fundamentals_universe_pk on public.mv_fundamentals_universe (symbol);
revoke all on public.mv_sector_medians, public.mv_fundamentals_universe from anon, authenticated;
create or replace function public.sector_medians()
returns table(sector text, n int, pe float8, ps float8, op_margin float8, growth float8)
language sql stable security definer set search_path = public as $$ select * from mv_sector_medians order by sector $$;
create or replace function public.fundamentals_universe()
returns table(symbol text, name text, sector text, market_cap float8, revenue float8, net_income float8,
              equity float8, debt float8, cash float8, assets_current float8, liabilities_current float8,
              operating_cash_flow float8, capex float8, eps float8, eps_prior float8, eps_5y_ago float8,
              eps_q float8, eps_q_year_ago float8, revenue_q float8, revenue_q_year_ago float8)
language sql stable security definer set search_path = public as $$ select * from mv_fundamentals_universe order by symbol $$;
grant execute on function public.sector_medians(), public.fundamentals_universe() to anon, authenticated;
create or replace function public.fundamentals_refresh()
returns void language plpgsql security definer set search_path = public as $$
begin
  refresh materialized view concurrently mv_sector_medians;
  refresh materialized view concurrently mv_fundamentals_universe;
end $$;
revoke all on function public.fundamentals_refresh() from public, anon, authenticated;
select cron.schedule('viridia-fundamentals-refresh', '7 * * * *', $$select public.fundamentals_refresh()$$);
-- sic_sector: "when g = 30 then case when s = 3021 then 'Consumer Discretionary' else 'Materials' end" (full body as in 0040, with 30 split out)
