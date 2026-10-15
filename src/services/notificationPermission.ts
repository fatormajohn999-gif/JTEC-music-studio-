import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const NOTIFICATION_ASKED_STORAGE_KEY = 'jtec_notification_permission_asked';
let isRequesting = false;

export const NotificationPermissionManager = {
  /**
   * When running natively on Android, the first time the user starts playing a song,
   * checks permission and requests it once if not already granted.
   * Completely safe and non-blocking: playback will never fail or crash even if denied.
   */
  async checkAndRequestOnFirstPlay(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    if (isRequesting) return;

    try {
      const alreadyAsked = localStorage.getItem(NOTIFICATION_ASKED_STORAGE_KEY) === 'true';
      if (alreadyAsked) return;

      isRequesting = true;
      let status;
      try {
        status = await LocalNotifications.checkPermissions();
      } catch (checkErr) {
        console.warn('Could not check notification permissions:', checkErr);
        localStorage.setItem(NOTIFICATION_ASKED_STORAGE_KEY, 'true');
        return;
      }

      if (status && status.display !== 'granted') {
        localStorage.setItem(NOTIFICATION_ASKED_STORAGE_KEY, 'true');
        try {
          await LocalNotifications.requestPermissions();
        } catch (reqErr) {
          console.warn('Could not request notification permissions:', reqErr);
        }
      } else {
        localStorage.setItem(NOTIFICATION_ASKED_STORAGE_KEY, 'true');
      }
    } catch (err) {
      console.warn('Error checking/requesting notification permissions:', err);
    } finally {
      isRequesting = false;
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
      return status?.display === 'denied' || (alreadyAsked && status?.display !== 'granted');
    } catch {
      return false;
    }
  },
};
