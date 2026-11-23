import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '../../components/Chip';
import { Notice } from '../../components/Section';
import { VenueCard } from '../../components/VenueCard';
import { getSaved, getVenues } from '../../lib/api';
import { SAVED_STATUS } from '../../lib/labels';
import { isConfigured } from '../../lib/supabase';
import { colors } from '../../lib/theme';
import type { SavedStatus, SavedVenue, Venue } from '../../lib/types';

export default function SavedScreen() {
  const [saved, setSaved] = useState<SavedVenue[]>([]);
  const [venues, setVenues] = useState<Map<string, Venue>>(new Map());
  const [status, setStatus] = useState<SavedStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isConfigured) return;
      let alive = true;
      setLoading(true);
      (async () => {
        try {
          const s = await getSaved();
          const v = await getVenues(s.map((x) => x.venue_id));
          if (!alive) return;
          setSaved(s);
          setVenues(new Map(v.map((x) => [x.id, x])));
          setError(null);
        } catch (e) {
          if (alive) setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (alive) setLoading(false);
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const rows = useMemo(
    () => saved.filter((s) => venues.has(s.venue_id) && (status == null || s.status === status)),
    [saved, venues, status],
  );

  return (
    <FlatList
      data={rows}
      keyExtractor={(s) => s.venue_id}
      contentContainerStyle={styles.list}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      renderItem={({ item }) => (
        <View>
          <Text style={styles.status}>{SAVED_STATUS[item.status]}</Text>
          <VenueCard venue={venues.get(item.venue_id)!} note={item.note} />
        </View>
      )}
      ListHeaderComponent={
        <View style={styles.header}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label="Sve" selected={status == null} onPress={() => setStatus(null)} />
            {(Object.keys(SAVED_STATUS) as SavedStatus[]).map((s) => (
              <Chip key={s} label={SAVED_STATUS[s]} selected={status === s} onPress={() => setStatus(s)} />
            ))}
          </ScrollView>
          {loading && <ActivityIndicator color={colors.primary} />}
          {error && <Notice tone="error" text={error} />}
        </View>
      }
      ListEmptyComponent={
        !loading ? (
          <Notice text="Ovdje se skupljaju lokali koje spremiš (npr. kandidati za kviz). Za svaki možeš voditi status dogovora i bilješku." />
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 40 },
  header: { gap: 10, marginBottom: 12 },
  status: { fontSize: 12, fontWeight: '700', color: colors.primary, marginBottom: 4, textTransform: 'uppercase' },
});
