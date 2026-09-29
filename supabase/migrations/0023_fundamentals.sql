-- Fundamentals from SEC EDGAR (Cycle 5, phase 2). Public data only:
--   * XBRL frames: revenue, net income, operating income, gross profit (fiscal years nearest
--     calendar 2024 and 2025) and shares outstanding (latest quarter ends), for every filer at once.
--   * Company submissions: SIC code and description, mapped to a broad sector.
-- Vercel routes (/api/sec/frames, /api/sec/sic) fetch and compact the SEC responses; Postgres calls
-- them through pg_net (sec_tick) and stores the results, the same pattern as the backtest.

create table if not exists public.sec_companies (
  cik bigint primary key,
  name text, sic text, sic_description text, owner_org text, fiscal_year_end text,
  checked_at timestamptz not null default now()
);
create table if not exists public.sec_facts (
  cik bigint not null, concept text not null, period text not null,
  val double precision not null, end_date date,
  primary key (cik, concept, period)
);
create table if not exists public.sec_jobs (
  id bigserial primary key,
  kind text not null check (kind in ('frame', 'sic')),
  path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'sent', 'done', 'failed')),
  request_id bigint, tries int not null default 0, sent_at timestamptz, done_at timestamptz, note text
);
alter table public.sec_companies enable row level security;
alter table public.sec_facts enable row level security;
alter table public.sec_jobs enable row level security;

-- Broad sector from the SEC's SIC code. An approximation of the usual 11 sectors: SIC predates them,
-- so a few industries (conglomerates, some services) land in the nearest fit.
create or replace function public.sic_sector(p_sic text)
returns text language sql immutable as $$
  select (select case
        when g between 1 and 9 then 'Consumer Staples'
        when g in (12, 13, 29) then 'Energy'
        when g in (10, 14) then 'Materials'
        when g between 15 and 17 then 'Industrials'
        when g in (20, 21) then 'Consumer Staples'
        when g in (22, 23, 25, 31) then 'Consumer Discretionary'
        when g in (24, 26, 30, 32, 33) then 'Materials'
        when g = 27 then 'Communication Services'
        when g = 28 then case when s between 2830 and 2836 then 'Health Care' when s between 2840 and 2844 then 'Consumer Staples' else 'Materials' end
        when g = 34 then 'Industrials'
        when g = 35 then case when s between 3570 and 3579 then 'Information Technology' else 'Industrials' end
        when g = 36 then case when s between 3630 and 3639 then 'Consumer Discretionary' else 'Information Technology' end
        when g = 37 then case when s between 3710 and 3716 or s = 3751 then 'Consumer Discretionary' else 'Industrials' end
        when g = 38 then case when s between 3840 and 3851 then 'Health Care' else 'Information Technology' end
        when g = 39 then 'Consumer Discretionary'
        when g between 40 and 47 then 'Industrials'
        when g = 48 then 'Communication Services'
        when g = 49 then 'Utilities'
        when g in (50, 51) then case when s = 5122 then 'Health Care' when s between 5140 and 5149 then 'Consumer Staples' else 'Industrials' end
        when g = 54 then 'Consumer Staples'
        when g between 52 and 59 then case when s = 5912 then 'Consumer Staples' else 'Consumer Discretionary' end
        when g between 60 and 64 then 'Financials'
        when g = 65 then 'Real Estate'
        when g = 67 then case when s = 6798 then 'Real Estate' else 'Financials' end
        when g = 70 then 'Consumer Discretionary'
        when g = 73 then case when s between 7370 and 7379 then 'Information Technology' else 'Industrials' end
        when g in (78, 79) then 'Communication Services'
        when g = 80 then 'Health Care'
        when g = 82 then 'Consumer Discretionary'
        when g between 72 and 89 then 'Industrials'
        else null end
    from (select p_sic::int as s, p_sic::int / 100 as g) c
    where p_sic ~ '^\d{3,4}$')
$$;

-- Queue every frame and one SIC batch per 20 listed companies. Safe to call again: finished jobs are reset.
create or replace function public.sec_seed()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_frames int := 0; v_sic int := 0; t text; p text; batch text;
begin
  foreach t in array array['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet', 'NetIncomeLoss', 'OperatingIncomeLoss', 'GrossProfit'] loop
    foreach p in array array['CY2024', 'CY2025'] loop
      insert into sec_jobs (kind, path) values ('frame', '/api/sec/frames?tag=' || t || '&period=' || p)
      on conflict (path) do update set status = 'pending', tries = 0, request_id = null, note = null;
      v_frames := v_frames + 1;
    end loop;
  end loop;
  foreach p in array array['CY2025Q4I', 'CY2026Q1I', 'CY2026Q2I'] loop
    insert into sec_jobs (kind, path) values ('frame', '/api/sec/frames?tag=EntityCommonStockSharesOutstanding&period=' || p)
    on conflict (path) do update set status = 'pending', tries = 0, request_id = null, note = null;
    v_frames := v_frames + 1;
  end loop;
  for batch in
    select string_agg(cik::text, ',' order by cik)
    from (select cik, (row_number() over (order by cik) - 1) / 20 as grp
          from (select distinct nullif(ltrim(s.cik, '0'), '')::bigint cik
                from securities s join bar_coverage c on c.security_id = s.id and c.timeframe = '1d'
                where s.is_active and s.asset_type = 'stock' and s.cik ~ '^\d+$') d) x
    group by grp
  loop
    insert into sec_jobs (kind, path) values ('sic', '/api/sec/sic?ciks=' || batch)
    on conflict (path) do update set status = 'pending', tries = 0, request_id = null, note = null;
    v_sic := v_sic + 1;
  end loop;
  return jsonb_build_object('frames', v_frames, 'sic_batches', v_sic);
end $$;

-- Collect finished responses, store them, send the next few requests.
create or replace function public.sec_tick(p_parallel int default 3)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare q record; v_body jsonb; v_done int := 0; v_sent int := 0; v_failed int := 0; r record;
begin
  for q in
    select j.id, j.kind, j.tries, j.sent_at, h.status_code, h.content, h.timed_out, h.error_msg
    from sec_jobs j left join net._http_response h on h.id = j.request_id
    where j.status = 'sent'
  loop
    if q.status_code = 200 then
      begin
        v_body := q.content::jsonb;
        if q.kind = 'frame' then
          insert into sec_facts (cik, concept, period, val, end_date)
          select (x->>0)::bigint, v_body->>'tag', v_body->>'period', (x->>1)::float8, (x->>2)::date
          from jsonb_array_elements(v_body->'rows') x
          on conflict (cik, concept, period) do update set val = excluded.val, end_date = excluded.end_date;
        else
          insert into sec_companies (cik, name, sic, sic_description, owner_org, fiscal_year_end, checked_at)
          select (c->>'cik')::bigint, c->>'name', c->>'sic', c->>'sic_description', c->>'owner_org', c->>'fiscal_year_end', now()
          from jsonb_array_elements(v_body->'companies') c
          on conflict (cik) do update set name = excluded.name, sic = excluded.sic, sic_description = excluded.sic_description,
            owner_org = excluded.owner_org, fiscal_year_end = excluded.fiscal_year_end, checked_at = now();
        end if;
        update sec_jobs set status = 'done', done_at = now(), note = null where id = q.id;
        v_done := v_done + 1;
      exception when others then
        update sec_jobs set status = case when q.tries >= 3 then 'failed' else 'pending' end, note = left(sqlerrm, 200) where id = q.id;
        v_failed := v_failed + 1;
      end;
    elsif q.status_code is not null or q.timed_out or q.error_msg is not null or q.sent_at < now() - interval '3 minutes' then
      update sec_jobs set status = case when q.tries >= 3 then 'failed' else 'pending' end,
        note = left(coalesce(q.error_msg, 'HTTP ' || q.status_code, 'timed out'), 200) where id = q.id;
      v_failed := v_failed + 1;
    end if;
  end loop;

  for r in
    select id, path from sec_jobs where status = 'pending' order by (kind = 'frame') desc, id
    limit greatest(p_parallel - (select count(*) from sec_jobs where status = 'sent'), 0)
  loop
    update sec_jobs set status = 'sent', tries = tries + 1, sent_at = now(),
      request_id = net.http_get(url := 'https://viridia-terminal-ten.vercel.app' || r.path, timeout_milliseconds := 60000)
    where id = r.id;
    v_sent := v_sent + 1;
  end loop;

  if v_done > 0 then perform sec_apply_sectors(); end if;
  return jsonb_build_object('done', v_done, 'sent', v_sent, 'failed', v_failed);
end $$;

-- Write the sector and SIC description onto securities, so every screen that reads securities.sector gets it.
create or replace function public.sec_apply_sectors()
returns int language sql security definer set search_path = public as $$
  with u as (
    update securities s set sector = sic_sector(c.sic), industry = initcap(lower(c.sic_description))
    from sec_companies c
    where s.cik ~ '^\d+$' and nullif(ltrim(s.cik, '0'), '')::bigint = c.cik and s.asset_type = 'stock'
      and (s.sector is distinct from sic_sector(c.sic) or s.industry is distinct from initcap(lower(c.sic_description)))
    returning 1)
  select count(*)::int from u
$$;

-- Per-security fundamentals: the latest fiscal year's figures, the prior year's revenue, shares
-- outstanding and, for single-class companies, market cap and multiples at the last close.
create or replace function public.get_fundamentals(p_symbols text[])
returns table(symbol text, sector text, industry text, fy_end date, revenue float8, revenue_prior float8,
              net_income float8, operating_income float8, gross_profit float8, shares float8, shares_as_of date,
              market_cap float8, multi_class boolean, revenue_concept text)
language sql stable security definer set search_path = public as $$
  with s as (
    select s.id, s.symbol, s.sector, s.industry, nullif(ltrim(s.cik, '0'), '')::bigint cik
    from unnest(p_symbols[1:60]) u(sym) join securities s on s.symbol = upper(trim(u.sym)) and s.is_active
    where s.asset_type = 'stock' and s.cik ~ '^\d+$'
  ),
  rev as (
    select distinct on (s.cik) s.cik, f.concept, f.period, f.val, f.end_date
    from s join sec_facts f on f.cik = s.cik
    where f.concept in ('Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet')
    order by s.cik, f.period desc,
      array_position(array['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'], f.concept)
  )
  select s.symbol, s.sector, s.industry,
    coalesce(rev.end_date, ni.end_date),
    rev.val,
    (select p.val from sec_facts p where p.cik = s.cik and p.concept = rev.concept
       and p.period = 'CY' || (substr(rev.period, 3, 4)::int - 1)),
    ni.val, oi.val, gp.val, sh.val, sh.end_date,
    case when mc.n = 1 and sh.val > 0 and sn.close > 0 then sh.val * sn.close end,
    mc.n > 1,
    rev.concept
  from s
  left join rev on rev.cik = s.cik
  left join lateral (select val, end_date from sec_facts where cik = s.cik and concept = 'NetIncomeLoss' order by period desc limit 1) ni on true
  left join lateral (select val from sec_facts where cik = s.cik and concept = 'OperatingIncomeLoss' order by period desc limit 1) oi on true
  left join lateral (select val from sec_facts where cik = s.cik and concept = 'GrossProfit' order by period desc limit 1) gp on true
  left join lateral (select val, end_date from sec_facts where cik = s.cik and concept = 'EntityCommonStockSharesOutstanding' order by period desc limit 1) sh on true
  left join lateral (select count(*) n from securities x where x.is_active and x.asset_type = 'stock' and x.cik ~ '^\d+$'
                     and nullif(ltrim(x.cik, '0'), '')::bigint = s.cik) mc on true
  left join security_snapshot sn on sn.security_id = s.id
$$;

-- Sector medians across single-class companies with filings: P/E (positive earnings only), P/S,
-- operating margin and revenue growth. Used to put one company's figures in context.
create or replace function public.sector_medians()
returns table(sector text, n int, pe float8, ps float8, op_margin float8, growth float8)
language sql stable security definer set search_path = public as $$
  with base as (
    select s.id, s.sector, nullif(ltrim(s.cik, '0'), '')::bigint cik
    from securities s where s.is_active and s.asset_type = 'stock' and s.sector is not null and s.cik ~ '^\d+$'
  ),
  single as (select cik from base group by cik having count(*) = 1),
  f as (
    select b.sector, sn.close,
      (select val from sec_facts x where x.cik = b.cik and x.concept = 'EntityCommonStockSharesOutstanding' order by period desc limit 1) sh,
      (select val from sec_facts x where x.cik = b.cik and x.concept = 'NetIncomeLoss' order by period desc limit 1) ni,
      (select val from sec_facts x where x.cik = b.cik and x.concept = 'OperatingIncomeLoss' order by period desc limit 1) oi,
      r.val rev, r.prior
    from base b join single using (cik)
    join security_snapshot sn on sn.security_id = b.id
    left join lateral (
      select f1.val, (select f0.val from sec_facts f0 where f0.cik = f1.cik and f0.concept = f1.concept and f0.period = 'CY' || (substr(f1.period, 3, 4)::int - 1)) prior
      from sec_facts f1 where f1.cik = b.cik and f1.concept in ('Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet')
      order by f1.period desc, array_position(array['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'SalesRevenueNet'], f1.concept) limit 1
    ) r on true
  )
  select sector, count(*)::int,
    percentile_cont(0.5) within group (order by sh * close / ni) filter (where ni > 0 and sh > 0 and close > 0),
    percentile_cont(0.5) within group (order by sh * close / rev) filter (where rev > 0 and sh > 0 and close > 0),
    percentile_cont(0.5) within group (order by oi / rev) filter (where rev > 0 and oi is not null),
    percentile_cont(0.5) within group (order by rev / prior - 1) filter (where rev > 0 and prior > 0)
  from f group by sector order by sector
$$;
grant execute on function public.sector_medians() to anon, authenticated;

grant execute on function public.get_fundamentals(text[]) to anon, authenticated;
revoke all on function public.sec_tick(int), public.sec_seed(), public.sec_apply_sectors() from public, anon, authenticated;

create index if not exists sec_facts_cik_idx on public.sec_facts (cik, concept, period desc);

select public.sec_seed();
select cron.schedule('viridia-sec-tick', '* * * * *', $$select public.sec_tick(3)$$);
select cron.schedule('viridia-sec-reseed', '23 9 5 * *', $$select public.sec_seed()$$);

-- Portfolio X-Ray gains each holding's sector (return type changes, so drop and recreate).
drop function if exists public.portfolio_context(text[]);
create function public.portfolio_context(p_symbols text[])
returns table(symbol text, name text, asset_subtype text, close double precision, prev_close double precision, last_ts timestamptz, trend text,
              glance_degree text, glance_pattern text, glance_complete boolean, glance_wave text, glance_wave_dir text, glance_score smallint,
              glance_hold double precision, setup_side text, setup_kind text, setup_rr real, weekly_dir text, sector text)
language sql stable security definer set search_path = public as $$
  select s.symbol, s.name, s.asset_subtype, px(x.close)::float8, px(x.prev_close)::float8, x.last_ts::timestamptz, x.trend,
         a.glance_degree, a.glance_pattern, a.glance_complete, a.glance_wave, a.glance_wave_dir, a.glance_score, a.glance_hold,
         a.setup_side, a.setup_kind, a.setup_rr, w.glance_wave_dir, s.sector
  from securities s
  left join security_snapshot x on x.security_id = s.id
  left join analysis_results a on a.security_id = s.id and a.timeframe = '1d'
  left join analysis_results w on w.security_id = s.id and w.timeframe = '1w'
  where s.is_active and s.symbol = any (select upper(trim(u)) from unnest(p_symbols[1:100]) u)
$$;
grant execute on function public.portfolio_context(text[]) to anon, authenticated;
