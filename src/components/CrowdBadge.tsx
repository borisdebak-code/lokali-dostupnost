import { StyleSheet, Text, View } from 'react-native';
import { crowdLabel } from '../lib/labels';
import { colors, radius } from '../lib/theme';

export function crowdColor(level: number | null): string {
  if (level == null) return colors.muted;
  if (level < 1.67) return colors.ok;
  if (level < 2.34) return colors.warn;
  return colors.bad;
}

export function CrowdBadge({ level, prefix }: { level: number | null; prefix?: string }) {
  const c = crowdColor(level);
  return (
    <View style={[styles.badge, { borderColor: c }]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.text, { color: c }]}>
        {prefix ? `${prefix}: ` : ''}
        {crowdLabel(level)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '600' },
});
