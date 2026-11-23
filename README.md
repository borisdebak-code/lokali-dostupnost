# Lokali – dostupnost (radni naziv: Stolovi)

Mobilna aplikacija (Expo / React Native + Supabase) s popisom ugostiteljskih objekata u Hrvatskoj.
Prvenstveno je namijenjena **organizatorima grupa** (kvizovi, okupljanja), a zatim turistima i lokalcima.

- **Za grupe:** broj ljudi + termin + mjesto → lokali u koje grupa stane, koji tada rade i nisu izvan sezone,
  poredani po tome koliko je inače gužva u to vrijeme.
- **Karta / Popis:** dvije vrste, 🍽 Jelo i 🍺 Piće, s filterima (otvoreno sad, terasa, kartice, Wi‑Fi, psi…).
- **Lokal:** kapacitet (unutra/terasa), gužva sad, tipična gužva po danu i satu, oprema za kvizove
  (separe, projektor/TV, ozvučenje), radno vrijeme, sezonalnost, link na Google Karte.
- **Spremljeno:** shortlista lokala sa statusom dogovora (ideja → kontaktirano → dogovoreno) i bilješkom.

Početne regije su **Zagreb** i **Istočna Slavonija** (Osječko-baranjska i Vukovarsko-srijemska županija).
Nova regija se dodaje jednim retkom u tablici `regions` i ponovnim pokretanjem uvoza.

## Odakle podaci

| Podatak | Izvor |
|---|---|
| Popis lokala, adresa, radno vrijeme, terasa… | OpenStreetMap (besplatno, ODbL licenca, obavezna atribucija „© OpenStreetMap suradnici”) |
| Kapacitet | korisnici (medijan prijava) → kasnije vlasnici; OSM `capacity` gdje postoji |
| Gužva | prijave korisnika („ima mjesta / srednje / gužva”), agregirano po danu i satu |
| Google ocjena | zasad samo gumb „Google Karte”; stupac `google_place_id` je spreman za Places API |
| Karta (podloga) | OpenFreeMap + MapLibre u WebViewu — besplatno, bez API ključa i bez Google računa |

## Struktura

```
supabase/migrations/   shema baze (PostGIS, RLS, funkcije za pretragu i uvoz, dnevnik uvoza)
supabase/functions/    Edge funkcija import-osm (uvoz iz OpenStreetMapa, radi na Supabaseu)
supabase/tests/        lokalni SQL test (bez Supabasea)
scripts/               isti uvoz kao skripta za vlastito računalo + testovi mapiranja
src/app/               ekrani (expo-router): (tabs)/index = Za grupe, karta, popis, spremljeno, lokal/[id]
src/lib/               Supabase klijent, API, radno vrijeme (opening_hours), oznake
src/components/        UI komponente
```

### Baza ukratko

- `regions` – regije i nazivi OSM područja za uvoz
- `venues` – lokali: kategorija (jelo/pice), lokacija (PostGIS), kapacitet + izvor, sezonalnost, filteri
- `capacity_reports` – jedna prijava kapaciteta po korisniku i lokalu → okidač računa medijan u `venues`
- `crowd_reports` – prijave gužve (najviše 1 u 20 min po korisniku i lokalu); sirove prijave nisu javne
- `saved_venues` – osobna shortlista (status + bilješka)
- `venue_cards` (view), `search_venues`, `typical_crowd`, `venue_busyness`, `region_cities` – ono što aplikacija čita
- `upsert_osm_venues`, `deactivate_missing_osm_venues` – samo za uvoz (service_role).
  Uvoz ne gazi korisnički kapacitet ni podatke koje je potvrdio vlasnik (`owner_verified_at`).
- `import_runs` – dnevnik uvoza (status, broj lokala, greška); `trigger_osm_import(regija)` pokreće uvoz

## Postavljeno okruženje

- **Supabase** projekt **lokali-dostupnost** (Frankfurt), `https://dcxbnsdhtxwtgnixqiuq.supabase.co`
  - migracije su primijenjene, anonimna prijava je uključena
  - Edge funkcija `import-osm` je objavljena; tajna `IMPORT_SECRET` je postavljena u funkciji i u Vaultu
- **Expo / EAS** projekt `@bdebak/stolovi`; `EXPO_PUBLIC_SUPABASE_URL` i `EXPO_PUBLIC_SUPABASE_ANON_KEY`
  postavljeni su kao EAS varijable (development, preview, production)

## Uvoz lokala (osvježavanje podataka)

U Supabaseu → SQL Editor:

```sql
select public.trigger_osm_import('zagreb');
-- pričekaj ~2 minute, pa:
select public.trigger_osm_import('istocna-slavonija');

select * from public.import_runs order by id desc;   -- status i broj lokala
```

Uvoz traje 1–3 minute po regiji i može se ponavljati. Novi lokali se dodaju, a nestali se skrivaju.
Za automatski tjedni uvoz vidi komentar na kraju `supabase/migrations/20261124000001_osm_import_schedule.sql`.

Alternativa sa svog računala: `cp .env.import.example .env.import` (URL + secret ključ), pa
`npm run import:osm -- zagreb`.

## Aplikacija

**Android (APK za instalaciju):**

```bash
npx eas-cli@latest build -p android --profile preview
```

Na kraju dobiješ link/QR kod za preuzimanje APK-a. Na mobitelu dopusti instalaciju iz tog izvora.

**iPhone:** potreban je Apple Developer račun (99 USD godišnje). Zatim:

```bash
npx eas-cli@latest device:create
```
```bash
npx eas-cli@latest build -p ios --profile preview
```

Prvi registrira tvoj iPhone, a drugi radi build koji se instalira preko linka.
Bez Apple računa aplikaciju možeš isprobati u **Expo Go**: `cp .env.example .env` (URL + publishable ključ),
`npx expo start`, pa skeniraj QR kod.

**Nova verzija** nakon promjene koda: isti `eas build` naredbe.

## Provjere

```bash
npm test               # mapiranje OSM → baza
npm run typecheck
npx expo lint
```

SQL test bez Supabasea (lokalni Postgres 16 + PostGIS):
`psql -f supabase/tests/local_bootstrap.sql`, zatim migracija, zatim `supabase/tests/smoke_test.sql`.

## Sljedeći koraci

1. Google ocjena: povezivanje `google_place_id` i dohvat ocjene preko Supabase Edge funkcije
   (ključ ostaje na serveru, uz kratko keširanje)
2. Prijava e-mailom (povezivanje anonimnog računa) i dijeljenje shortliste s kolegom
3. Profil za vlasnike: preuzimanje lokala, potvrđeni kapacitet, slobodni stolovi uživo, upiti za grupe (model zarade)
4. Nove regije (Osijek → cijela Slavonija → obala sa sezonalnošću)
