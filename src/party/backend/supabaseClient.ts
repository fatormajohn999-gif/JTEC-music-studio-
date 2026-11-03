import { createClient, SupabaseClient } from '@supabase/supabase-js';

const partySupabaseUrl = (import.meta.env.VITE_PARTY_SUPABASE_URL || '').trim();
const partySupabaseAnonKey = (import.meta.env.VITE_PARTY_SUPABASE_ANON_KEY || '').trim();

export function isPartySupabaseConfigured(): boolean {
  return Boolean(
    partySupabaseUrl &&
    partySupabaseAnonKey &&
    partySupabaseUrl.startsWith('http') &&
    !partySupabaseUrl.includes('your-party-project')
  );
}

export function getPartySupabaseConfig(): { url: string; anonKey: string } {
  return {
    url: partySupabaseUrl,
    anonKey: partySupabaseAnonKey,
  };
}

let partyClientInstance: SupabaseClient | null = null;

/**
 * Returns a SEPARATE Supabase client created exclusively from
 * VITE_PARTY_SUPABASE_URL and VITE_PARTY_SUPABASE_ANON_KEY.
 * Never uses the music Supabase client.
 */
export function getPartySupabaseClient(): SupabaseClient | null {
  if (!isPartySupabaseConfigured()) {
    return null;
  }

  if (!partyClientInstance) {
    partyClientInstance = createClient(partySupabaseUrl, partySupabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'jtec_party_supabase_auth_token',
      },
      realtime: {
        params: {
          eventsPerSecond: 20,
        },
      },
    });
  }

  return partyClientInstance;
}
