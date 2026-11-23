// HTML stranica s MapLibre kartom koja se prikazuje u WebViewu.
// Podloga: OpenFreeMap (besplatno, bez API ključa), podaci © OpenStreetMap.
// Komunikacija: RN -> karta preko window.* funkcija (injectJavaScript),
// karta -> RN preko window.ReactNativeWebView.postMessage(JSON).

export const MAPLIBRE_VERSION = '5.24.0';
export const DEFAULT_STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export type MapMessage =
  | { type: 'ready' }
  | { type: 'move'; lat: number; lng: number; radiusM: number; zoom: number }
  | { type: 'select'; id: string }
  | { type: 'deselect' }
  | { type: 'error'; message: string };

export type MapPoint = { id: string; lat: number; lng: number; category: 'jelo' | 'pice' };

type Options = {
  lat: number;
  lng: number;
  zoom: number;
  colors: { jelo: string; pice: string; me: string };
  style?: string;
  scriptUrl?: string;
  cssUrl?: string;
};

export function buildMapHtml(o: Options): string {
  const script = o.scriptUrl ?? `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
  const css = o.cssUrl ?? `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
  const cfg = JSON.stringify({ ...o, style: o.style ?? DEFAULT_STYLE });
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="${css}">
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;background:#f2efe9}</style>
</head>
<body>
<div id="map"></div>
<script src="${script}"></script>
<script>
(function () {
  var cfg = ${cfg};
  function post(m) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m));
    else if (window.__onMapMessage) window.__onMapMessage(m);
  }
  if (typeof maplibregl === 'undefined') {
    post({ type: 'error', message: 'Karta se nije učitala (provjeri internet).' });
    return;
  }
  var map = new maplibregl.Map({
    container: 'map',
    style: cfg.style,
    center: [cfg.lng, cfg.lat],
    zoom: cfg.zoom,
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false
  });
  map.touchZoomRotate.disableRotation();

  var loaded = false;
  var pending = [];
  function whenLoaded(fn) { if (loaded) fn(); else pending.push(fn); }

  function emitMove() {
    var c = map.getCenter();
    var ne = map.getBounds().getNorthEast();
    post({ type: 'move', lat: c.lat, lng: c.lng, radiusM: Math.round(c.distanceTo(ne)), zoom: map.getZoom() });
  }

  map.on('load', function () {
    map.addSource('venues', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'venues', type: 'circle', source: 'venues',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 13, 6, 17, 10],
        'circle-color': ['match', ['get', 'category'], 'jelo', cfg.colors.jelo, cfg.colors.pice],
        'circle-stroke-width': ['case', ['boolean', ['get', 'selected'], false], 4, 1.5],
        'circle-stroke-color': '#ffffff'
      }
    });
    map.addSource('me', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'me', type: 'circle', source: 'me',
      paint: { 'circle-radius': 7, 'circle-color': cfg.colors.me, 'circle-stroke-width': 3, 'circle-stroke-color': '#ffffff' }
    });
    loaded = true;
    pending.splice(0).forEach(function (fn) { fn(); });
    post({ type: 'ready' });
    emitMove();
  });
  map.on('moveend', emitMove);
  map.on('error', function (e) {
    post({ type: 'error', message: String((e && e.error && e.error.message) || 'Greška karte') });
  });

  // Lakše pogađanje malih točaka prstom: traži u kvadratu oko dodira
  map.on('click', function (e) {
    var p = e.point, r = 14;
    var hits = map.queryRenderedFeatures([[p.x - r, p.y - r], [p.x + r, p.y + r]], { layers: ['venues'] });
    if (hits.length) post({ type: 'select', id: String(hits[0].properties.id) });
    else post({ type: 'deselect' });
  });

  var points = [];
  var selectedId = null;
  function render() {
    whenLoaded(function () {
      map.getSource('venues').setData({
        type: 'FeatureCollection',
        features: points.map(function (v) {
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [v.lng, v.lat] },
            properties: { id: v.id, category: v.category, selected: v.id === selectedId }
          };
        })
      });
    });
  }

  window.setVenues = function (list) { points = list || []; render(); };
  window.setSelected = function (id) { selectedId = id; render(); };
  window.flyTo = function (lat, lng, zoom) { map.flyTo({ center: [lng, lat], zoom: zoom, duration: 600 }); };
  window.setMe = function (lat, lng) {
    whenLoaded(function () {
      map.getSource('me').setData({ type: 'FeatureCollection', features: [
        { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] }, properties: {} }
      ] });
    });
  };
})();
</script>
</body>
</html>`;
}
