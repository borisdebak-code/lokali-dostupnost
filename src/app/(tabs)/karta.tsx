import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '../../components/Chip';
import { VenueCard } from '../../components/VenueCard';
import { VenueMap, type MapViewState, type VenueMapHandle } from '../../components/VenueMap';
import { getRegions, searchVenues } from '../../lib/api';
import { regionZoom } from '../../lib/geo';
import { isOpenAt } from '../../lib/hours';
import { getMyLocation } from '../../lib/location';
import type { MapPoint } from '../../lib/mapHtml';
import { isConfigured } from '../../lib/supabase';
import { colors, radius } from '../../lib/theme';
import type { Category, Region, Venue } from '../../lib/types';

const START = { lat: 45.8131, lng: 15.9775, zoom: 13 };
const MIN_ZOOM_FOR_VENUES = 10;

export default function MapScreen() {
  const mapRef = useRef<VenueMapHandle>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [view, setView] = useState<MapViewState | null>(null);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [selected, setSelected] = useState<Venue | null>(null);
  const [loading, setLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [openNow, setOpenNow] = useState(false);
  const [terrace, setTerrace] = useState(false);

  useEffect(() => {
    if (isConfigured) getRegions().then(setRegions).catch(() => {});
  }, []);

  const tooWide = view != null && view.zoom < MIN_ZOOM_FOR_VENUES;

  useEffect(() => {
    if (!isConfigured || !view || tooWide) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        setVenues(
          await searchVenues({
            lat: view.lat,
            lng: view.lng,
            radiusM: view.radiusM,
            category,
            features: terrace ? ['terasa'] : [],
            limit: 500,
          }),
        );
      } catch {
        // karta ostaje s prethodnim rezultatima
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [view, category, terrace, tooWide]);

  const shown = useMemo(() => {
    if (tooWide) return [];
    if (!openNow) return venues;
    const now = new Date();
    return venues.filter((v) => isOpenAt(v, now) === true);
  }, [venues, openNow, tooWide]);

  const points = useMemo<MapPoint[]>(
    () => shown.map((v) => ({ id: v.id, lat: v.lat, lng: v.lng, category: v.category })),
    [shown],
  );

  const goToMe = async () => {
    const c = await getMyLocation();
    if (c) {
      mapRef.current?.setMe(c.lat, c.lng);
      mapRef.current?.flyTo(c.lat, c.lng, 15);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <VenueMap
        ref={mapRef}
        initial={START}
        points={points}
        selectedId={selected?.id ?? null}
        onMove={setView}
        onSelect={(id) => setSelected(shown.find((v) => v.id === id) ?? null)}
        onDeselect={() => setSelected(null)}
        onError={setMapError}
      />

      <View style={styles.top} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {regions.map((r) => (
            <Chip key={r.id} label={r.name} onPress={() => mapRef.current?.flyTo(r.center_lat, r.center_lng, regionZoom(r))} />
          ))}
          <Chip label="📍 Ja" onPress={goToMe} />
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Sve" selected={category == null} onPress={() => setCategory(null)} />
          <Chip label="🍽 Jelo" selected={category === 'jelo'} color={colors.jelo} onPress={() => setCategory('jelo')} />
          <Chip label="🍺 Piće" selected={category === 'pice'} color={colors.pice} onPress={() => setCategory('pice')} />
          <Chip label="Otvoreno sad" selected={openNow} onPress={() => setOpenNow((x) => !x)} />
          <Chip label="Terasa" selected={terrace} onPress={() => setTerrace((x) => !x)} />
        </ScrollView>
      </View>

      {selected ? (
        <View style={styles.bottom}>
          <VenueCard venue={selected} open={isOpenAt(selected, new Date())} />
          <Pressable onPress={() => setSelected(null)} style={styles.close} hitSlop={10}>
            <Text style={styles.closeText}>Zatvori</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.status} pointerEvents="none">
          {loading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.statusText}>
              {mapError ?? (!isConfigured ? 'Baza nije spojena' : tooWide ? 'Približi kartu za prikaz lokala' : `${shown.length} lokala`)}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 10, left: 0, right: 0, gap: 8 },
  chips: { gap: 8, paddingHorizontal: 12 },
  status: {
    position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: colors.card,
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border,
  },
  statusText: { color: colors.text, fontWeight: '600' },
  bottom: { position: 'absolute', left: 12, right: 12, bottom: 16, gap: 6 },
  close: { alignSelf: 'center', backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 6 },
  closeText: { color: colors.muted, fontWeight: '600' },
});
