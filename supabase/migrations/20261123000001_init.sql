-- =====================================================================
-- Stolovi: početna shema baze
-- Ugostiteljski objekti (jelo / piće), kapacitet, gužva, spremljeni popisi
-- =====================================================================

create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- Tipovi
-- ---------------------------------------------------------------------
create type public.venue_category as enum ('jelo', 'pice');
create type public.seasonality as enum ('cijela_godina', 'sezonski', 'nepoznato');
create type public.capacity_source as enum ('vlasnik', 'korisnici', 'osm');
create type public.saved_status as enum ('ideja', 'kontaktirano', 'dogovoreno', 'odbijeno');

-- ---------------------------------------------------------------------
-- Regije (Zagreb, Istočna Slavonija, ... dodaje se po potrebi)
-- ---------------------------------------------------------------------
create table public.regions (
  id smallint generated always as identity primary key,
  slug text not null unique,
  name text not null,
  -- nazivi administrativnih područja u OpenStreetMapu (za uvoz)
  osm_area_names text[] not null,
  center_lat double precision not null,
  center_lng double precision not null,
  radius_m integer not null default 5000
);

insert into public.regions (slug, name, osm_area_names, center_lat, center_lng, radius_m) values
  ('zagreb', 'Zagreb', array['Grad Zagreb'], 45.8131, 15.9775, 6000),
  ('istocna-slavonija', 'Istočna Slavonija',
     array['Osječko-baranjska županija', 'Vukovarsko-srijemska županija'],
     45.4500, 18.6900, 60000);

-- ---------------------------------------------------------------------
-- Lokali
-- ---------------------------------------------------------------------
create table public.venues (
  id uuid primary key default gen_random_uuid(),
  region_id smallint not null references public.regions (id),

  -- izvori
  osm_type text check (osm_type in ('node', 'way', 'relation')),
  osm_id bigint,
  google_place_id text unique,          -- za kasnije povlačenje Google ocjene
  osm_last_seen_at timestamptz,
  owner_verified_at timestamptz,        -- vlasnik je potvrdio podatke (uvoz ih tada ne gazi)

  -- osnovno
  name text not null,
  category public.venue_category not null,
  venue_type text not null,             -- restaurant, cafe, bar, pub, fast_food, ...
  cuisine text[] not null default '{}',
  tags text[] not null default '{}',    -- slobodne oznake: hrana, kokteli, craft-pivo, slastice...

  -- lokacija
  location extensions.geography (point, 4326) not null,
  address text,
  postcode text,
  city text,
  district text,                        -- kvart / naselje (korisno za Zagreb)

  -- kontakt
  phone text,
  website text,
  email text,

  -- radno vrijeme i sezonalnost
  opening_hours text,                   -- OSM sintaksa, npr. "Mo-Fr 07:00-23:00; Sa 08:00-24:00"
  seasonality public.seasonality not null default 'nepoznato',
  season_start_month smallint check (season_start_month between 1 and 12),
  season_end_month smallint check (season_end_month between 1 and 12),

  -- kapacitet (broj mjesta)
  capacity_indoor integer check (capacity_indoor >= 0),
  capacity_outdoor integer check (capacity_outdoor >= 0),
  capacity_total integer generated always as (
    case when capacity_indoor is null and capacity_outdoor is null then null
         else coalesce(capacity_indoor, 0) + coalesce(capacity_outdoor, 0) end
  ) stored,
  capacity_source public.capacity_source,
  capacity_reports_count integer not null default 0,
  capacity_updated_at timestamptz,

  -- praktični filteri (null = ne znamo)
  outdoor_seating boolean,     -- terasa
  takes_reservations boolean,
  card_payment boolean,
  wheelchair boolean,
  dogs_allowed boolean,
  kids_friendly boolean,
  has_parking boolean,
  has_wifi boolean,
  smoking_allowed boolean,

  -- za grupe / kvizove
  has_private_room boolean,    -- separe / zasebna prostorija
  has_projector_tv boolean,    -- projektor ili veliki TV
  has_sound_system boolean,    -- ozvučenje / mikrofon
  hosts_events boolean,        -- već organizira kvizove, svirke...

  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (osm_type, osm_id)
);

create index venues_location_gix on public.venues using gist (location);
create index venues_region_city_idx on public.venues (region_id, lower(city));
create index venues_tags_gin on public.venues using gin (tags);
create index venues_capacity_idx on public.venues (capacity_total) where is_active;

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger venues_set_updated_at before update on public.venues
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Prijave kapaciteta od korisnika (jedna po korisniku po lokalu)
-- ---------------------------------------------------------------------
create table public.capacity_reports (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  indoor integer check (indoor between 0 and 2000),
  outdoor integer check (outdoor between 0 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (indoor is not null or outdoor is not null),
  unique (venue_id, user_id)
);
create index capacity_reports_user_idx on public.capacity_reports (user_id);

create trigger capacity_reports_set_updated_at before update on public.capacity_reports
  for each row execute function public.set_updated_at();

-- Kapacitet lokala = medijan korisničkih prijava (osim ako ga je unio vlasnik)
create function public.recompute_venue_capacity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid := coalesce(new.venue_id, old.venue_id);
begin
  update public.venues v
  set capacity_indoor  = coalesce(agg.indoor, v.capacity_indoor),
      capacity_outdoor = coalesce(agg.outdoor, v.capacity_outdoor),
      capacity_source  = 'korisnici',
      capacity_reports_count = agg.n,
      capacity_updated_at = now()
  from (
    select round(percentile_cont(0.5) within group (order by indoor))::int  as indoor,
           round(percentile_cont(0.5) within group (order by outdoor))::int as outdoor,
           count(*)::int as n
    from public.capacity_reports
    where venue_id = v_id
  ) agg
  where v.id = v_id
    and v.capacity_source is distinct from 'vlasnik'
    and agg.n > 0;
  return null;
end $$;

create trigger capacity_reports_recompute
  after insert or update on public.capacity_reports
  for each row execute function public.recompute_venue_capacity();

-- ---------------------------------------------------------------------
-- Prijave gužve (1 = ima mjesta, 2 = srednje, 3 = gužva)
-- ---------------------------------------------------------------------
create table public.crowd_reports (
  id bigint generated always as identity primary key,
  venue_id uuid not null references public.venues (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  level smallint not null check (level between 1 and 3),
  created_at timestamptz not null default now()
);
create index crowd_reports_venue_time_idx on public.crowd_reports (venue_id, created_at desc);
create index crowd_reports_user_idx on public.crowd_reports (user_id, venue_id, created_at desc);

-- Isti korisnik može prijaviti gužvu za isti lokal najviše jednom u 20 minuta
create function public.crowd_reports_rate_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.crowd_reports
    where user_id = new.user_id and venue_id = new.venue_id
      and created_at > now() - interval '20 minutes'
  ) then
    raise exception 'Gužvu za ovaj lokal već ste prijavili u zadnjih 20 minuta.'
      using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end $$;

create trigger crowd_reports_rate_limit before insert on public.crowd_reports
  for each row execute function public.crowd_reports_rate_limit();

-- ---------------------------------------------------------------------
-- Spremljeni lokali (shortlista organizatora: bilješka + status dogovora)
-- ---------------------------------------------------------------------
create table public.saved_venues (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  venue_id uuid not null references public.venues (id) on delete cascade,
  status public.saved_status not null default 'ideja',
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, venue_id)
);
create index saved_venues_venue_idx on public.saved_venues (venue_id);

create trigger saved_venues_set_updated_at before update on public.saved_venues
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Agregati gužve (sirove prijave nisu javne, samo prosjeci)
-- ---------------------------------------------------------------------

-- Trenutna gužva: prosjek prijava u zadnjih 90 minuta
create function public.crowd_now(p_venue_id uuid, out level numeric, out reports integer)
language sql stable security definer set search_path = '' as $$
  select round(avg(level), 2), count(*)::int
  from public.crowd_reports
  where venue_id = p_venue_id and created_at > now() - interval '90 minutes'
$$;

-- Tipična gužva po danu u tjednu (1 = pon) i satu, zadnjih godinu dana
create function public.venue_busyness(p_venue_id uuid)
returns table (isodow smallint, hour smallint, level numeric, reports integer)
language sql stable security definer set search_path = '' as $$
  select extract(isodow from created_at at time zone 'Europe/Zagreb')::smallint,
         extract(hour from created_at at time zone 'Europe/Zagreb')::smallint,
         round(avg(level), 2),
         count(*)::int
  from public.crowd_reports
  where venue_id = p_venue_id and created_at > now() - interval '365 days'
  group by 1, 2
  order by 1, 2
$$;

-- Tipična gužva za više lokala u zadanom terminu (za pretragu grupa).
-- Vraća samo lokale s barem 3 prijave u tom danu/satu.
create function public.typical_crowd(p_venue_ids uuid[], p_at timestamptz)
returns table (venue_id uuid, level numeric, reports integer)
language sql stable security definer set search_path = '' as $$
  select cr.venue_id, round(avg(cr.level), 2), count(*)::int
  from public.crowd_reports cr
  where cr.venue_id = any (p_venue_ids[1:500])
    and cr.created_at > now() - interval '365 days'
    and extract(isodow from cr.created_at at time zone 'Europe/Zagreb')
        = extract(isodow from p_at at time zone 'Europe/Zagreb')
    and extract(hour from cr.created_at at time zone 'Europe/Zagreb')
        = extract(hour from p_at at time zone 'Europe/Zagreb')
  group by cr.venue_id
  having count(*) >= 3
$$;

-- ---------------------------------------------------------------------
-- Javni prikaz lokala (ono što aplikacija čita)
-- ---------------------------------------------------------------------
create view public.venue_cards with (security_invoker = true) as
select
  v.id, v.region_id, v.name, v.category, v.venue_type, v.cuisine, v.tags,
  extensions.st_y(v.location::extensions.geometry) as lat,
  extensions.st_x(v.location::extensions.geometry) as lng,
  v.address, v.postcode, v.city, v.district,
  v.phone, v.website, v.email,
  v.opening_hours, v.seasonality, v.season_start_month, v.season_end_month,
  v.capacity_indoor, v.capacity_outdoor, v.capacity_total, v.capacity_source,
  v.capacity_reports_count,
  v.outdoor_seating, v.takes_reservations, v.card_payment, v.wheelchair,
  v.dogs_allowed, v.kids_friendly, v.has_parking, v.has_wifi, v.smoking_allowed,
  v.has_private_room, v.has_projector_tv, v.has_sound_system, v.hosts_events,
  v.google_place_id, v.owner_verified_at,
  cn.level as crowd_now, cn.reports as crowd_now_reports
from public.venues v
cross join lateral public.crowd_now(v.id) cn
where v.is_active;

-- ---------------------------------------------------------------------
-- Pretraga
-- p_features: terasa, separe, projektor, ozvucenje, eventi, rezervacije,
--             kartice, wifi, pristupacno, psi, djeca, parking, nepusacki
-- ---------------------------------------------------------------------
create function public.search_venues(
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_m integer default 3000,
  p_region_id smallint default null,
  p_city text default null,
  p_category public.venue_category default null,
  p_min_capacity integer default null,
  p_include_unknown_capacity boolean default true,
  p_features text[] default '{}',
  p_query text default null,
  p_limit integer default 200
)
returns setof public.venue_cards
language sql stable set search_path = '' as $$
  select c.*
  from public.venue_cards c
  join public.venues v on v.id = c.id
  where (p_lat is null or p_lng is null or extensions.st_dwithin(
           v.location,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography,
           least(greatest(p_radius_m, 100), 100000)))
    and (p_region_id is null or c.region_id = p_region_id)
    and (p_city is null or lower(c.city) = lower(p_city))
    and (p_category is null or c.category = p_category)
    and (p_min_capacity is null
         or c.capacity_total >= p_min_capacity
         or (p_include_unknown_capacity and c.capacity_total is null))
    and (p_query is null or c.name ilike '%' || p_query || '%')
    and ('terasa'      <> all (p_features) or c.outdoor_seating)
    and ('separe'      <> all (p_features) or c.has_private_room)
    and ('projektor'   <> all (p_features) or c.has_projector_tv)
    and ('ozvucenje'   <> all (p_features) or c.has_sound_system)
    and ('eventi'      <> all (p_features) or c.hosts_events)
    and ('rezervacije' <> all (p_features) or c.takes_reservations)
    and ('kartice'     <> all (p_features) or c.card_payment)
    and ('wifi'        <> all (p_features) or c.has_wifi)
    and ('pristupacno' <> all (p_features) or c.wheelchair)
    and ('psi'         <> all (p_features) or c.dogs_allowed)
    and ('djeca'       <> all (p_features) or c.kids_friendly)
    and ('parking'     <> all (p_features) or c.has_parking)
    and ('nepusacki'   <> all (p_features) or c.smoking_allowed = false)
  order by
    case when p_lat is not null and p_lng is not null then extensions.st_distance(
      v.location,
      extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography)
    end nulls last,
    c.capacity_total desc nulls last,
    c.name
  limit least(greatest(p_limit, 1), 500)
$$;

-- Mjesta u regiji (za odabir grada u pretrazi grupa)
create function public.region_cities(p_region_id smallint)
returns table (city text, venues integer, lat double precision, lng double precision)
language sql stable set search_path = '' as $$
  select c.city, count(*)::int, avg(c.lat), avg(c.lng)
  from public.venue_cards c
  where c.region_id = p_region_id and c.city is not null
  group by c.city
  order by count(*) desc, c.city
$$;

-- ---------------------------------------------------------------------
-- Uvoz iz OpenStreetMapa (poziva samo skripta sa service_role ključem)
-- ---------------------------------------------------------------------
create function public.upsert_osm_venues(p_region_id smallint, p_rows jsonb)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with src as (
    select r.*
    from jsonb_to_recordset(p_rows) as r(
      osm_type text, osm_id bigint, name text, category public.venue_category,
      venue_type text, cuisine text[], tags text[], lat double precision, lng double precision,
      address text, postcode text, city text, district text,
      phone text, website text, email text, opening_hours text,
      seasonality public.seasonality, season_start_month smallint, season_end_month smallint,
      capacity integer,
      outdoor_seating boolean, takes_reservations boolean, card_payment boolean,
      wheelchair boolean, dogs_allowed boolean, kids_friendly boolean, has_wifi boolean,
      smoking_allowed boolean)
  )
  insert into public.venues as v (
    region_id, osm_type, osm_id, osm_last_seen_at, name, category, venue_type, cuisine, tags,
    location, address, postcode, city, district, phone, website, email, opening_hours,
    seasonality, season_start_month, season_end_month,
    capacity_indoor, capacity_source, capacity_updated_at,
    outdoor_seating, takes_reservations, card_payment, wheelchair, dogs_allowed,
    kids_friendly, has_wifi, smoking_allowed, is_active)
  select
    p_region_id, s.osm_type, s.osm_id, now(), s.name, s.category, s.venue_type,
    coalesce(s.cuisine, '{}'), coalesce(s.tags, '{}'),
    extensions.st_setsrid(extensions.st_makepoint(s.lng, s.lat), 4326)::extensions.geography,
    s.address, s.postcode, s.city, s.district, s.phone, s.website, s.email, s.opening_hours,
    coalesce(s.seasonality, 'nepoznato'), s.season_start_month, s.season_end_month,
    s.capacity, case when s.capacity is not null then 'osm'::public.capacity_source end,
    case when s.capacity is not null then now() end,
    s.outdoor_seating, s.takes_reservations, s.card_payment, s.wheelchair, s.dogs_allowed,
    s.kids_friendly, s.has_wifi, s.smoking_allowed, true
  from src s
  where s.name is not null and s.lat is not null and s.lng is not null
  on conflict (osm_type, osm_id) do update set
    osm_last_seen_at = now(),
    is_active = true,
    region_id = excluded.region_id,
    location = excluded.location,
    -- podatke koje je potvrdio vlasnik ne prepisujemo
    name          = case when v.owner_verified_at is null then excluded.name else v.name end,
    category      = case when v.owner_verified_at is null then excluded.category else v.category end,
    venue_type    = case when v.owner_verified_at is null then excluded.venue_type else v.venue_type end,
    cuisine       = case when v.owner_verified_at is null then excluded.cuisine else v.cuisine end,
    tags          = case when v.owner_verified_at is null
                         then (select coalesce(array_agg(distinct t order by t), '{}')
                               from unnest(v.tags || excluded.tags) t)
                         else v.tags end,
    address       = coalesce(excluded.address, v.address),
    postcode      = coalesce(excluded.postcode, v.postcode),
    city          = coalesce(excluded.city, v.city),
    district      = coalesce(excluded.district, v.district),
    phone         = case when v.owner_verified_at is null then coalesce(excluded.phone, v.phone) else v.phone end,
    website       = case when v.owner_verified_at is null then coalesce(excluded.website, v.website) else v.website end,
    email         = case when v.owner_verified_at is null then coalesce(excluded.email, v.email) else v.email end,
    opening_hours = case when v.owner_verified_at is null then coalesce(excluded.opening_hours, v.opening_hours) else v.opening_hours end,
    seasonality   = case when v.owner_verified_at is null and excluded.seasonality <> 'nepoznato'
                         then excluded.seasonality else v.seasonality end,
    season_start_month = case when v.owner_verified_at is null then coalesce(excluded.season_start_month, v.season_start_month) else v.season_start_month end,
    season_end_month   = case when v.owner_verified_at is null then coalesce(excluded.season_end_month, v.season_end_month) else v.season_end_month end,
    capacity_indoor = case when (v.capacity_source is null or v.capacity_source = 'osm') and excluded.capacity_indoor is not null
                           then excluded.capacity_indoor else v.capacity_indoor end,
    capacity_source = case when (v.capacity_source is null or v.capacity_source = 'osm') and excluded.capacity_indoor is not null
                           then 'osm' else v.capacity_source end,
    outdoor_seating    = case when v.owner_verified_at is null then coalesce(excluded.outdoor_seating, v.outdoor_seating) else v.outdoor_seating end,
    takes_reservations = case when v.owner_verified_at is null then coalesce(excluded.takes_reservations, v.takes_reservations) else v.takes_reservations end,
    card_payment       = case when v.owner_verified_at is null then coalesce(excluded.card_payment, v.card_payment) else v.card_payment end,
    wheelchair         = case when v.owner_verified_at is null then coalesce(excluded.wheelchair, v.wheelchair) else v.wheelchair end,
    dogs_allowed       = case when v.owner_verified_at is null then coalesce(excluded.dogs_allowed, v.dogs_allowed) else v.dogs_allowed end,
    kids_friendly      = case when v.owner_verified_at is null then coalesce(excluded.kids_friendly, v.kids_friendly) else v.kids_friendly end,
    has_wifi           = case when v.owner_verified_at is null then coalesce(excluded.has_wifi, v.has_wifi) else v.has_wifi end,
    smoking_allowed    = case when v.owner_verified_at is null then coalesce(excluded.smoking_allowed, v.smoking_allowed) else v.smoking_allowed end;

  get diagnostics n = row_count;
  return n;
end $$;

-- Lokali koji su nestali iz OSM-a (zatvoreni) skrivaju se nakon uvoza
create function public.deactivate_missing_osm_venues(p_region_id smallint, p_since timestamptz)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  update public.venues
  set is_active = false
  where region_id = p_region_id
    and osm_id is not null
    and owner_verified_at is null
    and is_active
    and osm_last_seen_at < p_since;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Ovlasti i Row Level Security
-- ---------------------------------------------------------------------
alter table public.regions enable row level security;
alter table public.venues enable row level security;
alter table public.capacity_reports enable row level security;
alter table public.crowd_reports enable row level security;
alter table public.saved_venues enable row level security;

create policy "regije su javne" on public.regions
  for select to anon, authenticated using (true);

create policy "aktivni lokali su javni" on public.venues
  for select to anon, authenticated using (is_active);

create policy "korisnik vidi svoje prijave kapaciteta" on public.capacity_reports
  for select to authenticated using (user_id = (select auth.uid()));
create policy "korisnik unosi svoje prijave kapaciteta" on public.capacity_reports
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "korisnik mijenja svoje prijave kapaciteta" on public.capacity_reports
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy "korisnik unosi prijave gužve" on public.crowd_reports
  for insert to authenticated with check (user_id = (select auth.uid()));

create policy "korisnik upravlja svojim popisom" on public.saved_venues
  for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Tablice: samo ono što aplikaciji treba
revoke all on public.regions, public.venues, public.capacity_reports,
              public.crowd_reports, public.saved_venues from anon, authenticated;
grant select on public.regions, public.venues to anon, authenticated;
grant select on public.venue_cards to anon, authenticated;
grant select, insert, update on public.capacity_reports to authenticated;
grant insert on public.crowd_reports to authenticated;
grant select, insert, update, delete on public.saved_venues to authenticated;

-- Funkcije
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.crowd_now(uuid),
  public.venue_busyness(uuid),
  public.typical_crowd(uuid[], timestamptz),
  public.search_venues(double precision, double precision, integer, smallint, text,
                       public.venue_category, integer, boolean, text[], text, integer),
  public.region_cities(smallint)
to anon, authenticated;
grant execute on function
  public.upsert_osm_venues(smallint, jsonb),
  public.deactivate_missing_osm_venues(smallint, timestamptz)
to service_role;
