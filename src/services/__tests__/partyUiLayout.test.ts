import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Minimal Web Storage / window mocks for testing PartyService & partyPreferences
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
}

if (!(globalThis as any).localStorage) {
  (globalThis as any).localStorage = new MemoryStorage();
}
if (!(globalThis as any).sessionStorage) {
  (globalThis as any).sessionStorage = new MemoryStorage();
}
if (!(globalThis as any).window) {
  (globalThis as any).window = {
    localStorage: (globalThis as any).localStorage,
    sessionStorage: (globalThis as any).sessionStorage,
    location: { origin: 'https://jtec.app', href: 'https://jtec.app/', pathname: '/', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import {
  DEFAULT_PARTY_ROOM_SETTINGS,
  validatePartyRoomSettings,
  loadSavedPartyPreferences,
  savePartyPreferences,
  resetPartyPreferences,
} from '../../party/utils/partyPreferences';
import { PartyService } from '../../party/PartyService';
import type { PartyTrack } from '../../party/types';

const readSource = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

const existsSource = (relPath: string): boolean =>
  fs.existsSync(path.resolve(process.cwd(), relPath));

function createFakeChannel() {
  const sent: Array<{ type: string; event: string; payload: any }> = [];
  return {
    sent,
    send: async (msg: { type: string; event: string; payload: any }) => {
      sent.push(msg);
      return 'ok';
    },
    track: async () => 'ok',
    untrack: async () => 'ok',
    unsubscribe: async () => 'ok',
    presenceState: () => ({}),
  };
}

describe('JTEC Party redesigned navigation, layout & pre-create room settings', () => {
  beforeEach(async () => {
    resetPartyPreferences();
    await PartyService.leaveRoom(false);
    PartyService.clearErrorMessage();
  });

  test('Lobby uses fixed 3-tab bottom navigation, safe-area padding, and Profile sections (My Profile, Party Preferences, Account Management)', () => {
    const screen = readSource('src/party/PartyScreen.tsx');

    // Top horizontal Rooms / Friends / Profile tab bar replaced by fixed bottom nav
    assert.ok(screen.includes('aria-label="Party Lobby Navigation"'));
    assert.ok(screen.includes('grid-cols-3'));
    assert.ok(screen.includes('pb-[max(0.45rem,env(safe-area-inset-bottom,0px))]'));

    // Profile tab structured cleanly into the 3 required sections
    assert.ok(screen.includes('My Profile'));
    assert.ok(screen.includes('Party Preferences'));
    assert.ok(screen.includes('Account Management'));
    assert.ok(screen.includes('Delete My Account'));

    // Pre-create Party Setup bottom sheet with only existing supported settings
    assert.ok(screen.includes('Party Setup'));
    assert.ok(screen.includes('Allow members to add music'));
    assert.ok(screen.includes('Enable automatic vote-to-skip'));
    assert.ok(screen.includes('Allow new members to join'));
    assert.ok(screen.includes('PartyService.createRoom(validated)'));
  });

  test('Active Party replaces Room Menu dashboard with persistent 5-tab bottom navigation and compact top header', () => {
    const screen = readSource('src/party/PartyScreen.tsx');
    const listen = readSource('src/party/components/PartyRoomListenTab.tsx');

    // Intermediate Room Menu card flow removed from normal navigation
    assert.equal(existsSource('src/party/components/PartyRoomDashboard.tsx'), false);
    assert.equal(screen.includes('PartyRoomDashboard'), false);
    assert.equal(listen.includes('Room Menu'), false);
    assert.equal(listen.includes('onOpenDashboard'), false);

    // Persistent 5-tab bottom navigation bar inside active room
    assert.ok(screen.includes('aria-label="Active Party Room Navigation"'));
    assert.ok(screen.includes('grid-cols-5'));
    for (const label of ["'Listen'", "'People'", "'Invite'", "'Chat'", "'Queue'"]) {
      assert.ok(screen.includes(label), `Missing active room tab label ${label}`);
    }
    assert.ok(screen.includes('unreadChatCount'));
    assert.ok(screen.includes('partyState.queue.length'));

    // Top header compact with room code, role, and Leave/End confirmation protection
    assert.ok(screen.includes('h-12 flex items-center justify-between'));
    assert.ok(screen.includes('env(safe-area-inset-top'));
    assert.ok(screen.includes('setShowLeaveConfirm(true)'));
  });

  test('In-room duplicate host setting controls are removed from People and Queue while preserving member kick and queue actions', () => {
    const people = readSource('src/party/components/PartyRoomPeopleTab.tsx');
    const queue = readSource('src/party/components/PartyRoomQueueTab.tsx');

    // Host setting switches removed from in-room tabs
    assert.equal(people.includes('toggleRoomLock'), false);
    assert.equal(people.includes('hostSetGuestQueueAllowed'), false);
    assert.equal(people.includes('hostSetAutoSkip'), false);
    assert.equal(people.includes('Host Controls'), false);
    assert.equal(queue.includes('hostSetGuestQueueAllowed'), false);

    // Member management, kick/ban, sync log, and queue actions preserved
    assert.ok(people.includes('onKickMember'));
    assert.ok(people.includes('onOpenConnectionDetails'));
    assert.ok(people.includes('onSelectMember'));
    assert.ok(people.includes('flex-1 min-h-0 h-full w-full'));

    assert.ok(queue.includes('flex-1 min-h-0 overflow-y-auto'));
    assert.ok(queue.includes('Add Music'));
    assert.ok(queue.includes('hostPlayTrackFromQueue'));
    assert.ok(queue.includes('hostReorderQueue'));
    assert.ok(queue.includes('hostRemoveFromQueue'));
  });

  test('Chat and Invite maintain keyboard-safe, full-height independent scrolling without built-in composer emoji picker or nested scrollbars', () => {
    const chat = readSource('src/party/components/PartyRoomChatTab.tsx');
    const invite = readSource('src/party/components/PartyRoomInviteTab.tsx');

    // Chat guarantees
    assert.equal(chat.includes('CHAT_QUICK_EMOJIS'), false);
    assert.equal(chat.includes('showEmojiPicker'), false);
    assert.equal(/\bSmile\b/.test(chat), false);
    assert.ok(chat.includes('flex-1 min-h-0 overflow-y-auto'));
    assert.ok(chat.includes('enterKeyHint="send"'));
    assert.ok(chat.includes('handleComposerFocus'));
    assert.ok(chat.includes('PartyService.sendChatMessage'));

    // Invite guarantees (no nested scrollbar)
    assert.equal(invite.includes('max-h-60 overflow-y-auto'), false);
    assert.ok(invite.includes('flex-1 min-h-0 h-full w-full overflow-y-auto'));
    assert.ok(invite.includes('QrCodeDisplay'));
  });

  test('Party Preferences validate, persist across reads, and reset cleanly', () => {
    assert.deepEqual(loadSavedPartyPreferences(), DEFAULT_PARTY_ROOM_SETTINGS);

    const saved = savePartyPreferences({
      allowGuestQueue: true,
      autoSkipEnabled: true,
      allowNewMembers: false,
    });
    assert.deepEqual(saved, {
      allowGuestQueue: true,
      autoSkipEnabled: true,
      allowNewMembers: false,
    });

    assert.deepEqual(loadSavedPartyPreferences(), saved);

    // Malformed / legacy isLocked validation
    assert.deepEqual(
      validatePartyRoomSettings({
        allowGuestQueue: 1 as any,
        autoSkipEnabled: 0 as any,
        isLocked: true,
      }),
      {
        allowGuestQueue: true,
        autoSkipEnabled: false,
        allowNewMembers: false,
      }
    );

    assert.deepEqual(resetPartyPreferences(), DEFAULT_PARTY_ROOM_SETTINGS);
  });

  test('PartyService.createRoom applies pre-create settings before connectChannel and syncs them to joining and reconnecting guests', async () => {
    const svc = PartyService as any;

    // Intercept connectChannel to observe state BEFORE channel connection completes
    const originalConnectChannel = svc.connectChannel;
    const originalInitRoom = svc.initRoom;
    assert.equal(typeof originalInitRoom, 'function');

    const fakeChannel = createFakeChannel();
    let observedPreConnectState: any = null;
    svc.connectChannel = async (code: string, role: string) => {
      observedPreConnectState = PartyService.getState();
      assert.equal(observedPreConnectState.roomCode, code);
      assert.equal(observedPreConnectState.role, role);
      svc.isIntentionalDisconnect = false;
      svc.state.isConnected = true;
      svc.channel = fakeChannel;
      svc.broadcastCurrentHostState();
    };

    try {
      const origCreateRoom = PartyService.createRoom.bind(PartyService);
      assert.equal(typeof origCreateRoom, 'function');

      // Also verify PartyService.ts applies hostSettings in initRoom before connectChannel
      const serviceSource = readSource('src/party/PartyService.ts');
      assert.ok(serviceSource.includes('const appliedSettings = role === \'host\' ? validatePartyRoomSettings(hostSettings) : null;'));
      assert.ok(serviceSource.includes('this.state.isLocked = appliedSettings ? !appliedSettings.allowNewMembers : false;'));
      assert.ok(serviceSource.includes('this.state.autoSkipEnabled = appliedSettings ? appliedSettings.autoSkipEnabled : false;'));
      assert.ok(serviceSource.includes('this.state.allowGuestQueue = appliedSettings ? appliedSettings.allowGuestQueue : false;'));

      // Simulate configured Supabase client for initRoom unit verification
      svc.initRoom = async (code: string, role: 'host' | 'guest', hostSettings?: any) => {
        const applied = validatePartyRoomSettings(hostSettings);
        svc.state.roomCode = code;
        svc.state.role = role;
        svc.state.isLocked = !applied.allowNewMembers;
        svc.state.allowGuestQueue = applied.allowGuestQueue;
        svc.state.autoSkipEnabled = applied.autoSkipEnabled;
        svc.channel = fakeChannel;
        await svc.connectChannel(code, role);
      };

      const roomCode = await PartyService.createRoom({
        allowGuestQueue: true,
        autoSkipEnabled: true,
        allowNewMembers: false,
      });

      assert.ok(roomCode.startsWith('JT'));
      assert.equal(observedPreConnectState.allowGuestQueue, true);
      assert.equal(observedPreConnectState.autoSkipEnabled, true);
      assert.equal(observedPreConnectState.isLocked, true);

      // Initial host state broadcast includes room settings
      const initialStateMsg = fakeChannel.sent.find((m) => m.payload?.type === 'state');
      assert.ok(initialStateMsg);
      assert.equal(initialStateMsg.payload.allowGuestQueue, true);
      assert.equal(initialStateMsg.payload.autoSkipEnabled, true);
      assert.equal(initialStateMsg.payload.isLocked, true);

      // Room Lock enforcement: joining guest receives kick_member when room is closed (isLocked: true)
      svc.handleBroadcastMessage({
        type: 'hello',
        memberId: 'guest_blocked_1',
        nickname: 'Blocked Guest',
        senderId: 'guest_blocked_1',
        seq: 1,
      });
      const kickMsg = fakeChannel.sent.find(
        (m) => m.payload?.type === 'kick_member' && m.payload?.targetId === 'guest_blocked_1'
      );
      assert.ok(kickMsg, 'Host must reject new guests when allowNewMembers was false before create');

      // Reopen room dynamically via state or create open room with guest queue & auto-skip enabled
      fakeChannel.sent.length = 0;
      await PartyService.createRoom({
        allowGuestQueue: true,
        autoSkipEnabled: true,
        allowNewMembers: true,
      });

      svc.handleBroadcastMessage({
        type: 'hello',
        memberId: 'guest_join_1',
        nickname: 'Allowed Guest',
        senderId: 'guest_join_1',
        seq: 1,
      });

      const helloState = fakeChannel.sent.find(
        (m) => m.payload?.type === 'state' && m.payload?.targetMemberId === 'guest_join_1'
      );
      const guestQueuePerm = fakeChannel.sent.find(
        (m) =>
          m.payload?.type === 'set_guest_queue_permission' &&
          m.payload?.targetMemberId === 'guest_join_1'
      );
      const skipVotesMsg = fakeChannel.sent.find(
        (m) =>
          m.payload?.type === 'skip_votes_update' &&
          m.payload?.targetMemberId === 'guest_join_1'
      );
      assert.equal(helloState?.payload.allowGuestQueue, true);
      assert.equal(helloState?.payload.autoSkipEnabled, true);
      assert.equal(helloState?.payload.isLocked, false);
      assert.equal(guestQueuePerm?.payload.enabled, true);
      assert.equal(skipVotesMsg?.payload.autoSkipEnabled, true);

      // Guest side reconnection receives settings via state message even when idle
      await PartyService.leaveRoom(false);
      svc.isIntentionalDisconnect = false;
      svc.state.roomCode = roomCode;
      svc.state.role = 'guest';
      svc.state.isConnected = true;
      svc.channel = createFakeChannel();

      svc.handleBroadcastMessage({
        type: 'state',
        track: null,
        status: 'idle',
        positionMs: 0,
        hostTimestamp: Date.now(),
        isLocked: false,
        autoSkipEnabled: true,
        allowGuestQueue: true,
        senderId: 'host_id',
        seq: 1,
      });

      const reconnectedGuestState = PartyService.getState();
      assert.equal(reconnectedGuestState.allowGuestQueue, true);
      assert.equal(reconnectedGuestState.autoSkipEnabled, true);
      assert.equal(reconnectedGuestState.isLocked, false);

      // Guest queue switch governs behavior
      const track: PartyTrack = {
        source: 'jtec_main',
        id: 't_allowed',
        title: 'Allowed Track',
        artist: 'Artist',
        audioUrl: 'https://cdn.example.com/music/ok.mp3',
      };
      const addRes = PartyService.addTracksToQueue([track]);
      assert.equal(addRes.addedCount, 1);

      // Auto-skip switch governs majority vote-to-skip behavior on host
      await PartyService.leaveRoom(false);
      svc.isIntentionalDisconnect = false;
      svc.state.roomCode = 'SKIP01';
      svc.state.role = 'host';
      svc.state.isConnected = true;
      svc.state.autoSkipEnabled = true;
      svc.state.members = [
        { id: svc.state.selfId, nickname: 'Host', isHost: true, status: 'playing', lastSeen: Date.now() },
        { id: 'g1', nickname: 'G1', isHost: false, status: 'playing', lastSeen: Date.now() },
      ];
      svc.state.currentTrack = track;
      svc.state.queue = [
        { ...track, id: 't_next', title: 'Next Track' },
      ];
      svc.channel = createFakeChannel();
      const unregister = PartyService.registerPlayerHandlers({
        loadTrack: async () => true,
        play: async () => {},
        pause: () => {},
        seek: () => {},
        getCurrentPositionSeconds: () => 0,
      });
      try {
        // Two votes out of 2 (> floor(2/2) = 1) triggers auto-skip to Next Track
        PartyService.voteToSkip();
        assert.equal(PartyService.getState().currentTrack?.id, 't_allowed');
        svc.handleBroadcastMessage({
          type: 'vote_skip',
          memberId: 'g1',
          senderId: 'g1',
          seq: 1,
        });
        assert.equal(PartyService.getState().currentTrack?.id, 't_next');
      } finally {
        unregister();
      }
    } finally {
      svc.connectChannel = originalConnectChannel;
      svc.initRoom = originalInitRoom;
    }
  });
});
