import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { Chip } from '../../components/Chip';
import { Notice } from '../../components/Section';
import { VenueMap, type VenueMapHandle } from '../../components/VenueMap';
import { getQuizzes, getRegions } from '../../lib/api';
import { regionZoom } from '../../lib/geo';
import { DAYS_SHORT, VENUE_TYPE } from '../../lib/labels';
import type { MapPoint } from '../../lib/mapHtml';
import { dayHeading, FREQUENCY_LABEL, formatTime, nextOccurrence } from '../../lib/quiz';
import { isConfigured } from '../../lib/supabase';
import { colors, radius } from '../../lib/theme';
import type { QuizCard, Region } from '../../lib/types';

type Row = { quiz: QuizCard; next: Date };

export default function QuizScreen() {
  const mapRef = useRef<VenueMapHandle>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [regionId, setRegionId] = useState<number | null>(null);
  const [quizzes, setQuizzes] = useState<QuizCard[]>([]);
  const [weekday, setWeekday] = useState<number | null>(null);
  const [organizer, setOrganizer] = useState<string | null>(null);
  const [mode, setMode] = useState<'popis' | 'karta'>('popis');
  const [selectedVenue, setSelectedVenue] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isConfigured) return;
      let alive = true;
      setLoading(true);
      Promise.all([getRegions(), getQuizzes()])
        .then(([r, q]) => {
          if (!alive) return;
          setRegions(r);
          setQuizzes(q);
          setError(null);
        })
        .catch((e) => alive && setError(e instanceof Error ? e.message : String(e)))
        .finally(() => alive && setLoading(false));
      return () => {
        alive = false;
      };
    }, []),
  );

  const organizers = useMemo(
    () => [...new Set(quizzes.map((q) => q.organizer_name).filter((x): x is string => !!x))].sort(),
    [quizzes],
  );

  const rows = useMemo<Row[]>(() => {
    const now = new Date();
    return quizzes
      .filter((q) => regionId == null || q.region_id === regionId)
      .filter((q) => organizer == null || q.organizer_name === organizer)
      .map((q) => ({ quiz: q, next: nextOccurrence(q, now) }))
      .filter((r): r is Row => r.next != null)
      .filter((r) => weekday == null || ((r.next.getDay() + 6) % 7) + 1 === weekday)
      .sort((a, b) => a.next.getTime() - b.next.getTime());
  }, [quizzes, regionId, organizer, weekday]);

  const sections = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = dayHeading(r.next);
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [rows]);

  const points = useMemo<MapPoint[]>(() => {
    const seen = new Set<string>();
    return rows
      .filter((r) => !seen.has(r.quiz.venue_id) && seen.add(r.quiz.venue_id))
      .map((r) => ({ id: r.quiz.venue_id, lat: r.quiz.lat, lng: r.quiz.lng, category: r.quiz.category }));
  }, [rows]);

  const selectedRows = rows.filter((r) => r.quiz.venue_id === selectedVenue);

  const filters = (
    <View style={styles.filters}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Sve regije" selected={regionId == null} onPress={() => setRegionId(null)} />
        {regions.map((r) => (
          <Chip
            key={r.id}
            label={r.name}
            selected={regionId === r.id}
            onPress={() => {
              setRegionId(r.id);
              mapRef.current?.flyTo(r.center_lat, r.center_lng, regionZoom(r));
            }}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Svi dani" selected={weekday == null} onPress={() => setWeekday(null)} />
        {DAYS_SHORT.map((d, i) => (
          <Chip key={d} label={d} selected={weekday === i + 1} onPress={() => setWeekday(i + 1)} />
        ))}
      </ScrollView>
      {organizers.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Svi organizatori" selected={organizer == null} onPress={() => setOrganizer(null)} />
          {organizers.map((o) => (
            <Chip key={o} label={o} selected={organizer === o} onPress={() => setOrganizer(o)} />
          ))}
        </ScrollView>
      )}
    </View>
  );

  const toggle = (
    <View style={styles.toggle}>
      {(['popis', 'karta'] as const).map((m) => (
        <Pressable key={m} onPress={() => setMode(m)} style={[styles.toggleBtn, mode === m && styles.toggleOn]}>
          <Ionicons name={m === 'popis' ? 'list' : 'map'} size={16} color={mode === m ? '#fff' : colors.text} />
          <Text style={[styles.toggleText, mode === m && { color: '#fff' }]}>{m === 'popis' ? 'Popis' : 'Karta'}</Text>
        </Pressable>
      ))}
    </View>
  );

  if (mode === 'karta') {
    return (
      <View style={{ flex: 1 }}>
        <VenueMap
          ref={mapRef}
          initial={{ lat: 45.8131, lng: 15.9775, zoom: 12 }}
          points={points}
          selectedId={selectedVenue}
          onSelect={setSelectedVenue}
          onDeselect={() => setSelectedVenue(null)}
        />
        <View style={styles.mapTop} pointerEvents="box-none">
          {toggle}
          {filters}
        </View>
        {selectedRows.length > 0 && (
          <View style={styles.mapBottom}>
            {selectedRows.map((r) => (
              <QuizRow key={r.quiz.id} row={r} />
            ))}
          </View>
        )}
      </View>
    );
  }

  return (
    <SectionList
      sections={sections}
      keyExtractor={(r) => String(r.quiz.id)}
      contentContainerStyle={styles.list}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={
        <View style={{ gap: 10, marginBottom: 6 }}>
          {toggle}
          {filters}
          {!isConfigured && <Notice tone="error" text="Baza nije spojena (vidi README)." />}
          {error && <Notice tone="error" text={error} />}
          {loading && <ActivityIndicator color={colors.primary} />}
        </View>
      }
      renderSectionHeader={({ section }) => <Text style={styles.sectionTitle}>{section.title}</Text>}
      renderItem={({ item }) => <QuizRow row={item} />}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      ListEmptyComponent={
        !loading ? (
          <Notice
            text={
              quizzes.length === 0
                ? 'Još nema upisanih kvizova. Lokacije kvizova (npr. Fast Facts Trivia) dodaju se u bazu — vidi README.'
                : 'Nema kvizova za odabrane filtere.'
            }
          />
        ) : undefined
      }
    />
  );
}

function QuizRow({ row }: { row: Row }) {
  const q = row.quiz;
  const catColor = q.category === 'jelo' ? colors.jelo : colors.pice;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lokal/[id]', params: { id: q.venue_id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.time}>
        <Text style={styles.timeText}>{formatTime(q.start_time) || '—'}</Text>
        <Text style={styles.timeDay}>{DAYS_SHORT[(row.next.getDay() + 6) % 7]}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.venue} numberOfLines={1}>{q.venue_name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={{ color: catColor, fontWeight: '600' }}>{VENUE_TYPE[q.venue_type] ?? q.venue_type}</Text>
          {' · '}
          {[q.district, q.city].filter(Boolean).join(', ')}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {q.title}
          {q.organizer_name ? ` · ${q.organizer_name}` : ''} · {FREQUENCY_LABEL[q.frequency]}
        </Text>
        <View style={styles.badges}>
          {q.capacity_total != null && <Text style={styles.pill}>{q.capacity_total} mjesta</Text>}
          {q.team_size_max != null && <Text style={styles.pill}>do {q.team_size_max} po ekipi</Text>}
          {q.entry_fee_eur != null && <Text style={styles.pill}>{Number(q.entry_fee_eur).toFixed(2).replace('.', ',')} €</Text>}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  filters: { gap: 8 },
  chips: { gap: 8, paddingHorizontal: 0 },
  toggle: {
    flexDirection: 'row', alignSelf: 'flex-start', backgroundColor: colors.card, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border, padding: 3,
  },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill },
  toggleOn: { backgroundColor: colors.primary },
  toggleText: { fontWeight: '600', color: colors.text },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, marginTop: 16, marginBottom: 10 },
  card: {
    flexDirection: 'row', gap: 12, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, padding: 12, alignItems: 'center',
  },
  time: {
    width: 62, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.primarySoft,
  },
  timeText: { fontSize: 18, fontWeight: '800', color: colors.primary },
  timeDay: { fontSize: 12, fontWeight: '600', color: colors.primary },
  venue: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  pill: {
    fontSize: 12, color: colors.muted, backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: radius.pill, overflow: 'hidden',
  },
  mapTop: { position: 'absolute', top: 10, left: 12, right: 12, gap: 8 },
  mapBottom: { position: 'absolute', left: 12, right: 12, bottom: 16, gap: 8 },
});
