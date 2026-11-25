import { type ComponentType, type Ref, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { buildMapHtml, type MapMessage, type MapPoint } from '../lib/mapHtml';
import { colors } from '../lib/theme';

// Tipovi paketa daju `never` za props kad se generik ne navede; ovo je isti komponent s ispravnim tipom.
type WebViewHandle = { injectJavaScript: (script: string) => void };
const MapWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

export type MapViewState = { lat: number; lng: number; radiusM: number; zoom: number };
export type VenueMapHandle = {
  flyTo: (lat: number, lng: number, zoom: number) => void;
  setMe: (lat: number, lng: number) => void;
};

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

export function VenueMap({ ref, initial, points, selectedId = null, onMove, onSelect, onDeselect, onError }: Props) {
  const webRef = useRef<WebViewHandle>(null);
  // HTML se gradi jednom; daljnje promjene idu preko injectJavaScript
  const html = useMemo(
    () => buildMapHtml({ ...initial, colors: { jelo: colors.jelo, pice: colors.pice, me: '#2563EB' } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const run = (js: string) => webRef.current?.injectJavaScript(`${js}; true;`);

  useImperativeHandle(ref, () => ({
    flyTo: (lat, lng, zoom) => run(`window.flyTo(${lat}, ${lng}, ${zoom})`),
    setMe: (lat, lng) => run(`window.setMe(${lat}, ${lng})`),
  }));

  useEffect(() => {
    run(`window.setVenues && window.setVenues(${JSON.stringify(points)})`);
  }, [points]);

  useEffect(() => {
    run(`window.setSelected && window.setSelected(${JSON.stringify(selectedId)})`);
  }, [selectedId]);

  const onMessage = (e: WebViewMessageEvent) => {
    let msg: MapMessage;
    try {
      msg = JSON.parse(e.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.type === 'move') onMove?.({ lat: msg.lat, lng: msg.lng, radiusM: msg.radiusM, zoom: msg.zoom });
    else if (msg.type === 'select') onSelect?.(msg.id);
    else if (msg.type === 'deselect') onDeselect?.();
    else if (msg.type === 'error') onError?.(msg.message);
    else if (msg.type === 'ready') {
      onError?.(null);
      // točke koje su stigle prije nego što se karta učitala
      run(`window.setVenues(${JSON.stringify(points)}); window.setSelected(${JSON.stringify(selectedId)})`);
    }
  };

  return (
    <MapWebView
      ref={webRef}
      style={StyleSheet.absoluteFill}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://localhost/' }}
      onMessage={onMessage}
      javaScriptEnabled
      setSupportMultipleWindows={false}
      overScrollMode="never"
      bounces={false}
    />
  );
}
