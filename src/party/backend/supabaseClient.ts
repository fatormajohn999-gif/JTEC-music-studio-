import { createClient, SupabaseClient } from '@supabase/supabase-js';

const partySupabaseUrl = (import.meta.env.VITE_PARTY_SUPABASE_URL || '').trim();
const partySupabaseAnonKey = (import.meta.env.VITE_PARTY_SUPABASE_ANON_KEY || '').trim();

export interface PartySupabaseConfigStatus {
  isConfigured: boolean;
  hasUrl: boolean;
  hasAnonKey: boolean;
  isValidUrl: boolean;
  maskedHost: string;
  reason: string | null;
}

export function getPartySupabaseMaskedHost(): string {
  if (!partySupabaseUrl) return 'Not configured';
  try {
    const normalized = partySupabaseUrl.startsWith('http')
      ? partySupabaseUrl
      : `https://${partySupabaseUrl}`;
    const parsed = new URL(normalized);
    return parsed.hostname || 'Invalid URL';
  } catch {
    return 'Invalid URL';
  }
}

export function isPartySupabaseConfigured(): boolean {
  return Boolean(
    partySupabaseUrl &&
    partySupabaseAnonKey &&
    partySupabaseUrl.startsWith('http') &&
    !partySupabaseUrl.includes('your-party-project')
  );
}

export function getPartySupabaseConfigStatus(): PartySupabaseConfigStatus {
  const hasUrl = Boolean(partySupabaseUrl);
  const hasAnonKey = Boolean(partySupabaseAnonKey);
  const maskedHost = getPartySupabaseMaskedHost();
  const isValidUrl = Boolean(
    hasUrl &&
      partySupabaseUrl.startsWith('http') &&
      !partySupabaseUrl.includes('your-party-project') &&
      maskedHost !== 'Invalid URL'
  );

  let reason: string | null = null;
  if (!hasUrl && !hasAnonKey) {
    reason = 'VITE_PARTY_SUPABASE_URL and VITE_PARTY_SUPABASE_ANON_KEY are missing.';
  } else if (!hasUrl) {
    reason = 'VITE_PARTY_SUPABASE_URL is missing.';
  } else if (!hasAnonKey) {
    reason = 'VITE_PARTY_SUPABASE_ANON_KEY is missing.';
  } else if (!isValidUrl) {
    reason = 'VITE_PARTY_SUPABASE_URL is not a valid HTTP(S) Supabase URL.';
  }

  return {
    isConfigured: isValidUrl && hasAnonKey,
    hasUrl,
    hasAnonKey,
    isValidUrl,
    maskedHost,
    reason,
  };
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
