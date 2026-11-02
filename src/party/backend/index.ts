import { PartyBackend } from './types';
import { MockPartyBackendInstance } from './MockPartyBackend';
import { SupabasePartyBackendInstance } from './SupabasePartyBackend';

export * from './types';
export * from './MockPartyBackend';
export * from './SupabasePartyBackend';

/**
 * Returns the configured party backend instance.
 * If VITE_PARTY_SUPABASE_URL and VITE_PARTY_SUPABASE_ANON_KEY exist, uses SupabasePartyBackend.
 * Otherwise, silently falls back to MockPartyBackend (local on-device engine).
 */
export function getPartyBackend(): PartyBackend {
  const supabaseUrl = import.meta.env.VITE_PARTY_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_PARTY_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnonKey) {
    return SupabasePartyBackendInstance;
  }

  return MockPartyBackendInstance;
}
