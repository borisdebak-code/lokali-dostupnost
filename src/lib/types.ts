export type Category = 'jelo' | 'pice';
export type CapacitySource = 'vlasnik' | 'korisnici' | 'osm';
export type Seasonality = 'cijela_godina' | 'sezonski' | 'nepoznato';
export type SavedStatus = 'ideja' | 'kontaktirano' | 'dogovoreno' | 'odbijeno';

export type Region = {
  id: number;
  slug: string;
  name: string;
  center_lat: number;
  center_lng: number;
  radius_m: number;
};

export type Venue = {
  id: string;
  region_id: number;
  name: string;
  category: Category;
  venue_type: string;
  cuisine: string[];
  tags: string[];
  lat: number;
  lng: number;
  address: string | null;
  postcode: string | null;
  city: string | null;
  district: string | null;
  phone: string | null;
  website: string | null;
  email: string | null;
  opening_hours: string | null;
  seasonality: Seasonality;
  season_start_month: number | null;
  season_end_month: number | null;
  capacity_indoor: number | null;
  capacity_outdoor: number | null;
  capacity_total: number | null;
  capacity_source: CapacitySource | null;
  capacity_reports_count: number;
  outdoor_seating: boolean | null;
  takes_reservations: boolean | null;
  card_payment: boolean | null;
  wheelchair: boolean | null;
  dogs_allowed: boolean | null;
  kids_friendly: boolean | null;
  has_parking: boolean | null;
  has_wifi: boolean | null;
  smoking_allowed: boolean | null;
  has_private_room: boolean | null;
  has_projector_tv: boolean | null;
  has_sound_system: boolean | null;
  hosts_events: boolean | null;
  google_place_id: string | null;
  owner_verified_at: string | null;
  crowd_now: number | null;
  crowd_now_reports: number;
};

export type Feature =
  | 'terasa' | 'separe' | 'projektor' | 'ozvucenje' | 'eventi' | 'rezervacije'
  | 'kartice' | 'wifi' | 'pristupacno' | 'psi' | 'djeca' | 'parking' | 'nepusacki';

export type SearchParams = {
  lat?: number;
  lng?: number;
  radiusM?: number;
  regionId?: number;
  city?: string | null;
  category?: Category | null;
  minCapacity?: number | null;
  includeUnknownCapacity?: boolean;
  features?: Feature[];
  query?: string | null;
  limit?: number;
};

export type Busyness = { isodow: number; hour: number; level: number; reports: number };
export type TypicalCrowd = { venue_id: string; level: number; reports: number };
export type RegionCity = { city: string; venues: number; lat: number; lng: number };
export type SavedVenue = { venue_id: string; status: SavedStatus; note: string | null; updated_at: string };

export type QuizFrequency = 'tjedno' | 'svaki_drugi_tjedan' | 'mjesecno' | 'povremeno';

export type QuizCard = {
  id: number;
  title: string;
  weekday: number | null; // 1 = ponedjeljak
  start_time: string | null; // "20:00:00"
  frequency: QuizFrequency;
  next_date: string | null; // "2026-12-03"
  team_size_max: number | null;
  entry_fee_eur: number | null;
  signup_url: string | null;
  notes: string | null;
  organizer_id: number | null;
  organizer_name: string | null;
  organizer_website: string | null;
  organizer_instagram: string | null;
  venue_id: string;
  venue_name: string;
  category: Category;
  venue_type: string;
  region_id: number;
  city: string | null;
  district: string | null;
  address: string | null;
  lat: number;
  lng: number;
  capacity_total: number | null;
  phone: string | null;
};
