import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Chip } from '../../components/Chip';
import { Notice } from '../../components/Section';
import { VenueCard } from '../../components/VenueCard';
import { getRegions, searchVenues } from '../../lib/api';
import { distanceM } from '../../lib/geo';
import { isOpenAt } from '../../lib/hours';
import { FEATURE_LABEL, PRACTICAL_FEATURES } from '../../lib/labels';
import { getMyLocation, type Coords } from '../../lib/location';
import { isConfigured } from '../../lib/supabase';
import { colors, radius } from '../../lib/theme';
import type { Category, Feature, Region, Venue } from '../../lib/types';

type Origin = { kind: 'near'; coords: Coords } | { kind: 'region'; region: Region };

export default function ListScreen() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [openNow, setOpenNow] = useState(false);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConfigured) return;
    (async () => {
      const r = await getRegions().catch(() => [] as Region[]);
      setRegions(r);
      const me = await getMyLocation().catch(() => null);
      if (me) setOrigin({ kind: 'near', coords: me });
      else if (r[0]) setOrigin({ kind: 'region', region: r[0] });
    })();
  }, []);

  const load = useCallback(async () => {
    if (!origin) return;
    setLoading(true);
    setError(null);
    try {
      setVenues(
        await searchVenues({
          ...(origin.kind === 'near'
            ? { lat: origin.coords.lat, lng: origin.coords.lng, radiusM: 3000 }
            : { lat: origin.region.center_lat, lng: origin.region.center_lng, radiusM: origin.region.radius_m, regionId: origin.region.id }),
          category,
          features,
          query,
          limit: 300,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [origin, category, features, query]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const rows = useMemo(() => {
    const now = new Date();
    const center = origin?.kind === 'near' ? origin.coords : origin ? { lat: origin.region.center_lat, lng: origin.region.center_lng } : null;
    return venues
      .map((v) => ({ v, open: isOpenAt(v, now), d: center ? distanceM(center, v) : null }))
      .filter((r) => !openNow || r.open === true);
  }, [venues, openNow, origin]);

  const toggle = (f: Feature) => setFeatures((c) => (c.includes(f) ? c.filter((x) => x !== f) : [...c, f]));

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.v.id}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      renderItem={({ item }) => <VenueCard venue={item.v} open={item.open} distanceM={item.d} />}
      ListHeaderComponent={
        <View style={styles.header}>
          {!isConfigured && <Notice tone="error" text="Baza nije spojena (vidi README)." />}
          <TextInput
            style={styles.search}
            placeholder="Traži po nazivu…"
            placeholderTextColor={colors.muted}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip
              label="📍 U blizini"
              selected={origin?.kind === 'near'}
              onPress={async () => {
                const me = await getMyLocation();
                if (me) setOrigin({ kind: 'near', coords: me });
              }}
            />
            {regions.map((r) => (
              <Chip
                key={r.id}
                label={r.name}
                selected={origin?.kind === 'region' && origin.region.id === r.id}
                onPress={() => setOrigin({ kind: 'region', region: r })}
              />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="Sve" selected={category == null} onPress={() => setCategory(null)} />
            <Chip label="🍽 Jelo" selected={category === 'jelo'} color={colors.jelo} onPress={() => setCategory('jelo')} />
            <Chip label="🍺 Piće" selected={category === 'pice'} color={colors.pice} onPress={() => setCategory('pice')} />
            <Chip label="Otvoreno sad" selected={openNow} onPress={() => setOpenNow((x) => !x)} />
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {PRACTICAL_FEATURES.map((f) => (
              <Chip key={f} label={FEATURE_LABEL[f]} selected={features.includes(f)} onPress={() => toggle(f)} />
            ))}
          </ScrollView>
          {error && <Notice tone="error" text={error} />}
          {loading && <ActivityIndicator color={colors.primary} />}
          {!loading && origin && <Text style={styles.count}>{rows.length} lokala</Text>}
        </View>
      }
      ListFooterComponent={<Text style={styles.attribution}>Podaci o lokalima: © OpenStreetMap suradnici</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  header: { gap: 10, marginBottom: 12 },
  search: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text,
  },
  chips: { gap: 8 },
  count: { color: colors.muted, fontSize: 13 },
  attribution: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 24 },
});
