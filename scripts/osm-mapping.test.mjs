import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mapElements, overpassQuery, seasonFromOpeningHours } from '../supabase/functions/import-osm/osm-mapping.mjs';

// Izmišljeni elementi u OSM formatu
const elements = [
  { type: 'node', id: 10, lat: 45.05, lon: 18.70, tags: { place: 'town', name: 'Testgrad' } },
  { type: 'node', id: 11, lat: 45.06, lon: 18.71, tags: { place: 'suburb', name: 'Testkvart' } },
  { type: 'node', id: 1, lat: 45.051, lon: 18.701, tags: {
      amenity: 'restaurant', name: ' Test restoran ', cuisine: 'regional;pizza', capacity: '120',
      outdoor_seating: 'yes', 'payment:cards': 'yes', reservation: 'recommended', 'addr:street': 'Glavna', 'addr:housenumber': '5',
      opening_hours: 'May-Sep: Mo-Su 10:00-23:00' } },
  { type: 'way', id: 2, center: { lat: 45.061, lon: 18.711 }, tags: {
      amenity: 'pub', name: 'Test pub', food: 'yes', smoking: 'outside', seasonal: 'no', internet_access: 'wlan' } },
  { type: 'node', id: 3, lat: 45.0, lon: 18.0, tags: { amenity: 'cafe' } },             // bez imena
  { type: 'node', id: 4, lat: 45.0, lon: 18.0, tags: { amenity: 'pharmacy', name: 'x' } }, // nije ugostiteljstvo
  { type: 'node', id: 5, lat: 46.5, lon: 19.5, tags: { amenity: 'ice_cream', name: 'Daleka slastičarna', 'addr:city': 'Negdje' } },
];

test('mapira samo imenovane ugostiteljske objekte', () => {
  const rows = mapElements(elements);
  assert.deepEqual(rows.map((r) => r.osm_id), [1, 2, 5]);
});

test('restoran: kategorija, kapacitet, sezona, adresa, grad', () => {
  const r = mapElements(elements).find((x) => x.osm_id === 1);
  assert.equal(r.name, 'Test restoran');
  assert.equal(r.category, 'jelo');
  assert.equal(r.capacity, 120);
  assert.deepEqual(r.cuisine, ['regional', 'pizza']);
  assert.equal(r.seasonality, 'sezonski');
  assert.equal(r.season_start_month, 5);
  assert.equal(r.season_end_month, 9);
  assert.equal(r.address, 'Glavna 5');
  assert.equal(r.city, 'Testgrad');
  assert.equal(r.outdoor_seating, true);
  assert.equal(r.card_payment, true);
  assert.equal(r.takes_reservations, true);
});

test('pub (way s centrom): piće + oznaka hrana, nepušački, kvart', () => {
  const r = mapElements(elements).find((x) => x.osm_id === 2);
  assert.equal(r.osm_type, 'way');
  assert.equal(r.category, 'pice');
  assert.ok(r.tags.includes('hrana'));
  assert.ok(r.tags.includes('pivo'));
  assert.equal(r.smoking_allowed, false);
  assert.equal(r.has_wifi, true);
  assert.equal(r.seasonality, 'cijela_godina');
  assert.equal(r.district, 'Testkvart');
  assert.equal(r.capacity, null);
});

test('addr:city ima prednost, daleko od naselja nema kvarta', () => {
  const r = mapElements(elements).find((x) => x.osm_id === 5);
  assert.equal(r.city, 'Negdje');
  assert.equal(r.district, null);
  assert.ok(r.tags.includes('slastice'));
});

test('grad ima prednost pred bližim središtem sela', () => {
  const els = [
    { type: 'node', id: 20, lat: 45.5550, lon: 18.6950, tags: { place: 'city', name: 'Grad' } },
    { type: 'node', id: 21, lat: 45.5700, lon: 18.7200, tags: { place: 'village', name: 'Selo' } },
    { type: 'node', id: 22, lat: 45.5650, lon: 18.7100, tags: { amenity: 'cafe', name: 'Na rubu grada' } },
    { type: 'node', id: 23, lat: 45.5702, lon: 18.7203, tags: { amenity: 'pub', name: 'U selu' } },
  ];
  const rows = mapElements(els);
  assert.equal(rows.find((r) => r.osm_id === 22).city, 'Grad');
  assert.equal(rows.find((r) => r.osm_id === 23).city, 'Selo');
});

test('sezona iz radnog vremena', () => {
  assert.deepEqual(seasonFromOpeningHours('Apr 15-Oct 15: 08:00-22:00'), { start: 4, end: 10 });
  assert.equal(seasonFromOpeningHours('Mo-Fr 08:00-16:00'), null);
});

test('overpass upit sadrži sva područja', () => {
  const q = overpassQuery(['Osječko-baranjska županija', 'Vukovarsko-srijemska županija']);
  assert.match(q, /Osječko-baranjska/);
  assert.match(q, /Vukovarsko-srijemska/);
  assert.match(q, /restaurant\|fast_food/);
});
