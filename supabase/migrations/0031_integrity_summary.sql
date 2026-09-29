-- Public summary of the nightly data-integrity checks (counts only; findings stay internal).
create or replace function public.integrity_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'ran_at', (select value->>'ran_at' from ingest_state where key = 'integrity'),
    'checks', (select coalesce(jsonb_object_agg(check_name, n), '{}'::jsonb) from (select check_name, count(*) n from data_integrity_findings group by 1) x),
    'high', (select count(*) from data_integrity_findings where severity = 'high'))
$$;
grant execute on function public.integrity_summary() to anon, authenticated;
