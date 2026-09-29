-- Securities whose daily and weekly preferred counts point the same way (Viridia Signals, Multi-Timeframe tab).
create or replace function public.timeframe_alignment(p_min_dollar_volume numeric default null, p_dir text default null, p_limit int default 20)
returns table(symbol text, name text, close float8, change_pct float8, adv20 float8, dir text,
              d_pattern text, d_complete boolean, d_wave text, d_score smallint, w_pattern text, w_complete boolean, w_wave text, w_score smallint, total bigint)
language sql stable security definer set search_path = public as $$
  select s.symbol, s.name, sn.close::float8, case when sn.prev_close > 0 then (sn.close / sn.prev_close - 1)::float8 end, sn.adv20::float8,
         d.glance_wave_dir, d.glance_pattern, d.glance_complete, d.glance_wave, d.glance_score,
         w.glance_pattern, w.glance_complete, w.glance_wave, w.glance_score, count(*) over ()
  from analysis_results d
  join analysis_results w on w.security_id = d.security_id and w.timeframe = '1w'
  join securities s on s.id = d.security_id and s.is_active
  join security_snapshot sn on sn.security_id = d.security_id
  where d.timeframe = '1d' and d.glance_wave_dir is not null and d.glance_wave_dir = w.glance_wave_dir
    and d.glance_score is not null and w.glance_score is not null
    and (p_dir is null or d.glance_wave_dir = p_dir)
    and (p_min_dollar_volume is null or sn.adv20 >= p_min_dollar_volume)
  order by d.glance_score + w.glance_score desc, sn.adv20 desc nulls last
  limit least(greatest(p_limit, 1), 100)
$$;
grant execute on function public.timeframe_alignment(numeric, text, int) to anon, authenticated;
