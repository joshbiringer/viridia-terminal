-- Database headroom (Cycle 5, phase 1). The instance throttled twice under the daily recompute plus
-- the backtest replay. Two changes cut steady-state IO and cap growth; neither removes data the
-- product reads today.
--
-- 1. Weekly counts are recomputed when a week completes (the Friday session), not after every
--    daily bar. A weekly Elliott count is read on completed weekly bars, so a mid-week partial bar
--    only added churn. A seven-day catch-all covers weeks whose Friday is a holiday. Daily counts
--    still recompute every session. This roughly halves the nightly analysis reads and writes.
-- 2. Daily price history is capped at the most recent 520 sessions per security (about two years,
--    more than the 1d analysis window needs and the backtest replay's warm-up plus one year).
--    Today every security has at most ~505 sessions, so nothing is deleted yet; the cap stops the
--    table growing past the free plan's 500 MB. Hourly bars older than 180 days are also dropped.

create or replace function public.analysis_batch(p_timeframe text, p_version text, p_limit integer default 50)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
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
           or a.expires_at < now()
           or (p_timeframe = '1d' and (a.source_last_ts is distinct from c.last_ts or a.source_first_ts is distinct from c.first_ts))
           or (p_timeframe <> '1d' and a.source_last_ts is distinct from c.last_ts
               and (extract(isodow from c.last_ts) = 5 or c.last_ts - a.source_last_ts >= interval '7 days')))
    order by (a.security_id is null) desc, sn.adv20 desc nulls last, s.id
    limit least(greatest(p_limit, 1), 200)
  loop
    select coalesce(jsonb_agg(jsonb_build_array(b.ts, b.open, b.high, b.low, b.close, b.volume) order by b.ts), '[]'::jsonb)
      into v_bars from get_bars(r.symbol, p_timeframe, v_lim) b;
    v_out := v_out || jsonb_build_object('security_id', r.id, 'symbol', r.symbol,
                                         'source_first_ts', r.first_ts, 'source_last_ts', r.last_ts, 'bars', v_bars);
  end loop;
  return v_out;
end $$;

-- Keep the latest p_keep daily sessions per security, a slice of securities per call so one run
-- never holds a long transaction. Returns the number of bars removed.
create or replace function public.prune_price_bars(p_keep int default 520, p_max_securities int default 4000)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r record; v_cut timestamptz; v_n bigint := 0; v_d bigint; v_seen int := 0;
begin
  for r in select security_id from bar_coverage where timeframe = '1d' order by security_id limit p_max_securities loop
    v_seen := v_seen + 1;
    select ts into v_cut from price_bars
      where security_id = r.security_id and timeframe = '1d' order by ts desc offset greatest(p_keep, 300) - 1 limit 1;
    continue when v_cut is null;
    delete from price_bars where security_id = r.security_id and timeframe = '1d' and ts < v_cut;
    get diagnostics v_d = row_count;
    v_n := v_n + v_d;
  end loop;
  delete from price_bars where timeframe = '1h' and ts < now() - interval '180 days';
  get diagnostics v_d = row_count;
  return jsonb_build_object('daily_removed', v_n, 'hourly_removed', v_d, 'securities', v_seen, 'keep', p_keep);
end $$;

revoke all on function public.prune_price_bars(int, int) from public, anon, authenticated;

select cron.schedule('viridia-bar-retention', '37 7 * * 2-6', $$select public.prune_price_bars()$$);
