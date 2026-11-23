import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DAYS_SHORT } from '../lib/labels';
import { colors } from '../lib/theme';
import type { Busyness } from '../lib/types';
import { Chip } from './Chip';
import { crowdColor } from './CrowdBadge';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 7); // 07–24 h

export function BusynessChart({ data }: { data: Busyness[] }) {
  const todayIsoDow = ((new Date().getDay() + 6) % 7) + 1;
  const [day, setDay] = useState(todayIsoDow);
  const byHour = useMemo(() => {
    const m = new Map<number, Busyness>();
    data.filter((b) => b.isodow === day).forEach((b) => m.set(b.hour, b));
    return m;
  }, [data, day]);

  const quietest = useMemo(() => {
    const solid = data.filter((b) => b.reports >= 3);
    if (solid.length < 5) return null;
    return [...solid].sort((a, b) => a.level - b.level).slice(0, 3);
  }, [data]);

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.days}>
        {DAYS_SHORT.map((d, i) => (
          <Chip key={d} label={d} selected={day === i + 1} onPress={() => setDay(i + 1)} />
        ))}
      </View>
      <View style={styles.chart} accessibilityLabel="Tipična gužva po satima">
        {HOURS.map((h) => {
          const b = byHour.get(h % 24);
          const height = b ? 12 + (b.level / 3) * 68 : 4;
          return (
            <View key={h} style={styles.col}>
              <View style={[styles.bar, { height, backgroundColor: b ? crowdColor(b.level) : colors.border }]} />
              <Text style={styles.hour}>{h % 3 === 0 ? `${h % 24}` : ''}</Text>
            </View>
          );
        })}
      </View>
      {data.length === 0 ? (
        <Text style={styles.hint}>
          Još nema prijava gužve. Kad si u lokalu, prijavi gužvu — iz prijava s vremenom nastaje ovaj grafikon.
        </Text>
      ) : quietest ? (
        <Text style={styles.hint}>
          Najmirnije obično: {quietest.map((q) => `${DAYS_SHORT[q.isodow - 1]} ${q.hour}h`).join(', ')}
        </Text>
      ) : (
        <Text style={styles.hint}>Još malo prijava — grafikon je okviran.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 100, gap: 3 },
  col: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  bar: { width: '100%', borderRadius: 3 },
  hour: { fontSize: 10, color: colors.muted, height: 12 },
  hint: { fontSize: 13, color: colors.muted },
});
