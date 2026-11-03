import { PartyBackend, BackendPartyStatus } from './types';
import { MockPartyBackendInstance } from './MockPartyBackend';
import { SupabasePartyBackendInstance } from './SupabasePartyBackend';
import { isPartySupabaseConfigured } from './supabaseClient';

export * from './types';
export * from './MockPartyBackend';
export * from './SupabasePartyBackend';
export * from './supabaseClient';

let devForceLocal = false;

export function setDevForceLocalBackend(forceLocal: boolean): void {
  devForceLocal = forceLocal;
}

export function isDevForceLocalBackend(): boolean {
  return devForceLocal;
}

/**
 * Returns the configured party backend instance.
 * If VITE_PARTY_SUPABASE_URL and VITE_PARTY_SUPABASE_ANON_KEY are configured, uses SupabasePartyBackend.
 * When not configured, SupabasePartyBackend reports unavailable status without fake data.
 */
export function getPartyBackend(): PartyBackend {
  if (devForceLocal) {
    return MockPartyBackendInstance;
  }

  // Always use the real Supabase backend implementation
  return SupabasePartyBackendInstance;
}

export function getPartyBackendStatus(): BackendPartyStatus {
  const backend = getPartyBackend();
  if (backend.getStatus) {
    return backend.getStatus();
  }

  return {
    backendType: backend.isMock() ? 'Local' : 'Supabase',
    accountId: null,
    partyId: null,
    onlineChannelState: 'DISCONNECTED',
    roomChannelState: 'IDLE',
    lastError: null,
  };
}
