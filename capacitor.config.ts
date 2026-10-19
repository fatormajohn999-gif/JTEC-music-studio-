import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: process.env.CAPACITOR_APP_ID || 'com.jtecmusic.app',
  appName: 'JTEC MUSIC',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_launcher_round',
      iconColor: '#00f0ff'
    }
  }
};

export default config;
