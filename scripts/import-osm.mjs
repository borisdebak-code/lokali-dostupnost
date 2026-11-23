// Uvoz ugostiteljskih objekata iz OpenStreetMapa u Supabase.
//
//   npm run import:osm -- zagreb
//   npm run import:osm -- istocna-slavonija
//   npm run import:osm -- zagreb --dry-run   (samo ispiše statistiku, ne piše u bazu)
//
// Treba .env.import s SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY (vidi .env.import.example).
// Podaci: © OpenStreetMap contributors, ODbL — u aplikaciji mora stajati atribucija.

import { createClient } from '@supabase/supabase-js';
import { mapElements, overpassQuery } from './osm-mapping.mjs';

const OVERPASS_URL = process.env.OVERPASS_URL || 'https://overpass-api.de/api/interpreter';
const BATCH = 500;

const args = process.argv.slice(2);
const slug = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');

if (!slug) {
  console.error('Upotreba: npm run import:osm -- <regija> [--dry-run]   npr. zagreb, istocna-slavonija');
  process.exit(1);
}

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Nedostaje SUPABASE_URL ili SUPABASE_SERVICE_ROLE_KEY u .env.import');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: region, error: regionError } = await supabase.from('regions').select('*').eq('slug', slug).single();
if (regionError || !region) {
  console.error(`Regija "${slug}" ne postoji u tablici regions.`, regionError?.message ?? '');
  process.exit(1);
}

console.log(`Dohvaćam OSM podatke za: ${region.name} (${region.osm_area_names.join(', ')}) ...`);
const startedAt = new Date();
const res = await fetch(OVERPASS_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'stolovi-import/1.0' },
  body: new URLSearchParams({ data: overpassQuery(region.osm_area_names) }),
});
if (!res.ok) {
  console.error(`Overpass greška ${res.status}: ${(await res.text()).slice(0, 500)}`);
  process.exit(1);
}
const { elements } = await res.json();
const rows = mapElements(elements);

const byType = rows.reduce((acc, r) => ((acc[r.venue_type] = (acc[r.venue_type] || 0) + 1), acc), {});
console.log(`Pronađeno ${rows.length} lokala:`, byType);
console.log(`  s kapacitetom: ${rows.filter((r) => r.capacity).length}, s radnim vremenom: ${rows.filter((r) => r.opening_hours).length}, bez mjesta: ${rows.filter((r) => !r.city).length}`);

if (dryRun) {
  console.log('Dry run — ništa nije upisano. Primjer:', rows.slice(0, 2));
  process.exit(0);
}
if (rows.length === 0) {
  console.error('Nijedan lokal nije pronađen — provjeri osm_area_names u tablici regions. Ništa nije promijenjeno.');
  process.exit(1);
}

let written = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const { data, error } = await supabase.rpc('upsert_osm_venues', { p_region_id: region.id, p_rows: rows.slice(i, i + BATCH) });
  if (error) {
    console.error('Greška pri upisu:', error.message);
    process.exit(1);
  }
  written += data;
  process.stdout.write(`\r  upisano ${written}/${rows.length}`);
}
console.log();

const { data: hidden, error: hideError } = await supabase.rpc('deactivate_missing_osm_venues', {
  p_region_id: region.id,
  p_since: startedAt.toISOString(),
});
if (hideError) console.error('Greška pri skrivanju zatvorenih lokala:', hideError.message);
else console.log(`Skriveno lokala koji više nisu u OSM-u: ${hidden}`);
console.log('Gotovo.');
