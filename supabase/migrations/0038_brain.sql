-- Viridia Brain: the reader's investment theses, the sources they came from, and the securities and
-- sectors each thesis bears on. Private to the owner (row-level security). Theses are filed from
-- documents the owner shares (newsletters, company material, notes) through brain_file(), which only
-- the service role can call, and are combined with value and technical evidence into research signals
-- in the app (src/lib/brain/signal.ts).

create table if not exists public.brain_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null default 'note' check (kind in ('newsletter', 'research', 'company', 'article', 'note', 'data')),
  title text not null,
  publisher text,
  author text,
  published_on date,
  url text,
  -- 'personal': licensed for the owner's own use only; never shown outside their account
  license text not null default 'personal' check (license in ('personal', 'public')),
  summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.brain_theses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_id uuid references public.brain_sources (id) on delete set null,
  title text not null,
  stance text not null check (stance in ('bullish', 'bearish', 'neutral')),
  conviction smallint not null default 3 check (conviction between 1 and 5),
  horizon text not null default 'months' check (horizon in ('weeks', 'months', 'year', 'multi-year')),
  status text not null default 'active' check (status in ('active', 'watching', 'retired', 'invalidated')),
  thesis text not null,
  invalidation text,
  -- value: the thesis is a value argument (cheapness, cash flow, balance sheet), weighted with the value third
  style text not null default 'macro' check (style in ('value', 'macro', 'technical', 'thematic', 'sentiment')),
  tags text[] not null default '{}',
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brain_links (
  id bigserial primary key,
  thesis_id uuid not null references public.brain_theses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('symbol', 'sector')),
  value text not null,
  -- overrides the thesis stance for this link (a pair trade is bullish one leg, bearish the other)
  stance text check (stance in ('bullish', 'bearish', 'neutral')),
  weight real not null default 1 check (weight > 0 and weight <= 2),
  unique (thesis_id, kind, value)
);

create index if not exists brain_theses_user on public.brain_theses (user_id, status);
create index if not exists brain_links_user_value on public.brain_links (user_id, kind, value);

alter table public.brain_sources enable row level security;
alter table public.brain_theses enable row level security;
alter table public.brain_links enable row level security;

drop policy if exists brain_sources_owner on public.brain_sources;
create policy brain_sources_owner on public.brain_sources for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists brain_theses_owner on public.brain_theses;
create policy brain_theses_owner on public.brain_theses for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists brain_links_owner on public.brain_links;
create policy brain_links_owner on public.brain_links for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.brain_sources, public.brain_theses, public.brain_links to authenticated;
grant usage on sequence public.brain_links_id_seq to authenticated;

-- File one source and its theses atomically.
--   p_source: {kind, title, publisher, author, published_on, url, license, summary}
--   p_theses: [{title, stance, conviction, horizon, status, style, thesis, invalidation, tags, expires_on,
--               links: [{kind: 'symbol'|'sector', value, stance?, weight?}]}]
create or replace function public.brain_file(p_user uuid, p_source jsonb, p_theses jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_source uuid; v_thesis uuid; t jsonb; l jsonb; n_t int := 0; n_l int := 0;
begin
  insert into brain_sources (user_id, kind, title, publisher, author, published_on, url, license, summary)
  values (p_user, coalesce(p_source->>'kind', 'note'), p_source->>'title', p_source->>'publisher', p_source->>'author',
          nullif(p_source->>'published_on', '')::date, p_source->>'url', coalesce(p_source->>'license', 'personal'), p_source->>'summary')
  returning id into v_source;
  for t in select * from jsonb_array_elements(coalesce(p_theses, '[]'::jsonb)) loop
    insert into brain_theses (user_id, source_id, title, stance, conviction, horizon, status, style, thesis, invalidation, tags, expires_on)
    values (p_user, v_source, t->>'title', t->>'stance', coalesce((t->>'conviction')::smallint, 3), coalesce(t->>'horizon', 'months'),
            coalesce(t->>'status', 'active'), coalesce(t->>'style', 'macro'), t->>'thesis', t->>'invalidation',
            coalesce(array(select jsonb_array_elements_text(t->'tags')), '{}'), nullif(t->>'expires_on', '')::date)
    returning id into v_thesis;
    n_t := n_t + 1;
    for l in select * from jsonb_array_elements(coalesce(t->'links', '[]'::jsonb)) loop
      insert into brain_links (thesis_id, user_id, kind, value, stance, weight)
      values (v_thesis, p_user, coalesce(l->>'kind', 'symbol'),
              case when coalesce(l->>'kind', 'symbol') = 'symbol' then upper(l->>'value') else initcap(l->>'value') end,
              l->>'stance', coalesce((l->>'weight')::real, 1))
      on conflict do nothing;
      n_l := n_l + 1;
    end loop;
  end loop;
  return jsonb_build_object('source', v_source, 'theses', n_t, 'links', n_l);
end $$;
revoke all on function public.brain_file(uuid, jsonb, jsonb) from public, anon, authenticated;

-- Price, trend and wave-count fields for a list of symbols: the technical third of a brain signal.
create or replace function public.brain_market(p_symbols text[])
returns table (symbol text, name text, asset_subtype text, sector text, close double precision, last_ts timestamptz,
               trend text, vs_sma50 double precision, vs_sma200 double precision, from_high double precision,
               dollar_volume double precision, glance_pattern text, glance_complete boolean, glance_wave text,
               glance_wave_dir text, glance_score smallint, glance_hold double precision)
language sql stable security definer set search_path to 'public' as $$
  select s.symbol, s.name, s.asset_subtype, s.sector, px(x.close)::float8, x.last_ts::timestamptz, x.trend,
         case when x.n50 >= 50 then (x.close / x.sma50 - 1)::float8 end,
         case when x.n200 >= 200 then (x.close / x.sma200 - 1)::float8 end,
         case when x.bars >= 250 and x.high_52w > 0 then (x.close / x.high_52w - 1)::float8 end,
         x.adv20::float8, a.glance_pattern, a.glance_complete, a.glance_wave, a.glance_wave_dir, a.glance_score, a.glance_hold
  from securities s
  join security_snapshot x on x.security_id = s.id
  left join analysis_results a on a.security_id = s.id and a.timeframe = '1d'
  where s.is_active and s.symbol = any (select upper(v) from unnest(p_symbols) v)
$$;
grant execute on function public.brain_market(text[]) to anon, authenticated;
