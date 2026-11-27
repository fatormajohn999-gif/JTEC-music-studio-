import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';
import { CreateRoomOptions, PartyHostPreferences } from './types';

const KEY_PARTY_HOST_PREFERENCES = 'jtec_party_host_preferences_v1';

export const DEFAULT_PARTY_HOST_PREFERENCES: PartyHostPreferences = {
  allowGuestQueue: false,
  autoSkipEnabled: false,
  allowNewMembers: true,
};

export function validatePartyHostPreferences(
  input?: CreateRoomOptions | PartyHostPreferences | null
): PartyHostPreferences {
  if (!input || typeof input !== 'object') {
    return { ...DEFAULT_PARTY_HOST_PREFERENCES };
  }

  return {
    allowGuestQueue:
      typeof input.allowGuestQueue === 'boolean'
        ? input.allowGuestQueue
        : DEFAULT_PARTY_HOST_PREFERENCES.allowGuestQueue,
    autoSkipEnabled:
      typeof input.autoSkipEnabled === 'boolean'
        ? input.autoSkipEnabled
        : DEFAULT_PARTY_HOST_PREFERENCES.autoSkipEnabled,
    allowNewMembers:
      typeof input.allowNewMembers === 'boolean'
        ? input.allowNewMembers
        : DEFAULT_PARTY_HOST_PREFERENCES.allowNewMembers,
  };
}

export function getPartyHostPreferencesSync(): PartyHostPreferences {
  try {
    const raw = localStorage.getItem(KEY_PARTY_HOST_PREFERENCES);
    if (!raw) return { ...DEFAULT_PARTY_HOST_PREFERENCES };
    const parsed = JSON.parse(raw);
    return validatePartyHostPreferences(parsed);
  } catch {
    return { ...DEFAULT_PARTY_HOST_PREFERENCES };
  }
}

export async function getPartyHostPreferences(): Promise<PartyHostPreferences> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { value } = await Preferences.get({ key: KEY_PARTY_HOST_PREFERENCES });
      if (value) {
        const parsed = JSON.parse(value);
        const validated = validatePartyHostPreferences(parsed);
        try {
          localStorage.setItem(KEY_PARTY_HOST_PREFERENCES, JSON.stringify(validated));
        } catch {}
        return validated;
      }
    } catch {
      // Fallback to localStorage below
    }
  }
  return getPartyHostPreferencesSync();
}

export async function savePartyHostPreferences(
  updates: Partial<PartyHostPreferences>
): Promise<PartyHostPreferences> {
  const current = getPartyHostPreferencesSync();
  const validated = validatePartyHostPreferences({ ...current, ...updates });
  const serialized = JSON.stringify(validated);

  try {
    localStorage.setItem(KEY_PARTY_HOST_PREFERENCES, serialized);
  } catch {}

  if (Capacitor.isNativePlatform()) {
    try {
      await Preferences.set({ key: KEY_PARTY_HOST_PREFERENCES, value: serialized });
    } catch {}
  }

  return validated;
}
