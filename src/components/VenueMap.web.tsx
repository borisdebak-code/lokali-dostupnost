import type { Ref } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { MapPoint } from '../lib/mapHtml';
import { colors } from '../lib/theme';

// Karta radi samo u mobilnoj aplikaciji (WebView); web je samo za pregled.
export type MapViewState = { lat: number; lng: number; radiusM: number; zoom: number };
export type VenueMapHandle = { flyTo: (lat: number, lng: number, zoom: number) => void; setMe: (lat: number, lng: number) => void };

type Props = {
  ref?: Ref<VenueMapHandle>;
  initial: { lat: number; lng: number; zoom: number };
  points: MapPoint[];
  selectedId?: string | null;
  onMove?: (v: MapViewState) => void;
  onSelect?: (id: string) => void;
  onDeselect?: () => void;
  onError?: (message: string | null) => void;
};

export function VenueMap({ points }: Props) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.wrap]}>
      <Text style={styles.text}>Karta je dostupna u mobilnoj aplikaciji ({points.length} točaka).</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#EDE8DF' },
  text: { color: colors.muted },
});
