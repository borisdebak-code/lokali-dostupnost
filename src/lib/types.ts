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
