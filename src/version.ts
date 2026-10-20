// Application version and build timestamp injected during build / dev
declare const __APP_VERSION__: string | undefined;
declare const __BUILD_DATE__: string | undefined;

export const APP_VERSION: string =
  typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.1 (Build 101)';

export const BUILD_DATE: string =
  typeof __BUILD_DATE__ !== 'undefined'
    ? __BUILD_DATE__
    : new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
