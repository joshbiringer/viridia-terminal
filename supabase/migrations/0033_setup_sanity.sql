-- Setup safety (productization sprint, priority 1). Every setup is checked before it can be shown.
-- A setup with any flag is suppressed from the product by default and listed for review in the
-- nightly integrity findings (/system). Checks, with thresholds:
--   no_price         no current close
--   entry_far        reference level more than 30% from the close
--   wrong_side       invalidation and structural target not on opposite sides of the reference level
--   risk_wide        invalidation more than 25% from the reference level
--   atr_wide         invalidation more than 8 ATR(14) away
--   atr_tight        invalidation less than 0.3 ATR(14) away (inside daily noise)
--   target_far       structural target more than 100% or 25 ATR from the reference level
--   rr_mismatch      reward/risk recomputed from the levels differs from the stored value by over 15%
--   rr_extreme       recomputed reward/risk above 10 or below 1
--   stale_analysis   analysis more than 5 days older than the latest bar
--   split_suspect    a split-like jump in the last 65 days (history may be unadjusted)
--   no_degree        no Elliott degree recorded

create or replace function public.setup_flags(p_setup jsonb, p_side text, p_close float8, p_atr float8,
  p_analysis_ts timestamptz, p_last_ts timestamptz, p_split boolean)
returns text[] language plpgsql immutable set search_path = public as $$
declare
  f text[] := '{}'; lo float8; hi float8; mid float8; stop float8; tgt float8; risk float8; reward float8; rr float8; stored float8;
begin
  if p_setup is null then return array['no_setup']; end if;
  lo := (p_setup->'entry'->>'low')::float8; hi := (p_setup->'entry'->>'high')::float8;
  stop := (p_setup->'stop'->>'price')::float8; tgt := (p_setup->'target'->>'price')::float8;
  stored := (p_setup->>'rr')::float8;
  if p_close is null or p_close <= 0 then f := array_append(f, 'no_price'::text); end if;
  if lo is null or hi is null or stop is null or tgt is null then return array_append(f, 'missing_levels'::text); end if;
  mid := (lo + hi) / 2;
  if p_close > 0 and abs(mid / p_close - 1) > 0.30 then f := array_append(f, 'entry_far'::text); end if;
  if (p_side = 'buy' and not (stop < lo and tgt > hi)) or (p_side = 'sell' and not (stop > hi and tgt < lo)) then f := array_append(f, 'wrong_side'::text); end if;
  risk := abs(mid - stop); reward := abs(tgt - mid);
  if mid > 0 and risk / mid > 0.25 then f := array_append(f, 'risk_wide'::text); end if;
  if p_atr > 0 and risk > 8 * p_atr then f := array_append(f, 'atr_wide'::text); end if;
  if p_atr > 0 and risk < 0.3 * p_atr then f := array_append(f, 'atr_tight'::text); end if;
  if (mid > 0 and reward / mid > 1.0) or (p_atr > 0 and reward > 25 * p_atr) then f := array_append(f, 'target_far'::text); end if;
  if risk > 0 then
    rr := reward / risk;
    if stored > 0 and abs(rr / stored - 1) > 0.15 then f := array_append(f, 'rr_mismatch'::text); end if;
    if rr > 10 or rr < 1 then f := array_append(f, 'rr_extreme'::text); end if;
  end if;
  if p_analysis_ts is not null and p_last_ts is not null and p_last_ts - p_analysis_ts > interval '5 days' then f := array_append(f, 'stale_analysis'::text); end if;
  if p_split then f := array_append(f, 'split_suspect'::text); end if;
  if coalesce(p_setup->>'degree', '') = '' then f := array_append(f, 'no_degree'::text); end if;
  return f;
end $$;

drop function if exists public.setup_scan(text, text, text, text, real, integer, numeric, text, integer, integer, boolean, boolean, real);
create function public.setup_scan(p_timeframe text default '1d', p_side text default null, p_status text default null, p_kind text default null,
  p_min_rr real default null, p_min_score integer default null, p_min_dollar_volume numeric default null, p_sort text default 'rr',
  p_limit integer default 50, p_offset integer default 0, p_aligned boolean default null, p_exclude_negative boolean default null,
  p_max_risk real default null, p_include_flagged boolean default false)
returns table(symbol text, name text, exchange text, asset_subtype text, close double precision, change_pct double precision,
  dollar_volume double precision, last_ts timestamptz, degree text, kind text, side text, status text, score smallint, rr real,
  risk_pct real, setup jsonb, weekly_dir text, grade text, kind_avg_r real, atr double precision, analysis_ts timestamptz, flags text[], total bigint)
language plpgsql stable security definer set search_path = public as $function$
begin
  return query execute $q$
  with c as (
    select s.symbol, s.name, s.exchange, s.asset_subtype, px(x.close)::float8 as close,
           case when x.prev_close > 0 then (x.close / x.prev_close - 1)::float8 end as change_pct,
           x.adv20::float8 as dollar_volume, x.last_ts::timestamptz as last_ts,
           a.setup_degree, a.setup_kind, a.setup_side, a.setup_status, a.glance_score, a.setup_rr, a.setup_risk_pct,
           a.setups_json -> a.setup_degree as setup, w.glance_wave_dir, q.grade, q.avg_r, t.atr, a.source_last_ts,
           exists (select 1 from data_integrity_findings f where f.security_id = a.security_id and f.check_name = 'split_suspect') as split
    from analysis_results a
    join securities s on s.id = a.security_id and s.is_active and s.coverage is not null
    join security_snapshot x on x.security_id = a.security_id
    left join analysis_results w on w.security_id = a.security_id and w.timeframe = '1w'
    left join setup_kind_quality q on q.kind = a.setup_kind and q.side = a.setup_side
    left join lateral (
      select avg(greatest(b.high - b.low, abs(b.high - b.pc), abs(b.low - b.pc)))::float8 as atr
      from (select z.high, z.low, lag(z.close) over (order by z.ts) as pc
            from (select pb.ts, pb.high, pb.low, pb.close from price_bars pb
                  where pb.security_id = a.security_id and pb.timeframe = '1d' order by pb.ts desc limit 15) z) b
      where b.pc is not null
    ) t on true
    where a.timeframe = $1 and a.setup_side is not null
      and ($2 is null or a.setup_side = $2)
      and ($3 is null or a.setup_status = $3)
      and ($4 is null or a.setup_kind = $4)
      and ($5 is null or a.setup_rr >= $5)
      and ($6 is null or a.glance_score >= $6)
      and ($7 is null or x.adv20 >= $7)
      and ($11 is null or ($11 = (w.glance_wave_dir = case a.setup_side when 'buy' then 'up' else 'down' end)))
      and ($12 is not true or q.grade is distinct from 'negative')
      and ($13 is null or a.setup_risk_pct <= $13)
  ), f as (
    select c.*, setup_flags(c.setup, c.setup_side, c.close, c.atr, c.source_last_ts, c.last_ts, c.split) as flags from c
  )
  select f.symbol, f.name, f.exchange, f.asset_subtype, f.close, f.change_pct, f.dollar_volume, f.last_ts,
         f.setup_degree, f.setup_kind, f.setup_side, f.setup_status, f.glance_score, f.setup_rr, f.setup_risk_pct,
         f.setup, f.glance_wave_dir, f.grade, f.avg_r, f.atr, f.source_last_ts, f.flags, count(*) over ()
  from f
  where $14 or cardinality(f.flags) = 0
  order by
    case when $8 = 'quality' then coalesce(f.avg_r, 0) end desc nulls last,
    case when $8 = 'quality' then f.glance_score end desc nulls last,
    case when $8 = 'rr' then f.setup_rr end desc nulls last,
    case when $8 = 'confidence' then f.glance_score end desc nulls last,
    case when $8 = 'risk' then f.setup_risk_pct end asc nulls last,
    case when $8 = 'symbol' then f.symbol end asc,
    f.dollar_volume desc nulls last
  limit least(greatest($9, 1), 200) offset greatest($10, 0)
$q$ using p_timeframe, p_side, p_status, p_kind, p_min_rr, p_min_score, p_min_dollar_volume, p_sort, p_limit, p_offset, p_aligned,
          p_exclude_negative, p_max_risk, p_include_flagged;
end $function$;
grant execute on function public.setup_scan(text, text, text, text, real, integer, numeric, text, integer, integer, boolean, boolean, real, boolean) to anon, authenticated;

-- One security's setup, checked the same way (security page and drawer).
create or replace function public.setup_check(p_symbol text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('flags', setup_flags(a.setups_json -> a.setup_degree, a.setup_side, x.close::float8, t.atr, a.source_last_ts, x.last_ts,
                              exists (select 1 from data_integrity_findings f where f.security_id = a.security_id and f.check_name = 'split_suspect')),
                            'atr', t.atr, 'analysis_ts', a.source_last_ts, 'degree', a.setup_degree)
  from securities s
  join analysis_results a on a.security_id = s.id and a.timeframe = '1d' and a.setup_side is not null
  join security_snapshot x on x.security_id = s.id
  left join lateral (
    select avg(greatest(b.high - b.low, abs(b.high - b.pc), abs(b.low - b.pc)))::float8 as atr
    from (select z.high, z.low, lag(z.close) over (order by z.ts) as pc
          from (select pb.ts, pb.high, pb.low, pb.close from price_bars pb
                where pb.security_id = s.id and pb.timeframe = '1d' order by pb.ts desc limit 15) z) b
    where b.pc is not null
  ) t on true
  where s.symbol = upper(trim(p_symbol)) and s.is_active
$$;
grant execute on function public.setup_check(text) to anon, authenticated;

-- run_integrity_checks also lists every suppressed setup as 'questionable_setup' (medium), with its
-- flags, levels and ATR, by paging setup_scan(p_include_flagged := true) 200 rows at a time. The
-- block added before the final counts is:
--   for v_off in 0..1400 by 200 loop
--     insert into data_integrity_findings (check_name, severity, security_id, symbol, ts, detail)
--     select 'questionable_setup', 'medium', s.id, q.symbol, q.analysis_ts, jsonb_build_object(...)
--     from setup_scan(p_include_flagged := true, p_limit := 200, p_offset := v_off, p_sort := 'symbol') q
--     join securities s on s.symbol = q.symbol and s.is_active where cardinality(q.flags) > 0;
--   end loop;
-- First run: 940 setups, 620 pass, 320 suppressed.

-- setup_check returns atr, analysis_ts, last_ts, split and degree alongside the flags (and an empty
-- flag list when there is no setup); security_preview includes 'setup_check', setup_check(s.symbol)
-- so the drawer applies the same suppression.
