import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { APP_VERSION } from '../version';

export const GITHUB_LATEST_RELEASE_URL =
  'https://api.github.com/repos/fatormajohn999-gif/JTEC-music-studio-/releases/latest';

export const APK_DOWNLOAD_URL =
  'https://github.com/fatormajohn999-gif/JTEC-music-studio-/releases/latest/download/JTEC-MUSIC.apk';

const LS_KEY_LAST_CHECK = 'jtec_last_native_update_check';
const LS_KEY_DISMISSED_UNTIL = 'jtec_native_update_dismissed_until';

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface NativeUpdateCheckResult {
  hasUpdate: boolean;
  versionName: string;
  latestBuild: number;
  currentBuild: number;
  downloadUrl: string;
}

/**
 * Parses the release tag (e.g. "v1.0.57" or "1.0.57") and computes:
 * latestBuild = 100 + the last number of the tag.
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

export const NativeUpdateService = {
  /**
   * Checks for an Android APK release on GitHub.
   * If manual is false, respects the 6-hour check throttle and the 24-hour "Later" dismissal.
   */
  async checkForUpdate(manual = false): Promise<NativeUpdateCheckResult | null> {
    if (!Capacitor.isNativePlatform()) {
      return null;
    }

    const now = Date.now();

    if (!manual) {
      // 1. Check if user tapped "Later" within the last 24 hours
      try {
        const dismissedUntil = parseInt(localStorage.getItem(LS_KEY_DISMISSED_UNTIL) || '0', 10);
        if (now < dismissedUntil) {
          return null;
        }
      } catch {
        // Ignore localStorage read errors
      }

      // 2. Check if we checked recently (at most once every 6 hours)
      try {
        const lastCheck = parseInt(localStorage.getItem(LS_KEY_LAST_CHECK) || '0', 10);
        if (now - lastCheck < SIX_HOURS_MS) {
          return null;
        }
      } catch {
        // Ignore localStorage read errors
      }
    }

    // Record check timestamp
    try {
      localStorage.setItem(LS_KEY_LAST_CHECK, String(now));
    } catch {
      // Ignore
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

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

      const parsed = parseTagBuildNumber(tagName);
      if (!parsed) {
        return {
          hasUpdate: false,
          versionName: tagName || 'latest',
          latestBuild: 0,
          currentBuild: 0,
          downloadUrl: APK_DOWNLOAD_URL,
        };
      }

      // Read installed build number (versionCode) from App.getInfo()
      let currentBuild = 0;
      try {
        const appInfo = await App.getInfo();
        currentBuild = parseInt(appInfo.build, 10);
      } catch (e) {
        console.warn('[NativeUpdate] Could not read App.getInfo(), falling back to APP_VERSION', e);
      }

      if (isNaN(currentBuild) || currentBuild <= 0) {
        // Fallback: parse build number from APP_VERSION string (e.g. "1.0.1 (Build 101)")
        const match = APP_VERSION.match(/Build\s+(\d+)/i);
        currentBuild = match ? parseInt(match[1], 10) : 100;
      }

      const hasUpdate = parsed.latestBuild > currentBuild;

      return {
        hasUpdate,
        versionName: parsed.versionName,
        latestBuild: parsed.latestBuild,
        currentBuild,
        downloadUrl: APK_DOWNLOAD_URL,
      };
    } catch (err) {
      clearTimeout(timeoutId);
      // Keep technical details only in console.log
      console.warn('[NativeUpdate] Check failed:', err);
      throw err;
    }
  },

  /**
   * Opens the latest APK release direct download URL in external browser.
   */
  async openDownloadPage(): Promise<void> {
    try {
      await Browser.open({
        url: APK_DOWNLOAD_URL,
      });
    } catch (err) {
      console.warn('[NativeUpdate] Failed to open browser:', err);
      window.open(APK_DOWNLOAD_URL, '_system');
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
