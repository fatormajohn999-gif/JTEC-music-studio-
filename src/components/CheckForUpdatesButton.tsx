import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw, Loader2, Check, AlertCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { APP_VERSION, BUILD_DATE } from '../version';

import { NativeUpdateService } from '../services/nativeUpdate';

type UpdateCheckStatus = 'idle' | 'checking' | 'updating' | 'up-to-date' | 'error';

function isNewerVersion(remote: string, current: string): boolean {
  if (!remote || !current) return false;
  if (remote === current) return false;

  const rParts = remote.split('.').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });
  const cParts = current.split('.').map((p) => {
    const num = parseInt(p, 10);
    return isNaN(num) ? 0 : num;
  });

  for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
    const r = rParts[i] ?? 0;
    const c = cParts[i] ?? 0;
    if (r > c) return true;
    if (r < c) return false;
  }

  return remote !== current;
}

export const CheckForUpdatesButton: React.FC = () => {
  const [status, setStatus] = useState<UpdateCheckStatus>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleCheckForUpdates = async () => {
    if (status === 'checking' || status === 'updating') return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    // On native Capacitor app, check for newer APK release on GitHub
    if (Capacitor.isNativePlatform()) {
      setStatus('checking');
      try {
        const result = await NativeUpdateService.checkForUpdate(true);
        if (result && result.hasUpdate) {
          setStatus('idle');
          window.dispatchEvent(
            new CustomEvent('jtec:show-native-update', {
              detail: { versionName: result.versionName },
            })
          );
        } else {
          setStatus('up-to-date');
          timerRef.current = setTimeout(() => {
            setStatus('idle');
          }, 3000);
        }
      } catch (err) {
        setStatus('error');
        timerRef.current = setTimeout(() => {
          setStatus('idle');
        }, 3000);
      }
      return;
    }

    setStatus('checking');

    try {
      // 1. Fetch ./version.json from site with cache: "no-store"
      let res: Response;
      try {
        res = await fetch('./version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) {
          res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
        }
      } catch {
        res = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
      }

      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }

      const remoteData = (await res.json()) as { version?: string; built?: string };
      const remoteVersion = remoteData?.version ? String(remoteData.version).trim() : '';
      const currentVersion = APP_VERSION.trim();

      // 2. Also call registration.update() on the service worker to look for a new service worker
      let swReg: ServiceWorkerRegistration | null = null;
      let foundNewSW = false;

      if ('serviceWorker' in navigator) {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          swReg = reg ?? null;
          if (swReg) {
            await swReg.update();
            if (swReg.waiting || swReg.installing) {
              foundNewSW = true;
            }
          }
        } catch (swErr) {
          console.warn('[PWA] Service worker update check:', swErr);
        }
      }

      // 3. Compare remote version with the version currently running in the app
      const hasNewerVersionNumber = isNewerVersion(remoteVersion, currentVersion);
      const versionDiffers = remoteVersion !== '' && remoteVersion !== currentVersion;
      const updateAvailable = hasNewerVersionNumber || versionDiffers || foundNewSW;

      if (updateAvailable) {
        // 4. If a newer version exists:
        // - Show "Update found, updating..."
        // - Activate the new service worker (skipWaiting), clear the old caches, and reload the app automatically
        setStatus('updating');

        // Clear the old caches
        if ('caches' in window) {
          try {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          } catch (cacheErr) {
            console.warn('[PWA] Cache purge error:', cacheErr);
          }
        }

        // Activate new service worker
        if (swReg) {
          if (swReg.waiting) {
            swReg.waiting.postMessage({ type: 'SKIP_WAITING' });
          } else if (swReg.installing) {
            swReg.installing.postMessage({ type: 'SKIP_WAITING' });
            swReg.installing.addEventListener('statechange', (e) => {
              const sw = e.target as ServiceWorker;
              if (sw.state === 'installed' || sw.state === 'activated') {
                sw.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          }
        }

        // Reload the app automatically
        setTimeout(() => {
          window.location.reload();
        }, 750);
      } else {
        // 5. If there is no new version: show "You're up to date ✓" with the version number for 3 seconds, then return to normal
        setStatus('up-to-date');
        timerRef.current = setTimeout(() => {
          setStatus('idle');
        }, 3000);
      }
    } catch (error) {
      // 6. If the check fails (offline or network error): show "Couldn't check. Check your internet." and return to normal
      console.warn('[PWA] Update check failed:', error);
      setStatus('error');
      timerRef.current = setTimeout(() => {
        setStatus('idle');
      }, 3000);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-2 pt-1 pb-1">
      <button
        type="button"
        onClick={handleCheckForUpdates}
        disabled={status === 'checking' || status === 'updating'}
        className={`group relative inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all duration-200 select-none ${
          status === 'checking'
            ? 'bg-slate-800/90 text-cyan-300 border border-cyan-500/40 cursor-wait'
            : status === 'updating'
            ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/50 cursor-wait'
            : status === 'up-to-date'
            ? 'bg-emerald-950/50 text-emerald-300 border border-emerald-500/40'
            : status === 'error'
            ? 'bg-rose-950/50 text-rose-300 border border-rose-500/40'
            : 'bg-slate-800/80 hover:bg-slate-700/80 active:scale-95 text-slate-200 border border-slate-700/80 hover:border-cyan-500/30 hover:text-white shadow-sm'
        }`}
      >
        {status === 'checking' && (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            <span>Checking...</span>
          </>
        )}

        {status === 'updating' && (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            <span>Update found, updating...</span>
          </>
        )}

        {status === 'up-to-date' && (
          <>
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>You&apos;re up to date ✓ ({APP_VERSION})</span>
          </>
        )}

        {status === 'error' && (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
            <span>Couldn&apos;t check right now.</span>
          </>
        )}

        {status === 'idle' && (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-cyan-400 group-hover:rotate-180 transition-transform duration-500" />
            <span>Check for updates</span>
          </>
        )}
      </button>

      {/* Version and build date in small text directly under the button */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
        <span className="font-mono text-cyan-400">Version: {APP_VERSION}</span>
        <span className="text-slate-600">•</span>
        <span className="text-slate-400">Build: {BUILD_DATE}</span>
      </div>
    </div>
  );
};
