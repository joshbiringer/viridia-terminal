-- Ask Viridia (research copilot).
--   ask_structure        one security's structure for answers: swings by degree, how many counts the
--                        engine found, and the three nearest Fibonacci confluence zones with their levels
--   resolve_symbols      which of a list of candidate tokens are covered tickers (query routing)
--   ask_conversations    saved conversations, owner-only, grouped by workspace; messages carry an
--                        internal execution trace (tools, sources, timings), never chain-of-thought

create or replace function public.ask_structure(p_symbol text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'swing', a.swing_structure,
    'candidates', a.candidate_count,
    'analysis_ts', a.source_last_ts,
    'close_call', (a.glance_alt_score is not null and a.glance_score is not null and a.glance_score - a.glance_alt_score < 5),
    'zones', coalesce((
      select jsonb_agg(z order by abs((z->>'distancePct')::float8))
      from (select z from jsonb_array_elements(coalesce(a.confluence_zones_json->'zones', '[]'::jsonb)) z
            order by abs((z->>'distancePct')::float8) limit 3) q
    ), '[]'::jsonb)
  )
  from securities s join analysis_results a on a.security_id = s.id and a.timeframe = '1d'
  where s.symbol = upper(trim(p_symbol)) and s.is_active
$$;
grant execute on function public.ask_structure(text) to anon, authenticated;

create or replace function public.resolve_symbols(p_symbols text[])
returns table(symbol text, name text, asset_subtype text)
language sql stable security definer set search_path = public as $$
  select s.symbol, s.name, s.asset_subtype from securities s
  where s.is_active and s.symbol = any (select distinct upper(trim(u)) from unnest(p_symbols[1:40]) u)
$$;
grant execute on function public.resolve_symbols(text[]) to anon, authenticated;

create table if not exists public.ask_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New conversation' check (char_length(title) between 1 and 120),
  workspace text check (workspace is null or char_length(workspace) <= 80),
  archived boolean not null default false,
  entities text[] not null default '{}',
  messages jsonb not null default '[]'::jsonb check (jsonb_typeof(messages) = 'array' and pg_column_size(messages) < 900000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ask_conversations_user_idx on public.ask_conversations (user_id, updated_at desc);
alter table public.ask_conversations enable row level security;
drop policy if exists "own conversations" on public.ask_conversations;
create policy "own conversations" on public.ask_conversations for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
grant select, insert, update, delete on public.ask_conversations to authenticated;
drop trigger if exists ask_conversations_touch on public.ask_conversations;
create trigger ask_conversations_touch before update on public.ask_conversations for each row execute function public.touch_portfolio();

create or replace function public.limit_ask_conversations() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from ask_conversations where user_id = new.user_id) >= 200 then
    raise exception 'You can keep up to 200 conversations. Delete older ones first.';
  end if;
  return new;
end $$;
revoke all on function public.limit_ask_conversations() from public, anon, authenticated;
drop trigger if exists ask_conversations_limit on public.ask_conversations;
create trigger ask_conversations_limit before insert on public.ask_conversations for each row execute function public.limit_ask_conversations();
