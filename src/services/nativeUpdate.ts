import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { AppLauncher } from '@capacitor/app-launcher';
import { Network } from '@capacitor/network';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { APP_VERSION } from '../version';

export const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/fatormajohn999-gif/JTEC-music-studio-/releases/latest';

export const APK_DOWNLOAD_URL =
  'https://github.com/fatormajohn999-gif/JTEC-music-studio-/releases/latest/download/JTEC-MUSIC.apk';

const LS_KEY_LAST_CHECK = 'jtec_last_native_update_check';
const LS_KEY_DISMISSED_UNTIL = 'jtec_native_update_dismissed_until';
const LS_KEY_LAST_RUN_BUILD = 'jtec_last_run_build';
const LS_KEY_SAVED_RELEASE_NOTES = 'jtec_saved_release_notes';
const LS_KEY_SAVED_RELEASE_VERSION = 'jtec_saved_release_version';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

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

export const NativeUpdateService = {
  /**
   * Checks for an Android APK release on GitHub.
   * If manual is false, respects the 6-hour check throttle, and only runs on native platform.
   */
  async checkForUpdate(manual = false): Promise<NativeUpdateInfo | null> {
    if (!Capacitor.isNativePlatform() && !manual) {
      return null;
    }

    const now = Date.now();

    if (!manual) {
      try {
        const lastCheck = parseInt(localStorage.getItem(LS_KEY_LAST_CHECK) || '0', 10);
        if (now - lastCheck < SIX_HOURS_MS) {
          return null;
        }
      } catch {
        // Ignore localStorage read errors
      }
    }

    try {
      localStorage.setItem(LS_KEY_LAST_CHECK, String(now));
    } catch {
      // Ignore
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      const releaseData = await response.json();
      const tagName: string = releaseData?.tag_name || '';
      const rawBody: string = releaseData?.body || '';
      const assets: any[] = Array.isArray(releaseData?.assets) ? releaseData.assets : [];

      // Find the JTEC-MUSIC.apk asset or fallback to any .apk asset
      const apkAsset =
        assets.find((a) => a.name && a.name.toLowerCase() === 'jtec-music.apk') ||
        assets.find((a) => a.name && a.name.toLowerCase().endsWith('.apk'));

      const downloadUrl = apkAsset?.browser_download_url || APK_DOWNLOAD_URL;
      const fileSizeBytes = apkAsset?.size || 0;
      const formattedSize = formatBytes(fileSizeBytes);

      const { bullets: notesBullets, isRequired } = parseReleaseNotes(rawBody);

      const parsed = parseTagBuildNumber(tagName);
      const appInfo = await getCurrentAppVersion();
      const currentBuild = appInfo.build;
      const currentVersionName = appInfo.version;

      if (!parsed) {
        return {
          hasUpdate: false,
          versionName: tagName || 'latest',
          latestBuild: 0,
          currentBuild,
          currentVersionName,
          downloadUrl,
          fileSizeBytes,
          formattedSize,
          notesBullets,
          isRequired,
          rawBody,
        };
      }

      const hasUpdate = parsed.latestBuild > currentBuild;

      // When update is found, persist release info for post-update "What's new" dialog
      if (hasUpdate) {
        try {
          localStorage.setItem(LS_KEY_SAVED_RELEASE_NOTES, JSON.stringify(notesBullets));
          localStorage.setItem(LS_KEY_SAVED_RELEASE_VERSION, parsed.versionName);
        } catch {
          // Ignore
        }
      }

      return {
        hasUpdate,
        versionName: parsed.versionName,
        latestBuild: parsed.latestBuild,
        currentBuild,
        currentVersionName,
        downloadUrl,
        fileSizeBytes,
        formattedSize,
        notesBullets,
        isRequired,
        rawBody,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      console.warn('[NativeUpdate] Check failed:', err);
      throw err;
    }
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
  async openBrowserDownload(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) {
        await AppLauncher.openUrl({ url: APK_DOWNLOAD_URL });
      } else {
        window.open(APK_DOWNLOAD_URL, '_blank');
      }
    } catch (err) {
      console.error('[NativeUpdate] AppLauncher openUrl error:', err);
      try {
        window.open(APK_DOWNLOAD_URL, '_blank');
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
