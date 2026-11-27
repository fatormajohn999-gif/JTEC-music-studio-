import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const SETTINGS_PATH = path.resolve(process.cwd(), 'src/screens/SettingsScreen.tsx');
const HOME_PATH = path.resolve(process.cwd(), 'src/screens/HomeScreen.tsx');
const ABOUT_DEV_PATH = path.resolve(process.cwd(), 'src/components/AboutDeveloperView.tsx');
const PRIVACY_PATH = path.resolve(process.cwd(), 'src/components/PrivacyPolicyView.tsx');
const USER_GUIDE_PATH = path.resolve(process.cwd(), 'src/components/UserGuideView.tsx');
const APP_PATH = path.resolve(process.cwd(), 'src/App.tsx');

const NAMED_HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  quot: '"',
  lt: '<',
  gt: '>',
  nbsp: ' ',
  rarr: '→',
  larr: '←',
  bull: '•',
  copy: '©',
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&([a-zA-Z]+);/g, (full, name) => NAMED_HTML_ENTITIES[name] ?? full);
}

function stripTagsAndDecode(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHeadingTexts(html: string): string[] {
  const headings: string[] = [];
  const headingRegex = /<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(html)) !== null) {
    headings.push(stripTagsAndDecode(match[1]));
  }
  return headings;
}

function ensureDomAndStorageGlobals(): void {
  const makeMemoryStorage = (): Storage => {
    const map = new Map<string, string>();
    return {
      get length() {
        return map.size;
      },
      clear() {
        map.clear();
      },
      getItem(key: string) {
        return map.has(key) ? map.get(key)! : null;
      },
      key(index: number) {
        return Array.from(map.keys())[index] ?? null;
      },
      removeItem(key: string) {
        map.delete(key);
      },
      setItem(key: string, value: string) {
        map.set(key, String(value));
      },
    };
  };

  if (!(globalThis as any).localStorage) {
    (globalThis as any).localStorage = makeMemoryStorage();
  }
  if (!(globalThis as any).sessionStorage) {
    (globalThis as any).sessionStorage = makeMemoryStorage();
  }
  if (!(globalThis as any).window) {
    (globalThis as any).window = {
      localStorage: (globalThis as any).localStorage,
      sessionStorage: (globalThis as any).sessionStorage,
      location: { origin: 'https://jtec.app', href: 'https://jtec.app/', pathname: '/', search: '' },
      addEventListener: () => {},
      removeEventListener: () => {},
      navigator: { userAgent: 'node' },
    };
  }
  if (!(globalThis as any).document) {
    (globalThis as any).document = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
}

const REQUIRED_JTEC_INTRO =
  'JTEC is an independent technology and software project founded by Johnny TEC (JTEC). It focuses on creating practical digital products, mobile applications and connected experiences that make technology more useful and accessible. Through projects such as JTEC MUSIC and JTEC Party, the aim is to build thoughtful, reliable products with a strong focus on usability, performance and continuous improvement.';

describe('Settings, Home Screen, About Developer & Privacy Policy Redesign', () => {
  test('1. SettingsScreen implements JTEC Party featured card, 5 clean categories, and preserves all controls', async () => {
    ensureDomAndStorageGlobals();
    const { SettingsScreen } = await import('../../screens/SettingsScreen');

    const renderedHtml = renderToStaticMarkup(
      React.createElement(SettingsScreen, {
        settings: {
          performanceMode: 'balanced',
          visualizerMode: 'auto',
          reactionStrength: 'medium',
          autoplayNext: true,
          rememberLastSong: true,
          neonGlow: true,
          reducedMotion: false,
          downloadOnWifiOnly: false,
        },
        storageStats: {
          songCount: 4,
          estimatedBytes: 2048,
          downloadCount: 2,
          downloadBytes: 1024,
          isPersisted: false,
        },
        songs: [],
        onUpdateSettings: () => {},
        onClearLibrary: () => {},
        sleepTimer: {
          isActive: false,
          totalDurationMinutes: 0,
          endTime: null,
          remainingSeconds: 0,
          isFading: false,
        },
        onStartSleepTimer: () => {},
        onCancelSleepTimer: () => {},
        onExtendSleepTimer: () => {},
      })
    );

    const renderedHeadings = extractHeadingTexts(renderedHtml);
    const renderedText = stripTagsAndDecode(renderedHtml);

    const requiredCategories = [
      'JTEC Party',
      'Playback & Sound',
      'Appearance',
      'Downloads & Storage',
      'Notifications & Device',
      'About & Information',
    ];
    for (const label of requiredCategories) {
      assert.equal(
        renderedHeadings.includes(label),
        true,
        `SettingsScreen rendered headings missing category/card: ${label} (found: ${renderedHeadings.join(', ')})`
      );
      assert.equal(
        renderedText.includes(label),
        true,
        `SettingsScreen rendered text missing category/card: ${label}`
      );
    }

    assert.equal(
      renderedText.includes('Automatic Next, Sleep Timer & sound reset'),
      true,
      'SettingsScreen rendered text missing Playback & Sound subtitle'
    );
    assert.equal(
      renderedText.includes('Glow aesthetics & player backdrop display'),
      true,
      'SettingsScreen rendered text missing Appearance subtitle'
    );
    assert.equal(
      renderedText.includes('Local storage, offline files & download settings'),
      true,
      'SettingsScreen rendered text missing Downloads & Storage subtitle'
    );
    assert.equal(
      renderedText.includes('Notifications, lock screen controls & home screen widget'),
      true,
      'SettingsScreen rendered text missing Notifications & Device subtitle'
    );
    assert.equal(
      renderedText.includes('Guides, developer info, privacy & updates'),
      true,
      'SettingsScreen rendered text missing About & Information subtitle'
    );
    assert.equal(
      renderedText.includes('Slow + Reverb, EQ, and audio processing'),
      true,
      'SettingsScreen rendered Appearance info should confirm Slow + Reverb & EQ preservation'
    );

    const src = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const decodedSrc = decodeHtmlEntities(src);
    for (const label of requiredCategories) {
      assert.equal(
        decodedSrc.includes(label),
        true,
        `SettingsScreen decoded source missing category/card: ${label}`
      );
    }

    const requiredControls = [
      'autoplayNext',
      'SleepTimerSection',
      'rememberLastSong',
      'neonGlow',
      'onResetSoundAndVisual',
      'storageStats',
      'ManageDownloadsModal',
      'downloadOnWifiOnly',
      'requestPersistentStorage',
      'onClearLibrary',
      'NotificationPermissionManager',
      'requestPinWidget',
      'AboutDeveloperView',
      'PrivacyPolicyView',
      'UserGuideView',
      'InstallGuideView',
      'HowToUpdateView',
      'CheckForUpdatesButton',
      'DeveloperPage',
      'registerBackHandler',
      'saveScrollPosition',
    ];
    for (const control of requiredControls) {
      assert.equal(src.includes(control), true, `SettingsScreen missing preserved control: ${control}`);
    }
  });

  test('2. HomeScreen preserves native/PWA update cards, real sections, and adds JTEC Cloud & JTEC Party access', () => {
    const src = fs.readFileSync(HOME_PATH, 'utf8');

    const requiredSections = [
      'PWAInstallButton',
      'nativeUpdateInfo',
      'isPWAUpdateAvailable',
      'Recently Played',
      'Recently Added',
      'Your Playlists',
      'Favorites',
      'JTEC Cloud',
      'JTEC Party',
      'onOpenCloud',
      'onOpenParty',
      'onTogglePlay',
      'onOpenFullPlayer',
    ];
    for (const section of requiredSections) {
      assert.equal(src.includes(section), true, `HomeScreen missing required section/prop: ${section}`);
    }
  });

  test('3. AboutDeveloperView includes exact JTEC project introduction and authentic identity without clichés', () => {
    const src = fs.readFileSync(ABOUT_DEV_PATH, 'utf8');

    assert.equal(
      src.includes(REQUIRED_JTEC_INTRO),
      true,
      'AboutDeveloperView must include the exact JTEC project introduction paragraph'
    );
    assert.equal(src.includes('Johnny TEC (JTEC)'), true);
    assert.equal(src.includes('Independent Software Developer'), true);
    assert.equal(src.includes('fatormajohn999@gmail.com'), true);
    assert.equal(src.includes('Share JTEC MUSIC'), true);
    assert.equal(src.includes('APP_VERSION'), true);
    assert.equal(src.includes('BUILD_DATE'), true);
    assert.equal(src.includes('APK_DOWNLOAD_URL'), true);

    assert.equal(
      src.toLowerCase().includes('developer who loves music'),
      false,
      'AboutDeveloperView must not contain generic "developer who loves music" copy'
    );
  });

  test('4. PrivacyPolicyView accurately documents cloud management, local storage, Party, install counting, and external services with no secrets', () => {
    const src = fs.readFileSync(PRIVACY_PATH, 'utf8');
    const guideSrc = fs.readFileSync(USER_GUIDE_PATH, 'utf8');

    assert.equal(
      src.toLowerCase().includes('cloud music uploading is not supported'),
      false,
      'PrivacyPolicyView must not contain false claim that cloud music uploading is not supported'
    );
    assert.equal(
      guideSrc.includes('JTEC MUSIC does not support uploading music files to the cloud'),
      false,
      'UserGuideView must stay consistent with PrivacyPolicyView on cloud upload behavior'
    );

    const requiredTopics = [
      'TOTP',
      'jtec_music_database',
      'IndexedDB',
      'JTEC Party',
      '8-character Party ID',
      'anonymous install ID',
      'device manufacturer',
      'Notifications',
      'Home Widget',
      'Manage downloads',
      'Supabase',
      'Jamendo',
      'Internet Archive',
      'GitHub Releases',
      'fatormajohn999@gmail.com',
    ];
    for (const topic of requiredTopics) {
      assert.equal(src.includes(topic), true, `PrivacyPolicyView missing required topic: ${topic}`);
    }

    // Ensure no internal Supabase project URLs, anon keys, or private admin email leaks
    assert.equal(src.includes('.supabase.co'), false, 'PrivacyPolicyView must not expose Supabase URLs');
    assert.equal(src.includes('eyJ'), false, 'PrivacyPolicyView must not expose JWT tokens or anon keys');
    assert.equal(src.includes('SUPABASE_'), false, 'PrivacyPolicyView must not expose internal env vars');
  });

  test('5. App.tsx wires redesigned HomeScreen and SettingsScreen props cleanly', () => {
    const src = fs.readFileSync(APP_PATH, 'utf8');

    assert.equal(src.includes('onOpenEffects={() => setIsEffectsModalOpen(true)}'), true);
    assert.equal(src.includes('onSubViewChange={setSettingsSubView}'), true);
    assert.equal(src.includes('onOpenParty={handleOpenPartyScreen}'), true);
    assert.equal(src.includes('partyRoomCode={partyState.roomCode}'), true);
    assert.equal(src.includes('partyMemberCount={partyState.members.length}'), true);
  });
});
