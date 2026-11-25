import { Image, StyleSheet, Text, View } from 'react-native';
import { colors } from '../lib/theme';

/** Naslov s logom (pinta s pjenom-mozgom) za glavni ekran. */
export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.tile}>
        <Image source={require('../../assets/logo.png')} style={styles.logo} accessibilityIgnoresInvertColors />
      </View>
      <View>
        <Text style={styles.title}>
          <Text style={{ color: colors.accent }}>FFF</Text> Fast Facts Finder
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tile: { width: 38, height: 38, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 36, height: 36 },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 12, color: colors.muted },
});
