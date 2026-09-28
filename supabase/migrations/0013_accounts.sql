-- Cycle 1: accounts, preferences, watchlists and first-party product events.
-- Every table is private to its owner through row-level security; nothing here is readable by anyone else.

-- ------------------------------------------------------------------ profiles
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text check (char_length(first_name) <= 80),
  last_name text check (char_length(last_name) <= 80),
  -- onboarding answers; each one changes a default (see user_preferences)
  market_focus text check (market_focus in ('stocks','etfs','both')),
  trading_style text check (trading_style in ('short_term','swing','position','long_term')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  default_timeframe text not null default '1d' check (default_timeframe in ('1h','4h','1d','1w','1mo')),
  default_degree text not null default 'auto' check (default_degree in ('auto','primary','intermediate','minor')),
  chart_density text not null default 'comfortable' check (chart_density in ('comfortable','compact')),
  landing_page text not null default '/terminal' check (landing_page in ('/terminal','/watchlist','/markets','/scanner')),
  -- notification choices are stored now; delivery ships with alerts
  notifications jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------------ watchlists
create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Watchlist' check (char_length(name) between 1 and 60),
  position int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists watchlists_user_idx on public.watchlists(user_id, position);

create table if not exists public.watchlist_items (
  watchlist_id uuid not null references public.watchlists(id) on delete cascade,
  security_id bigint not null references public.securities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position int not null default 0,
  added_at timestamptz not null default now(),
  primary key (watchlist_id, security_id)
);
create index if not exists watchlist_items_user_idx on public.watchlist_items(user_id);

-- ------------------------------------------------------------------ product events (first-party, minimal)
-- No IP addresses, no user agents, no free text from users. Event names are a fixed list.
create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  anon_id text check (char_length(anon_id) <= 40),
  event text not null check (event in (
    'landing_view','signup_started','signup_completed','signin_completed','onboarding_started','onboarding_completed',
    'ticker_searched','analysis_viewed','watchlist_created','watchlist_item_added','alert_created',
    'trial_started','checkout_started','subscription_started')),
  path text check (char_length(path) <= 200),
  props jsonb not null default '{}'::jsonb check (pg_column_size(props) <= 2048),
  created_at timestamptz not null default now()
);
create index if not exists product_events_event_idx on public.product_events(event, created_at desc);

-- ------------------------------------------------------------------ row-level security
alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.product_events enable row level security;

create policy "own profile" on public.profiles for all to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy "own preferences" on public.user_preferences for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own watchlists" on public.watchlists for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own watchlist items" on public.watchlist_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));
-- events: anyone may insert (visitors are anonymous); a signed-in user can only attribute events to themselves; nobody can read
create policy "insert events" on public.product_events for insert to anon, authenticated
  with check (user_id is null or user_id = (select auth.uid()));

-- ------------------------------------------------------------------ new-user bootstrap
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.user_preferences (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger prefs_touch before update on public.user_preferences for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------------ watchlist view with market data
-- The caller's watchlist items with the latest snapshot and cached daily swing structure.
create or replace function public.my_watchlist(p_watchlist uuid default null)
returns table (watchlist_id uuid, security_id bigint, symbol text, name text, exchange text, asset_type text,
               close double precision, prev_close double precision, change_pct double precision, trend text,
               high_52w double precision, low_52w double precision, adv20 double precision, last_ts timestamptz,
               swing text, zones int, added_at timestamptz)
-- definer: reads the market-data views on the caller's behalf; rows are limited to auth.uid()'s own lists
language sql stable security definer set search_path = public as $$
  select i.watchlist_id, s.id, s.symbol, s.name, s.exchange, s.asset_type,
         sn.close::float8, sn.prev_close::float8,
         case when sn.prev_close > 0 then (sn.close / sn.prev_close - 1)::float8 end,
         sn.trend, sn.high_52w::float8, sn.low_52w::float8, sn.adv20::float8, sn.last_ts,
         a.swing_structure->>'intermediate', coalesce(jsonb_array_length(a.confluence_zones_json->'zones'), 0), i.added_at
  from watchlist_items i
  join watchlists w on w.id = i.watchlist_id
  join securities s on s.id = i.security_id
  left join security_snapshot sn on sn.security_id = s.id
  left join analysis_results a on a.security_id = s.id and a.timeframe = '1d'
  where w.user_id = auth.uid() and (p_watchlist is null or i.watchlist_id = p_watchlist)
  order by i.position, i.added_at
$$;
revoke all on function public.my_watchlist(uuid) from public, anon;
grant execute on function public.my_watchlist(uuid) to authenticated;

-- ------------------------------------------------------------------ account deletion (self-service)
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public, auth as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 0014: trigger functions are never called directly
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
