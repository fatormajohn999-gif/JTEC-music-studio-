import { Capacitor } from '@capacitor/core';
import { SupabaseService } from './supabase';
import { getCurrentAppVersion } from './nativeUpdate';

const LS_KEY_INSTALL_ID = 'jtec_install_id';
const LS_KEY_LAST_PING = 'jtec_last_install_ping';
const LS_KEY_LAST_CONFIG_CHECK = 'jtec_last_min_version_check';
const LS_KEY_LAST_CONFIG_DATA = 'jtec_last_app_config_data';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export interface AppConfigRow {
  min_build: number;
  message?: string;
}

export interface MinVersionStatus {
  isBlocked: boolean;
  minBuild: number;
  message: string;
  currentBuild: number;
  isWeb: boolean;
}

/**
 * Gets or creates the anonymous persistent install ID on first run.
 * Uses crypto.randomUUID with fallback.
 */
export function getOrCreateInstallId(): string {
  try {
    let id = localStorage.getItem(LS_KEY_INSTALL_ID);
    if (!id) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = crypto.randomUUID();
      } else {
        id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = (Math.random() * 16) | 0;
          const v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      }
      localStorage.setItem(LS_KEY_INSTALL_ID, id);
    }
    return id;
  } catch {
    return '00000000-0000-4000-8000-000000000000';
  }
}

/**
 * Calls the Supabase RPC ping_install on the main JTEC Supabase source.
 * At most once every 24 hours (and on the first run).
 * Sends:
 * - p_id: anonymous random UUID
 * - p_version: app version string
 * - p_build: app build integer
 * - p_platform: "android" | "web" | "ios"
 *
 * Does not send anything else: no names, emails, location or device details.
 * Ignores all errors silently. Never shows errors to users.
 */
export async function sendAnonymousPing(force = false): Promise<void> {
  try {
    const now = Date.now();
    const lastPingStr = localStorage.getItem(LS_KEY_LAST_PING);
    const lastPing = lastPingStr ? parseInt(lastPingStr, 10) : 0;

    if (!force && lastPing > 0 && now - lastPing < TWENTY_FOUR_HOURS_MS) {
      return;
    }

    const installId = getOrCreateInstallId();
    const { version, build } = await getCurrentAppVersion();

    let platform: 'android' | 'web' | 'ios' = 'web';
    if (Capacitor.isNativePlatform()) {
      const p = Capacitor.getPlatform();
      if (p === 'android') platform = 'android';
      else if (p === 'ios') platform = 'ios';
      else platform = 'android';
    } else {
      platform = 'web';
    }

    const client = SupabaseService.getClientForCategory('jtec_main');
    if (!client) return;

    await client.rpc('ping_install', {
      p_id: installId,
      p_version: version,
      p_build: build,
      p_platform: platform,
    });

    localStorage.setItem(LS_KEY_LAST_PING, String(now));
  } catch {
    // Ignore all errors silently
  }
}

/**
 * Checks minimum version from table app_config (id = 1).
 * Read on app open and return to foreground (at most once every 30 minutes).
 * If the installed build is lower than min_build, marks isBlocked = true.
 * If check fails or there is no internet, lets the app work normally.
 */
export async function checkMinimumVersion(force = false): Promise<MinVersionStatus | null> {
  try {
    const isWeb = !Capacitor.isNativePlatform();
    const now = Date.now();
    const lastCheckStr = localStorage.getItem(LS_KEY_LAST_CONFIG_CHECK);
    const lastCheck = lastCheckStr ? parseInt(lastCheckStr, 10) : 0;

    const { build: currentBuild } = await getCurrentAppVersion();

    // Check throttle
    if (!force && lastCheck > 0 && now - lastCheck < THIRTY_MINUTES_MS) {
      const cached = localStorage.getItem(LS_KEY_LAST_CONFIG_DATA);
      if (cached) {
        try {
          const parsed = JSON.parse(cached) as AppConfigRow;
          const minBuild = Number(parsed.min_build) || 0;
          if (minBuild > 0 && currentBuild < minBuild) {
            return {
              isBlocked: true,
              minBuild,
              message: parsed.message || 'An update is required to continue using JTEC MUSIC.',
              currentBuild,
              isWeb,
            };
          }
        } catch {
          // ignore cache parse errors
        }
      }
      return null;
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Offline: let app work normally
      return null;
    }

    const client = SupabaseService.getClientForCategory('jtec_main');
    if (!client) {
      return null;
    }

    const { data, error } = await client
      .from('app_config')
      .select('min_build, message')
      .eq('id', 1)
      .maybeSingle();

    if (error || !data) {
      // If check fails, let the app work normally
      return null;
    }

    localStorage.setItem(LS_KEY_LAST_CONFIG_CHECK, String(now));
    localStorage.setItem(LS_KEY_LAST_CONFIG_DATA, JSON.stringify(data));

    const minBuild = Number(data.min_build) || 0;
    const message = data.message ? String(data.message).trim() : 'An update is required to continue using JTEC MUSIC.';

    if (minBuild > 0 && currentBuild < minBuild) {
      return {
        isBlocked: true,
        minBuild,
        message,
        currentBuild,
        isWeb,
      };
    }

    return {
      isBlocked: false,
      minBuild,
      message,
      currentBuild,
      isWeb,
    };
  } catch {
    // If check fails, let the app work normally
    return null;
  }
}
