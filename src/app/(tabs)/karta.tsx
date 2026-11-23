import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Callout, Marker, type Region as MapRegion } from 'react-native-maps';
import { Chip } from '../../components/Chip';
import { getRegions, searchVenues } from '../../lib/api';
import { isOpenAt } from '../../lib/hours';
import { venueSubtitle } from '../../lib/labels';
import { getMyLocation } from '../../lib/location';
import { isConfigured } from '../../lib/supabase';
import { colors, radius } from '../../lib/theme';
import type { Category, Region, Venue } from '../../lib/types';

const ZAGREB: MapRegion = { latitude: 45.8131, longitude: 15.9775, latitudeDelta: 0.06, longitudeDelta: 0.06 };

function toMapRegion(r: Region): MapRegion {
  const delta = Math.min(1.2, (r.radius_m / 111000) * 1.2);
  return { latitude: r.center_lat, longitude: r.center_lng, latitudeDelta: delta, longitudeDelta: delta };
}

export default function MapScreen() {
  const mapRef = useRef<MapView>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [view, setView] = useState<MapRegion>(ZAGREB);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<Category | null>(null);
  const [openNow, setOpenNow] = useState(false);
  const [terrace, setTerrace] = useState(false);

  useEffect(() => {
    if (isConfigured) getRegions().then(setRegions).catch(() => {});
  }, []);

  // Ne učitavamo cijelu državu odjednom — treba približiti kartu
  const tooWide = view.latitudeDelta > 0.8;

  useEffect(() => {
    if (!isConfigured || tooWide) return;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const radiusM = Math.round((Math.max(view.latitudeDelta, view.longitudeDelta) * 111000) / 2);
        setVenues(
          await searchVenues({
            lat: view.latitude,
            lng: view.longitude,
            radiusM,
            category,
            features: terrace ? ['terasa'] : [],
            limit: 400,
          }),
        );
      } catch {
        // karta ostaje s prethodnim rezultatima
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [view, category, terrace, tooWide]);

  const shown = useMemo(() => {
    if (tooWide) return [];
    if (!openNow) return venues;
    const now = new Date();
    return venues.filter((v) => isOpenAt(v, now) === true);
  }, [venues, openNow, tooWide]);

  const goTo = (r: MapRegion) => mapRef.current?.animateToRegion(r, 500);

  const goToMe = async () => {
    const c = await getMyLocation();
    if (c) goTo({ latitude: c.lat, longitude: c.lng, latitudeDelta: 0.03, longitudeDelta: 0.03 });
  };

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={ZAGREB}
        onRegionChangeComplete={setView}
        showsUserLocation
        toolbarEnabled={false}
      >
        {shown.map((v) => (
          <Marker
            key={v.id}
            coordinate={{ latitude: v.lat, longitude: v.lng }}
            pinColor={v.category === 'jelo' ? colors.jelo : colors.pice}
            tracksViewChanges={false}
          >
            <Callout onPress={() => router.push({ pathname: '/lokal/[id]', params: { id: v.id } })}>
              <View style={styles.callout}>
                <Text style={styles.calloutTitle}>{v.name}</Text>
                <Text style={styles.calloutMeta}>{venueSubtitle(v)}</Text>
                <Text style={styles.calloutMeta}>
                  {v.capacity_total != null ? `${v.capacity_total} mjesta` : 'Kapacitet nepoznat'} · Detalji ›
                </Text>
              </View>
            </Callout>
          </Marker>
        ))}
      </MapView>

      <View style={styles.top} pointerEvents="box-none">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {regions.map((r) => (
            <Chip key={r.id} label={r.name} onPress={() => goTo(toMapRegion(r))} />
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

      <View style={styles.status} pointerEvents="none">
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Text style={styles.statusText}>
            {!isConfigured ? 'Baza nije spojena' : tooWide ? 'Približi kartu za prikaz lokala' : `${shown.length} lokala`}
          </Text>
        )}
      </View>
      <Text style={styles.attribution}>© OpenStreetMap suradnici</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 10, left: 0, right: 0, gap: 8 },
  chips: { gap: 8, paddingHorizontal: 12 },
  callout: { maxWidth: 240, padding: 4, gap: 2 },
  calloutTitle: { fontWeight: '700', fontSize: 15, color: colors.text },
  calloutMeta: { fontSize: 13, color: colors.muted },
  status: {
    position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: colors.card,
    borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.border,
  },
  statusText: { color: colors.text, fontWeight: '600' },
  attribution: { position: 'absolute', bottom: 4, right: 8, fontSize: 10, color: colors.muted },
});
