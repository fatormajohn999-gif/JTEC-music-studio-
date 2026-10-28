import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';

export interface BackHandler {
  id: string;
  priority: number; // Higher number executed first
  handle: () => boolean; // Returns true if handled, false to delegate
}

// In-memory scroll registry
const scrollRegistry = new Map<string, number>();

// In-memory back handlers
const backHandlers: BackHandler[] = [];

/**
 * Saves scroll position for a specific screen/container key.
 */
export function saveScrollPosition(key: string, scrollTop: number): void {
  scrollRegistry.set(key, Math.max(0, scrollTop));
}

/**
 * Gets the saved scroll position for a key (defaults to 0).
 */
export function getSavedScrollPosition(key: string): number {
  return scrollRegistry.get(key) || 0;
}

/**
 * Clears saved scroll position for a key.
 */
export function clearSavedScrollPosition(key: string): void {
  scrollRegistry.delete(key);
}

/**
 * Restores scroll position with retries across animation frames
 * until the content container is tall enough to reach the target position.
 */
export function restoreScroll(
  targetElement: HTMLElement | Window | null,
  targetScrollTop: number,
  maxAttempts = 15
): () => void {
  if (!targetElement || targetScrollTop <= 0) {
    if (targetElement) {
      if (targetElement === window) {
        window.scrollTo(0, 0);
      } else {
        (targetElement as HTMLElement).scrollTop = 0;
      }
    }
    return () => {};
  }

  let attempts = 0;
  let rafId: number | null = null;

  const tryScroll = () => {
    attempts++;
    const isWindow = targetElement === window;
    const currentScrollHeight = isWindow
      ? document.documentElement.scrollHeight
      : (targetElement as HTMLElement).scrollHeight;
    const clientHeight = isWindow
      ? window.innerHeight
      : (targetElement as HTMLElement).clientHeight;

    const maxScroll = Math.max(0, currentScrollHeight - clientHeight);
    const scrollVal = Math.min(targetScrollTop, maxScroll);

    if (isWindow) {
      window.scrollTo(0, scrollVal);
    } else {
      (targetElement as HTMLElement).scrollTop = scrollVal;
    }

    // If container isn't yet tall enough for target and attempts < maxAttempts, retry next frame
    if (maxScroll < targetScrollTop - 5 && attempts < maxAttempts) {
      rafId = requestAnimationFrame(tryScroll);
    }
  };

  tryScroll();

  return () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
  };
}

/**
 * Registers a back handler in the authoritative navigation stack.
 * Supports:
 * - registerBackHandler(id: string, priority: number, handle: () => boolean)
 * - registerBackHandler(handle: () => boolean, priority?: number)
 * Returns an unregister function.
 */
export function registerBackHandler(
  idOrHandle: string | (() => boolean),
  priorityOrHandle?: number | (() => boolean),
  maybeHandle?: () => boolean
): () => void {
  let id = 'handler_' + Math.random().toString(36).substring(2, 9);
  let priority = 0;
  let handle: () => boolean;

  if (typeof idOrHandle === 'string') {
    id = idOrHandle;
    priority = typeof priorityOrHandle === 'number' ? priorityOrHandle : 0;
    handle = maybeHandle || (() => false);
  } else {
    handle = idOrHandle;
    priority = typeof priorityOrHandle === 'number' ? priorityOrHandle : 0;
  }

  // Remove any existing handler with same id
  const existingIndex = backHandlers.findIndex((h) => h.id === id);
  if (existingIndex >= 0) {
    backHandlers.splice(existingIndex, 1);
  }

  backHandlers.push({ id, priority, handle });
  // Keep sorted descending by priority
  backHandlers.sort((a, b) => b.priority - a.priority);

  return () => {
    const idx = backHandlers.findIndex((h) => h.id === id);
    if (idx >= 0) {
      backHandlers.splice(idx, 1);
    }
  };
}

/**
 * Executes a global back action through registered back handlers.
 * Returns true if any handler handled the back action, false otherwise.
 */
export function triggerGlobalBack(): boolean {
  for (const handler of [...backHandlers]) {
    try {
      const handled = handler.handle();
      if (handled) {
        return true;
      }
    } catch (e) {
      console.warn(`[Navigation] Error in back handler ${handler.id}:`, e);
    }
  }
  return false;
}

// Global initialization flag
let isInitialized = false;

/**
 * Initializes global back button listeners for Android Capacitor and browser popstate.
 */
export function initializeGlobalNavigation(): () => void {
  if (isInitialized) return () => {};
  isInitialized = true;

  // 1. Android Capacitor Back Button
  let capacitorListenerPromise: any = null;
  if (Capacitor.isNativePlatform()) {
    capacitorListenerPromise = CapApp.addListener('backButton', () => {
      const handled = triggerGlobalBack();
      if (!handled) {
        // At root with nothing open -> exit app
        CapApp.exitApp();
      }
    });
  }

  // 2. Web browser popstate (Android browser back gesture & desktop back)
  const handlePopState = () => {
    triggerGlobalBack();
  };
  window.addEventListener('popstate', handlePopState);

  return () => {
    isInitialized = false;
    window.removeEventListener('popstate', handlePopState);
    if (capacitorListenerPromise) {
      capacitorListenerPromise.then((handle: any) => handle?.remove?.()).catch(() => {});
    }
  };
}
