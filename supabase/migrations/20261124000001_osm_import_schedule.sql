-- =====================================================================
-- Uvoz iz OpenStreetMapa preko Edge funkcije: dnevnik uvoza + okidač
-- Edge funkcija import-osm radi sam uvoz; baza je samo poziva.
-- Prije prvog poziva u Vault treba spremiti dvije tajne:
--   select vault.create_secret('<https://REF.supabase.co>', 'project_url');
--   select vault.create_secret('<ista vrijednost kao IMPORT_SECRET funkcije>', 'import_secret');
-- =====================================================================

create extension if not exists pg_net with schema extensions;

create table public.import_runs (
  id bigint generated always as identity primary key,
  region_id smallint not null references public.regions (id),
  status text not null check (status in ('u_tijeku', 'gotovo', 'greska')),
  found integer,
  written integer,
  hidden integer,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index import_runs_region_idx on public.import_runs (region_id, started_at desc);

-- Samo service_role (funkcija) i administratori; aplikacija ovo ne čita
alter table public.import_runs enable row level security;
revoke all on public.import_runs from anon, authenticated;

-- Pokretanje uvoza za regiju (vraća id pg_net zahtjeva)
create function public.trigger_osm_import(p_region_slug text) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'project_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'import_secret';
  if v_url is null or v_secret is null then
    raise exception 'U Vaultu nedostaje project_url ili import_secret';
  end if;
  return net.http_post(
    url := v_url || '/functions/v1/import-osm',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-import-secret', v_secret),
    body := jsonb_build_object('region', p_region_slug),
    timeout_milliseconds := 30000
  );
end $$;

revoke execute on function public.trigger_osm_import(text) from public, anon, authenticated;

-- Tjedni raspored (opcionalno, uključi kad uvoz proradi):
--   create extension if not exists pg_cron;
--   select cron.schedule('osm-import-zagreb', '17 3 * * 1', $$select public.trigger_osm_import('zagreb')$$);
--   select cron.schedule('osm-import-istocna-slavonija', '37 3 * * 1', $$select public.trigger_osm_import('istocna-slavonija')$$);
