-- Cycle 4, Phase 4: the "What changed?" feed for the Viridia Brief. Compares each security's latest
-- stored session in analysis_history with the one before it. A change is reported only when both
-- sessions were analyzed by the same engine version, so an engine upgrade never shows up as a market
-- change. Optionally limited to a list of symbols (a watchlist).

create or replace function public.brief_changes(p_symbols text[] default null, p_min_dollar_volume numeric default null, p_limit integer default 40)
returns table(symbol text, name text, day date, prev_day date, adv20 double precision, close double precision, change_pct double precision,
              pattern text, complete boolean, wave text, wave_dir text, score smallint, setup_side text, setup_kind text,
              p_pattern text, p_complete boolean, p_wave text, p_wave_dir text, p_score smallint, p_setup_side text, p_setup_kind text,
              direction_flip boolean, pattern_change boolean, setup_new boolean, setup_gone boolean, confidence_move boolean)
language sql stable security definer set search_path to 'public' as $$
  with scope as (
    select s.id, s.symbol, s.name from securities s
    where s.is_active and (p_symbols is null or s.symbol = any (select upper(trim(u)) from unnest(p_symbols[1:200]) u))
  ), ranked as (
    select h.*, row_number() over (partition by h.security_id order by h.day desc) as rn
    from analysis_history h join scope on scope.id = h.security_id
    where h.day > current_date - 14
  ), pair as (
    select a.security_id, a.day, b.day as prev_day,
           a.pattern, a.complete, a.wave, a.wave_dir, a.score, a.setup_side, a.setup_kind,
           b.pattern as p_pattern, b.complete as p_complete, b.wave as p_wave, b.wave_dir as p_wave_dir, b.score as p_score,
           b.setup_side as p_setup_side, b.setup_kind as p_setup_kind
    from ranked a join ranked b on b.security_id = a.security_id and a.rn = 1 and b.rn = 2
    where a.algorithm_version is not distinct from b.algorithm_version
  ), flagged as (
    select p.*,
           (p.wave_dir is distinct from p.p_wave_dir and p.wave_dir is not null and p.p_wave_dir is not null) as direction_flip,
           (p.wave_dir is not distinct from p.p_wave_dir and (p.pattern is distinct from p.p_pattern or p.wave is distinct from p.p_wave
              or p.complete is distinct from p.p_complete)) as pattern_change,
           (p.setup_side is not null and (p.p_setup_side is null or p.setup_kind is distinct from p.p_setup_kind)) as setup_new,
           (p.setup_side is null and p.p_setup_side is not null) as setup_gone,
           (abs(coalesce(p.score, 0) - coalesce(p.p_score, 0)) >= 10) as confidence_move
    from pair p
  )
  select sc.symbol, sc.name, f.day, f.prev_day, x.adv20::float8, px(x.close)::float8,
         case when x.prev_close > 0 then (x.close / x.prev_close - 1)::float8 end,
         f.pattern, f.complete, f.wave, f.wave_dir, f.score, f.setup_side, f.setup_kind,
         f.p_pattern, f.p_complete, f.p_wave, f.p_wave_dir, f.p_score, f.p_setup_side, f.p_setup_kind,
         f.direction_flip, f.pattern_change, f.setup_new, f.setup_gone, f.confidence_move
  from flagged f
  join scope sc on sc.id = f.security_id
  left join security_snapshot x on x.security_id = f.security_id
  where (f.direction_flip or f.pattern_change or f.setup_new or f.setup_gone or f.confidence_move)
    and (p_min_dollar_volume is null or x.adv20 >= p_min_dollar_volume)
  order by f.direction_flip desc, f.setup_new desc, x.adv20 desc nulls last
  limit least(greatest(p_limit, 1), 200)
$$;
grant execute on function public.brief_changes(text[], numeric, integer) to anon, authenticated;
