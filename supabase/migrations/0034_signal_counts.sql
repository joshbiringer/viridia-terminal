-- Viridia Signals cards (productization sprint, priority 5): for each signal, the count at the latest
-- analysed session, how many are new that session, and the change against the prior session, all
-- from analysis_history so the three numbers share one definition. analysis_history also keeps the
-- distance from the 52-week high for the 52W Strength card.

alter table public.analysis_history add column if not exists from_high real;

create or replace function public.analysis_history_from_high() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select case when sn.high_52w > 0 and new.close > 0 then (new.close / sn.high_52w - 1)::real end into new.from_high
  from security_snapshot sn where sn.security_id = new.security_id;
  return new;
end $$;
revoke all on function public.analysis_history_from_high() from public, anon, authenticated;
drop trigger if exists analysis_history_from_high on public.analysis_history;
create trigger analysis_history_from_high before insert or update of close on public.analysis_history
  for each row execute function public.analysis_history_from_high();

update public.analysis_history h set from_high = case when sn.high_52w > 0 and h.close > 0 then (h.close / sn.high_52w - 1)::real end
from public.security_snapshot sn where sn.security_id = h.security_id and h.day = (select max(day) from public.analysis_history);

create or replace function public.signal_hit(p_signal text, h public.analysis_history) returns boolean language sql immutable set search_path = public as $$
  select case p_signal
    when 'strong' then coalesce(h.score >= 70, false)
    when 'wave3' then coalesce(h.pattern in ('impulse', 'leading_diagonal', 'ending_diagonal') and not h.complete and h.wave = '3', false)
    -- same as the scanner's near_zone: the nearest zone's midpoint within 3% of the close
    when 'fib' then coalesce(h.close > 0 and abs(((h.zone_low + h.zone_high) / 2) / h.close - 1) <= 0.03, false)
    when 'near_invalidation' then coalesce(h.hold > 0 and abs(h.hold / h.close - 1) <= 0.03, false)
    when 'abc_done' then coalesce(h.pattern in ('zigzag', 'flat') and h.complete, false)
    when 'strength52' then coalesce(h.from_high >= -0.03, false)
    else false end
$$;

create or replace function public.signal_counts(p_min_dollar_volume numeric default null)
returns table(signal text, day date, prior_day date, n_today bigint, n_prior bigint, new_today bigint)
language sql stable security definer set search_path = public as $$
  with d as (select max(day) d0 from analysis_history),
  p as (select max(day) d1 from analysis_history, d where day < d.d0),
  liquid as (select security_id from security_snapshot where p_min_dollar_volume is null or adv20 >= p_min_dollar_volume),
  t as (select h.* from analysis_history h, d where h.day = d.d0 and h.security_id in (select security_id from liquid)),
  y as (select h.* from analysis_history h, p where h.day = p.d1 and h.security_id in (select security_id from liquid)),
  sig as (select unnest(array['strong', 'wave3', 'fib', 'near_invalidation', 'abc_done', 'strength52']) s)
  select sig.s, (select d0 from d), (select d1 from p),
    (select count(*) from t where signal_hit(sig.s, t)),
    case when (select d1 from p) is null then null else (select count(*) from y where signal_hit(sig.s, y)) end,
    case when (select d1 from p) is null then null else
      (select count(*) from t where signal_hit(sig.s, t)
         and exists (select 1 from y where y.security_id = t.security_id) and not exists (select 1 from y where y.security_id = t.security_id and signal_hit(sig.s, y))) end
  from sig
$$;
grant execute on function public.signal_counts(numeric) to anon, authenticated;
