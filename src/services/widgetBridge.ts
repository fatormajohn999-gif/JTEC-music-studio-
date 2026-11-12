import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';

export type WidgetActionType = 'playPause' | 'next' | 'previous' | 'toggleFavorite';

export interface WidgetStatePayload {
  trackId: string;
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  rate: number;
  accentColor: string;
  isFavorite: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  artwork?: string;
}

interface JtecWidgetPluginInterface {
  updateState(options: WidgetStatePayload): Promise<void>;
  clear(): Promise<void>;
  hasWidgets(): Promise<{ value: boolean }>;
  requestPinWidget(): Promise<{ supported: boolean }>;
  getLaunchAction(): Promise<{ action: WidgetActionType | null }>;
  addListener(
    eventName: 'widgetAction',
    listenerFunc: (event: { action: WidgetActionType }) => void
  ): Promise<PluginListenerHandle>;
}

const JtecWidgetNative = registerPlugin<JtecWidgetPluginInterface>('JtecWidget');

const MAX_ARTWORK_BYTES = 40 * 1024;
const artworkBase64Cache = new Map<string, string>();

/**
 * Resizes a cover image (data URL or remote URL) to a 256x256 JPEG
 * and compresses it under 40 KB as raw base64 (without data: prefix).
 */
export async function prepareWidgetArtworkBase64(coverUrl?: string): Promise<string | undefined> {
  if (!coverUrl || !Capacitor.isNativePlatform()) {
    return undefined;
  }

  const cached = artworkBase64Cache.get(coverUrl);
  if (cached) {
    return cached;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const timeout = setTimeout(() => {
        resolve(undefined);
      }, 4500);

      img.onload = () => {
        clearTimeout(timeout);
        try {
          const size = 256;
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(undefined);
            return;
          }

          const nw = img.naturalWidth || img.width || size;
          const nh = img.naturalHeight || img.height || size;
          const minDim = Math.min(nw, nh);
          const sx = (nw - minDim) / 2;
          const sy = (nh - minDim) / 2;

          ctx.fillStyle = '#060810';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

          const qualities = [0.82, 0.68, 0.54, 0.40, 0.28];
          let chosenBase64: string | undefined;

          for (const q of qualities) {
            const dataUrl = canvas.toDataURL('image/jpeg', q);
            const commaIdx = dataUrl.indexOf(',');
            const rawB64 = commaIdx >= 0 ? dataUrl.slice(commaIdx + 1) : dataUrl;
            if (rawB64.length <= MAX_ARTWORK_BYTES) {
              chosenBase64 = rawB64;
              break;
            }
            chosenBase64 = rawB64;
          }

          if (chosenBase64) {
            if (artworkBase64Cache.size >= 12) {
              const firstKey = artworkBase64Cache.keys().next().value;
              if (firstKey !== undefined) {
                artworkBase64Cache.delete(firstKey);
              }
            }
            artworkBase64Cache.set(coverUrl, chosenBase64);
          }

          resolve(chosenBase64);
        } catch {
          resolve(undefined);
        }
      };

      img.onerror = () => {
        clearTimeout(timeout);
        resolve(undefined);
      };

      img.src = coverUrl;
    } catch {
      resolve(undefined);
    }
  });
}

export const WidgetBridge = {
  isSupported(): boolean {
    try {
      return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    } catch {
      return false;
    }
  },

  async updateState(payload: WidgetStatePayload): Promise<void> {
    if (!this.isSupported()) return;
    try {
      await JtecWidgetNative.updateState(payload);
    } catch {
      // Safe no-op: widget errors must never affect playback
    }
  },

  async clear(): Promise<void> {
    if (!this.isSupported()) return;
    try {
      await JtecWidgetNative.clear();
    } catch {
      // ignore
    }
  },

  async hasWidgets(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const res = await JtecWidgetNative.hasWidgets();
      return Boolean(res?.value);
    } catch {
      return false;
    }
  },

  async requestPinWidget(): Promise<boolean> {
    if (!this.isSupported()) return false;
    try {
      const res = await JtecWidgetNative.requestPinWidget();
      return Boolean(res?.supported);
    } catch {
      return false;
    }
  },

  async getLaunchAction(): Promise<WidgetActionType | null> {
    if (!this.isSupported()) return null;
    try {
      const res = await JtecWidgetNative.getLaunchAction();
      return res?.action || null;
    } catch {
      return null;
    }
  },

  async addActionListener(
    callback: (action: WidgetActionType) => void
  ): Promise<() => void> {
    if (!this.isSupported()) {
      return () => {};
    }
    try {
      const handle = await JtecWidgetNative.addListener('widgetAction', (event) => {
        if (event?.action) {
          callback(event.action);
        }
      });
      return () => {
        try {
          handle.remove();
        } catch {
          // ignore
        }
      };
    } catch {
      return () => {};
    }
  },
};
