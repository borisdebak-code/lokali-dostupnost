// Uvoz termina kvizova iz data/kvizovi.csv u Supabase.
//
//   npm run import:kvizovi                 (pravi upis)
//   npm run import:kvizovi -- --dry-run    (samo provjera)
//
// Popis jednog organizatora je mjerodavan: postojeći kvizovi tog organizatora
// zamijene se onima iz datoteke. Lokal se traži po nazivu u zadanom mjestu;
// ako ga nema u bazi, a upisani su lat/lng, doda se kao novi lokal.
//
// Stupci: organizator, regija (zagreb / istocna-slavonija), mjesto, lokal,
//   dan (pon..ned), vrijeme (20:00), ucestalost (tjedno / svaki_drugi_tjedan / mjesecno / povremeno),
//   datum (YYYY-MM-DD, za ne-tjedne), max_po_ekipi, kotizacija_eur, prijava_url, napomena, lat, lng

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const DAYS = { pon: 1, uto: 2, sri: 3, cet: 4, čet: 4, pet: 5, sub: 6, ned: 7 };
const file = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? 'data/kvizovi.csv';
const dryRun = process.argv.includes('--dry-run');

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

async function main() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Nedostaje SUPABASE_URL ili SUPABASE_SERVICE_ROLE_KEY u .env.import');
  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const rows = parseCsv(readFileSync(file, 'utf8'));
  if (rows.length === 0) throw new Error(`${file} nema redaka.`);
  const { data: regions } = await db.from('regions').select('id, slug');
  const regionBySlug = new Map(regions.map((r) => [r.slug, r.id]));

  const out = [];
  const problems = [];
  for (const [i, r] of rows.entries()) {
    const line = i + 2;
    const regionId = regionBySlug.get(r.regija);
    if (!regionId) { problems.push(`red ${line}: nepoznata regija "${r.regija}"`); continue; }
    const weekday = r.dan ? DAYS[norm(r.dan).slice(0, 3)] : null;
    if (r.dan && !weekday) { problems.push(`red ${line}: nepoznat dan "${r.dan}"`); continue; }

    let q = db.from('venues').select('id, name, city').eq('region_id', regionId).eq('is_active', true).ilike('name', `%${r.lokal}%`);
    if (r.mjesto) q = q.ilike('city', r.mjesto);
    const { data: found } = await q.limit(10);
    let venue = found?.find((v) => norm(v.name) === norm(r.lokal)) ?? (found?.length === 1 ? found[0] : null);

    if (!venue && r.lat && r.lng) {
      if (dryRun) venue = { id: '(novi)', name: r.lokal };
      else {
        const ins = await db.from('venues').insert({
          region_id: regionId, name: r.lokal, category: 'pice', venue_type: 'bar', city: r.mjesto || null,
          location: `SRID=4326;POINT(${Number(r.lng)} ${Number(r.lat)})`, hosts_events: true,
        }).select('id, name').single();
        if (ins.error) throw ins.error;
        venue = ins.data;
      }
    }
    if (!venue) {
      problems.push(`red ${line}: lokal "${r.lokal}" (${r.mjesto}) nije pronađen${found?.length ? ` — kandidati: ${found.map((v) => `${v.name} (${v.city})`).join(', ')}` : ''}. Upiši točan naziv ili lat/lng.`);
      continue;
    }
    out.push({
      organizer: r.organizator || 'Fast Facts Trivia',
      row: {
        venue_id: venue.id,
        title: 'Pub kviz',
        weekday,
        start_time: r.vrijeme || null,
        frequency: r.ucestalost || 'tjedno',
        next_date: r.datum || null,
        team_size_max: r.max_po_ekipi ? Number(r.max_po_ekipi) : null,
        entry_fee_eur: r.kotizacija_eur ? Number(r.kotizacija_eur.replace(',', '.')) : null,
        signup_url: r.prijava_url || null,
        notes: r.napomena || null,
        source: file,
      },
      label: `${venue.name} · ${r.dan || r.datum} ${r.vrijeme}`,
    });
  }

  out.forEach((o) => console.log(`✓ ${o.organizer}: ${o.label}`));
  problems.forEach((p) => console.log(`✗ ${p}`));
  if (dryRun) return console.log(`\nDry run: ${out.length} spremno, ${problems.length} problema. Ništa nije upisano.`);
  if (problems.length) throw new Error('Popravi probleme pa pokreni ponovno (ništa nije upisano).');

  for (const name of new Set(out.map((o) => o.organizer))) {
    let { data: org } = await db.from('quiz_organizers').select('id').eq('name', name).maybeSingle();
    if (!org) org = (await db.from('quiz_organizers').insert({ name }).select('id').single()).data;
    const del = await db.from('quiz_nights').delete().eq('organizer_id', org.id);
    if (del.error) throw del.error;
    const ins = await db.from('quiz_nights').insert(out.filter((o) => o.organizer === name).map((o) => ({ ...o.row, organizer_id: org.id })));
    if (ins.error) throw ins.error;
    console.log(`\n${name}: upisano ${out.filter((o) => o.organizer === name).length} kvizova.`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e.message ?? e);
    process.exit(1);
  });
}
