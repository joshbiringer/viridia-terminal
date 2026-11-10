-- Paper tracking of the Brain daily model portfolio. Nothing is bought or sold: this replays the saved daily
-- lists against stored daily bars to show what following them would have done.
--
-- Conventions
--   * $100,000 starts on the first list. A list is built pre-market, so its changes fill at the OPEN of the first
--     complete trading session on or after its run_date.
--   * Only the list's `changes` trade (new/add/trim/drop). new/add/trim set the position to the target weight of
--     the portfolio value at that open; drop sells it all. Unchanged names drift; cash absorbs the difference.
--   * If the fill session's bars are not loaded yet, that list and every later one are reported as pending.
--     Nothing is stored, so the report fixes itself once the bars arrive.
--   * AVOID names are graded from the open after they were first flagged (in an unbroken run of lists) to the
--     latest close, or to the open after they left the list.
--   * p_extra_bars is for testing only: [{symbol, d, open, close}] rows added to the stored bars.

create or replace function public.brain_paper_report(
  p_user uuid, p_capital numeric default 100000, p_extra_bars jsonb default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_first date; L record; c record; r jsonb; prev jsonb := null;
  v_fill date; v_nav numeric; v_cash numeric := p_capital; v_px numeric; v_sh numeric; v_delta numeric;
  v_pending jsonb := null; v_started date := null; v_why jsonb; v_avoid jsonb; v_last_fill date := null;
  v_out jsonb;
begin
  select min(run_date) into v_first from brain_daily_lists where user_id = p_user;
  if v_first is null then return jsonb_build_object('error', 'no lists'); end if;

  drop table if exists _sessions, _bars, _pos, _trades, _closed;

  -- Complete sessions: dates with a market-wide bar load (a partial load is not a session yet).
  create temp table _sessions on commit drop as
    select ts::date d from price_bars where timeframe = '1d' and ts >= v_first - 10
    group by 1 having count(*) > 1000;

  create temp table _bars on commit drop as
    select s.symbol, pb.ts::date d, pb.open::numeric open, pb.close::numeric close
    from price_bars pb join securities s on s.id = pb.security_id
    where pb.timeframe = '1d' and pb.ts >= v_first - 10
      and s.symbol in (
        select x->>'symbol' from brain_daily_lists bl,
          lateral jsonb_array_elements(coalesce(bl.payload->'stocks','[]') || coalesce(bl.payload->'etfs','[]') || coalesce(bl.payload->'avoid','[]')) x
        where bl.user_id = p_user
        union select 'SPY');
  if p_extra_bars is not null then
    insert into _bars select x->>'symbol', (x->>'d')::date, (x->>'open')::numeric, (x->>'close')::numeric from jsonb_array_elements(p_extra_bars) x;
    insert into _sessions select distinct (x->>'d')::date from jsonb_array_elements(p_extra_bars) x where (x->>'d')::date not in (select d from _sessions);
  end if;

  create temp table _pos (symbol text primary key, sleeve text, shares numeric, cost numeric, opened date,
    entry_px numeric, entry jsonb) on commit drop;
  create temp table _trades (seq serial, list_date date, fill_date date, symbol text, sleeve text, action text,
    shares numeric, price numeric, w_from numeric, w_to numeric, realized numeric, why jsonb) on commit drop;
  create temp table _closed (symbol text, sleeve text, opened date, closed date, entry_px numeric, exit_px numeric,
    pnl numeric, ret numeric, entry jsonb, exit jsonb) on commit drop;

  for L in select run_date, payload from brain_daily_lists where user_id = p_user order by run_date loop
    if v_pending is not null then
      v_pending := jsonb_set(v_pending, '{later_lists}', (v_pending->'later_lists') || to_jsonb(L.run_date));
      prev := L.payload; continue;
    end if;
    if jsonb_array_length(coalesce(L.payload->'changes','[]')) = 0 then prev := L.payload; continue; end if;

    select min(d) into v_fill from _sessions where d >= L.run_date;
    if v_fill is null or exists (
        select 1 from jsonb_array_elements(L.payload->'changes') ch
        where not exists (select 1 from _bars b where b.symbol = ch->>'symbol' and b.d = v_fill)) then
      v_pending := jsonb_build_object('list_date', L.run_date, 'fill_session', coalesce(v_fill::text, 'next session'),
        'changes', L.payload->'changes', 'later_lists', '[]'::jsonb);
      prev := L.payload; continue;
    end if;

    -- Portfolio value at this open (a holding without a bar that day uses its last close).
    select v_cash + coalesce(sum(p.shares * coalesce(
        (select b.open from _bars b where b.symbol = p.symbol and b.d = v_fill),
        (select b.close from _bars b where b.symbol = p.symbol and b.d < v_fill order by b.d desc limit 1), p.entry_px)), 0)
      into v_nav from _pos p;
    v_started := coalesce(v_started, v_fill);
    v_last_fill := v_fill;

    -- Sells first, then buys.
    for c in select ch from jsonb_array_elements(L.payload->'changes') ch
             order by case when ch->>'kind' in ('drop','trim') then 0 else 1 end loop
      select b.open into v_px from _bars b where b.symbol = c.ch->>'symbol' and b.d = v_fill;
      select x into r from jsonb_array_elements(coalesce(L.payload->'stocks','[]') || coalesce(L.payload->'etfs','[]')) x
        where x->>'symbol' = c.ch->>'symbol';
      select x into v_avoid from jsonb_array_elements(coalesce(L.payload->'avoid','[]')) x where x->>'symbol' = c.ch->>'symbol';
      v_why := jsonb_build_object(
        'now', r,                                                     -- this list's row (null for a drop)
        'before', (select x from jsonb_array_elements(coalesce(prev->'stocks','[]') || coalesce(prev->'etfs','[]')) x
                    where x->>'symbol' = c.ch->>'symbol'),           -- the previous list's row
        'avoid', v_avoid);
      v_delta := v_nav * (c.ch->>'to')::numeric / v_px - coalesce((select shares from _pos where symbol = c.ch->>'symbol'), 0);

      if c.ch->>'kind' in ('new','add') then
        insert into _pos values (c.ch->>'symbol', c.ch->>'sleeve', v_delta, v_delta * v_px, v_fill, v_px, v_why)
          on conflict (symbol) do update set shares = _pos.shares + v_delta, cost = _pos.cost + v_delta * v_px;
        insert into _trades (list_date, fill_date, symbol, sleeve, action, shares, price, w_from, w_to, realized, why)
          values (L.run_date, v_fill, c.ch->>'symbol', c.ch->>'sleeve', upper(c.ch->>'kind'), v_delta, v_px,
                  (c.ch->>'from')::numeric, (c.ch->>'to')::numeric, null, v_why);
        v_cash := v_cash - v_delta * v_px;
      else
        select shares into v_sh from _pos where symbol = c.ch->>'symbol';
        if v_sh is null then continue; end if;
        if c.ch->>'kind' = 'drop' then v_delta := -v_sh; end if;
        v_delta := greatest(v_delta, -v_sh);
        insert into _trades (list_date, fill_date, symbol, sleeve, action, shares, price, w_from, w_to, realized, why)
          select L.run_date, v_fill, symbol, sleeve, upper(c.ch->>'kind'), v_delta, v_px,
                 (c.ch->>'from')::numeric, (c.ch->>'to')::numeric, -v_delta * (v_px - cost / shares), v_why
          from _pos where symbol = c.ch->>'symbol';
        v_cash := v_cash - v_delta * v_px;
        if c.ch->>'kind' = 'drop' then
          insert into _closed select symbol, sleeve, opened, v_fill, cost / shares, v_px, shares * v_px - cost,
                 v_px / (cost / shares) - 1, entry, v_why from _pos where symbol = c.ch->>'symbol';
          delete from _pos where symbol = c.ch->>'symbol';
        else
          update _pos set cost = cost * (shares + v_delta) / shares, shares = shares + v_delta where symbol = c.ch->>'symbol';
        end if;
      end if;
    end loop;
    prev := L.payload;
  end loop;

  -- Mark to market at each holding's latest close.
  with m as (
    select p.*, lb.close last, lb.d last_d from _pos p
    left join lateral (select close, d from _bars b where b.symbol = p.symbol order by d desc limit 1) lb on true),
  tot as (select v_cash + coalesce(sum(shares * coalesce(last, entry_px)), 0) nav, max(last_d) as_of from m),
  avoid_runs as (
    -- Unbroken runs of a symbol on the AVOID list.
    select symbol, min(run_date) flagged, max(run_date) last_listed, max(why) why, max(score) score,
           bool_or(run_date = (select max(run_date) from brain_daily_lists where user_id = p_user)) active
    from (select bl.run_date, x->>'symbol' symbol, x->>'why' why, (x->>'score')::numeric score,
            dense_rank() over (order by bl.run_date) - dense_rank() over (partition by x->>'symbol' order by bl.run_date) grp
          from brain_daily_lists bl, lateral jsonb_array_elements(coalesce(bl.payload->'avoid','[]')) x
          where bl.user_id = p_user) z
    group by symbol, grp),
  avoid_graded as (
    select a.*, f.d from_d, f.open from_px,
      case when a.active then lc.d else e.d end to_d,
      case when a.active then lc.close else e.open end to_px
    from avoid_runs a
    left join lateral (select b.d, b.open from _bars b join _sessions s on s.d = b.d
                       where b.symbol = a.symbol and b.d >= a.flagged order by b.d limit 1) f on true
    left join lateral (select b.d, b.close from _bars b where b.symbol = a.symbol order by b.d desc limit 1) lc on true
    left join lateral (select b.d, b.open from _bars b join _sessions s on s.d = b.d
                       where b.symbol = a.symbol and b.d > a.last_listed order by b.d limit 1) e on true),
  spy as (
    select (select open from _bars where symbol = 'SPY' and d = v_started) o,
           (select close from _bars where symbol = 'SPY' order by d desc limit 1) c)
  select jsonb_build_object(
    'started', v_started, 'as_of', (select as_of from tot), 'capital', p_capital,
    'nav', round((select nav from tot), 2),
    'total_return', case when v_started is null then null else round((select nav from tot) / p_capital - 1, 5) end,
    'spy_return', case when v_started is null then null else round((select c / nullif(o, 0) - 1 from spy), 5) end,
    'cash', round(v_cash, 2),
    'realized_pnl', round(coalesce((select sum(realized) from _trades), 0), 2),
    'unrealized_pnl', round(coalesce((select sum(shares * coalesce(last, entry_px) - cost) from m), 0), 2),
    'last_fill', v_last_fill,
    'latest_session_loaded', (select max(d) from _sessions),
    'pending', v_pending,
    'open', coalesce((select jsonb_agg(jsonb_build_object(
        'symbol', symbol, 'sleeve', sleeve, 'opened', opened, 'avg_cost', round(cost / shares, 2), 'last', last,
        'last_date', last_d, 'ret', round(coalesce(last, entry_px) / (cost / shares) - 1, 5),
        'pnl', round(shares * coalesce(last, entry_px) - cost, 2),
        'weight_now', round(shares * coalesce(last, entry_px) / (select nav from tot), 4),
        'entry', entry) order by shares * coalesce(last, entry_px) - cost desc) from m), '[]'::jsonb),
    'closed', coalesce((select jsonb_agg(to_jsonb(cl) order by closed desc, symbol) from _closed cl), '[]'::jsonb),
    'trades_last_fill', coalesce((select jsonb_agg(to_jsonb(t) order by seq) from _trades t where fill_date = v_last_fill), '[]'::jsonb),
    'avoid', coalesce((select jsonb_agg(jsonb_build_object(
        'symbol', symbol, 'flagged', flagged, 'active', active, 'why', why, 'score', score,
        'from_date', from_d, 'from_px', from_px, 'to_date', to_d, 'to_px', to_px,
        'move', case when from_px is null or to_px is null then null else round(to_px / from_px - 1, 5) end)
        order by active desc, flagged desc, symbol) from avoid_graded), '[]'::jsonb)
  ) into v_out;

  return v_out;
end $$;

revoke all on function public.brain_paper_report(uuid, numeric, jsonb) from public, anon, authenticated;
