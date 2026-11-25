-- =====================================================================
-- Kvizovi: organizatori i redoviti termini kvizova po lokalima
-- =====================================================================

create type public.quiz_frequency as enum ('tjedno', 'svaki_drugi_tjedan', 'mjesecno', 'povremeno');

create table public.quiz_organizers (
  id smallint generated always as identity primary key,
  name text not null unique,
  website text,
  instagram text,
  facebook text,
  created_at timestamptz not null default now()
);

insert into public.quiz_organizers (name) values ('Fast Facts Trivia');

create table public.quiz_nights (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues (id) on delete cascade,
  organizer_id smallint references public.quiz_organizers (id) on delete set null,
  title text not null default 'Pub kviz',          -- npr. "Pub kviz", "Glazbeni kviz", "Family kviz"
  weekday smallint check (weekday between 1 and 7), -- 1 = ponedjeljak (ISO)
  start_time time,
  frequency public.quiz_frequency not null default 'tjedno',
  next_date date,                                    -- za kvizove koji nisu svaki tjedan
  team_size_max smallint check (team_size_max between 1 and 20),
  entry_fee_eur numeric(6, 2) check (entry_fee_eur >= 0),
  signup_url text,
  notes text,
  source text,                                       -- odakle je podatak (npr. stranica organizatora)
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (weekday is not null or next_date is not null)
);
create index quiz_nights_venue_idx on public.quiz_nights (venue_id);
create index quiz_nights_organizer_idx on public.quiz_nights (organizer_id);

create trigger quiz_nights_set_updated_at before update on public.quiz_nights
  for each row execute function public.set_updated_at();

-- Lokal s aktivnim kvizom automatski dobiva oznaku "organizira evente"
create function public.sync_venue_hosts_events() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(new.venue_id, old.venue_id);
begin
  update public.venues v
  set hosts_events = true
  where v.id = v_id
    and exists (select 1 from public.quiz_nights q where q.venue_id = v_id and q.is_active)
    and v.hosts_events is distinct from true;
  return null;
end $$;

create trigger quiz_nights_sync_venue
  after insert or update on public.quiz_nights
  for each row execute function public.sync_venue_hosts_events();

-- Kvizovi s osnovnim podacima o lokalu (ono što aplikacija čita)
create view public.quiz_cards with (security_invoker = true) as
select
  q.id, q.title, q.weekday, q.start_time, q.frequency, q.next_date,
  q.team_size_max, q.entry_fee_eur, q.signup_url, q.notes,
  o.id as organizer_id, o.name as organizer_name, o.website as organizer_website, o.instagram as organizer_instagram,
  v.id as venue_id, v.name as venue_name, v.category, v.venue_type, v.region_id,
  v.city, v.district, v.address, v.lat, v.lng, v.capacity_total, v.phone
from public.quiz_nights q
join public.venue_cards v on v.id = q.venue_id
left join public.quiz_organizers o on o.id = q.organizer_id
where q.is_active
  and (q.frequency <> 'povremeno' or q.next_date is null or q.next_date >= (now() at time zone 'Europe/Zagreb')::date);

alter table public.quiz_organizers enable row level security;
alter table public.quiz_nights enable row level security;

create policy "organizatori su javni" on public.quiz_organizers
  for select to anon, authenticated using (true);
create policy "aktivni kvizovi su javni" on public.quiz_nights
  for select to anon, authenticated using (is_active);

revoke all on public.quiz_organizers, public.quiz_nights from anon, authenticated;
grant select on public.quiz_organizers, public.quiz_nights, public.quiz_cards to anon, authenticated;
revoke execute on function public.sync_venue_hosts_events() from public, anon, authenticated;
