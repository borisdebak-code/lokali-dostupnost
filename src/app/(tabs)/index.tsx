import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, SectionList, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Chip } from '../../components/Chip';
import { DateTimeField } from '../../components/DateTimeField';
import { Notice, Section } from '../../components/Section';
import { VenueCard } from '../../components/VenueCard';
import { getRegionCities, getRegions, getTypicalCrowd, searchVenues } from '../../lib/api';
import { distanceM } from '../../lib/geo';
import { isInSeason, isOpenAt } from '../../lib/hours';
import { FEATURE_LABEL, formatDateTime, GROUP_FEATURES } from '../../lib/labels';
import { getMyLocation, type Coords } from '../../lib/location';
import { isConfigured } from '../../lib/supabase';
import { colors, radius } from '../../lib/theme';
import type { Category, Feature, Region, RegionCity, Venue } from '../../lib/types';

type Where = { kind: 'region'; region: Region; city: string | null } | { kind: 'near'; coords: Coords };

type Result = {
  venue: Venue;
  open: boolean | null;
  typical: number | null;
  distance: number | null;
};

function defaultWhen(): Date {
  const d = new Date();
  d.setHours(20, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

export default function GroupSearch() {
  const [regions, setRegions] = useState<Region[]>([]);
  const [citiesFor, setCitiesFor] = useState<{ regionId: number; list: RegionCity[] } | null>(null);
  const [where, setWhere] = useState<Where | null>(null);
  const [people, setPeople] = useState(20);
  const [when, setWhen] = useState(defaultWhen);
  const [category, setCategory] = useState<Category | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [excluded, setExcluded] = useState(0);

  useEffect(() => {
    if (!isConfigured) return;
    getRegions()
      .then((r) => {
        setRegions(r);
        if (r[0]) setWhere({ kind: 'region', region: r[0], city: null });
      })
      .catch((e) => setError(e.message));
  }, []);

  const regionId = where?.kind === 'region' ? where.region.id : null;
  useEffect(() => {
    if (regionId == null) return;
    getRegionCities(regionId)
      .then((list) => setCitiesFor({ regionId, list }))
      .catch(() => setCitiesFor({ regionId, list: [] }));
  }, [regionId]);
  const cities = citiesFor && citiesFor.regionId === regionId ? citiesFor.list : [];

  const toggleFeature = (f: Feature) =>
    setFeatures((cur) => (cur.includes(f) ? cur.filter((x) => x !== f) : [...cur, f]));

  const useMyLocation = async () => {
    const coords = await getMyLocation();
    if (coords) setWhere({ kind: 'near', coords });
    else setError('Bez dopuštenja za lokaciju — odaberi regiju.');
  };

  const search = async () => {
    if (!where) return;
    setLoading(true);
    setError(null);
    try {
      const venues = await searchVenues({
        ...(where.kind === 'near'
          ? { lat: where.coords.lat, lng: where.coords.lng, radiusM: 5000 }
          : { regionId: where.region.id, city: where.city }),
        category,
        minCapacity: people,
        includeUnknownCapacity: true,
        features,
        limit: 300,
      });
      const typical = await getTypicalCrowd(venues.map((v) => v.id), when).catch(() => []);
      const typicalById = new Map(typical.map((t) => [t.venue_id, t.level]));
      let out = 0;
      const rows: Result[] = [];
      for (const v of venues) {
        const open = isOpenAt(v, when);
        const season = isInSeason(v, when);
        if (open === false || season === false) {
          out++;
          continue;
        }
        rows.push({
          venue: v,
          open,
          typical: typicalById.get(v.id) ?? null,
          distance: where.kind === 'near' ? distanceM(where.coords, v) : null,
        });
      }
      // Prvo poznato otvoreni, zatim manja tipična gužva, pa kapacitet najbliži traženom
      rows.sort((a, b) => {
        const o = (x: Result) => (x.open === true ? 0 : 1);
        if (o(a) !== o(b)) return o(a) - o(b);
        const t = (x: Result) => x.typical ?? 2;
        if (t(a) !== t(b)) return t(a) - t(b);
        if (a.distance != null && b.distance != null) return a.distance - b.distance;
        return (a.venue.capacity_total ?? 0) - (b.venue.capacity_total ?? 0);
      });
      setResults(rows);
      setExcluded(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const sections = useMemo(() => {
    if (!results) return [];
    const known = results.filter((r) => r.venue.capacity_total != null);
    const unknown = results.filter((r) => r.venue.capacity_total == null);
    return [
      { title: `Ima mjesta za ${people}+ (${known.length})`, data: known },
      { title: `Kapacitet još nepoznat — provjeri (${unknown.length})`, data: unknown },
    ].filter((s) => s.data.length > 0);
  }, [results, people]);

  const form = (
    <View style={styles.form}>
      {!isConfigured && (
        <Notice tone="error" text="Aplikacija nije spojena na bazu. Upiši EXPO_PUBLIC_SUPABASE_URL i EXPO_PUBLIC_SUPABASE_ANON_KEY u .env (vidi README)." />
      )}

      <Section title="Gdje">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {regions.map((r) => (
            <Chip
              key={r.id}
              label={r.name}
              selected={where?.kind === 'region' && where.region.id === r.id}
              onPress={() => setWhere({ kind: 'region', region: r, city: null })}
            />
          ))}
          <Chip label="📍 U blizini" selected={where?.kind === 'near'} onPress={useMyLocation} />
        </ScrollView>
        {where?.kind === 'region' && cities.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label="Sva mjesta" selected={where.city == null} onPress={() => setWhere({ ...where, city: null })} />
            {cities.slice(0, 30).map((c) => (
              <Chip
                key={c.city}
                label={`${c.city} (${c.venues})`}
                selected={where.city === c.city}
                onPress={() => setWhere({ ...where, city: c.city })}
              />
            ))}
          </ScrollView>
        )}
      </Section>

      <Section title="Koliko ljudi">
        <View style={styles.stepperRow}>
          <Pressable style={styles.stepBtn} onPress={() => setPeople((p) => Math.max(2, p - 5))}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <TextInput
            style={styles.peopleInput}
            keyboardType="number-pad"
            value={String(people)}
            onChangeText={(t) => setPeople(Math.min(1000, Math.max(0, parseInt(t || '0', 10) || 0)))}
          />
          <Pressable style={styles.stepBtn} onPress={() => setPeople((p) => Math.min(1000, p + 5))}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
          <Text style={styles.muted}>osoba</Text>
        </View>
        <View style={styles.chips}>
          {[10, 20, 30, 50, 80].map((n) => (
            <Chip key={n} label={`${n}`} selected={people === n} onPress={() => setPeople(n)} />
          ))}
        </View>
      </Section>

      <Section title="Kada">
        <DateTimeField value={when} onChange={setWhen} />
        {Platform.OS === 'ios' && <Text style={styles.muted}>{formatDateTime(when)}</Text>}
      </Section>

      <Section title="Što treba">
        <View style={styles.chips}>
          <Chip label="Svejedno" selected={category == null} onPress={() => setCategory(null)} />
          <Chip label="🍽 Jelo" selected={category === 'jelo'} color={colors.jelo} onPress={() => setCategory('jelo')} />
          <Chip label="🍺 Piće" selected={category === 'pice'} color={colors.pice} onPress={() => setCategory('pice')} />
        </View>
        <View style={styles.chips}>
          {GROUP_FEATURES.map((f) => (
            <Chip key={f} label={FEATURE_LABEL[f]} selected={features.includes(f)} onPress={() => toggleFeature(f)} />
          ))}
        </View>
      </Section>

      <Pressable
        style={({ pressed }) => [styles.cta, (!where || loading) && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}
        disabled={!where || loading}
        onPress={search}
      >
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaText}>Pronađi lokale</Text>}
      </Pressable>

      {error && <Notice tone="error" text={error} />}
      {results && results.length === 0 && (
        <Notice text="Ništa ne odgovara. Probaj manje filtera, drugo mjesto ili termin." />
      )}
      {results && excluded > 0 && (
        <Text style={styles.muted}>Skriveno {excluded} lokala koji su u tom terminu zatvoreni ili izvan sezone.</Text>
      )}
    </View>
  );

  return (
    <SectionList
      sections={sections}
      keyExtractor={(r) => r.venue.id}
      ListHeaderComponent={form}
      contentContainerStyle={styles.list}
      keyboardShouldPersistTaps="handled"
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      renderItem={({ item }) => (
        <VenueCard venue={item.venue} open={item.open} typicalCrowd={item.typical} distanceM={item.distance} />
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListFooterComponent={<Text style={styles.attribution}>Podaci o lokalima: © OpenStreetMap suradnici</Text>}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  form: { gap: 12, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
  },
  stepText: { fontSize: 22, color: colors.text },
  peopleInput: {
    minWidth: 70, fontSize: 28, fontWeight: '700', textAlign: 'center', color: colors.text,
    borderBottomWidth: 2, borderColor: colors.primary, paddingVertical: 2,
  },
  muted: { color: colors.muted, fontSize: 14 },
  cta: {
    backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 16, alignItems: 'center',
  },
  ctaText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 18, marginBottom: 10 },
  attribution: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 24 },
});
