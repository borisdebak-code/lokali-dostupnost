import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDateTime } from '../lib/labels';
import { colors, radius } from '../lib/theme';

type Props = { value: Date; onChange: (d: Date) => void };

export function DateTimeField({ value, onChange }: Props) {
  if (Platform.OS === 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="datetime"
        display="compact"
        locale="hr-HR"
        minuteInterval={15}
        minimumDate={new Date()}
        onValueChange={(_, d) => onChange(d)}
        style={{ alignSelf: 'flex-start' }}
      />
    );
  }

  const open = (mode: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value,
      mode,
      is24Hour: true,
      minimumDate: mode === 'date' ? new Date() : undefined,
      onValueChange: (_, d) => {
        const next = new Date(value);
        if (mode === 'date') next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
        else next.setHours(d.getHours(), d.getMinutes(), 0, 0);
        onChange(next);
      },
    });

  return (
    <View style={styles.row}>
      <Pressable style={styles.btn} onPress={() => open('date')}>
        <Text style={styles.text}>{formatDateTime(value).split(' u ')[0]}</Text>
      </Pressable>
      <Pressable style={styles.btn} onPress={() => open('time')}>
        <Text style={styles.text}>
          {String(value.getHours()).padStart(2, '0')}:{String(value.getMinutes()).padStart(2, '0')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  btn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.bg,
  },
  text: { fontSize: 15, color: colors.text, fontWeight: '500' },
});
