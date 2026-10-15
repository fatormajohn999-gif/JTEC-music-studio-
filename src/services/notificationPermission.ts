import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const NOTIFICATION_ASKED_STORAGE_KEY = 'jtec_notification_permission_asked';

export const NotificationPermissionManager = {
  /**
   * When running natively on Android, the first time the user starts playing a song,
   * checks permission and requests it once if not already granted.
   */
  async checkAndRequestOnFirstPlay(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;

    try {
      const alreadyAsked = localStorage.getItem(NOTIFICATION_ASKED_STORAGE_KEY) === 'true';
      if (alreadyAsked) return;

      const status = await LocalNotifications.checkPermissions();
      if (status.display !== 'granted') {
        localStorage.setItem(NOTIFICATION_ASKED_STORAGE_KEY, 'true');
        await LocalNotifications.requestPermissions();
      } else {
        localStorage.setItem(NOTIFICATION_ASKED_STORAGE_KEY, 'true');
      }
    } catch (err) {
      console.warn('Error checking/requesting notification permissions:', err);
    }
  },

  /**
   * Checks whether notification permission has been denied on native Android.
   */
  async isPermissionDenied(): Promise<boolean> {
    if (!Capacitor.isNativePlatform()) return false;

    try {
      const status = await LocalNotifications.checkPermissions();
      const alreadyAsked = localStorage.getItem(NOTIFICATION_ASKED_STORAGE_KEY) === 'true';
      return status.display === 'denied' || (alreadyAsked && status.display !== 'granted');
    } catch {
      return false;
    }
  },
};
