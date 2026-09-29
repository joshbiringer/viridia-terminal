-- What Changed engine (product sprint, priority 3). Each security's daily analysis snapshot in
-- analysis_history gains the fields needed to compare sessions, and every new snapshot is compared
-- with the previous one to write structured events. Deterministic: plain comparisons of stored
-- engine output, no model involved.
--
-- Event types:
--   TREND_CHANGED                 50/200-day trend state changed
--   SWING_CONFIRMED               a new intermediate-degree swing high or low was confirmed
--   STRUCTURE_CHANGED             intermediate swing structure changed (e.g. expanding → higher highs/lows)
--   COUNT_ADDED                   a count entered the top three at the glance degree
--   COUNT_REMOVED                 a top-three count dropped out without its level breaking
--   COUNT_INVALIDATED             the preferred count dropped out and price broke its invalidation level
--   FIB_ZONE_CREATED              a confluence zone within 5% of price that wasn't there before
--   FIB_ZONE_ENTERED / _EXITED    the close moved into or out of the nearest confluence zone
--   TIMEFRAME_ALIGNMENT_CHANGED   the daily and weekly preferred counts started or stopped pointing the same way
-- Storage is kept small (hashed count ids, a handful of zone midpoints) and history is kept 60 days.

alter table public.analysis_history
  add column if not exists hold_side text,
  add column if not exists trend text,
  add column if not exists swing text,
  add column if not exists pivot_ts timestamptz,
  add column if not exists pivot_kind text,
  add column if not exists pref_hash int,
  add column if not exists top_hashes int[],
  add column if not exists top_labels text[],
  add column if not exists zone_low real,
  add column if not exists zone_high real,
  add column if not exists zone_mids real[],
  add column if not exists weekly_dir text;

create table if not exists public.structure_events (
  security_id bigint not null references public.securities(id) on delete cascade,
  day date not null,
  type text not null,
  weight smallint not null,
  detail jsonb not null default '{}'::jsonb,
  primary key (security_id, day, type)
);
create index if not exists structure_events_day_idx on public.structure_events (day desc, weight desc);
alter table public.structure_events enable row level security;

-- a short human label for a compact count: "Impulse w3 ↑"
-- the arrow is the direction of the move the count expects next, as elsewhere in the product
create or replace function public.count_label(c jsonb) returns text language sql immutable set search_path = public as $$
  select initcap(replace(c->>'pt', '_', ' ')) ||
         case when (c->>'c')::boolean then ' complete' else ' w' || coalesce(c->'nx'->>'l', '?') end ||
         case when coalesce(c->'nx'->>'d', c->>'d') = 'u' then ' ↑' else ' ↓' end
$$;

create or replace function public.analysis_history_record()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_day date; v_prev analysis_history; v_cur analysis_history; v_close float8; v_deg text; v_counts jsonb; v_piv jsonb;
  v_zone jsonb; v_in_now boolean; v_in_prev boolean; v_new_mid real; v_i int;
begin
  if new.timeframe <> '1d' or new.source_last_ts is null then return new; end if;
  -- daily bars are stamped 00:00 UTC on the session date
  v_day := (new.source_last_ts at time zone 'UTC')::date;
  v_close := (new.confluence_zones_json->>'close')::float8;
  v_deg := coalesce(new.glance_degree, 'intermediate');
  v_counts := new.candidate_counts_json->v_deg->'c';
  v_piv := new.pivots_json->'intermediate'->'pivots';
  select zz into v_zone from jsonb_array_elements(coalesce(new.confluence_zones_json->'zones', '[]')) zz
    order by abs((zz->>'distancePct')::float8) nulls last limit 1;

  insert into analysis_history as h (security_id, day, degree, pattern, complete, wave, wave_dir, score, hold, hold_side,
      setup_side, setup_kind, close, algorithm_version, trend, swing, pivot_ts, pivot_kind, pref_hash, top_hashes, top_labels,
      zone_low, zone_high, zone_mids, weekly_dir)
  values (new.security_id, v_day, new.glance_degree, new.glance_pattern, new.glance_complete, new.glance_wave, new.glance_wave_dir,
      new.glance_score, new.glance_hold, new.glance_hold_side, new.setup_side, new.setup_kind, v_close, new.algorithm_version,
      (select trend from security_snapshot where security_id = new.security_id),
      new.swing_structure->>'intermediate',
      (v_piv->(jsonb_array_length(v_piv) - 1)->>'t')::timestamptz,
      v_piv->(jsonb_array_length(v_piv) - 1)->>'k',
      hashtext(v_counts->0->>'id'),
      array(select hashtext(c->>'id') from jsonb_array_elements(coalesce(v_counts, '[]')) with ordinality e(c, n) where n <= 3 order by n),
      array(select count_label(c) from jsonb_array_elements(coalesce(v_counts, '[]')) with ordinality e(c, n) where n <= 3 order by n),
      (v_zone->>'low')::real, (v_zone->>'high')::real,
      array(select (zz->>'mid')::real from jsonb_array_elements(coalesce(new.confluence_zones_json->'zones', '[]')) zz
            where abs((zz->>'distancePct')::float8) <= 0.05),
      (select glance_wave_dir from analysis_results where security_id = new.security_id and timeframe = '1w'))
  on conflict (security_id, day) do update set
    degree = excluded.degree, pattern = excluded.pattern, complete = excluded.complete, wave = excluded.wave,
    wave_dir = excluded.wave_dir, score = excluded.score, hold = excluded.hold, hold_side = excluded.hold_side,
    setup_side = excluded.setup_side, setup_kind = excluded.setup_kind, close = excluded.close,
    algorithm_version = excluded.algorithm_version, trend = excluded.trend, swing = excluded.swing, pivot_ts = excluded.pivot_ts,
    pivot_kind = excluded.pivot_kind, pref_hash = excluded.pref_hash, top_hashes = excluded.top_hashes, top_labels = excluded.top_labels,
    zone_low = excluded.zone_low, zone_high = excluded.zone_high, zone_mids = excluded.zone_mids, weekly_dir = excluded.weekly_dir
  returning * into v_cur;

  select * into v_prev from analysis_history where security_id = new.security_id and day < v_day order by day desc limit 1;
  delete from structure_events where security_id = new.security_id and day = v_day;
  if v_prev.security_id is null then return new; end if;

  if v_prev.trend is not null and v_cur.trend is not null and v_prev.trend <> v_cur.trend
     and v_prev.trend <> 'insufficient' and v_cur.trend <> 'insufficient' then
    insert into structure_events values (new.security_id, v_day, 'TREND_CHANGED', case when v_cur.trend in ('uptrend', 'downtrend') then 3 else 2 end,
      jsonb_build_object('from', v_prev.trend, 'to', v_cur.trend));
  end if;

  if v_cur.pivot_ts is not null and v_cur.pivot_ts is distinct from v_prev.pivot_ts and v_prev.pivot_ts is not null and v_cur.pivot_ts > v_prev.pivot_ts then
    insert into structure_events values (new.security_id, v_day, 'SWING_CONFIRMED', 1,
      jsonb_build_object('kind', v_cur.pivot_kind, 'at', v_cur.pivot_ts));
  end if;

  if v_prev.swing is not null and v_cur.swing is not null and v_prev.swing <> v_cur.swing
     and v_prev.swing <> 'insufficient' and v_cur.swing <> 'insufficient' then
    insert into structure_events values (new.security_id, v_day, 'STRUCTURE_CHANGED', 2, jsonb_build_object('from', v_prev.swing, 'to', v_cur.swing));
  end if;

  if v_prev.algorithm_version = v_cur.algorithm_version and v_prev.top_hashes is not null then
    -- the preferred count dropped out: invalidated if price broke its level, otherwise just removed
    if v_prev.pref_hash is not null and not (v_prev.pref_hash = any (coalesce(v_cur.top_hashes, '{}'))) then
      if v_prev.hold is not null and v_cur.close is not null
         and ((v_prev.hold_side = 'below' and v_cur.close < v_prev.hold) or (v_prev.hold_side = 'above' and v_cur.close > v_prev.hold)) then
        insert into structure_events values (new.security_id, v_day, 'COUNT_INVALIDATED', 4,
          jsonb_build_object('count', v_prev.top_labels[1], 'level', v_prev.hold, 'close', v_cur.close, 'now', v_cur.top_labels[1]));
      else
        insert into structure_events values (new.security_id, v_day, 'COUNT_REMOVED', 2,
          jsonb_build_object('count', v_prev.top_labels[1], 'now', v_cur.top_labels[1]));
      end if;
    end if;
    for v_i in 1 .. coalesce(array_length(v_cur.top_hashes, 1), 0) loop
      if not (v_cur.top_hashes[v_i] = any (v_prev.top_hashes)) then
        insert into structure_events values (new.security_id, v_day, 'COUNT_ADDED', case when v_i = 1 then 3 else 1 end,
          jsonb_build_object('count', v_cur.top_labels[v_i], 'rank', v_i, 'score', case when v_i = 1 then v_cur.score end))
        on conflict do nothing;
        exit;
      end if;
    end loop;
  end if;

  if v_cur.zone_mids is not null and v_prev.zone_mids is not null then
    select m into v_new_mid from unnest(v_cur.zone_mids) m
      where not exists (select 1 from unnest(v_prev.zone_mids) p where abs(p / m - 1) < 0.01) limit 1;
    if v_new_mid is not null then
      insert into structure_events values (new.security_id, v_day, 'FIB_ZONE_CREATED', 1, jsonb_build_object('mid', v_new_mid, 'close', v_cur.close));
    end if;
  end if;

  v_in_now := v_cur.close is not null and v_cur.zone_low is not null and v_cur.close between v_cur.zone_low and v_cur.zone_high;
  v_in_prev := v_prev.close is not null and v_prev.zone_low is not null and v_prev.close between v_prev.zone_low and v_prev.zone_high;
  if v_in_now and not v_in_prev then
    insert into structure_events values (new.security_id, v_day, 'FIB_ZONE_ENTERED', 2, jsonb_build_object('low', v_cur.zone_low, 'high', v_cur.zone_high, 'close', v_cur.close));
  elsif v_in_prev and not v_in_now then
    insert into structure_events values (new.security_id, v_day, 'FIB_ZONE_EXITED', 2,
      jsonb_build_object('low', v_prev.zone_low, 'high', v_prev.zone_high, 'close', v_cur.close, 'side', case when v_cur.close > v_prev.zone_high then 'above' else 'below' end));
  end if;

  if v_prev.weekly_dir is not null and v_cur.weekly_dir is not null and v_prev.wave_dir is not null and v_cur.wave_dir is not null
     and (v_prev.weekly_dir = v_prev.wave_dir) <> (v_cur.weekly_dir = v_cur.wave_dir) then
    insert into structure_events values (new.security_id, v_day, 'TIMEFRAME_ALIGNMENT_CHANGED', 2,
      jsonb_build_object('aligned', v_cur.weekly_dir = v_cur.wave_dir, 'daily', v_cur.wave_dir, 'weekly', v_cur.weekly_dir));
  end if;
  return new;
end $$;

-- Latest events for the terminal and for one security, most meaningful first.
create or replace function public.recent_structure_events(p_symbols text[] default null, p_types text[] default null,
  p_min_dollar_volume numeric default null, p_days int default 5, p_limit int default 50)
returns table(symbol text, name text, day date, type text, weight smallint, detail jsonb, close float8, change_pct float8, adv20 float8)
language sql stable security definer set search_path = public as $$
  select s.symbol, s.name, e.day, e.type, e.weight, e.detail, sn.close::float8,
         case when sn.prev_close > 0 then (sn.close / sn.prev_close - 1)::float8 end, sn.adv20::float8
  from structure_events e
  join securities s on s.id = e.security_id and s.is_active
  left join security_snapshot sn on sn.security_id = e.security_id
  where e.day >= (select max(day) from structure_events) - greatest(p_days - 1, 0)
    and (p_symbols is null or s.symbol = any (select upper(trim(x)) from unnest(p_symbols) x))
    and (p_types is null or e.type = any (p_types))
    and (p_min_dollar_volume is null or sn.adv20 >= p_min_dollar_volume)
  order by e.day desc, e.weight desc, sn.adv20 desc nulls last
  limit least(greatest(p_limit, 1), 200)
$$;
grant execute on function public.recent_structure_events(text[], text[], numeric, int, int) to anon, authenticated;

create or replace function public.structure_event_counts(p_min_dollar_volume numeric default null)
returns table(day date, type text, n bigint)
language sql stable security definer set search_path = public as $$
  select e.day, e.type, count(*) from structure_events e
  left join security_snapshot sn on sn.security_id = e.security_id
  where e.day = (select max(day) from structure_events) and (p_min_dollar_volume is null or sn.adv20 >= p_min_dollar_volume)
  group by 1, 2 order by 3 desc
$$;
grant execute on function public.structure_event_counts(numeric) to anon, authenticated;

-- retention: history 60 days (only consecutive sessions are compared), events 120 days
select cron.alter_job((select jobid from cron.job where jobname = 'viridia-history-prune'),
  command := $$delete from public.analysis_history where day < current_date - 60; delete from public.structure_events where day < current_date - 120$$);

-- one-off repairs applied with this migration: history days were labeled from the New York date of
-- a 00:00 UTC bar stamp (one day early); rows were shifted forward a day, and the latest row per
-- security was backfilled with the new snapshot fields.
