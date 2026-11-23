// Supabase Edge Function: uvoz ugostiteljskih objekata iz OpenStreetMapa.
//
// Poziv: POST /functions/v1/import-osm  { "region": "zagreb" }
// Zaglavlje x-import-secret mora odgovarati tajni IMPORT_SECRET.
// Poziva je baza (public.trigger_osm_import) jednom tjedno preko pg_cron + pg_net.
// Uvoz radi u pozadini; tijek i rezultat zapisuju se u tablicu public.import_runs.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { mapElements, overpassQuery } from './osm-mapping.mjs';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const BATCH = 500;

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

async function fetchOverpass(query: string): Promise<{ elements: unknown[] }> {
  const errors: string[] = [];
  for (const url of OVERPASS_URLS) {
    const t0 = Date.now();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'lokali-dostupnost-import/1.0' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(100_000),
      });
      if (res.ok) return await res.json();
      errors.push(`${url}: HTTP ${res.status} nakon ${Date.now() - t0} ms: ${(await res.text()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 160)}`);
    } catch (e) {
      errors.push(`${url}: ${e instanceof Error ? e.message : String(e)} nakon ${Date.now() - t0} ms`);
    }
  }
  throw new Error(`Overpass nedostupan. ${errors.join(' | ')}`);
}

async function runImport(runId: number, region: { id: number; osm_area_names: string[] }) {
  const finish = (patch: Record<string, unknown>) =>
    supabase.from('import_runs').update({ ...patch, finished_at: new Date().toISOString() }).eq('id', runId);
  try {
    const startedAt = new Date();
    const { elements } = await fetchOverpass(overpassQuery(region.osm_area_names));
    const rows = mapElements(elements as never[]);
    if (rows.length === 0) throw new Error('Nijedan lokal nije pronađen — provjeri osm_area_names.');
    await supabase.from('import_runs').update({ found: rows.length }).eq('id', runId);

    let written = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { data, error } = await supabase.rpc('upsert_osm_venues', {
        p_region_id: region.id,
        p_rows: rows.slice(i, i + BATCH),
      });
      if (error) throw new Error(`Upis: ${error.message}`);
      written += data as number;
    }
    const { data: hidden, error: hideError } = await supabase.rpc('deactivate_missing_osm_venues', {
      p_region_id: region.id,
      p_since: startedAt.toISOString(),
    });
    if (hideError) throw new Error(`Skrivanje: ${hideError.message}`);
    await finish({ status: 'gotovo', written, hidden });
  } catch (e) {
    await finish({ status: 'greska', error: e instanceof Error ? e.message : String(e) });
  }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('IMPORT_SECRET');
  if (!secret || req.headers.get('x-import-secret') !== secret) {
    return new Response('Zabranjeno', { status: 403 });
  }
  let slug = '';
  try {
    slug = String((await req.json()).region ?? '');
  } catch {
    // prazno tijelo
  }
  const { data: region } = await supabase.from('regions').select('id, slug, osm_area_names').eq('slug', slug).maybeSingle();
  if (!region) return Response.json({ error: `Nepoznata regija "${slug}"` }, { status: 400 });

  const { data: run, error } = await supabase
    .from('import_runs')
    .insert({ region_id: region.id, status: 'u_tijeku' })
    .select('id')
    .single();
  if (error || !run) return Response.json({ error: error?.message }, { status: 500 });

  EdgeRuntime.waitUntil(runImport(run.id, region));
  return Response.json({ run_id: run.id, status: 'u_tijeku' }, { status: 202 });
});
