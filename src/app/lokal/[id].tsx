import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { BusynessChart } from '../../components/BusynessChart';
import { Chip } from '../../components/Chip';
import { CrowdBadge } from '../../components/CrowdBadge';
import { Notice, Section } from '../../components/Section';
import {
  getBusyness, getSavedOne, getVenue, getVenueQuizzes, reportCapacity, reportCrowd, saveVenue, unsaveVenue,
} from '../../lib/api';
import { scheduleText } from '../../lib/quiz';
import { isInSeason, isOpenAt, prettyHours } from '../../lib/hours';
import {
  CAPACITY_SOURCE, CATEGORY, FEATURE_LABEL, featureValue, GROUP_FEATURES, MONTHS, PRACTICAL_FEATURES,
  SAVED_STATUS, VENUE_TYPE,
} from '../../lib/labels';
import { colors, radius } from '../../lib/theme';
import type { Busyness, Feature, QuizCard, SavedStatus, SavedVenue, Venue } from '../../lib/types';

function errMsg(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export default function VenueScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [busyness, setBusyness] = useState<Busyness[]>([]);
  const [saved, setSaved] = useState<SavedVenue | null>(null);
  const [quizzes, setQuizzes] = useState<QuizCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(
    () =>
      Promise.all([getVenue(id), getBusyness(id)])
        .then(([v, b]) => {
          setVenue(v);
          setBusyness(b);
          setError(v ? null : 'Lokal nije pronađen.');
        })
        .catch((e) => setError(errMsg(e)))
        .finally(() => setLoading(false)),
    [id],
  );

  useEffect(() => {
    reload();
    getSavedOne(id).then(setSaved).catch(() => {});
    getVenueQuizzes(id).then(setQuizzes).catch(() => {});
  }, [id, reload]);

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color={colors.primary} />;
  if (!venue) return <View style={{ padding: 16 }}><Notice tone="error" text={error ?? 'Greška'} /></View>;

  const v = venue;
  const now = new Date();
  const open = isOpenAt(v, now);
  const season = isInSeason(v, now);
  const catColor = v.category === 'jelo' ? colors.jelo : colors.pice;
  const mapsQuery = encodeURIComponent([v.name, v.address, v.city].filter(Boolean).join(', '));

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Stack.Screen options={{ title: v.name }} />

      <View style={{ gap: 6 }}>
        <Text style={styles.title}>{v.name}</Text>
        <Text style={styles.subtitle}>
          <Text style={{ color: catColor, fontWeight: '700' }}>{CATEGORY[v.category]}</Text>
          {' · '}
          {VENUE_TYPE[v.venue_type] ?? v.venue_type}
          {v.cuisine.length > 0 ? ` · ${v.cuisine.join(', ').replace(/_/g, ' ')}` : ''}
        </Text>
        <Text style={styles.subtitle}>
          {[v.address, v.district, v.city].filter(Boolean).join(', ') || 'Adresa nepoznata'}
        </Text>
        <View style={styles.row}>
          {open === true && <Text style={[styles.tag, { color: colors.ok }]}>Otvoreno sad</Text>}
          {open === false && <Text style={[styles.tag, { color: colors.bad }]}>Zatvoreno sad</Text>}
          {open === null && <Text style={styles.tag}>Radno vrijeme nepoznato</Text>}
          {v.seasonality === 'sezonski' && (
            <Text style={[styles.tag, season === false && { color: colors.bad }]}>
              Sezonski
              {v.season_start_month && v.season_end_month
                ? ` (${MONTHS[v.season_start_month - 1]} – ${MONTHS[v.season_end_month - 1]})`
                : ''}
            </Text>
          )}
          {v.seasonality === 'cijela_godina' && <Text style={styles.tag}>Radi cijelu godinu</Text>}
          {v.tags.map((t) => <Text key={t} style={styles.tag}>{t}</Text>)}
        </View>
      </View>

      <View style={styles.actions}>
        <SaveButton venueId={v.id} saved={saved} onChange={setSaved} />
        <Action icon="map-outline" label="Google Karte" onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`)} />
        {v.phone && <Action icon="call-outline" label="Nazovi" onPress={() => Linking.openURL(`tel:${v.phone!.replace(/\s/g, '')}`)} />}
        {v.website && <Action icon="globe-outline" label="Web" onPress={() => Linking.openURL(v.website!)} />}
      </View>
      <Text style={styles.hint}>Google ocjenu za sada vidiš preko gumba „Google Karte”.</Text>

      {saved && <SavedEditor saved={saved} onChange={setSaved} />}

      {quizzes.length > 0 && (
        <Section title="Kviz ovdje">
          {quizzes.map((q) => (
            <View key={q.id} style={{ gap: 2 }}>
              <Text style={styles.label}>
                {q.title}
                {q.organizer_name ? ` · ${q.organizer_name}` : ''}
              </Text>
              <Text style={styles.body}>{scheduleText(q)}</Text>
              {q.notes ? <Text style={styles.hint}>{q.notes}</Text> : null}
              {q.signup_url ? (
                <Text style={[styles.body, { color: colors.primary }]} onPress={() => Linking.openURL(q.signup_url!)}>
                  {q.signup_url!.includes('quisco.co') ? 'Otvori na Quiscu ›' : 'Prijava ekipe ›'}
                </Text>
              ) : null}
            </View>
          ))}
        </Section>
      )}

      <CapacitySection venue={v} onSaved={reload} />

      <Section title="Gužva" right={<CrowdBadge level={v.crowd_now} prefix="Sad" />}>
        <CrowdReporter venueId={v.id} onSaved={reload} />
        <Text style={styles.label}>Tipično po danima i satima</Text>
        <BusynessChart data={busyness} />
      </Section>

      <Section title="Za grupe i kvizove">
        <FeatureList venue={v} features={GROUP_FEATURES.filter((f) => f !== 'terasa' && f !== 'rezervacije')} />
      </Section>

      <Section title="Praktično">
        <FeatureList venue={v} features={['rezervacije', ...PRACTICAL_FEATURES]} />
      </Section>

      <Section title="Radno vrijeme">
        <Text style={styles.body}>{prettyHours(v) ?? 'Nepoznato'}</Text>
      </Section>

      <Text style={styles.attribution}>Podaci: © OpenStreetMap suradnici. Nešto nije točno? Javi nam.</Text>
    </ScrollView>
  );
}

function Action({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => [styles.action, pressed && { opacity: 0.7 }]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.primary} />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

function SaveButton({ venueId, saved, onChange }: { venueId: string; saved: SavedVenue | null; onChange: (s: SavedVenue | null) => void }) {
  const toggle = async () => {
    try {
      if (saved) {
        await unsaveVenue(venueId);
        onChange(null);
      } else {
        await saveVenue(venueId);
        onChange(await getSavedOne(venueId));
      }
    } catch (e) {
      Alert.alert('Greška', errMsg(e));
    }
  };
  return <Action icon={saved ? 'bookmark' : 'bookmark-outline'} label={saved ? 'Spremljeno' : 'Spremi'} onPress={toggle} />;
}

function SavedEditor({ saved, onChange }: { saved: SavedVenue; onChange: (s: SavedVenue) => void }) {
  const [note, setNote] = useState(saved.note ?? '');
  const update = async (patch: { status?: SavedStatus; note?: string | null }) => {
    try {
      await saveVenue(saved.venue_id, patch);
      onChange({ ...saved, ...patch });
    } catch (e) {
      Alert.alert('Greška', errMsg(e));
    }
  };
  return (
    <Section title="Moj popis">
      <View style={styles.row}>
        {(Object.keys(SAVED_STATUS) as SavedStatus[]).map((s) => (
          <Chip key={s} label={SAVED_STATUS[s]} selected={saved.status === s} onPress={() => update({ status: s })} />
        ))}
      </View>
      <TextInput
        style={[styles.input, { minHeight: 60 }]}
        placeholder="Bilješka (npr. kontakt osoba, cijena, dogovoreni termin)"
        placeholderTextColor={colors.muted}
        multiline
        value={note}
        onChangeText={setNote}
        onEndEditing={() => note !== (saved.note ?? '') && update({ note: note || null })}
      />
    </Section>
  );
}

function CapacitySection({ venue: v, onSaved }: { venue: Venue; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [indoor, setIndoor] = useState('');
  const [outdoor, setOutdoor] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const i = indoor.trim() ? parseInt(indoor, 10) : null;
    const o = outdoor.trim() ? parseInt(outdoor, 10) : null;
    if ((i == null && o == null) || (i != null && isNaN(i)) || (o != null && isNaN(o))) {
      Alert.alert('Upiši broj mjesta unutra i/ili na terasi.');
      return;
    }
    setBusy(true);
    try {
      await reportCapacity(v.id, i, o);
      setEditing(false);
      onSaved();
    } catch (e) {
      Alert.alert('Greška', errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const source = v.capacity_source
    ? `${CAPACITY_SOURCE[v.capacity_source]}${v.capacity_source === 'korisnici' ? ` (${v.capacity_reports_count})` : ''}`
    : null;

  return (
    <Section title="Kapacitet">
      {v.capacity_total != null ? (
        <View style={styles.capRow}>
          <Stat label="Ukupno" value={v.capacity_total} big />
          <Stat label="Unutra" value={v.capacity_indoor} />
          <Stat label="Terasa" value={v.capacity_outdoor} />
        </View>
      ) : (
        <Text style={styles.body}>Kapacitet još nije poznat. Ako znaš otprilike koliko ljudi stane, upiši — pomažeš drugima.</Text>
      )}
      {source && <Text style={styles.hint}>Izvor: {source}</Text>}
      {editing ? (
        <View style={{ gap: 8 }}>
          <View style={styles.row}>
            <TextInput style={[styles.input, { flex: 1 }]} keyboardType="number-pad" placeholder="Unutra" placeholderTextColor={colors.muted} value={indoor} onChangeText={setIndoor} />
            <TextInput style={[styles.input, { flex: 1 }]} keyboardType="number-pad" placeholder="Terasa" placeholderTextColor={colors.muted} value={outdoor} onChangeText={setOutdoor} />
          </View>
          <View style={styles.row}>
            <Chip label={busy ? 'Spremam…' : 'Spremi'} selected onPress={busy ? undefined : submit} />
            <Chip label="Odustani" onPress={() => setEditing(false)} />
          </View>
        </View>
      ) : (
        v.capacity_source !== 'vlasnik' && (
          <Chip label={v.capacity_total != null ? 'Ispravi kapacitet' : 'Dodaj kapacitet'} onPress={() => setEditing(true)} />
        )
      )}
    </Section>
  );
}

function Stat({ label, value, big }: { label: string; value: number | null; big?: boolean }) {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={[styles.statValue, big && { fontSize: 32, color: colors.primary }]}>{value ?? '–'}</Text>
      <Text style={styles.hint}>{label}</Text>
    </View>
  );
}

function CrowdReporter({ venueId, onSaved }: { venueId: string; onSaved: () => void }) {
  const [done, setDone] = useState(false);
  const send = async (level: 1 | 2 | 3) => {
    try {
      await reportCrowd(venueId, level);
      setDone(true);
      onSaved();
    } catch (e) {
      Alert.alert('Nije spremljeno', errMsg(e));
    }
  };
  if (done) return <Text style={styles.body}>Hvala! Prijava je spremljena.</Text>;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>Jesi li sada tamo? Kakva je gužva?</Text>
      <View style={styles.row}>
        <Chip label="🟢 Ima mjesta" onPress={() => send(1)} />
        <Chip label="🟡 Srednje" onPress={() => send(2)} />
        <Chip label="🔴 Gužva" onPress={() => send(3)} />
      </View>
    </View>
  );
}

function FeatureList({ venue, features }: { venue: Venue; features: Feature[] }) {
  return (
    <View style={{ gap: 8 }}>
      {features.map((f) => {
        const val = featureValue(venue, f);
        return (
          <View key={f} style={styles.featureRow}>
            <Ionicons
              name={val === true ? 'checkmark-circle' : val === false ? 'close-circle' : 'remove-circle-outline'}
              size={20}
              color={val === true ? colors.ok : val === false ? colors.bad : colors.muted}
            />
            <Text style={[styles.body, val == null && { color: colors.muted }]}>{FEATURE_LABEL[f]}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 16, gap: 14, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '800', color: colors.text },
  subtitle: { fontSize: 15, color: colors.muted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tag: {
    fontSize: 12, color: colors.muted, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden',
  },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  action: {
    flexGrow: 1, flexBasis: 70, alignItems: 'center', gap: 4, paddingVertical: 10, backgroundColor: colors.primarySoft,
    borderRadius: radius.md,
  },
  actionText: { fontSize: 12, fontWeight: '600', color: colors.primary },
  label: { fontSize: 14, fontWeight: '600', color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 21 },
  hint: { fontSize: 12, color: colors.muted },
  capRow: { flexDirection: 'row', gap: 28, alignItems: 'flex-end' },
  statValue: { fontSize: 20, fontWeight: '700', color: colors.text },
  input: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: colors.text, backgroundColor: colors.bg, textAlignVertical: 'top',
  },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  attribution: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
