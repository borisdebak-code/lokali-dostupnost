import { supabase, ensureUser } from './supabase';
import type {
  Busyness, QuizCard, Region, RegionCity, SavedStatus, SavedVenue, SearchParams, TypicalCrowd, Venue,
} from './types';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function getRegions(): Promise<Region[]> {
  return check(await supabase.from('regions').select('id, slug, name, center_lat, center_lng, radius_m').order('id'));
}

export async function getRegionCities(regionId: number): Promise<RegionCity[]> {
  return check(await supabase.rpc('region_cities', { p_region_id: regionId }));
}

export async function searchVenues(p: SearchParams): Promise<Venue[]> {
  return check(
    await supabase.rpc('search_venues', {
      p_lat: p.lat ?? null,
      p_lng: p.lng ?? null,
      p_radius_m: p.radiusM ?? 3000,
      p_region_id: p.regionId ?? null,
      p_city: p.city ?? null,
      p_category: p.category ?? null,
      p_min_capacity: p.minCapacity ?? null,
      p_include_unknown_capacity: p.includeUnknownCapacity ?? true,
      p_features: p.features ?? [],
      p_query: p.query?.trim() ? p.query.trim() : null,
      p_limit: p.limit ?? 200,
    }),
  );
}

export async function getVenue(id: string): Promise<Venue | null> {
  return check(await supabase.from('venue_cards').select('*').eq('id', id).maybeSingle());
}

export async function getVenues(ids: string[]): Promise<Venue[]> {
  if (ids.length === 0) return [];
  return check(await supabase.from('venue_cards').select('*').in('id', ids));
}

export async function getBusyness(venueId: string): Promise<Busyness[]> {
  return check(await supabase.rpc('venue_busyness', { p_venue_id: venueId }));
}

export async function getTypicalCrowd(venueIds: string[], at: Date): Promise<TypicalCrowd[]> {
  if (venueIds.length === 0) return [];
  return check(await supabase.rpc('typical_crowd', { p_venue_ids: venueIds, p_at: at.toISOString() }));
}

export async function reportCrowd(venueId: string, level: 1 | 2 | 3): Promise<void> {
  await ensureUser();
  check(await supabase.from('crowd_reports').insert({ venue_id: venueId, level }));
}

export async function reportCapacity(venueId: string, indoor: number | null, outdoor: number | null): Promise<void> {
  const userId = await ensureUser();
  check(
    await supabase
      .from('capacity_reports')
      .upsert({ venue_id: venueId, user_id: userId, indoor, outdoor }, { onConflict: 'venue_id,user_id' }),
  );
}

export async function getSaved(): Promise<SavedVenue[]> {
  await ensureUser();
  return check(
    await supabase.from('saved_venues').select('venue_id, status, note, updated_at').order('updated_at', { ascending: false }),
  );
}

export async function getSavedOne(venueId: string): Promise<SavedVenue | null> {
  await ensureUser();
  return check(
    await supabase.from('saved_venues').select('venue_id, status, note, updated_at').eq('venue_id', venueId).maybeSingle(),
  );
}

export async function saveVenue(venueId: string, patch: { status?: SavedStatus; note?: string | null } = {}): Promise<void> {
  const userId = await ensureUser();
  check(await supabase.from('saved_venues').upsert({ user_id: userId, venue_id: venueId, ...patch }, { onConflict: 'user_id,venue_id' }));
}

export async function unsaveVenue(venueId: string): Promise<void> {
  await ensureUser();
  check(await supabase.from('saved_venues').delete().eq('venue_id', venueId));
}

export async function getQuizzes(regionId?: number | null): Promise<QuizCard[]> {
  let q = supabase.from('quiz_cards').select('*');
  if (regionId != null) q = q.eq('region_id', regionId);
  return check(await q);
}

export async function getVenueQuizzes(venueId: string): Promise<QuizCard[]> {
  return check(await supabase.from('quiz_cards').select('*').eq('venue_id', venueId));
}
