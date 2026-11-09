-- Brain screens: the owner's fundamental screens (Graham value, Buffett quality, O'Neil growth, ...).
-- Criteria are stored as data and evaluated in the app (src/lib/brain/screens.ts) against SEC
-- fundamentals; a stock passing a value or quality screen strengthens the value third of its signal.

create table if not exists public.brain_screens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  philosophy text not null default 'value' check (philosophy in ('value', 'quality', 'growth', 'income', 'momentum')),
  -- [{"metric":"pe","op":"<","value":15}, ...]; metric ids are defined in src/lib/brain/screens.ts
  criteria jsonb not null,
  notes text,
  source text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
alter table public.brain_screens enable row level security;
drop policy if exists brain_screens_owner on public.brain_screens;
create policy brain_screens_owner on public.brain_screens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.brain_screens to authenticated;
