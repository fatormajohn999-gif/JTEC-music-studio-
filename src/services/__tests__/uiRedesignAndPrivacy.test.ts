import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const SETTINGS_PATH = path.resolve(process.cwd(), 'src/screens/SettingsScreen.tsx');
const HOME_PATH = path.resolve(process.cwd(), 'src/screens/HomeScreen.tsx');
const ABOUT_DEV_PATH = path.resolve(process.cwd(), 'src/components/AboutDeveloperView.tsx');
const PRIVACY_PATH = path.resolve(process.cwd(), 'src/components/PrivacyPolicyView.tsx');
const USER_GUIDE_PATH = path.resolve(process.cwd(), 'src/components/UserGuideView.tsx');
const APP_PATH = path.resolve(process.cwd(), 'src/App.tsx');

const REQUIRED_JTEC_INTRO =
  'JTEC is an independent technology and software project founded by Johnny TEC (JTEC). It focuses on creating practical digital products, mobile applications and connected experiences that make technology more useful and accessible. Through projects such as JTEC MUSIC and JTEC Party, the aim is to build thoughtful, reliable products with a strong focus on usability, performance and continuous improvement.';

describe('Settings, Home Screen, About Developer & Privacy Policy Redesign', () => {
  test('1. SettingsScreen implements JTEC Party featured card, 5 clean categories, and preserves all controls', () => {
    const src = fs.readFileSync(SETTINGS_PATH, 'utf8');

    const requiredCategories = [
      'JTEC Party',
      'Playback & Sound',
      'Appearance & Player',
      'Downloads & Storage',
      'Notifications & Device',
      'About, Privacy & Support',
    ];
    for (const label of requiredCategories) {
      assert.equal(src.includes(label), true, `SettingsScreen missing category/card: ${label}`);
    }

    const requiredControls = [
      'autoplayNext',
      'SleepTimerSection',
      'rememberLastSong',
      'onOpenEffects',
      'neonGlow',
      'visualizerMode',
      'reactionStrength',
      'performanceMode',
      'reducedMotion',
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
