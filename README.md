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

## Struktura

```
supabase/migrations/   shema baze (PostGIS, RLS, funkcije za pretragu i uvoz)
supabase/tests/        lokalni SQL test (bez Supabasea)
scripts/               uvoz iz OpenStreetMapa + testovi mapiranja
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
- `upsert_osm_venues`, `deactivate_missing_osm_venues` – samo za skriptu uvoza (service_role).
  Uvoz ne gazi korisnički kapacitet ni podatke koje je potvrdio vlasnik (`owner_verified_at`).

## Postavljeno okruženje

- Supabase projekt: **lokali-dostupnost** (Frankfurt, `eu-central-1`), URL `https://dcxbnsdhtxwtgnixqiuq.supabase.co`
- Migracija `20261123000001_init.sql` je primijenjena, a anonimna prijava je uključena
- Baza je još prazna: lokali se pune skriptom za uvoz (korak 2 ispod)
- Ključeve (publishable / anon za aplikaciju, secret / service_role za uvoz) nađeš u Supabaseu pod
  Project Settings → API Keys

## Pokretanje

1. **Supabase projekt** (već napravljen, vidi gore; ovo vrijedi za novi projekt)
   - SQL editor → zalijepi i pokreni `supabase/migrations/20261123000001_init.sql`
     (ili `npx supabase db push` ako koristiš Supabase CLI)
   - Authentication → Sign In / Providers → uključi **Anonymous sign-ins**
     (korisnici mogu prijavljivati gužvu/kapacitet bez registracije)

2. **Uvoz lokala** (na svom računalu, treba internet do overpass-api.de)
   ```bash
   cp .env.import.example .env.import   # upiši URL i service_role ključ
   npm install
   npm run import:osm -- zagreb --dry-run
   npm run import:osm -- zagreb
   npm run import:osm -- istocna-slavonija
   ```
   Uvoz se može ponavljati (npr. jednom tjedno). Novi lokali se dodaju, a zatvoreni se skrivaju.

3. **Aplikacija**
   ```bash
   cp .env.example .env                 # upiši URL i anon (publishable) ključ
   npx expo start
   ```
   Otvori u Expo Go na mobitelu (skeniraj QR kod).
   Za objavu u trgovinama: `npx eas-cli@latest build`. Za Android build treba Google Maps SDK ključ
   (`android.config.googleMaps.apiKey` u app.json; mobilni Maps SDK je besplatan). iOS koristi Apple Maps.

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
