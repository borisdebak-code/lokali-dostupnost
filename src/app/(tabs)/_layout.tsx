import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { BrandHeader } from '../../components/BrandHeader';
import { colors } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;
function icon(name: IconName) {
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} color={typeof color === 'string' ? color : undefined} size={size} />;
  }
  return TabIcon;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        headerTitleStyle: { color: colors.text },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Za grupe', headerTitle: () => <BrandHeader subtitle="Gdje s ekipom?" />, tabBarIcon: icon('people') }} />
      <Tabs.Screen name="kvizovi" options={{ title: 'Kvizovi', headerTitle: 'Kvizovi', tabBarIcon: icon('bulb') }} />
      <Tabs.Screen name="karta" options={{ title: 'Karta', tabBarIcon: icon('map') }} />
      <Tabs.Screen name="popis" options={{ title: 'Popis', headerTitle: 'Lokali', tabBarIcon: icon('list') }} />
      <Tabs.Screen name="spremljeno" options={{ title: 'Spremljeno', headerTitle: 'Moj popis', tabBarIcon: icon('bookmark') }} />
    </Tabs>
  );
}
