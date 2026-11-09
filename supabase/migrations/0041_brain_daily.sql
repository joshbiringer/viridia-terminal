-- Daily model portfolio from the Brain. Applied Nov 9 2026.
-- /api/brain/daily route to build the owner's list. The route reads the owner's private theses and screens
-- through keyed security-definer functions (the key lives only in this database, sent in a header), and
-- saves the list here. The owner reads it at /brain/portfolio and in the 8:30 AM email. Nothing places orders.

create table if not exists public.brain_daily_lists (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  run_date date not null,
  generated_at timestamptz not null default now(),
  payload jsonb not null,
  email text,
  unique (user_id, run_date)
);
alter table public.brain_daily_lists enable row level security;
drop policy if exists brain_daily_lists_own on public.brain_daily_lists;
create policy brain_daily_lists_own on public.brain_daily_lists for select to authenticated using (user_id = auth.uid());

-- Who gets a daily list, and the key the app must present. No policies: invisible to anon and authenticated.
create table if not exists public.brain_daily_config (
  user_id uuid primary key references auth.users(id) on delete cascade,
  key text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  enabled boolean not null default true
);
alter table public.brain_daily_config enable row level security;
revoke all on public.brain_daily_config from anon, authenticated;

/** The owner's live theses (with source and links), active screens and the previous list, for a valid key. */
create or replace function public.brain_daily_inputs(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_user uuid;
begin
  select user_id into v_user from brain_daily_config where key = p_key and enabled;
  if v_user is null then raise exception 'invalid key'; end if;
  return jsonb_build_object(
    'user_id', v_user,
    'theses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'title', t.title, 'stance', t.stance, 'conviction', t.conviction, 'horizon', t.horizon, 'status', t.status,
        'style', t.style, 'thesis', t.thesis, 'invalidation', t.invalidation, 'tags', t.tags, 'created_at', t.created_at, 'expires_on', t.expires_on,
        'source', case when s.id is null then null else jsonb_build_object('title', s.title, 'publisher', s.publisher, 'published_on', s.published_on, 'kind', s.kind) end,
        'links', coalesce((select jsonb_agg(jsonb_build_object('kind', l.kind, 'value', l.value, 'stance', l.stance, 'weight', l.weight)) from brain_links l where l.thesis_id = t.id), '[]'::jsonb)))
      from brain_theses t left join brain_sources s on s.id = t.source_id
      where t.user_id = v_user and t.status in ('active', 'watching')), '[]'::jsonb),
    'screens', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'philosophy', philosophy, 'criteria', criteria, 'notes', notes, 'source', source, 'active', active))
      from brain_screens where user_id = v_user and active), '[]'::jsonb),
    'previous', (select payload from brain_daily_lists where user_id = v_user order by run_date desc limit 1)
  );
end $$;

create or replace function public.brain_daily_save(p_key text, p_date date, p_payload jsonb, p_email text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid;
begin
  select user_id into v_user from brain_daily_config where key = p_key and enabled;
  if v_user is null then raise exception 'invalid key'; end if;
  insert into brain_daily_lists (user_id, run_date, payload, email) values (v_user, p_date, p_payload, p_email)
  on conflict (user_id, run_date) do update set payload = excluded.payload, email = excluded.email, generated_at = now();
end $$;

-- The previous list must be today's predecessor, not today's own earlier run: inputs skip today when rebuilding.
create or replace function public.brain_daily_inputs_for(p_key text, p_date date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb; v_user uuid;
begin
  v := brain_daily_inputs(p_key);
  v_user := (v->>'user_id')::uuid;
  return jsonb_set(v, '{previous}', coalesce((select payload from brain_daily_lists where user_id = v_user and run_date < p_date order by run_date desc limit 1), 'null'::jsonb));
end $$;

grant execute on function public.brain_daily_inputs_for(text, date), public.brain_daily_save(text, date, jsonb, text) to anon, authenticated;
revoke all on function public.brain_daily_inputs(text) from public, anon, authenticated;

/** Ask the app to build today's list for every enabled owner. */
create or replace function public.brain_daily_kick()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare r record; n int := 0;
begin
  for r in select key from brain_daily_config where enabled loop
    perform net.http_get(url := 'https://viridia-terminal-ten.vercel.app/api/brain/daily',
                         headers := jsonb_build_object('x-brain-key', r.key), timeout_milliseconds := 120000);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.brain_daily_kick() from public, anon, authenticated;

insert into public.brain_daily_config (user_id) values ('79c17806-315c-4b5a-a384-9b91818af58e') on conflict do nothing;

-- 11:30 UTC = 6:30 AM EST / 7:30 AM EDT, weekdays: after the overnight bar load, before the 8:30 AM ET email.
select cron.schedule('viridia-brain-daily', '30 11 * * 1-5', $$select public.brain_daily_kick()$$);
