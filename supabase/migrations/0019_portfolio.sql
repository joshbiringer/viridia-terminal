-- Cycle 4, Phase 3: Portfolio X-Ray. Two read-only lookups for a list of symbols the reader supplies.
-- Holdings themselves are never sent here: only symbols. Nothing is stored.

-- Security, snapshot, daily structure, setup and weekly direction for each symbol.
create or replace function public.portfolio_context(p_symbols text[])
returns table(symbol text, name text, asset_subtype text, close double precision, prev_close double precision,
              last_ts timestamptz, trend text, glance_degree text, glance_pattern text, glance_complete boolean,
              glance_wave text, glance_wave_dir text, glance_score smallint, glance_hold double precision,
              setup_side text, setup_kind text, setup_rr real, weekly_dir text)
language sql stable security definer set search_path to 'public' as $$
  select s.symbol, s.name, s.asset_subtype, px(x.close)::float8, px(x.prev_close)::float8, x.last_ts::timestamptz, x.trend,
         a.glance_degree, a.glance_pattern, a.glance_complete, a.glance_wave, a.glance_wave_dir, a.glance_score, a.glance_hold,
         a.setup_side, a.setup_kind, a.setup_rr, w.glance_wave_dir
  from securities s
  left join security_snapshot x on x.security_id = s.id
  left join analysis_results a on a.security_id = s.id and a.timeframe = '1d'
  left join analysis_results w on w.security_id = s.id and w.timeframe = '1w'
  where s.is_active and s.symbol = any (select upper(trim(u)) from unnest(p_symbols[1:100]) u)
$$;
grant execute on function public.portfolio_context(text[]) to anon, authenticated;

-- Daily closes for up to 100 symbols (last p_limit sessions each), for returns, beta and correlation.
create or replace function public.closes_for(p_symbols text[], p_limit integer default 253)
returns table(symbol text, ts timestamptz, close double precision)
language sql stable security definer set search_path to 'public' as $$
  select u.sym, b.ts, b.close
  from (select distinct upper(trim(x)) as sym from unnest(p_symbols[1:100]) x) u
  cross join lateral get_bars(u.sym, '1d', least(greatest(p_limit, 20), 300)) b
$$;
grant execute on function public.closes_for(text[], integer) to anon, authenticated;
