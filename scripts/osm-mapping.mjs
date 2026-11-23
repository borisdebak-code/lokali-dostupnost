// Pretvaranje OpenStreetMap elemenata u retke za tablicu `venues`.
// Bez vanjskih ovisnosti, kako bi se moglo koristiti i u Supabase Edge funkciji.

export const AMENITY_CATEGORY = {
  restaurant: 'jelo',
  fast_food: 'jelo',
  food_court: 'jelo',
  ice_cream: 'jelo',
  cafe: 'pice',
  bar: 'pice',
  pub: 'pice',
  biergarten: 'pice',
  nightclub: 'pice',
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function overpassQuery(areaNames) {
  const amenities = Object.keys(AMENITY_CATEGORY).join('|');
  const areas = areaNames
    .map((n) => `area["name"="${n.replace(/"/g, '\\"')}"]["boundary"="administrative"];`)
    .join('\n  ');
  return `[out:json][timeout:300];
(
  ${areas}
)->.a;
(
  nwr["amenity"~"^(${amenities})$"]["name"](area.a);
  node["place"~"^(city|town|village|suburb|quarter|neighbourhood)$"]["name"](area.a);
);
out center tags;`;
}

function yesNo(value) {
  if (value == null) return null;
  const v = String(value).toLowerCase();
  if (['yes', 'designated', 'limited', 'only', 'required', 'recommended', 'true'].includes(v)) return true;
  if (['no', 'false'].includes(v)) return false;
  return null;
}

function firstNumber(...values) {
  for (const value of values) {
    if (value == null) continue;
    const m = String(value).match(/\d+/);
    if (m) {
      const n = parseInt(m[0], 10);
      if (n > 0 && n <= 3000) return n;
    }
  }
  return null;
}

function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase().replace(/\s+/g, '_'))
    .filter(Boolean);
}

// "May-Sep ..." ili "Apr 15-Oct 15 ..." -> { start: 5, end: 9 }
export function seasonFromOpeningHours(oh) {
  if (!oh) return null;
  const m = String(oh).match(/^\s*([A-Z][a-z]{2})(?:\s+\d{1,2})?\s*-\s*([A-Z][a-z]{2})(?:\s+\d{1,2})?\b/);
  if (!m) return null;
  const start = MONTHS[m[1].toLowerCase()];
  const end = MONTHS[m[2].toLowerCase()];
  if (!start || !end) return null;
  return { start, end };
}

function seasonality(tags) {
  const fromOh = seasonFromOpeningHours(tags.opening_hours);
  if (fromOh) return { seasonality: 'sezonski', season_start_month: fromOh.start, season_end_month: fromOh.end };
  const s = tags.seasonal?.toLowerCase();
  if (s === 'no') return { seasonality: 'cijela_godina' };
  if (s === 'summer') return { seasonality: 'sezonski', season_start_month: 6, season_end_month: 9 };
  if (s === 'winter') return { seasonality: 'sezonski', season_start_month: 12, season_end_month: 2 };
  if (s && s !== 'no') return { seasonality: 'sezonski' };
  return { seasonality: 'nepoznato' };
}

function cardPayment(tags) {
  const keys = ['payment:cards', 'payment:credit_cards', 'payment:debit_cards', 'payment:visa', 'payment:mastercard', 'payment:maestro'];
  const values = keys.map((k) => yesNo(tags[k])).filter((v) => v !== null);
  if (values.includes(true)) return true;
  if (values.length && values.every((v) => v === false)) return false;
  return null;
}

function derivedTags(tags, amenity, cuisine) {
  const out = new Set();
  if (amenity === 'ice_cream' || cuisine.includes('ice_cream') || cuisine.includes('cake')) out.add('slastice');
  if (amenity === 'fast_food') out.add('brza-hrana');
  if (amenity === 'nightclub') out.add('nocni-klub');
  if (amenity === 'pub' || amenity === 'biergarten' || tags.microbrewery === 'yes' || tags['drink:craft_beer'] === 'yes') out.add('pivo');
  if (tags.cocktails === 'yes' || tags['drink:cocktail'] === 'yes') out.add('kokteli');
  if (tags['drink:wine'] === 'yes' || cuisine.includes('wine')) out.add('vino');
  if (amenity === 'cafe' || cuisine.includes('coffee_shop')) out.add('kava');
  if (AMENITY_CATEGORY[amenity] === 'pice' && (yesNo(tags.food) || cuisine.some((c) => c !== 'coffee_shop'))) out.add('hrana');
  if (tags.breakfast === 'yes' || cuisine.includes('breakfast')) out.add('dorucak');
  if (yesNo(tags.delivery)) out.add('dostava');
  if (yesNo(tags.takeaway)) out.add('za-van');
  if (tags.sport || tags['screen'] === 'yes' || tags['television'] === 'yes') out.add('sport-tv');
  return [...out].sort();
}

function address(tags) {
  const street = tags['addr:street'] || tags['addr:place'];
  if (!street) return null;
  return [street, tags['addr:housenumber']].filter(Boolean).join(' ');
}

function coords(el) {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function nearest(point, places, maxKm) {
  let best = null;
  let bestD = Infinity;
  for (const p of places) {
    const d = distanceKm(point, p);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best && bestD <= maxKm ? best.name : null;
}

export function mapElements(elements) {
  const settlements = [];
  const districts = [];
  for (const el of elements) {
    const place = el.tags?.place;
    if (!place || !el.tags?.name) continue;
    const c = coords(el);
    if (!c) continue;
    const item = { ...c, name: el.tags.name };
    if (place === 'city' || place === 'town' || place === 'village') settlements.push(item);
    else districts.push(item);
  }

  const rows = [];
  for (const el of elements) {
    const tags = el.tags || {};
    const amenity = tags.amenity;
    const category = AMENITY_CATEGORY[amenity];
    if (!category || !tags.name) continue;
    const c = coords(el);
    if (!c) continue;

    const cuisine = splitList(tags.cuisine);
    const city = tags['addr:city'] || nearest(c, settlements, 6);
    const district = nearest(c, districts, 2);

    rows.push({
      osm_type: el.type,
      osm_id: el.id,
      name: tags.name.trim(),
      category,
      venue_type: amenity,
      cuisine,
      tags: derivedTags(tags, amenity, cuisine),
      lat: c.lat,
      lng: c.lng,
      address: address(tags),
      postcode: tags['addr:postcode'] || null,
      city,
      district: district && district !== city ? district : null,
      phone: tags.phone || tags['contact:phone'] || null,
      website: tags.website || tags['contact:website'] || null,
      email: tags.email || tags['contact:email'] || null,
      opening_hours: tags.opening_hours || null,
      ...seasonality(tags),
      capacity: firstNumber(tags.capacity, tags.seats, tags['capacity:persons']),
      outdoor_seating: yesNo(tags.outdoor_seating),
      takes_reservations: yesNo(tags.reservation),
      card_payment: cardPayment(tags),
      wheelchair: yesNo(tags.wheelchair),
      dogs_allowed: yesNo(tags.dog),
      kids_friendly: yesNo(tags.kids_area) || yesNo(tags.highchair) || null,
      has_wifi: tags.internet_access ? ['wlan', 'yes', 'wifi'].includes(tags.internet_access) : null,
      smoking_allowed: tags.smoking ? ['yes', 'separated', 'isolated', 'dedicated'].includes(tags.smoking) : null,
    });
  }
  return rows;
}
