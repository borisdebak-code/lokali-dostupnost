-- Lokalni test sheme: psql -f local_bootstrap.sql, migracija, pa ovaj file.
-- Podaci su izmišljeni (Test lokal A/B/C).
\set ON_ERROR_STOP 1

create or replace function pg_temp.assert(cond boolean, msg text) returns void
language plpgsql as $$ begin if cond is not true then raise exception 'NEUSPJEH: %', msg; end if; end $$;

-- 1) Uvoz kao service_role
set role service_role;
select pg_temp.assert(public.upsert_osm_venues(1::smallint, '[
  {"osm_type":"node","osm_id":1,"name":"Test lokal A","category":"jelo","venue_type":"restaurant",
   "lat":45.8131,"lng":15.9775,"city":"Zagreb","capacity":80,"outdoor_seating":true,"tags":["hrana"]},
  {"osm_type":"way","osm_id":2,"name":"Test lokal B","category":"pice","venue_type":"bar",
   "lat":45.8150,"lng":15.9800,"city":"Zagreb","opening_hours":"Mo-Su 08:00-23:00"},
  {"osm_type":"node","osm_id":3,"name":"Test lokal C","category":"pice","venue_type":"pub",
   "lat":45.2700,"lng":18.7000,"city":"Županja"},
  {"osm_type":"node","osm_id":4,"name":null,"category":"pice","venue_type":"cafe","lat":45.8,"lng":15.9}
]'::jsonb) = 3, 'uvoz 3 lokala (bez imena se preskače)');
reset role;

-- 2) Anonimni korisnik čita i pretražuje
set role anon;
select pg_temp.assert((select count(*) from public.venue_cards) = 3, 'anon vidi 3 lokala');
select pg_temp.assert((select count(*) from public.search_venues(p_lat => 45.8131, p_lng => 15.9775, p_radius_m => 2000)) = 2,
  'radijus 2 km oko Zagreba = 2 lokala');
select pg_temp.assert((select name from public.search_venues(p_lat => 45.8131, p_lng => 15.9775) limit 1) = 'Test lokal A',
  'najbliži prvi');
select pg_temp.assert((select count(*) from public.search_venues(p_min_capacity => 50, p_include_unknown_capacity => false)) = 1,
  'samo poznat kapacitet >= 50');
select pg_temp.assert((select count(*) from public.search_venues(p_min_capacity => 50)) = 3,
  'nepoznat kapacitet uključen po defaultu');
select pg_temp.assert((select count(*) from public.search_venues(p_features => array['terasa'])) = 1, 'filter terasa');
select pg_temp.assert((select count(*) from public.search_venues(p_category => 'pice', p_city => 'županja')) = 1, 'grad + kategorija');
select pg_temp.assert((select count(*) from public.region_cities(1::smallint)) = 2, 'gradovi u regiji');

do $$ begin
  begin
    insert into public.crowd_reports (venue_id, level) select id, 3 from public.venues limit 1;
    raise exception 'anon ne smije prijaviti gužvu';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.upsert_osm_venues(1::smallint, '[]'::jsonb);
    raise exception 'anon ne smije pokretati uvoz';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

-- 3) Prijavljeni (anonimni Supabase) korisnici prijavljuju gužvu i kapacitet
insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b');
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

insert into public.crowd_reports (venue_id, level)
  select id, 3 from public.venues where osm_id = 2;
do $$ begin
  begin
    insert into public.crowd_reports (venue_id, level) select id, 1 from public.venues where osm_id = 2;
    raise exception 'ograničenje 20 min nije radilo';
  exception when raise_exception then
    if sqlerrm not like 'Gužvu%' then raise; end if;
  end;
end $$;
select pg_temp.assert((select crowd_now from public.venue_cards where name = 'Test lokal B') = 3, 'gužva sad = 3');
do $$ begin
  begin
    perform count(*) from public.crowd_reports;
    raise exception 'sirove prijave gužve ne smiju biti čitljive';
  exception when insufficient_privilege then null;
  end;
end $$;

insert into public.capacity_reports (venue_id, indoor, outdoor)
  select id, 40, 20 from public.venues where osm_id = 2;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
insert into public.capacity_reports (venue_id, indoor)
  select id, 60 from public.venues where osm_id = 2;
select pg_temp.assert((select capacity_indoor from public.venue_cards where name = 'Test lokal B') = 50, 'medijan unutra = 50');
select pg_temp.assert((select capacity_total from public.venue_cards where name = 'Test lokal B') = 70, 'ukupno = 70');
select pg_temp.assert((select capacity_source::text from public.venue_cards where name = 'Test lokal B') = 'korisnici', 'izvor korisnici');
select pg_temp.assert((select count(*) from public.capacity_reports) = 1, 'korisnik vidi samo svoju prijavu');

do $$ begin
  begin
    insert into public.capacity_reports (venue_id, user_id, indoor)
      select id, '00000000-0000-0000-0000-00000000000a', 999 from public.venues where osm_id = 1;
    raise exception 'unos u tuđe ime je prošao';
  exception when insufficient_privilege then null;
  end;
end $$;

insert into public.saved_venues (venue_id, status, note)
  select id, 'kontaktirano', 'Pitati za projektor' from public.venues where osm_id = 1;
select pg_temp.assert((select count(*) from public.saved_venues) = 1, 'spremljeni lokal');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.assert((select count(*) from public.saved_venues) = 0, 'tuđi popis nije vidljiv');
reset role;

-- 4) Ponovni uvoz: korisnički kapacitet ostaje, potvrđeni podaci vlasnika ostaju, nestali lokali se skrivaju
update public.venues set owner_verified_at = now(), name = 'Test lokal A (vlasnik)' where osm_id = 1;
update public.venues set osm_last_seen_at = now() - interval '1 day' where osm_id = 3;
set role service_role;
select public.upsert_osm_venues(1::smallint, '[
  {"osm_type":"node","osm_id":1,"name":"Stari naziv","category":"jelo","venue_type":"restaurant","lat":45.8131,"lng":15.9775},
  {"osm_type":"way","osm_id":2,"name":"Test lokal B","category":"pice","venue_type":"bar","lat":45.8150,"lng":15.9800,"capacity":500}
]'::jsonb);
select public.deactivate_missing_osm_venues(1::smallint, now() - interval '1 second');
reset role;
select pg_temp.assert((select name from public.venues where osm_id = 1) = 'Test lokal A (vlasnik)', 'vlasnikov naziv ostaje');
select pg_temp.assert((select capacity_total from public.venues where osm_id = 2) = 70, 'OSM ne gazi korisnički kapacitet');
select pg_temp.assert((select outdoor_seating from public.venues where osm_id = 1), 'terasa ostaje kad OSM ne kaže ništa');

select pg_temp.assert((select not is_active from public.venues where osm_id = 3), 'nestali lokal skriven');

-- 5) Kvizovi
insert into public.quiz_nights (venue_id, organizer_id, weekday, start_time)
  select v.id, o.id, 2, '20:00' from public.venues v, public.quiz_organizers o
  where v.osm_id = 2 and o.name = 'Fast Facts Trivia';
select pg_temp.assert((select hosts_events from public.venues where osm_id = 2), 'lokal s kvizom dobiva oznaku eventi');
set role anon;
select pg_temp.assert((select count(*) from public.quiz_cards) = 1, 'anon vidi kviz');
select pg_temp.assert((select organizer_name from public.quiz_cards) = 'Fast Facts Trivia', 'organizator');
do $$ begin
  begin
    insert into public.quiz_nights (venue_id, weekday) select id, 1 from public.venues limit 1;
    raise exception 'anon ne smije dodavati kvizove';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select 'SVI TESTOVI PROŠLI' as rezultat;
