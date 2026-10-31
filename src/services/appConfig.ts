import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { SupabaseService } from './supabase';
import { getCurrentAppVersion, getInstalledBuildSync } from './nativeUpdate';

const LS_KEY_INSTALL_ID = 'jtec_install_id';
const LS_KEY_LAST_PING = 'jtec_last_install_ping';
const LS_KEY_LAST_CONFIG_CHECK = 'jtec_last_min_version_check';
const LS_KEY_LAST_CONFIG_DATA = 'jtec_last_app_config_data';
const LS_KEY_LAST_CONFIG_READ_TIME = 'jtec_last_min_version_read_time';
const LS_KEY_LAST_CONFIG_ERROR = 'jtec_last_min_version_error';
const LS_KEY_LAST_BACKGROUND = 'jtec_last_app_background_time';

const PING_DEBOUNCE_MS = 30 * 1000; // 30 seconds
const THIRTY_MINUTES_MS = 30 * 60 * 1000; // 30 minutes
const FIVE_MINUTES_MS = 5 * 60 * 1000; // 5 minutes

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

// In-memory last error cache for Developer Page
let lastMinVersionErrorMemory: string | null = null;

// Telemetry state in memory
let lastPingTimeMemory = 0;
let lastTouchTimeMemory = 0;
let stillHereTimer: any = null;
let isAppForegroundState = true;
let inMemoryBackgroundTimestamp = 0;

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

const LS_KEY_LAST_PING_NAME = 'jtec_last_ping_p_name';
const LS_KEY_LAST_PING_SUCCESS = 'jtec_last_ping_succeeded';
const LS_KEY_LAST_PING_TIMESTAMP = 'jtec_last_ping_timestamp';
const LS_KEY_LAST_PING_ERROR = 'jtec_last_ping_error';

export interface PingDiagnosticInfo {
  p_name: string | null;
  succeeded: boolean | null;
  timestamp: number | null;
  error: string | null;
}

/**
 * Reads the status, sent name, and timestamp of the last ping_install call.
 */
export function getLastPingDiagnosticInfo(): PingDiagnosticInfo {
  try {
    const name = localStorage.getItem(LS_KEY_LAST_PING_NAME);
    const successStr = localStorage.getItem(LS_KEY_LAST_PING_SUCCESS);
    const timeStr = localStorage.getItem(LS_KEY_LAST_PING_TIMESTAMP);
    const error = localStorage.getItem(LS_KEY_LAST_PING_ERROR);

    return {
      p_name: name || null,
      succeeded: successStr === 'true' ? true : successStr === 'false' ? false : null,
      timestamp: timeStr ? parseInt(timeStr, 10) : null,
      error: error || null,
    };
  } catch {
    return {
      p_name: null,
      succeeded: null,
      timestamp: null,
      error: null,
    };
  }
}

/**
 * Cleans and deduplicates manufacturer and model strings.
 * For example: "TECNO TECNO SPARK 20" -> "TECNO SPARK 20"
 * Never returns the word "unknown".
 */
export function cleanManufacturerAndModel(manufacturer?: string | null, model?: string | null): string {
  const mfg = (manufacturer || '').trim();
  const mdl = (model || '').trim();

  if (!mfg && !mdl) return 'Android Device';
  if (!mfg) return mdl;
  if (!mdl) return mfg;

  const raw = `${mfg} ${mdl}`;
  const tokens = raw.split(/\s+/).filter(Boolean);
  const deduped: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (i === 0) {
      deduped.push(token);
    } else {
      const prev = deduped[deduped.length - 1];
      if (prev.toLowerCase() === token.toLowerCase()) {
        if (token === token.toUpperCase() && prev !== prev.toUpperCase()) {
          deduped[deduped.length - 1] = token;
        }
      } else {
        deduped.push(token);
      }
    }
  }

  const result = deduped.join(' ').trim();
  return result || mfg || mdl || 'Android Device';
}

/**
 * Resolves the display and telemetry device name according to user priority:
 * (a) Device.getInfo().name when not empty and not just a repeat of the model
 * (b) Otherwise the text "<manufacturer> <model>" cleaned up without repeated words
 * Always returns a non-empty name and never the word "unknown".
 */
export function resolveDeviceDisplayName(
  rawName?: string | null,
  manufacturer?: string | null,
  model?: string | null,
  platform?: string | null
): string {
  const isAndroid = (platform || '').toLowerCase().includes('android') || Capacitor.isNativePlatform();
  const cleanedMfgModel = cleanManufacturerAndModel(manufacturer, model);
  const trimmedName = (rawName || '').trim();
  const trimmedModel = (model || '').trim();

  if (trimmedName.length > 0) {
    const nameLower = trimmedName.toLowerCase();
    const modelLower = trimmedModel.toLowerCase();
    const cleanedLower = cleanedMfgModel.toLowerCase();

    // Check if name is NOT just a repeat of model or manufacturer+model
    const isRepeat =
      nameLower === modelLower ||
      nameLower === cleanedLower ||
      (modelLower.length > 0 && nameLower === `${(manufacturer || '').toLowerCase()} ${modelLower}`.trim()) ||
      (modelLower.length > 0 && modelLower.includes(nameLower) && modelLower.length <= nameLower.length + 3);

    if (!isRepeat && nameLower !== 'unknown' && nameLower !== 'unnamed') {
      return trimmedName;
    }
  }

  if (cleanedMfgModel && cleanedMfgModel.toLowerCase() !== 'unknown') {
    return cleanedMfgModel;
  }

  return isAndroid ? 'Android Device' : 'Web Client';
}

/**
 * Detects device info for install telemetry:
 * - On Android native: Device.getInfo() for model, manufacturer, osVersion, and automatic device name.
 * - On Web: browser family, OS, and browser-based client name.
 * Always returns a non-empty name and never the word "unknown".
 */
async function getDeviceTelemetryInfo(): Promise<{
  model: string;
  manufacturer: string;
  os: string;
  platform: 'android' | 'web' | 'ios';
  name: string;
}> {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await Device.getInfo();
      const p = Capacitor.getPlatform();
      const platform: 'android' | 'web' | 'ios' = p === 'ios' ? 'ios' : 'android';
      const manufacturer = (info.manufacturer || (platform === 'ios' ? 'Apple' : 'Android')).trim();
      const model = (info.model || (platform === 'android' ? 'Android Device' : 'iOS Device')).trim();
      const osVersion = info.osVersion ? ` ${info.osVersion.trim()}` : '';
      const os = info.operatingSystem === 'android' ? `Android${osVersion}` : `${info.operatingSystem || 'iOS'}${osVersion}`;

      // (a) Device.getInfo().name when not empty and not repeat of model
      // (b) otherwise "<manufacturer> <model>" cleaned without repeated words
      const name = resolveDeviceDisplayName(info.name, manufacturer, model, platform);

      return { model, manufacturer, os, platform, name };
    } catch {
      return {
        model: 'Android Device',
        manufacturer: 'Android',
        os: 'Android',
        platform: 'android',
        name: 'Android Device',
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

  const webName = `${browser} on ${osName}`;

  return {
    model: webName,
    manufacturer: browser,
    os: osName,
    platform: 'web',
    name: webName,
  };
}

/**
 * Calls the Supabase RPC ping_install on the main JTEC Supabase source.
 * - Adds 1 to "opens"
 * - Called at every cold start, and when returning to foreground after >= 30 minutes away
 * - Ignores calls within 30 seconds of the previous call (dedup / throttle)
 * - Sends non-empty p_name with (a) phone name or (b) cleaned <manufacturer> <model>
 * - Tracks diagnostic status in storage for Developer Page
 * - Never blocks the app, ignores errors silently.
 */
export async function sendAnonymousPing(force = false): Promise<void> {
  try {
    const now = Date.now();
    const lastPingStr = localStorage.getItem(LS_KEY_LAST_PING);
    const lastPingStorage = lastPingStr ? parseInt(lastPingStr, 10) || 0 : 0;
    const lastPing = Math.max(lastPingTimeMemory, lastPingStorage);

    // Ignore a second call within 30 seconds of the previous one (unless forced, e.g. cold start)
    if (!force && lastPing > 0 && now - lastPing < PING_DEBOUNCE_MS) {
      return;
    }

    lastPingTimeMemory = now;
    try {
      localStorage.setItem(LS_KEY_LAST_PING, String(now));
    } catch {}

    const installId = getOrCreateInstallId();
    const { version, build } = await getCurrentAppVersion();
    const { model, manufacturer, os, platform, name } = await getDeviceTelemetryInfo();

    // Store diagnostic attempt
    try {
      localStorage.setItem(LS_KEY_LAST_PING_NAME, name);
      localStorage.setItem(LS_KEY_LAST_PING_TIMESTAMP, String(now));
    } catch {}

    const client = SupabaseService.getClientForCategory('jtec_main');
    if (!client) {
      try {
        localStorage.setItem(LS_KEY_LAST_PING_SUCCESS, 'false');
        localStorage.setItem(LS_KEY_LAST_PING_ERROR, 'No Supabase client available');
      } catch {}
      return;
    }

    try {
      const { error: rpcError } = await client.rpc('ping_install', {
        p_id: installId,
        p_version: version,
        p_build: build,
        p_platform: platform,
        p_model: model,
        p_manufacturer: manufacturer,
        p_os: os,
        p_name: name,
      });

      if (rpcError) {
        throw rpcError;
      }

      try {
        localStorage.setItem(LS_KEY_LAST_PING_SUCCESS, 'true');
        localStorage.removeItem(LS_KEY_LAST_PING_ERROR);
      } catch {}
    } catch (rpcErr: any) {
      // Fallback in case older RPC signature without p_name is active
      const errStr = String(rpcErr?.message || '');
      let fallbackSuccess = false;
      if (errStr.includes('function') || errStr.includes('parameters')) {
        try {
          const { error: fbErr } = await client.rpc('ping_install', {
            p_id: installId,
            p_version: version,
            p_build: build,
            p_platform: platform,
          });
          if (!fbErr) fallbackSuccess = true;
        } catch {}
      }

      try {
        localStorage.setItem(LS_KEY_LAST_PING_SUCCESS, fallbackSuccess ? 'true' : 'false');
        localStorage.setItem(LS_KEY_LAST_PING_ERROR, errStr || 'RPC ping error');
      } catch {}
    }
  } catch {
    // Ignore all errors silently, never block app
  }
}

/**
 * Calls the Supabase RPC touch_install with p_id (the random anonymous install ID).
 * Only updates last_seen in the database without adding to "opens".
 * Non-blocking, ignores all errors silently.
 */
export async function touchInstall(): Promise<void> {
  try {
    const now = Date.now();
    if (now - lastTouchTimeMemory < 3000) return;
    lastTouchTimeMemory = now;

    const installId = getOrCreateInstallId();
    const client = SupabaseService.getClientForCategory('jtec_main');
    if (!client) return;

    await client.rpc('touch_install', {
      p_id: installId,
    });
  } catch {
    // Ignore all errors silently
  }
}

/**
 * Starts the 5-minute still-here heartbeat while the app is visible.
 * Calls touch_install every 5 minutes.
 */
export function startStillHereHeartbeat(): void {
  stopStillHereHeartbeat();
  heartbeatTimerSetup();
}

function heartbeatTimerSetup(): void {
  stillHereTimer = setInterval(() => {
    if (isAppForegroundState && (typeof document === 'undefined' || document.visibilityState === 'visible')) {
      touchInstall();
    }
  }, FIVE_MINUTES_MS);
}

/**
 * Stops the still-here heartbeat (e.g. when app goes to background).
 */
export function stopStillHereHeartbeat(): void {
  if (stillHereTimer) {
    clearInterval(stillHereTimer);
    stillHereTimer = null;
  }
}

/**
 * Called when the app moves to the background (app minimized / tab hidden).
 * Stops the 5-minute still-here heartbeat and remembers the background timestamp.
 */
export function handleAppBackground(): void {
  if (!isAppForegroundState) return;
  isAppForegroundState = false;
  const now = Date.now();
  inMemoryBackgroundTimestamp = now;
  try {
    localStorage.setItem(LS_KEY_LAST_BACKGROUND, String(now));
  } catch {}
  stopStillHereHeartbeat();
}

/**
 * Called when the app returns to the foreground.
 * - If away for 30 minutes or more: calls sendAnonymousPing() (adds 1 to opens).
 * - If away for less than 30 minutes: calls touchInstall() once.
 * - Resumes the 5-minute still-here heartbeat while visible.
 */
export function handleAppForeground(): void {
  if (isAppForegroundState) return;
  isAppForegroundState = true;

  let bgTime = inMemoryBackgroundTimestamp;
  if (!bgTime) {
    try {
      const stored = localStorage.getItem(LS_KEY_LAST_BACKGROUND);
      if (stored) bgTime = parseInt(stored, 10) || 0;
    } catch {}
  }

  const now = Date.now();
  const elapsed = bgTime > 0 ? now - bgTime : 0;

  inMemoryBackgroundTimestamp = 0;
  try {
    localStorage.removeItem(LS_KEY_LAST_BACKGROUND);
  } catch {}

  if (bgTime > 0 && elapsed >= THIRTY_MINUTES_MS) {
    sendAnonymousPing();
  } else {
    touchInstall();
  }

  startStillHereHeartbeat();
}

/**
 * Synchronously checks if a cached minimum version from local storage blocks
 * this app launch immediately before any network request completes.
 */
export function getSavedMinVersionStatusSync(): MinVersionStatus | null {
  try {
    const cached = localStorage.getItem(LS_KEY_LAST_CONFIG_DATA);
    if (!cached) return null;

    const parsed = JSON.parse(cached) as AppConfigRow;
    const minBuild = Number(parsed.min_build) || 0;
    const currentBuild = getInstalledBuildSync();
    const isWeb = !Capacitor.isNativePlatform();

    if (minBuild > 0 && currentBuild < minBuild) {
      return {
        isBlocked: true,
        minBuild,
        message: parsed.message ? String(parsed.message).trim() : 'An update is required to continue using JTEC MUSIC.',
        notesBullets: parseConfigNotes(parsed.notes),
        apkUrl: parsed.apk_url?.trim() || DEFAULT_FALLBACK_APK_URL,
        currentBuild,
        isWeb,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Checks minimum version from table app_config (id = 1).
 * Reads min_build, message, notes, and apk_url.
 *
 * Rules:
 * - At EVERY app launch (isForegroundCheck = false): runs immediately with NO waiting period.
 * - When returning to the foreground (isForegroundCheck = true): throttled to at most once every 5 minutes.
 * - If currentBuild < minBuild: returns isBlocked = true.
 * - If cloud min_build has changed and app is no longer blocked: returns isBlocked = false.
 * - If offline: lets the app work normally.
 * - Records errors for the Developer Page.
 */
export async function checkMinimumVersion(isForegroundCheck = false): Promise<MinVersionStatus | null> {
  try {
    const isWeb = !Capacitor.isNativePlatform();
    const now = Date.now();
    const lastCheckStr = localStorage.getItem(LS_KEY_LAST_CONFIG_CHECK);
    const lastCheck = lastCheckStr ? parseInt(lastCheckStr, 10) : 0;

    const { build: currentBuild } = await getCurrentAppVersion();

    // Check foreground throttle (5 minutes)
    if (isForegroundCheck && lastCheck > 0 && now - lastCheck < FIVE_MINUTES_MS) {
      return getSavedMinVersionStatusSync();
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Offline: let app work normally
      return null;
    }

    const client = SupabaseService.getClientForCategory('jtec_main');
    if (!client) {
      lastMinVersionErrorMemory = 'No Supabase client available for jtec_main';
      try {
        localStorage.setItem(LS_KEY_LAST_CONFIG_ERROR, lastMinVersionErrorMemory);
      } catch {}
      return null;
    }

    const { data, error } = await client
      .from('app_config')
      .select('id, min_build, message, notes, apk_url')
      .eq('id', 1)
      .maybeSingle();

    if (error) {
      lastMinVersionErrorMemory = error.message || error.code || 'Query error';
      try {
        localStorage.setItem(LS_KEY_LAST_CONFIG_ERROR, lastMinVersionErrorMemory);
      } catch {}
      return null;
    }

    if (!data) {
      lastMinVersionErrorMemory = 'No row with id=1 found in app_config';
      try {
        localStorage.setItem(LS_KEY_LAST_CONFIG_ERROR, lastMinVersionErrorMemory);
      } catch {}
      return null;
    }

    // Success! Clear error
    lastMinVersionErrorMemory = null;
    try {
      localStorage.removeItem(LS_KEY_LAST_CONFIG_ERROR);
      localStorage.setItem(LS_KEY_LAST_CONFIG_CHECK, String(now));
      localStorage.setItem(LS_KEY_LAST_CONFIG_READ_TIME, String(now));
      localStorage.setItem(LS_KEY_LAST_CONFIG_DATA, JSON.stringify(data));
    } catch {}

    const minBuild = Number(data.min_build) || 0;
    const message = data.message ? String(data.message).trim() : 'An update is required to continue using JTEC MUSIC.';
    const notesBullets = parseConfigNotes(data.notes);
    const apkUrl = data.apk_url ? String(data.apk_url).trim() : DEFAULT_FALLBACK_APK_URL;

    const isBlocked = minBuild > 0 && currentBuild < minBuild;

    return {
      isBlocked,
      minBuild,
      message,
      notesBullets,
      apkUrl: apkUrl || DEFAULT_FALLBACK_APK_URL,
      currentBuild,
      isWeb,
    };
  } catch (err: any) {
    lastMinVersionErrorMemory = err?.message || String(err) || 'Unexpected error';
    try {
      localStorage.setItem(LS_KEY_LAST_CONFIG_ERROR, lastMinVersionErrorMemory);
    } catch {}
    // If check fails, let the app work normally
    return null;
  }
}

/**
 * Returns diagnostic info regarding the device's minimum version check status
 * for display in the hidden Developer Page.
 */
export function getMinVersionDiagnosticInfo(): {
  minBuild: number | null;
  lastReadTime: number | null;
  lastError: string | null;
  isBlocked: boolean;
} {
  try {
    let minBuild: number | null = null;
    const cachedData = localStorage.getItem(LS_KEY_LAST_CONFIG_DATA);
    if (cachedData) {
      try {
        const parsed = JSON.parse(cachedData);
        if (parsed?.min_build !== undefined && parsed?.min_build !== null) {
          minBuild = Number(parsed.min_build);
        }
      } catch {}
    }

    const readTimeStr = localStorage.getItem(LS_KEY_LAST_CONFIG_READ_TIME);
    const lastReadTime = readTimeStr ? parseInt(readTimeStr, 10) : null;
    const lastError = lastMinVersionErrorMemory || localStorage.getItem(LS_KEY_LAST_CONFIG_ERROR) || null;

    const currentBuild = getInstalledBuildSync();
    const isBlocked = minBuild !== null && minBuild > 0 && currentBuild < minBuild;

    return {
      minBuild,
      lastReadTime,
      lastError,
      isBlocked,
    };
  } catch {
    return {
      minBuild: null,
      lastReadTime: null,
      lastError: null,
      isBlocked: false,
    };
  }
}
