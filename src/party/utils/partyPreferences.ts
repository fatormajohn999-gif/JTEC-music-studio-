import { PartyCreateRoomOptions, PartyRoomSettings } from '../types';

export const DEFAULT_PARTY_ROOM_SETTINGS: PartyRoomSettings = {
  allowGuestQueue: false,
  autoSkipEnabled: false,
  allowNewMembers: true,
};

const PARTY_PREFERENCES_STORAGE_KEY = 'jtec_party_host_preferences_v1';

export function validatePartyRoomSettings(
  input?: PartyCreateRoomOptions | Partial<PartyRoomSettings> | null
): PartyRoomSettings {
  const allowGuestQueue = Boolean(
    input?.allowGuestQueue ?? DEFAULT_PARTY_ROOM_SETTINGS.allowGuestQueue
  );
  const autoSkipEnabled = Boolean(
    input?.autoSkipEnabled ?? DEFAULT_PARTY_ROOM_SETTINGS.autoSkipEnabled
  );

  let allowNewMembers = DEFAULT_PARTY_ROOM_SETTINGS.allowNewMembers;
  if (input && typeof (input as PartyCreateRoomOptions).allowNewMembers === 'boolean') {
    allowNewMembers = Boolean((input as PartyCreateRoomOptions).allowNewMembers);
  } else if (input && typeof (input as PartyCreateRoomOptions).isLocked === 'boolean') {
    allowNewMembers = !Boolean((input as PartyCreateRoomOptions).isLocked);
  }

  return {
    allowGuestQueue,
    autoSkipEnabled,
    allowNewMembers,
  };
}

export function loadSavedPartyPreferences(): PartyRoomSettings {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_PARTY_ROOM_SETTINGS };
    }
    const raw = localStorage.getItem(PARTY_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PARTY_ROOM_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_PARTY_ROOM_SETTINGS };
    }
    return validatePartyRoomSettings(parsed);
  } catch {
    return { ...DEFAULT_PARTY_ROOM_SETTINGS };
  }
}

export function savePartyPreferences(settings: Partial<PartyRoomSettings>): PartyRoomSettings {
  const current = loadSavedPartyPreferences();
  const validated = validatePartyRoomSettings({ ...current, ...settings });
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(PARTY_PREFERENCES_STORAGE_KEY, JSON.stringify(validated));
    }
  } catch {
    // Ignore storage write failures
  }
  return validated;
}

export function resetPartyPreferences(): PartyRoomSettings {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(PARTY_PREFERENCES_STORAGE_KEY);
    }
  } catch {
    // Ignore storage removal failures
  }
  return { ...DEFAULT_PARTY_ROOM_SETTINGS };
}
