import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../lib/theme';

// react-native-maps ne radi na webu; aplikacija je primarno mobilna.
export default function MapScreenWeb() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>Karta je dostupna u mobilnoj aplikaciji.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  text: { color: colors.muted, fontSize: 15 },
});
