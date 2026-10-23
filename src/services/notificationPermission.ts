import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

const NOTIFICATION_ASKED_STORAGE_KEY = 'jtec_notification_permission_asked';
let isRequesting = false;

export type NotificationStatus = 'granted' | 'denied' | 'prompt';

export const NotificationPermissionManager = {
  /**
   * When running natively on Android, the first time the user starts playing a song,
   * checks permission and requests it once if not already granted.
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
   * Returns current notification permission state: 'granted' | 'denied' | 'prompt'
   */
  async getPermissionStatus(): Promise<NotificationStatus> {
    if (Capacitor.isNativePlatform()) {
      try {
        const status = await LocalNotifications.checkPermissions();
        if (status.display === 'granted') return 'granted';
        if (status.display === 'denied') return 'denied';
        return 'prompt';
      } catch {
        return 'prompt';
      }
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'granted') return 'granted';
      if (Notification.permission === 'denied') return 'denied';
      return 'prompt';
    }

    return 'granted';
  },

  /**
   * Manually prompts user for notification permission
   */
  async requestPermission(): Promise<NotificationStatus> {
    if (Capacitor.isNativePlatform()) {
      try {
        const res = await LocalNotifications.requestPermissions();
        return res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'prompt';
      } catch {
        return 'denied';
      }
    }

    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const perm = await Notification.requestPermission();
        return perm === 'granted' ? 'granted' : perm === 'denied' ? 'denied' : 'prompt';
      } catch {
        return 'denied';
      }
    }

    return 'granted';
  },

  /**
   * Checks whether notification permission has been denied on native Android.
   */
  async isPermissionDenied(): Promise<boolean> {
    const status = await this.getPermissionStatus();
    return status === 'denied';
  },
};
