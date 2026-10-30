import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { SupabaseService } from './supabase';
import { getCurrentAppVersion } from './nativeUpdate';
import { PersistentSettingsService } from './persistentSettings';

const LS_KEY_INSTALL_ID = 'jtec_install_id';
const LS_KEY_LAST_PING = 'jtec_last_install_ping';
const LS_KEY_LAST_CONFIG_CHECK = 'jtec_last_min_version_check';
const LS_KEY_LAST_CONFIG_DATA = 'jtec_last_app_config_data';

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export const DEFAULT_FALLBACK_APK_URL =
  'https://github.com/fatormajohn999-gif/JTEC-music-studio-/releases/latest/download/JTEC-MUSIC.apk';

export interface AppConfigRow {
  id?: number;
  min_build: number;
  message?: string;
  notes?: string;
  apk_url?: string;
}

export interface MinVersionStatus {
  isBlocked: boolean;
  minBuild: number;
  message: string;
  notesBullets: string[];
  apkUrl: string;
  currentBuild: number;
  isWeb: boolean;
}

/**
 * Parses multi-line notes from app_config.notes (one bullet per line starting with "- ")
 */
export function parseConfigNotes(notesStr?: string | null): string[] {
  if (!notesStr || typeof notesStr !== 'string') return [];
  return notesStr
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^-\s*/, '').trim())
    .filter(Boolean);
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
 * Detects device info for install telemetry:
 * - On Android native: Device.getInfo() for model, manufacturer, and osVersion.
 * - On Web: browser family and operating system (e.g. "Chrome on Android").
 */
async function getDeviceTelemetryInfo(): Promise<{
  model: string;
  manufacturer: string;
  os: string;
  platform: 'android' | 'web' | 'ios';
}> {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await Device.getInfo();
      const p = Capacitor.getPlatform();
      const platform: 'android' | 'web' | 'ios' = p === 'ios' ? 'ios' : 'android';
      const model = info.model || (platform === 'android' ? 'Android Device' : 'iOS Device');
      const manufacturer = info.manufacturer || (platform === 'ios' ? 'Apple' : 'Android');
      const osVersion = info.osVersion ? ` ${info.osVersion}` : '';
      const os = info.operatingSystem === 'android' ? `Android${osVersion}` : `${info.operatingSystem || 'iOS'}${osVersion}`;
      return { model, manufacturer, os, platform };
    } catch {
      return {
        model: 'Android Device',
        manufacturer: 'Android',
        os: 'Android',
        platform: 'android',
      };
    }
  }

  // Web Browser & OS Detection
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  let browser = 'Browser';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';

  let osName = 'Web';
  if (/Android/i.test(ua)) osName = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) osName = 'iOS';
  else if (/Windows/i.test(ua)) osName = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) osName = 'macOS';
  else if (/Linux/i.test(ua)) osName = 'Linux';

  return {
    model: `${browser} on ${osName}`,
    manufacturer: browser,
    os: osName,
    platform: 'web',
  };
}

/**
 * Calls the Supabase RPC ping_install on the main JTEC Supabase source.
 * At most once every 24 hours (and on the first run, and immediately when device name changes).
 * Parameters sent:
 * - p_id: anonymous random UUID
 * - p_version: app version string
 * - p_build: app build integer
 * - p_platform: "android" | "web" | "ios"
 * - p_model: device model string
 * - p_manufacturer: device manufacturer string
 * - p_os: operating system string
 * - p_name: optional device name configured by user (or empty string)
 *
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
    const { model, manufacturer, os, platform } = await getDeviceTelemetryInfo();
    const deviceName = PersistentSettingsService.getDeviceNameSync() || '';

    const client = SupabaseService.getClientForCategory('jtec_main');
    if (!client) return;

    try {
      await client.rpc('ping_install', {
        p_id: installId,
        p_version: version,
        p_build: build,
        p_platform: platform,
        p_model: model,
        p_manufacturer: manufacturer,
        p_os: os,
        p_name: deviceName,
      });
    } catch (rpcErr: any) {
      // Fallback in case old RPC signature is active
      const errStr = String(rpcErr?.message || '');
      if (errStr.includes('function') || errStr.includes('parameters')) {
        await client.rpc('ping_install', {
          p_id: installId,
          p_version: version,
          p_build: build,
          p_platform: platform,
        });
      }
    }

    localStorage.setItem(LS_KEY_LAST_PING, String(now));
  } catch {
    // Ignore all errors silently
  }
}

// Listen to device name changes to ping immediately
if (typeof window !== 'undefined') {
  window.addEventListener('jtec:device-name-changed', () => {
    sendAnonymousPing(true).catch(() => {});
  });
}

/**
 * Checks minimum version from table app_config (id = 1).
 * Reads min_build, message, notes, and apk_url.
 * If the installed build is lower than min_build, marks isBlocked = true.
 * If the phone is offline, lets the app work normally.
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
              notesBullets: parseConfigNotes(parsed.notes),
              apkUrl: parsed.apk_url?.trim() || DEFAULT_FALLBACK_APK_URL,
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
      .select('id, min_build, message, notes, apk_url')
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
    const notesBullets = parseConfigNotes(data.notes);
    const apkUrl = data.apk_url ? String(data.apk_url).trim() : DEFAULT_FALLBACK_APK_URL;

    if (minBuild > 0 && currentBuild < minBuild) {
      return {
        isBlocked: true,
        minBuild,
        message,
        notesBullets,
        apkUrl: apkUrl || DEFAULT_FALLBACK_APK_URL,
        currentBuild,
        isWeb,
      };
    }

    return {
      isBlocked: false,
      minBuild,
      message,
      notesBullets,
      apkUrl: apkUrl || DEFAULT_FALLBACK_APK_URL,
      currentBuild,
      isWeb,
    };
  } catch {
    // If check fails, let the app work normally
    return null;
  }
}
