import type { CapacitySource, Feature, SavedStatus, Venue } from './types';

export const VENUE_TYPE: Record<string, string> = {
  restaurant: 'Restoran',
  fast_food: 'Brza hrana',
  food_court: 'Food court',
  ice_cream: 'Slastičarna',
  cafe: 'Kafić',
  bar: 'Bar',
  pub: 'Pub',
  biergarten: 'Pivnica',
  nightclub: 'Noćni klub',
};

export const CATEGORY = { jelo: 'Jelo', pice: 'Piće' } as const;

export const FEATURE_LABEL: Record<Feature, string> = {
  terasa: 'Terasa',
  separe: 'Separe / zasebna sala',
  projektor: 'Projektor / TV',
  ozvucenje: 'Ozvučenje',
  eventi: 'Organizira evente',
  rezervacije: 'Rezervacije',
  kartice: 'Kartice',
  wifi: 'Wi‑Fi',
  pristupacno: 'Pristupačno',
  psi: 'Psi dobrodošli',
  djeca: 'Za djecu',
  parking: 'Parking',
  nepusacki: 'Nepušački',
};

export const GROUP_FEATURES: Feature[] = ['separe', 'projektor', 'ozvucenje', 'terasa', 'rezervacije', 'eventi'];
export const PRACTICAL_FEATURES: Feature[] = ['terasa', 'kartice', 'wifi', 'pristupacno', 'psi', 'djeca', 'parking', 'nepusacki'];

export function featureValue(v: Venue, f: Feature): boolean | null {
  switch (f) {
    case 'terasa': return v.outdoor_seating;
    case 'separe': return v.has_private_room;
    case 'projektor': return v.has_projector_tv;
    case 'ozvucenje': return v.has_sound_system;
    case 'eventi': return v.hosts_events;
    case 'rezervacije': return v.takes_reservations;
    case 'kartice': return v.card_payment;
    case 'wifi': return v.has_wifi;
    case 'pristupacno': return v.wheelchair;
    case 'psi': return v.dogs_allowed;
    case 'djeca': return v.kids_friendly;
    case 'parking': return v.has_parking;
    case 'nepusacki': return v.smoking_allowed === null ? null : !v.smoking_allowed;
  }
}

export const CAPACITY_SOURCE: Record<CapacitySource, string> = {
  vlasnik: 'potvrdio vlasnik',
  korisnici: 'procjena korisnika',
  osm: 'OpenStreetMap',
};

export const SAVED_STATUS: Record<SavedStatus, string> = {
  ideja: 'Ideja',
  kontaktirano: 'Kontaktirano',
  dogovoreno: 'Dogovoreno',
  odbijeno: 'Odbijeno',
};

export const MONTHS = ['siječanj', 'veljača', 'ožujak', 'travanj', 'svibanj', 'lipanj', 'srpanj', 'kolovoz', 'rujan', 'listopad', 'studeni', 'prosinac'];
export const DAYS_SHORT = ['Pon', 'Uto', 'Sri', 'Čet', 'Pet', 'Sub', 'Ned'];
export const DAYS_LONG = ['ponedjeljak', 'utorak', 'srijeda', 'četvrtak', 'petak', 'subota', 'nedjelja'];

export function crowdLabel(level: number | null): string {
  if (level == null) return 'Nema podataka';
  if (level < 1.67) return 'Ima mjesta';
  if (level < 2.34) return 'Srednje';
  return 'Gužva';
}

export function venueSubtitle(v: Venue): string {
  return [VENUE_TYPE[v.venue_type] ?? v.venue_type, v.district ?? v.city].filter(Boolean).join(' · ');
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function formatDateTime(d: Date): string {
  const day = DAYS_LONG[(d.getDay() + 6) % 7];
  return `${day}, ${d.getDate()}.${d.getMonth() + 1}. u ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
