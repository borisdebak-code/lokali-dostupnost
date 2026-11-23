import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../lib/theme';

type Props = { label: string; selected?: boolean; onPress?: () => void; color?: string };

export function Chip({ label, selected, onPress, color = colors.primary }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={[styles.chip, selected && { backgroundColor: color, borderColor: color }]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  label: { color: colors.text, fontSize: 14, fontWeight: '500' },
  labelSelected: { color: '#fff' },
});
