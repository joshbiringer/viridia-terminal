-- Applied Nov 10 2026. analysis_batch(…, 15) took ~9 s after a new session: cold bar reads run ~0.6 s each on the
-- throttled disk, past the API role's 8 s statement timeout, so every analysis run failed. Each call now returns at
-- most 15 securities and stops after ~6.5 s. The deployed worker ends its run on a short batch, so pg_cron now runs it
-- every minute (was every 10). The worker source no longer stops on a short batch (index.ts); redeploy it with the
-- Supabase CLI, then the cron can return to */2.
select cron.alter_job((select jobid from cron.job where jobname = 'viridia-analysis-worker'), schedule => '* * * * *');
create or replace function public.analysis_batch(p_timeframe text, p_version text, p_limit integer default 50)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_out jsonb := '[]'::jsonb;
  r record;
  v_bars jsonb;
  v_lim int := case p_timeframe when '1d' then 600 when '1w' then 260 when '1mo' then 120 else 0 end;
  v_t0 timestamptz := clock_timestamp();
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
           or a.expires_at < now()
           or (p_timeframe = '1d' and (a.source_last_ts is distinct from c.last_ts or a.source_first_ts is distinct from c.first_ts))
           or (p_timeframe <> '1d' and a.source_last_ts is distinct from c.last_ts
               and (extract(isodow from c.last_ts) = 5 or c.last_ts - a.source_last_ts >= interval '7 days')))
    order by (a.security_id is null) desc, sn.adv20 desc nulls last, s.id
    limit least(greatest(p_limit, 1), 15)
  loop
    exit when clock_timestamp() - v_t0 > interval '6.5 seconds';
    select coalesce(jsonb_agg(jsonb_build_array(b.ts, b.open, b.high, b.low, b.close, b.volume) order by b.ts), '[]'::jsonb)
      into v_bars from get_bars(r.symbol, p_timeframe, v_lim) b;
    v_out := v_out || jsonb_build_object('security_id', r.id, 'symbol', r.symbol,
                                         'source_first_ts', r.first_ts, 'source_last_ts', r.last_ts, 'bars', v_bars);
  end loop;
  return v_out;
end $function$;
