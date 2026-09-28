-- Engine Phase 7: Pattern Confidence ranking and "Structure at a glance".
-- 1. analysis_batch sends volume with each bar (wave-personality evidence needs it).
-- 2. analysis_results gets the preferred/alternate summary as plain columns, so the scanner can
--    filter on structure without unpacking JSON for every security.

alter table public.analysis_results
  add column if not exists glance_degree text,
  add column if not exists glance_pattern text,
  add column if not exists glance_complete boolean,
  add column if not exists glance_wave text,
  add column if not exists glance_wave_dir text check (glance_wave_dir in ('up','down')),
  add column if not exists glance_score smallint,
  add column if not exists glance_alt_score smallint,
  add column if not exists glance_hold double precision,
  add column if not exists glance_hold_side text check (glance_hold_side in ('above','below')),
  add column if not exists glance_target double precision;

create index if not exists analysis_results_glance_idx on public.analysis_results (timeframe, glance_score desc)
  where glance_score is not null;

create or replace function public.analysis_batch(p_timeframe text, p_version text, p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_out jsonb := '[]'::jsonb;
  r record;
  v_bars jsonb;
  v_lim int := case p_timeframe when '1d' then 600 when '1w' then 260 when '1mo' then 120 else 0 end;
begin
  if v_lim = 0 then raise exception 'analysis_batch supports 1d, 1w and 1mo'; end if;
  for r in
    select s.id, s.symbol, c.first_ts, c.last_ts
    from bar_coverage c
    join securities s on s.id = c.security_id
    left join analysis_results a on a.security_id = c.security_id and a.timeframe = p_timeframe
    left join security_snapshot sn on sn.security_id = c.security_id
    where c.timeframe = '1d' and c.last_ts is not null
      and (a.security_id is null
           or a.algorithm_version <> p_version
           or a.source_last_ts is distinct from c.last_ts
           or a.source_first_ts is distinct from c.first_ts
           or a.expires_at < now())
    order by (a.security_id is null) desc, sn.adv20 desc nulls last, s.id
    limit least(greatest(p_limit, 1), 200)
  loop
    select coalesce(jsonb_agg(jsonb_build_array(b.ts, b.open, b.high, b.low, b.close, b.volume) order by b.ts), '[]'::jsonb)
      into v_bars from get_bars(r.symbol, p_timeframe, v_lim) b;
    v_out := v_out || jsonb_build_object('security_id', r.id, 'symbol', r.symbol,
                                         'source_first_ts', r.first_ts, 'source_last_ts', r.last_ts, 'bars', v_bars);
  end loop;
  return v_out;
end $function$;

create or replace function public.store_analysis_results(p_rows jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare v_n int;
begin
  insert into analysis_results (security_id, timeframe, algorithm_version, analysis_timestamp, source_first_ts, source_last_ts,
                                input_bars, computed_at, expires_at, swing_structure, pivots_json, candidate_counts_json, candidate_count,
                                fib_levels_json, confluence_zones_json,
                                glance_degree, glance_pattern, glance_complete, glance_wave, glance_wave_dir, glance_score,
                                glance_alt_score, glance_hold, glance_hold_side, glance_target)
  select x.security_id, x.timeframe, x.algorithm_version, x.analysis_timestamp, x.source_first_ts, x.source_last_ts,
         x.input_bars, now(), x.expires_at, x.swing_structure, x.pivots_json, x.candidate_counts_json, x.candidate_count,
         x.fib_levels_json, x.confluence_zones_json,
         x.glance_degree, x.glance_pattern, x.glance_complete, x.glance_wave, x.glance_wave_dir, x.glance_score,
         x.glance_alt_score, x.glance_hold, x.glance_hold_side, x.glance_target
  from jsonb_to_recordset(p_rows) as x(security_id bigint, timeframe text, algorithm_version text, analysis_timestamp timestamptz,
                                       source_first_ts timestamptz, source_last_ts timestamptz, input_bars int,
                                       expires_at timestamptz, swing_structure jsonb, pivots_json jsonb,
                                       candidate_counts_json jsonb, candidate_count int,
                                       fib_levels_json jsonb, confluence_zones_json jsonb,
                                       glance_degree text, glance_pattern text, glance_complete boolean, glance_wave text,
                                       glance_wave_dir text, glance_score smallint, glance_alt_score smallint,
                                       glance_hold double precision, glance_hold_side text, glance_target double precision)
  on conflict (security_id, timeframe) do update set
    algorithm_version = excluded.algorithm_version, analysis_timestamp = excluded.analysis_timestamp,
    source_first_ts = excluded.source_first_ts, source_last_ts = excluded.source_last_ts, input_bars = excluded.input_bars,
    computed_at = excluded.computed_at, expires_at = excluded.expires_at, swing_structure = excluded.swing_structure,
    pivots_json = excluded.pivots_json, candidate_counts_json = excluded.candidate_counts_json,
    candidate_count = excluded.candidate_count, fib_levels_json = excluded.fib_levels_json,
    confluence_zones_json = excluded.confluence_zones_json,
    glance_degree = excluded.glance_degree, glance_pattern = excluded.glance_pattern, glance_complete = excluded.glance_complete,
    glance_wave = excluded.glance_wave, glance_wave_dir = excluded.glance_wave_dir, glance_score = excluded.glance_score,
    glance_alt_score = excluded.glance_alt_score, glance_hold = excluded.glance_hold, glance_hold_side = excluded.glance_hold_side,
    glance_target = excluded.glance_target;
  get diagnostics v_n = row_count;
  return v_n;
end $function$;
