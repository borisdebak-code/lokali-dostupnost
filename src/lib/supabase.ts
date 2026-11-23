import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

let sessionPromise: Promise<string> | null = null;

/**
 * Prijave gužve/kapaciteta i spremljeni popis trebaju korisnika.
 * Za početak koristimo anonimnu prijavu (bez registracije) — kasnije se
 * isti račun može povezati s e-mailom.
 */
export function ensureUser(): Promise<string> {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) return data.session.user.id;
      const { data: signIn, error } = await supabase.auth.signInAnonymously();
      if (error || !signIn.user) throw new Error(error?.message ?? 'Prijava nije uspjela');
      return signIn.user.id;
    })().catch((e) => {
      sessionPromise = null;
      throw e;
    });
  }
  return sessionPromise;
}
