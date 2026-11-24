import { Capacitor } from '@capacitor/core';
import { useEffect, useState, useCallback, useRef } from 'react';
import { audioEngine } from '../services/audioEngine';

const LS_KEY_LAST_SW_RELOAD = 'jtec_last_sw_reload_at';
const TEN_MINUTES_MS = 10 * 60 * 1000;
const RELOAD_COOLDOWN_MS = 60 * 1000;

function canReloadWithinCooldown(): boolean {
  try {
    const raw = localStorage.getItem(LS_KEY_LAST_SW_RELOAD);
    if (!raw) return true;
    const last = parseInt(raw, 10);
    if (isNaN(last)) return true;
    return Date.now() - last >= RELOAD_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function recordReloadTimestamp(): void {
  try {
    localStorage.setItem(LS_KEY_LAST_SW_RELOAD, String(Date.now()));
  } catch {
    // ignore storage errors
  }
}

function waitForInstalledWorker(worker: ServiceWorker, timeoutMs = 6000): Promise<boolean> {
  if (worker.state === 'installed') return Promise.resolve(true);
  if (worker.state === 'redundant') return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const done = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeEventListener('statechange', onStateChange);
      resolve(ok);
    };

    const onStateChange = () => {
      if (worker.state === 'installed') done(true);
      else if (worker.state === 'redundant') done(false);
    };

    const timer = setTimeout(() => done(false), timeoutMs);
    worker.addEventListener('statechange', onStateChange);
  });
}

export type WebUpdateCheckResult = 'up-to-date' | 'update-ready' | 'reloading' | 'offline' | 'error';

/**
 * Triggers a Service Worker update check on Web.
 * - If offline, returns 'offline'.
 * - If a waiting or newly installed worker is ready:
 *   - When no music is playing and cooldown allows, applies immediately and returns 'reloading'.
 *   - Otherwise returns 'update-ready' and notifies the Home banner.
 */
export async function checkForWebUpdate(): Promise<WebUpdateCheckResult> {
  if (import.meta.env.DEV || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) {
    return 'up-to-date';
  }
  if (!navigator.onLine) {
    return 'offline';
  }

  try {
    let reg =
      (await navigator.serviceWorker.getRegistration('./')) ||
      (await navigator.serviceWorker.getRegistration());

    if (!reg) {
      try {
        reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      } catch {
        reg = await navigator.serviceWorker.register('sw.js');
      }
    }

    const activateWorkerOrBanner = (worker: ServiceWorker): 'reloading' | 'update-ready' => {
      if (!audioEngine.isPlaying && canReloadWithinCooldown()) {
        worker.postMessage({ type: 'SKIP_WAITING' });
        return 'reloading';
      }
      window.dispatchEvent(new CustomEvent('jtec:web-update-ready'));
      return 'update-ready';
    };

    if (reg.waiting) {
      return activateWorkerOrBanner(reg.waiting);
    }

    await reg.update();

    if (reg.waiting) {
      return activateWorkerOrBanner(reg.waiting);
    }

    if (reg.installing) {
      const installed = await waitForInstalledWorker(reg.installing);
      if (installed && navigator.serviceWorker.controller) {
        const target = reg.waiting || reg.installing;
        if (target) {
          return activateWorkerOrBanner(target);
        }
      }
    }

    return 'up-to-date';
  } catch {
    return navigator.onLine ? 'error' : 'offline';
  }
}

interface UsePWAUpdateOptions {
  isPlaying?: boolean;
}

export function usePWAUpdate(options: UsePWAUpdateOptions = {}) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);
  const isPlayingRef = useRef<boolean>(Boolean(options.isPlaying));
  isPlayingRef.current = Boolean(options.isPlaying);

  useEffect(() => {
    // When running in Vite dev mode or inside a native Capacitor app,
    // do NOT register the service worker and do NOT run PWA update-check logic.
    if (import.meta.env.DEV || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) {
      return;
    }

    let refreshing = false;
    let hadControllerOnMount = Boolean(navigator.serviceWorker.controller);

    const isPlaybackActive = () => isPlayingRef.current || audioEngine.isPlaying;

    const tryApplyOrQueueUpdate = (worker: ServiceWorker, isAppStart: boolean) => {
      waitingWorkerRef.current = worker;

      // Apply automatically at app start or when no music is playing
      // (protected by 60s reload cooldown so it can never loop).
      if ((isAppStart || !isPlaybackActive()) && canReloadWithinCooldown()) {
        worker.postMessage({ type: 'SKIP_WAITING' });
        return;
      }

      // Music is playing (or within cooldown): hold waiting worker and show non-blocking Home banner.
      // Next time the app opens, registration.waiting will auto-apply immediately.
      setUpdateAvailable(true);
    };

    // Reload at most once per 60 seconds when the SW controller changes
    const handleControllerChange = () => {
      if (!hadControllerOnMount) {
        // First-time SW activation on an uncontrolled page should not reload
        hadControllerOnMount = true;
        return;
      }
      if (refreshing || !canReloadWithinCooldown()) {
        return;
      }
      refreshing = true;
      recordReloadTimestamp();
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let handleVisibilityChange: (() => void) | null = null;

    const handleWebUpdateReadyEvent = () => {
      setUpdateAvailable(true);
    };
    window.addEventListener('jtec:web-update-ready', handleWebUpdateReadyEvent);

    // Register service worker with relative path for sub-folder and GitHub Pages support
    const registerWorker = async () => {
      try {
        return await navigator.serviceWorker.register('./sw.js', { scope: './' });
      } catch {
        return await navigator.serviceWorker.register('sw.js');
      }
    };

    registerWorker()
      .then(async (registration) => {
        // 1. Initial check when app opens
        registration.update().catch(() => {});

        // Apply automatically at app start if a waiting worker from a previous session exists
        if (registration.waiting) {
          tryApplyOrQueueUpdate(registration.waiting, true);
        }

        // Detect newly installed service worker
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                tryApplyOrQueueUpdate(registration.waiting || installingWorker, false);
              }
            }
          });
        });

        // 2. Check for update when app returns to foreground
        handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 3. Check every 10 minutes while visible
        intervalId = setInterval(() => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        }, TEN_MINUTES_MS);

        // 4. Periodic background sync for update check (feature-detect & fail silently)
        if ('periodicSync' in registration) {
          try {
            const status = await (navigator.permissions as any)?.query({
              name: 'periodic-background-sync',
            });
            if (status && (status.state === 'granted' || status.state === 'prompt')) {
              await (registration as any).periodicSync.register('jtec-update-check', {
                minInterval: 12 * 60 * 60 * 1000,
              });
            }
          } catch {
            // Fail silently if not supported or permission denied
          }
        }

        // 5. Background sync for retrying network operations (feature-detect & fail silently)
        if ('sync' in registration) {
          try {
            await (registration as any).sync.register('jtec-sync');
          } catch {
            // Fail silently if not supported
          }
        }
      })
      .catch((err) => {
        console.warn('[PWA] Service worker registration error:', err);
      });

    // Listen for update notification messages from service worker
    const handleSWMessage = (event: MessageEvent) => {
      if (event.data?.type === 'UPDATE_AVAILABLE') {
        setUpdateAvailable(true);
      }
    };
    navigator.serviceWorker.addEventListener('message', handleSWMessage);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      navigator.serviceWorker.removeEventListener('message', handleSWMessage);
      window.removeEventListener('jtec:web-update-ready', handleWebUpdateReadyEvent);
      if (handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const updateApp = useCallback(async () => {
    setIsUpdating(true);
    try {
      let worker = waitingWorkerRef.current;
      if (!worker && 'serviceWorker' in navigator) {
        const reg =
          (await navigator.serviceWorker.getRegistration('./')) ||
          (await navigator.serviceWorker.getRegistration());
        worker = reg?.waiting || null;
      }
      if (worker) {
        worker.postMessage({ type: 'SKIP_WAITING' });
      }
    } catch {
      // ignore and fall back to direct reload
    }

    // Fallback safety reload if controllerchange doesn't reload within 800ms
    setTimeout(() => {
      if (canReloadWithinCooldown()) {
        recordReloadTimestamp();
        window.location.reload();
      } else {
        setIsUpdating(false);
      }
    }, 800);
  }, []);

  return {
    updateAvailable,
    isUpdating,
    updateApp,
  };
}
