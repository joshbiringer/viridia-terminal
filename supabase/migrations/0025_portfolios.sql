-- Saved portfolios and target weights (Cycle 5, phase 4), and the review snapshot meeting prep
-- compares against (phase 5). Saving is opt-in: X-Ray still analyzes without storing anything.
-- Row-level security limits every read and write to the owner.

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  holdings_text text not null check (char_length(holdings_text) <= 20000),
  -- target weights by symbol, as fractions: {"VTI": 0.4, "BND": 0.2}
  targets jsonb not null default '{}'::jsonb check (jsonb_typeof(targets) = 'object'),
  -- what the X-Ray showed at the last review, for "since last review" in meeting prep
  review_snapshot jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portfolios_user_idx on public.portfolios (user_id, updated_at desc);
alter table public.portfolios enable row level security;

drop policy if exists "own portfolios" on public.portfolios;
create policy "own portfolios" on public.portfolios for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.touch_portfolio() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists portfolios_touch on public.portfolios;
create trigger portfolios_touch before update on public.portfolios for each row execute function public.touch_portfolio();

-- at most 25 saved portfolios per user
create or replace function public.limit_portfolios() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from portfolios where user_id = new.user_id) >= 25 then
    raise exception 'You can save up to 25 portfolios.';
  end if;
  return new;
end $$;
drop trigger if exists portfolios_limit on public.portfolios;
create trigger portfolios_limit before insert on public.portfolios for each row execute function public.limit_portfolios();

grant select, insert, update, delete on public.portfolios to authenticated;

revoke all on function public.limit_portfolios() from public, anon, authenticated;
revoke all on function public.touch_portfolio() from public, anon, authenticated;
