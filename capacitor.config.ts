import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jtec.music',
  appName: 'JTEC MUSIC',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
