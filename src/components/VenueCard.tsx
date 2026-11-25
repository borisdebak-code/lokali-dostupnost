import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CATEGORY, formatDistance, venueSubtitle } from '../lib/labels';
import { colors, radius } from '../lib/theme';
import type { Venue } from '../lib/types';
import { CrowdBadge } from './CrowdBadge';

type Props = {
  venue: Venue;
  distanceM?: number | null;
  open?: boolean | null;
  typicalCrowd?: number | null;
  note?: string | null;
};

export function VenueCard({ venue: v, distanceM, open, typicalCrowd, note }: Props) {
  const catColor = v.category === 'jelo' ? colors.jelo : colors.pice;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/lokal/[id]', params: { id: v.id } })}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.stripe, { backgroundColor: catColor }]} />
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{v.name}</Text>
          {distanceM != null && <Text style={styles.meta}>{formatDistance(distanceM)}</Text>}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          <Text style={{ color: catColor, fontWeight: '600' }}>{CATEGORY[v.category]}</Text> · {venueSubtitle(v)}
        </Text>
        <View style={styles.badges}>
          <View style={styles.capacity}>
            <Ionicons name="people-outline" size={14} color={colors.text} />
            <Text style={styles.capacityText}>
              {v.capacity_total != null ? `${v.capacity_total} mjesta` : 'kapacitet nepoznat'}
            </Text>
          </View>
          {open === true && <Text style={[styles.pill, { color: colors.ok }]}>Otvoreno</Text>}
          {open === false && <Text style={[styles.pill, { color: colors.bad }]}>Zatvoreno</Text>}
          {v.outdoor_seating && <Text style={styles.pill}>Terasa</Text>}
          {v.has_private_room && <Text style={styles.pill}>Separe</Text>}
          {v.has_projector_tv && <Text style={styles.pill}>Projektor/TV</Text>}
        </View>
        {(v.crowd_now != null || typicalCrowd != null) && (
          <View style={styles.badges}>
            {v.crowd_now != null && <CrowdBadge level={v.crowd_now} prefix="Sad" />}
            {typicalCrowd != null && <CrowdBadge level={typicalCrowd} prefix="Inače u to vrijeme" />}
          </View>
        )}
        {note ? <Text style={styles.note} numberOfLines={2}>{note}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  stripe: { width: 5 },
  body: { flex: 1, padding: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text, flex: 1 },
  meta: { fontSize: 13, color: colors.muted },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  capacity: { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 4 },
  capacityText: { fontSize: 13, fontWeight: '600', color: colors.text },
  pill: {
    fontSize: 12,
    color: colors.muted,
    backgroundColor: colors.bg,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  note: { fontSize: 13, color: colors.text, fontStyle: 'italic' },
});
