-- Phase 5: candidate wave counts, stored beside the pivots they were built from.
-- candidate_counts_json: { "<degree>": CompactCandidateSet } (see _shared/engine/candidates.ts).
-- Counts are unranked here; preferred_count_json / confidence stay null until Phase 7.
alter table public.analysis_results
  add column if not exists candidate_counts_json jsonb,
  add column if not exists candidate_count int;

create or replace function public.store_analysis_results(p_rows jsonb)
returns integer
language plpgsql security definer
set search_path to 'public'
as $$
declare v_n int;
begin
  insert into analysis_results (security_id, timeframe, algorithm_version, analysis_timestamp, source_first_ts, source_last_ts,
                                input_bars, computed_at, expires_at, swing_structure, pivots_json, candidate_counts_json, candidate_count)
  select x.security_id, x.timeframe, x.algorithm_version, x.analysis_timestamp, x.source_first_ts, x.source_last_ts,
         x.input_bars, now(), x.expires_at, x.swing_structure, x.pivots_json, x.candidate_counts_json, x.candidate_count
  from jsonb_to_recordset(p_rows) as x(security_id bigint, timeframe text, algorithm_version text, analysis_timestamp timestamptz,
                                       source_first_ts timestamptz, source_last_ts timestamptz, input_bars int,
                                       expires_at timestamptz, swing_structure jsonb, pivots_json jsonb,
                                       candidate_counts_json jsonb, candidate_count int)
  on conflict (security_id, timeframe) do update set
    algorithm_version = excluded.algorithm_version, analysis_timestamp = excluded.analysis_timestamp,
    source_first_ts = excluded.source_first_ts, source_last_ts = excluded.source_last_ts, input_bars = excluded.input_bars,
    computed_at = excluded.computed_at, expires_at = excluded.expires_at, swing_structure = excluded.swing_structure,
    pivots_json = excluded.pivots_json, candidate_counts_json = excluded.candidate_counts_json,
    candidate_count = excluded.candidate_count;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.store_analysis_results(jsonb) from public, anon, authenticated;

create or replace function public.get_analysis(p_symbol text, p_timeframe text default '1d')
returns jsonb
language sql stable security definer
set search_path to 'public'
as $$
  select jsonb_build_object(
    'symbol', s.symbol, 'timeframe', a.timeframe, 'algorithm_version', a.algorithm_version,
    'analysis_timestamp', a.analysis_timestamp, 'computed_at', a.computed_at, 'input_bars', a.input_bars,
    'current', (a.source_last_ts is not distinct from c.last_ts and a.source_first_ts is not distinct from c.first_ts),
    'swing_structure', a.swing_structure, 'pivots', a.pivots_json,
    'candidates', a.candidate_counts_json, 'candidate_count', a.candidate_count)
  from securities s
  join analysis_results a on a.security_id = s.id and a.timeframe = p_timeframe
  left join bar_coverage c on c.security_id = s.id and c.timeframe = '1d'
  where s.symbol = upper(trim(p_symbol))
  order by s.is_active desc
  limit 1
$$;
