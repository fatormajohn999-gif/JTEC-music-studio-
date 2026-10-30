import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Network } from '@capacitor/network';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { APP_VERSION } from '../version';

export const LATEST_JSON_URL =
  'https://github.com/fatormajohn999-gif/JTEC-music-studio-/releases/latest/download/latest.json';

export const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/fatormajohn999-gif/JTEC-music-studio-/releases/latest';

export const APK_DOWNLOAD_URL =
  'https://github.com/fatormajohn999-gif/JTEC-music-studio-/releases/latest/download/JTEC-MUSIC.apk';

const LS_KEY_LAST_CHECK = 'jtec_last_native_update_check';
const LS_KEY_LAST_FAILED_CHECK = 'jtec_last_native_update_failed_check';
const LS_KEY_CACHED_PENDING_UPDATE = 'jtec_cached_pending_update';
const LS_KEY_DISMISSED_UNTIL = 'jtec_native_update_dismissed_until';
const LS_KEY_LAST_RUN_BUILD = 'jtec_last_run_build';
const LS_KEY_SAVED_RELEASE_NOTES = 'jtec_saved_release_notes';
const LS_KEY_SAVED_RELEASE_VERSION = 'jtec_saved_release_version';

const TWENTY_MINUTES_MS = 20 * 60 * 1000;
const TWO_MINUTES_MS = 2 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export type UpdateCheckErrorReason =
  | 'offline'
  | 'timeout'
  | 'rate-limited'
  | 'server'
  | 'not-found'
  | 'unknown';

export class UpdateCheckError extends Error {
  reason: UpdateCheckErrorReason;
  statusCode?: number;

  constructor(reason: UpdateCheckErrorReason, statusCode?: number, message?: string) {
    super(message || reason);
    this.name = 'UpdateCheckError';
    this.reason = reason;
    this.statusCode = statusCode;
  }
}

export interface NativeUpdateInfo {
  hasUpdate: boolean;
  versionName: string;
  latestBuild: number;
  currentBuild: number;
  currentVersionName: string;
  downloadUrl: string;
  fileSizeBytes: number;
  formattedSize: string;
  notesBullets: string[];
  isRequired: boolean;
  rawBody: string;
  source?: 'latest.json' | 'github-api';

  // Error information if update check could not complete
  error?: UpdateCheckErrorReason;
  statusCode?: number;
  errorMessage?: string;
  reasonCode?: string;
}

/**
 * Format raw bytes into human readable string (e.g. "9.4 MB").
 */
export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

/**
 * Parses release body notes:
 * - Each line starting with "- " or "* " is a bullet (max 5).
 * - Checks if notes contain "[required]" tag (case-insensitive).
 */
export function parseReleaseNotes(body: string | undefined | null): {
  bullets: string[];
  isRequired: boolean;
} {
  if (!body || typeof body !== 'string') {
    return { bullets: [], isRequired: false };
  }

  const isRequired = body.toLowerCase().includes('[required]');
  const lines = body.split(/\r?\n/);
  const bullets: string[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      const clean = trimmed
        .replace(/^[-*]\s*/, '')
        .replace(/\[required\]/gi, '')
        .trim();
      if (clean) {
        bullets.push(clean);
        if (bullets.length >= 5) break;
      }
    }
  }

  // Fallback if no bullet points were formatted
  if (bullets.length === 0 && body.trim()) {
    const single = body.replace(/\[required\]/gi, '').trim();
    if (single) {
      bullets.push(single.slice(0, 140));
    }
  }

  return { bullets, isRequired };
}

/**
 * Parses the release tag (e.g. "v1.0.45" or "1.0.45") and computes:
 * latestBuild = 100 + the last number of the tag. (tag "v1.0.45" means build 145).
 */
export function parseTagBuildNumber(tagName: string): { versionName: string; latestBuild: number } | null {
  if (!tagName || typeof tagName !== 'string') return null;
  const clean = tagName.trim();
  const match = clean.match(/(\d+)(?!.*\d)/);
  if (!match) return null;
  const lastNum = parseInt(match[1], 10);
  if (isNaN(lastNum)) return null;
  return {
    versionName: clean,
    latestBuild: 100 + lastNum,
  };
}

/**
 * Reads real version and build number:
 * - When native (Capacitor.isNativePlatform()), reads from App.getInfo().
 * - On web, uses build-time values already in the project.
 */
export async function getCurrentAppVersion(): Promise<{
  version: string;
  build: number;
  formattedTag: string;
}> {
  let version = '1.0.1';
  let build = 101;

  if (Capacitor.isNativePlatform()) {
    try {
      const info = await App.getInfo();
      if (info.version) {
        version = info.version;
      }
      if (info.build) {
        const parsedBuild = parseInt(info.build, 10);
        if (!isNaN(parsedBuild) && parsedBuild > 0) {
          build = parsedBuild;
        }
      }
    } catch (e) {
      console.warn('[NativeUpdate] Could not read App.getInfo():', e);
    }
  } else {
    const match = APP_VERSION.match(/^([^(]+)(?:\s*\(Build\s*(\d+)\))?/i);
    if (match) {
      version = match[1].trim();
      if (match[2]) {
        const parsedBuild = parseInt(match[2], 10);
        if (!isNaN(parsedBuild)) build = parsedBuild;
      }
    } else {
      version = APP_VERSION.trim();
    }
  }

  const formattedTag = version.startsWith('v') ? version : `v${version}`;
  return { version, build, formattedTag };
}

/**
 * Checks if the current network connection is cellular data.
 */
export async function isCellularConnection(): Promise<boolean> {
  try {
    const status = await Network.getStatus();
    return status.connectionType === 'cellular';
  } catch {
    return false;
  }
}

/**
 * Checks if device is currently connected to the internet.
 */
export async function isDeviceOnline(): Promise<boolean> {
  try {
    const status = await Network.getStatus();
    return status.connected;
  } catch {
    return navigator.onLine;
  }
}

/**
 * Low-level HTTP request helper:
 * - On native Android: uses CapacitorHttp (native HTTP requests, following redirects, no CORS/WebView limits).
 * - On web: uses fetch with an AbortController 15-second timeout.
 */
async function makeHttpRequest(url: string, timeoutMs = 15000): Promise<{ status: number; data: any }> {
  if (Capacitor.isNativePlatform()) {
    try {
      const response = await CapacitorHttp.get({
        url,
        headers: {
          Accept: 'application/json, application/vnd.github.v3+json, text/plain, */*',
        },
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
      });

      let responseData = response.data;
      if (typeof responseData === 'string') {
        try {
          responseData = JSON.parse(responseData);
        } catch {
          // Leave as string if not JSON
        }
      }

      return {
        status: response.status,
        data: responseData,
      };
    } catch (err: any) {
      const msg = String(err?.message || err || '').toLowerCase();
      if (msg.includes('timeout') || msg.includes('timed out')) {
        throw new UpdateCheckError('timeout', undefined, 'Request timed out');
      }
      if (msg.includes('offline') || msg.includes('network') || msg.includes('no internet')) {
        throw new UpdateCheckError('offline', undefined, "You're offline.");
      }
      throw err;
    }
  } else {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json, application/vnd.github.v3+json, text/plain, */*',
        },
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);

      let data: any = null;
      const text = await response.text();
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }

      return {
        status: response.status,
        data,
      };
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError' || String(err).includes('aborted')) {
        throw new UpdateCheckError('timeout', undefined, 'Request timed out');
      }
      throw err;
    }
  }
}

/**
 * Executes a request with a 15-second timeout and 1 retry after 2 seconds.
 */
async function fetchWithRetry(url: string, isLatestJson: boolean): Promise<{ status: number; data: any }> {
  let lastError: any = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await makeHttpRequest(url, 15000);

      // If latest.json returns 404, it means the asset does not exist on this release. Skip retry, fall back immediately.
      if (isLatestJson && res.status === 404) {
        throw new UpdateCheckError('not-found', 404, 'latest.json not found in release');
      }

      // Successful HTTP response
      if (res.status >= 200 && res.status < 300) {
        return res;
      }

      // Rate limited
      if (res.status === 403 || res.status === 429) {
        throw new UpdateCheckError('rate-limited', res.status, `Rate limit reached (${res.status})`);
      }

      // Server error or other status
      throw new UpdateCheckError('server', res.status, `Server error ${res.status}`);
    } catch (err: any) {
      lastError = err;
      // If latest.json returned 404, do not wait 2 seconds, immediately bubble up to fallback
      if (err instanceof UpdateCheckError && err.reason === 'not-found') {
        throw err;
      }
      // If attempt 1 failed, wait 2 seconds before retry
      if (attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }
  throw lastError;
}

export const NativeUpdateService = {
  /**
   * Reads any currently cached pending update from localStorage.
   * If the installed build is already >= cached build, clears the cache and returns null.
   */
  getCachedPendingUpdateSync(): NativeUpdateInfo | null {
    try {
      const raw = localStorage.getItem(LS_KEY_CACHED_PENDING_UPDATE);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.hasUpdate || !parsed.latestBuild) return null;

      const match = APP_VERSION.match(/^([^(]+)(?:\s*\(Build\s*(\d+)\))?/i);
      let currentBuild = 101;
      if (match && match[2]) {
        const b = parseInt(match[2], 10);
        if (!isNaN(b)) currentBuild = b;
      }
      if (parsed.latestBuild <= currentBuild) {
        localStorage.removeItem(LS_KEY_CACHED_PENDING_UPDATE);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  },

  /**
   * Clears any cached pending update.
   */
  clearCachedPendingUpdate(): void {
    try {
      localStorage.removeItem(LS_KEY_CACHED_PENDING_UPDATE);
    } catch {}
  },

  /**
   * Checks for an Android APK release.
   * - Reads latest.json FIRST.
   * - On Android, uses CapacitorHttp (native, no WebView fetch, handles redirects). On Web, uses fetch.
   * - If latest.json cannot be read, falls back to GitHub API (also via CapacitorHttp on Android).
   * - Saves last check time ONLY after a SUCCESSFUL check.
   * - 20 minute limit for automatic checks. Failed checks can retry after 2 minutes. Manual checks always run.
   * - Returns clear error reasons ("offline", "timeout", "rate-limited", "server" with status code).
   */
  async checkForUpdate(manual = false): Promise<NativeUpdateInfo | null> {
    const appInfo = await getCurrentAppVersion();
    const currentBuild = appInfo.build;
    const currentVersionName = appInfo.version;

    // 1. Check network connection first
    const online = await isDeviceOnline();
    if (!online) {
      if (!manual) {
        try {
          localStorage.setItem(LS_KEY_LAST_FAILED_CHECK, String(Date.now()));
        } catch {}
      }
      return {
        hasUpdate: false,
        versionName: currentVersionName,
        latestBuild: currentBuild,
        currentBuild,
        currentVersionName,
        downloadUrl: APK_DOWNLOAD_URL,
        fileSizeBytes: 0,
        formattedSize: '',
        notesBullets: [],
        isRequired: false,
        rawBody: '',
        error: 'offline',
        errorMessage: "You're offline.",
        reasonCode: undefined,
      };
    }

    // 2. Throttle check for automatic checks (manual checks from Settings always run)
    const now = Date.now();
    if (!manual) {
      try {
        const lastCheck = parseInt(localStorage.getItem(LS_KEY_LAST_CHECK) || '0', 10);
        if (now - lastCheck < TWENTY_MINUTES_MS) {
          // Within 20 minute throttle
          return NativeUpdateService.getCachedPendingUpdateSync();
        }
        const lastFailed = parseInt(localStorage.getItem(LS_KEY_LAST_FAILED_CHECK) || '0', 10);
        if (now - lastFailed < TWO_MINUTES_MS) {
          // Failed check can retry after 2 minutes
          return NativeUpdateService.getCachedPendingUpdateSync();
        }
      } catch {
        // Ignore localStorage read errors
      }
    }

    let updateFound: NativeUpdateInfo | null = null;
    let lastFailureReason: UpdateCheckErrorReason = 'server';
    let lastStatusCode: number | undefined = undefined;

    // 3. SOURCE 1: Read latest.json FIRST
    try {
      const res = await fetchWithRetry(LATEST_JSON_URL, true);
      const data = res.data;
      if (data && (typeof data.build === 'number' || data.tag || data.versionName)) {
        let buildNum = 0;
        if (typeof data.build === 'number' && !isNaN(data.build) && data.build > 0) {
          buildNum = data.build;
        } else if (data.tag || data.versionName) {
          buildNum = parseTagBuildNumber(data.tag || data.versionName)?.latestBuild || 0;
        }

        const verName = data.versionName || data.tag || `Build ${buildNum}`;
        const sizeBytes = typeof data.sizeBytes === 'number' && data.sizeBytes > 0 ? data.sizeBytes : 0;
        const bullets: string[] = Array.isArray(data.notes)
          ? data.notes.map((n: any) => String(n).trim()).filter(Boolean).slice(0, 5)
          : [];
        const isRequired = Boolean(data.required);
        const downloadUrl = data.apkUrl || APK_DOWNLOAD_URL;

        updateFound = {
          hasUpdate: buildNum > currentBuild,
          versionName: verName,
          latestBuild: buildNum,
          currentBuild,
          currentVersionName,
          downloadUrl,
          fileSizeBytes: sizeBytes,
          formattedSize: formatBytes(sizeBytes),
          notesBullets: bullets,
          isRequired,
          rawBody: Array.isArray(data.notes) ? data.notes.join('\n') : '',
          source: 'latest.json',
        };
      }
    } catch (err: any) {
      if (err instanceof UpdateCheckError) {
        if (err.reason !== 'not-found') {
          lastFailureReason = err.reason;
          lastStatusCode = err.statusCode;
        }
      }
    }

    // 4. SOURCE 2: Fallback to GitHub API (also via CapacitorHttp on Android)
    if (!updateFound) {
      try {
        const res = await fetchWithRetry(GITHUB_LATEST_RELEASE_URL, false);
        const releaseData = res.data;
        const tagName: string = releaseData?.tag_name || '';
        const rawBody: string = releaseData?.body || '';
        const assets: any[] = Array.isArray(releaseData?.assets) ? releaseData.assets : [];

        const apkAsset =
          assets.find((a) => a.name && a.name.toLowerCase() === 'jtec-music.apk') ||
          assets.find((a) => a.name && a.name.toLowerCase().endsWith('.apk'));

        const downloadUrl = apkAsset?.browser_download_url || APK_DOWNLOAD_URL;
        const fileSizeBytes = apkAsset?.size || 0;
        const formattedSize = formatBytes(fileSizeBytes);
        const { bullets: notesBullets, isRequired } = parseReleaseNotes(rawBody);

        const parsed = parseTagBuildNumber(tagName);
        const latestBuild = parsed?.latestBuild || 0;
        const versionName = parsed?.versionName || tagName || 'latest';

        updateFound = {
          hasUpdate: latestBuild > currentBuild,
          versionName,
          latestBuild,
          currentBuild,
          currentVersionName,
          downloadUrl,
          fileSizeBytes,
          formattedSize,
          notesBullets,
          isRequired,
          rawBody,
          source: 'github-api',
        };
      } catch (err: any) {
        if (err instanceof UpdateCheckError) {
          lastFailureReason = err.reason;
          lastStatusCode = err.statusCode;
        } else {
          lastFailureReason = 'server';
        }
      }
    }

    // 5. SUCCESSFUL CHECK
    if (updateFound) {
      try {
        localStorage.setItem(LS_KEY_LAST_CHECK, String(now));
        localStorage.removeItem(LS_KEY_LAST_FAILED_CHECK);
      } catch {}

      if (updateFound.hasUpdate) {
        try {
          localStorage.setItem(LS_KEY_CACHED_PENDING_UPDATE, JSON.stringify(updateFound));
          localStorage.setItem(LS_KEY_SAVED_RELEASE_NOTES, JSON.stringify(updateFound.notesBullets));
          localStorage.setItem(LS_KEY_SAVED_RELEASE_VERSION, updateFound.versionName);
        } catch {}
      } else {
        // App is already up to date, clear any stale cached pending update
        try {
          localStorage.removeItem(LS_KEY_CACHED_PENDING_UPDATE);
        } catch {}
      }

      return updateFound;
    }

    // 6. FAILED CHECK
    try {
      localStorage.setItem(LS_KEY_LAST_FAILED_CHECK, String(now));
    } catch {}

    const isRateLimited = lastFailureReason === 'rate-limited';
    const isTimeout = lastFailureReason === 'timeout';
    const reasonCode = lastStatusCode
      ? `Code: ${lastStatusCode}`
      : isRateLimited
      ? 'Code: 403'
      : isTimeout
      ? 'Code: timeout'
      : `Code: ${lastFailureReason}`;

    return {
      hasUpdate: false,
      versionName: currentVersionName,
      latestBuild: currentBuild,
      currentBuild,
      currentVersionName,
      downloadUrl: APK_DOWNLOAD_URL,
      fileSizeBytes: 0,
      formattedSize: '',
      notesBullets: [],
      isRequired: false,
      rawBody: '',
      error: lastFailureReason,
      statusCode: lastStatusCode,
      errorMessage: "Couldn't check right now. Check your internet.",
      reasonCode,
    };
  },

  /**
   * Downloads the APK file into Cache Directory (update/JTEC-MUSIC.apk)
   * with progress tracking and size verification.
   */
  async downloadApk(options: {
    downloadUrl: string;
    expectedSizeBytes?: number;
    onProgress?: (progressPct: number, downloadedBytes: number, totalBytes: number) => void;
  }): Promise<string> {
    const { downloadUrl, expectedSizeBytes = 0, onProgress } = options;

    if (!Capacitor.isNativePlatform()) {
      throw new Error('Native download is only supported on Android devices');
    }

    // 1. Delete previous APK file if exists (ignore errors if it doesn't exist)
    try {
      await Filesystem.deleteFile({
        path: 'update/JTEC-MUSIC.apk',
        directory: Directory.Cache,
      });
    } catch {
      // Ignored if file does not exist
    }

    // 2. Before downloading, create the folder: Filesystem.mkdir({ path: 'update', directory: Directory.Cache, recursive: true }), and ignore the error if it already exists
    try {
      await Filesystem.mkdir({
        path: 'update',
        directory: Directory.Cache,
        recursive: true,
      });
    } catch {
      // Ignored if it already exists
    }

    // 3. Setup progress listener
    let progressHandle: { remove: () => Promise<void> } | null = null;
    try {
      progressHandle = await Filesystem.addListener('progress', (status) => {
        const total = status.contentLength > 0 ? status.contentLength : expectedSizeBytes;
        const current = status.bytes || 0;
        let pct = 0;
        if (total > 0) {
          pct = Math.min(100, Math.max(0, Math.round((current / total) * 100)));
        }
        if (onProgress) {
          onProgress(pct, current, total);
        }
      });
    } catch (e) {
      console.warn('[NativeUpdate] Progress listener setup failed:', e);
    }

    try {
      // 4. Download the file via Capacitor Filesystem passing recursive: true
      await Filesystem.downloadFile({
        url: downloadUrl,
        path: 'update/JTEC-MUSIC.apk',
        directory: Directory.Cache,
        progress: true,
        recursive: true,
      });

      // 5. After download: check that the file exists and that its size matches the release asset size
      const stat = await Filesystem.stat({
        path: 'update/JTEC-MUSIC.apk',
        directory: Directory.Cache,
      });

      if (!stat || stat.size <= 0) {
        throw new Error('Downloaded APK file does not exist or is empty.');
      }

      if (expectedSizeBytes > 0 && stat.size !== expectedSizeBytes) {
        throw new Error(
          `Downloaded APK size (${stat.size} bytes) does not match release asset size (${expectedSizeBytes} bytes).`
        );
      }

      // 6. Get the file's real address with Filesystem.getUri and return it for the installer
      const uriResult = await Filesystem.getUri({
        path: 'update/JTEC-MUSIC.apk',
        directory: Directory.Cache,
      });

      return uriResult.uri;
    } finally {
      if (progressHandle) {
        await progressHandle.remove().catch(() => {});
      }
    }
  },

  /**
   * Opens the downloaded APK file with the system package installer.
   */
  async installDownloadedApk(apkUri?: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    try {
      let uri = apkUri;
      if (!uri) {
        const uriResult = await Filesystem.getUri({
          path: 'update/JTEC-MUSIC.apk',
          directory: Directory.Cache,
        });
        uri = uriResult.uri;
      }

      const stat = await Filesystem.stat({
        path: 'update/JTEC-MUSIC.apk',
        directory: Directory.Cache,
      });

      if (!stat || stat.size <= 0) {
        throw new Error('APK file not found or empty when attempting install');
      }

      // Open with FileOpener
      await FileOpener.openFile({
        path: uri,
        mimeType: 'application/vnd.android.package-archive',
      });
    } catch (err) {
      console.error('[NativeUpdate] Technical details of installation error:', err);
      throw err;
    }
  },

  /**
   * Opens the direct APK download URL in the browser via AppLauncher.openUrl.
   */
  async openBrowserDownload(customUrl?: string): Promise<void> {
    const targetUrl = customUrl?.trim() || APK_DOWNLOAD_URL;
    try {
      if (Capacitor.isNativePlatform()) {
        await AppLauncher.openUrl({ url: targetUrl });
      } else {
        window.open(targetUrl, '_blank');
      }
    } catch (err) {
      console.error('[NativeUpdate] AppLauncher openUrl error:', err);
      try {
        window.open(targetUrl, '_blank');
      } catch (fallbackErr) {
        console.error('[NativeUpdate] window.open fallback error:', fallbackErr);
      }
    }
  },

  /**
   * Deletes cached APK file.
   */
  async cleanCachedApk(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try {
      await Filesystem.deleteFile({
        path: 'update/JTEC-MUSIC.apk',
        directory: Directory.Cache,
      });
    } catch {
      // Ignored
    }
  },

  /**
   * Checks if app was updated since previous run.
   * If so, returns the release notes to show in the "What's new" sheet.
   */
  async checkPostUpdate(): Promise<{
    showWhatsNew: boolean;
    versionName: string;
    notesBullets: string[];
  } | null> {
    try {
      const appInfo = await getCurrentAppVersion();
      const currentBuild = appInfo.build;
      const rawStored = localStorage.getItem(LS_KEY_LAST_RUN_BUILD);

      if (!rawStored) {
        // First run on this install: set initial build, don't show What's new modal
        localStorage.setItem(LS_KEY_LAST_RUN_BUILD, String(currentBuild));
        return null;
      }

      const previousBuild = parseInt(rawStored, 10);
      if (!isNaN(previousBuild) && currentBuild > previousBuild) {
        // Upgraded to a newer build!
        let savedNotes: string[] = [];
        let savedVersion = appInfo.formattedTag;

        try {
          const notesStr = localStorage.getItem(LS_KEY_SAVED_RELEASE_NOTES);
          if (notesStr) savedNotes = JSON.parse(notesStr);
          const verStr = localStorage.getItem(LS_KEY_SAVED_RELEASE_VERSION);
          if (verStr) savedVersion = verStr;
        } catch {
          // Ignore
        }

        // Clean up the cached APK immediately
        await this.cleanCachedApk();

        return {
          showWhatsNew: true,
          versionName: savedVersion,
          notesBullets:
            savedNotes.length > 0
              ? savedNotes
              : [
                  'In-app updates and smooth background installs',
                  'Performance enhancements and audio engine optimizations',
                  'Cloud catalog improvements and offline reliability',
                ],
        };
      }

      return null;
    } catch (err) {
      console.warn('[NativeUpdate] checkPostUpdate error:', err);
      return null;
    }
  },

  /**
   * Records that What's New has been seen and acknowledged for current build.
   */
  async markWhatsNewAcknowledged(): Promise<void> {
    try {
      const appInfo = await getCurrentAppVersion();
      localStorage.setItem(LS_KEY_LAST_RUN_BUILD, String(appInfo.build));
      localStorage.removeItem(LS_KEY_SAVED_RELEASE_NOTES);
      localStorage.removeItem(LS_KEY_SAVED_RELEASE_VERSION);
    } catch {
      // Ignore
    }
  },

  /**
   * Opens the latest APK release direct download URL with AppLauncher / browser.
   */
  async openDownloadPage(): Promise<void> {
    try {
      await AppLauncher.openUrl({
        url: APK_DOWNLOAD_URL,
      });
    } catch (err) {
      console.warn('[NativeUpdate] Failed to open with AppLauncher:', err);
      window.open(APK_DOWNLOAD_URL, '_blank');
    }
  },

  /**
   * Dismisses update notification for 24 hours.
   */
  dismissForLater(): void {
    try {
      localStorage.setItem(LS_KEY_DISMISSED_UNTIL, String(Date.now() + TWENTY_FOUR_HOURS_MS));
    } catch {
      // Ignore
    }
  },
};
