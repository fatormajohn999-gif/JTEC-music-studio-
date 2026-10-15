import { useEffect, useState, useCallback, useRef } from 'react';

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const waitingWorkerRef = useRef<ServiceWorker | null>(null);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }

    let refreshing = false;

    // Reload automatically when the controller changes
    const handleControllerChange = () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    let intervalId: ReturnType<typeof setInterval> | null = null;
    let handleVisibilityChange: (() => void) | null = null;

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

        // Check if there is already a waiting worker
        if (registration.waiting) {
          waitingWorkerRef.current = registration.waiting;
          setUpdateAvailable(true);
        }

        // Detect newly installed service worker
        registration.addEventListener('updatefound', () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;

          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed') {
              if (navigator.serviceWorker.controller) {
                // New version found and installed
                waitingWorkerRef.current = installingWorker;
                setUpdateAvailable(true);
              }
            }
          });
        });

        // 2. Check for update when app comes back to foreground
        handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            registration.update().catch(() => {});
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // 3. Check every 30 minutes
        const THIRTY_MINUTES_MS = 30 * 60 * 1000;
        intervalId = setInterval(() => {
          registration.update().catch(() => {});
        }, THIRTY_MINUTES_MS);

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
      if (handleVisibilityChange) {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const updateApp = useCallback(() => {
    setIsUpdating(true);
    if (waitingWorkerRef.current) {
      waitingWorkerRef.current.postMessage({ type: 'SKIP_WAITING' });
    }
    // Fallback safety reload if controllerchange event takes longer than 600ms
    setTimeout(() => {
      window.location.reload();
    }, 600);
  }, []);

  return {
    updateAvailable,
    isUpdating,
    updateApp,
  };
}
