import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

import { PartyService } from '../../party/PartyService';
import {
  DEFAULT_PARTY_HOST_PREFERENCES,
  getPartyHostPreferencesSync,
  savePartyHostPreferences,
  validatePartyHostPreferences,
} from '../../party/partyPreferences';
import type { PartyTrack } from '../../party/types';

const readSource = (relPath: string): string =>
  fs.readFileSync(path.resolve(process.cwd(), relPath), 'utf8');

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

describe('JTEC Party redesigned navigation, pre-create room settings, and mobile layout guarantees', () => {
  test('Lobby uses fixed 3-tab bottom navigation, organized Profile sections, and pre-create Party Setup before Create Room', () => {
    const screen = readSource('src/party/PartyScreen.tsx');

    // Compact header & fixed lobby bottom nav
    assert.ok(screen.includes('h-12 flex items-center justify-between'));
    assert.ok(screen.includes('env(safe-area-inset-top'));
    assert.ok(screen.includes('env(safe-area-inset-bottom'));
    assert.ok(screen.includes('aria-label="Party Lobby Navigation"'));
    assert.ok(screen.includes("key: 'rooms', label: 'Rooms'"));
    assert.ok(screen.includes("key: 'friends', label: 'Friends'"));
    assert.ok(screen.includes("key: 'profile', label: 'Profile'"));

    // Organized Profile sections
    assert.ok(screen.includes('My Profile'));
    assert.ok(screen.includes('Party Preferences'));
    assert.ok(screen.includes('Account Management'));

    // Pre-create Party Setup switches appear before Create Room button
    const setupIdx = screen.indexOf('Party Setup');
    const createRoomBtnIdx = screen.indexOf('Create Room');
    assert.ok(setupIdx > 0 && createRoomBtnIdx > setupIdx);
    assert.ok(screen.includes('Allow members to add music'));
    assert.ok(screen.includes('Enable automatic vote-to-skip'));
    assert.ok(screen.includes('Allow new members to join'));
    assert.ok(screen.includes('PartyService.createRoom(validatedSetup)'));
  });

  test('Active Room uses persistent 5-tab bottom navigation without intermediate Room Menu cards', () => {
    const screen = readSource('src/party/PartyScreen.tsx');
    const listen = readSource('src/party/components/PartyRoomListenTab.tsx');

    assert.equal(screen.includes('PartyRoomDashboard'), false);
    assert.equal(listen.includes('Room Menu'), false);
    assert.ok(listen.includes('min(66vw,31dvh)'));

    assert.ok(screen.includes('isInActiveRoom'));
    assert.ok(screen.includes('aria-label="Active Party Room Navigation"'));
    assert.ok(screen.includes("key: 'listen', label: 'Listen'"));
    assert.ok(screen.includes("key: 'people', label: 'People'"));
    assert.ok(screen.includes("key: 'invite', label: 'Invite'"));
    assert.match(screen, /key:\s*'chat',\s*label:\s*'Chat'/);
    assert.match(screen, /key:\s*'queue',\s*label:\s*'Queue'/);
    assert.ok(screen.includes('unreadChatCount'));
    assert.ok(screen.includes('partyState.queue.length'));
    assert.ok(screen.includes('showLeaveConfirm'));
  });

  test('In-room host settings toggles are removed from People and Queue while preserving member management and queue actions', () => {
    const people = readSource('src/party/components/PartyRoomPeopleTab.tsx');
    const queue = readSource('src/party/components/PartyRoomQueueTab.tsx');

    // Duplicate/in-room host switches removed
    assert.equal(people.includes('toggleRoomLock'), false);
    assert.equal(people.includes('hostSetGuestQueueAllowed'), false);
    assert.equal(people.includes('hostSetAutoSkip'), false);
    assert.equal(queue.includes('hostSetGuestQueueAllowed'), false);

    // Essential People & Queue capabilities preserved
    assert.ok(people.includes('flex-1 min-h-0 h-full w-full'));
    assert.ok(people.includes('Sync Log'));
    assert.ok(people.includes('onKickMember'));
    assert.ok(people.includes('onSelectMember'));
    assert.ok(queue.includes('flex-1 min-h-0 overflow-y-auto'));
    assert.ok(queue.includes('Add Music'));
  });

  test('Chat and Invite tabs preserve independent full-height scrolling and Android keyboard-safe composer layout', () => {
    const chat = readSource('src/party/components/PartyRoomChatTab.tsx');
    const invite = readSource('src/party/components/PartyRoomInviteTab.tsx');
    const screen = readSource('src/party/PartyScreen.tsx');

    assert.equal(chat.includes('CHAT_QUICK_EMOJIS'), false);
    assert.equal(chat.includes('showEmojiPicker'), false);
    assert.equal(/\bSmile\b/.test(chat), false);
    assert.ok(chat.includes('flex-1 min-h-0 overflow-y-auto'));
    assert.ok(chat.includes('PartyService.sendChatMessage'));
    assert.ok(screen.includes('visualViewport'));

    assert.equal(invite.includes('max-h-60 overflow-y-auto'), false);
    assert.ok(invite.includes('flex-1 min-h-0 h-full w-full overflow-y-auto'));
    assert.ok(invite.includes('QrCodeDisplay'));
  });
});

describe('JTEC Party pre-create room settings validation, sync & enforcement', () => {
  beforeEach(async () => {
    (globalThis as any).localStorage.clear();
    await PartyService.leaveRoom(false);
    PartyService.clearErrorMessage();
  });

  afterEach(async () => {
    await PartyService.leaveRoom(false);
  });

  test('validatePartyHostPreferences uses safe defaults and persists preferences', async () => {
    assert.deepEqual(validatePartyHostPreferences(undefined), DEFAULT_PARTY_HOST_PREFERENCES);
    assert.deepEqual(
      validatePartyHostPreferences({
        allowGuestQueue: true,
        autoSkipEnabled: 'invalid' as any,
        allowNewMembers: false,
      }),
      {
        allowGuestQueue: true,
        autoSkipEnabled: false,
        allowNewMembers: false,
      }
    );

    const saved = await savePartyHostPreferences({ allowGuestQueue: true, autoSkipEnabled: true });
    assert.equal(saved.allowGuestQueue, true);
    assert.equal(saved.autoSkipEnabled, true);
    assert.equal(saved.allowNewMembers, true);
    assert.deepEqual(getPartyHostPreferencesSync(), saved);
  });

  test('PartyService.createRoom(options) applies selected settings before channel connect and broadcasts them to joining and reconnecting guests', async () => {
    const svc = PartyService as any;
    const originalResolveClient = svc.resolvePartyClient.bind(svc);
    const originalConnectChannel = svc.connectChannel.bind(svc);
    let stateAtConnectStart: any = null;
    const channel = createFakeChannel();

    svc.resolvePartyClient = () => ({ client: {}, maskedHost: 'test.supabase.co' });
    svc.connectChannel = async function (code: string, role: string) {
      stateAtConnectStart = PartyService.getState();
      svc.channel = channel;
      svc.state.isConnected = true;
      svc.roomChannelStatus = 'SUBSCRIBED';
      svc.broadcastHostRoomSettings();
      svc.broadcastCurrentHostState();
    };

    try {
      const code = await PartyService.createRoom({
        allowGuestQueue: true,
        autoSkipEnabled: true,
        allowNewMembers: false,
      });

      assert.equal(code.length, 6);
      assert.ok(stateAtConnectStart, 'Host state should exist before channel connection begins');
      assert.equal(stateAtConnectStart.allowGuestQueue, true);
      assert.equal(stateAtConnectStart.autoSkipEnabled, true);
      assert.equal(stateAtConnectStart.isLocked, true);

      const lockMsg = channel.sent.find((m) => m.payload.type === 'room_lock');
      const skipMsg = channel.sent.find((m) => m.payload.type === 'skip_votes_update');
      const queuePermMsg = channel.sent.find((m) => m.payload.type === 'set_guest_queue_permission');
      const stateMsg = channel.sent.find((m) => m.payload.type === 'state');

      assert.equal(lockMsg?.payload.isLocked, true);
      assert.equal(skipMsg?.payload.autoSkipEnabled, true);
      assert.equal(queuePermMsg?.payload.enabled, true);
      assert.equal(stateMsg?.payload.isLocked, true);
      assert.equal(stateMsg?.payload.autoSkipEnabled, true);
      assert.equal(stateMsg?.payload.allowGuestQueue, true);

      // When room is locked (allowNewMembers: false), new guest hello is rejected
      svc.handleBroadcastMessage({
        type: 'hello',
        memberId: 'new_guest_1',
        nickname: 'New Guest',
        senderId: 'new_guest_1',
        seq: 1,
      });
      const kickMsg = channel.sent.find(
        (m) => m.payload.type === 'kick_member' && m.payload.targetId === 'new_guest_1'
      );
      assert.ok(kickMsg, 'Locked room created with allowNewMembers=false should reject new joins');

      // Now open room and verify guest hello receives full current room settings
      PartyService.toggleRoomLock();
      svc.handleBroadcastMessage({
        type: 'hello',
        memberId: 'reconnecting_guest',
        nickname: 'Reconnecting Guest',
        senderId: 'reconnecting_guest',
        seq: 1,
      });
      const guestQueuePerm = channel.sent.find(
        (m) =>
          m.payload.type === 'set_guest_queue_permission' &&
          m.payload.targetMemberId === 'reconnecting_guest'
      );
      const guestAutoSkip = channel.sent.find(
        (m) =>
          m.payload.type === 'skip_votes_update' &&
          m.payload.targetMemberId === 'reconnecting_guest'
      );
      const guestLock = channel.sent.find(
        (m) => m.payload.type === 'room_lock' && m.payload.targetMemberId === 'reconnecting_guest'
      );

      assert.equal(guestQueuePerm?.payload.enabled, true);
      assert.equal(guestAutoSkip?.payload.autoSkipEnabled, true);
      assert.equal(guestLock?.payload.isLocked, false);
    } finally {
      svc.resolvePartyClient = originalResolveClient;
      svc.connectChannel = originalConnectChannel;
    }
  });

  test('Guest receives pre-configured settings via state sync, queue permission enforces additions, and auto-skip advances track', async () => {
    const svc = PartyService as any;
    const channel = createFakeChannel();

    // Guest joins and receives host heartbeat state with updated settings
    svc.channel = channel;
    svc.state.roomCode = 'SYNC88';
    svc.state.role = 'guest';
    svc.state.isConnected = true;

    svc.handleBroadcastMessage({
      type: 'state',
      track: null,
      status: 'idle',
      positionMs: 0,
      hostTimestamp: Date.now(),
      isLocked: false,
      autoSkipEnabled: true,
      allowGuestQueue: true,
      senderId: 'host_user',
      seq: 10,
    });

    const guestState = PartyService.getState();
    assert.equal(guestState.allowGuestQueue, true);
    assert.equal(guestState.autoSkipEnabled, true);
    assert.equal(guestState.isLocked, false);

    const track: PartyTrack = {
      source: 'jtec_main',
      id: 't_guest_1',
      title: 'Guest Allowed Track',
      artist: 'Artist',
      audioUrl: 'https://cdn.example.com/track.mp3',
    };
    const res = PartyService.addTracksToQueue([track]);
    assert.equal(res.addedCount, 1);
    assert.ok(channel.sent.some((m) => m.payload.type === 'guest_add_queue'));

    // Auto-skip check on host when > 50% vote
    await PartyService.leaveRoom(false);
    const hostChannel = createFakeChannel();
    const unregister = PartyService.registerPlayerHandlers({
      loadTrack: async () => true,
      play: async () => {},
      pause: () => {},
      seek: () => {},
      getCurrentPositionSeconds: () => 0,
    });

    try {
      svc.channel = hostChannel;
      svc.state.roomCode = 'SKIP77';
      svc.state.role = 'host';
      svc.state.isConnected = true;
      svc.state.autoSkipEnabled = true;
      svc.state.currentTrack = track;
      svc.state.queue = [
        {
          source: 'jtec_main',
          id: 't_next_2',
          title: 'Next Up',
          artist: 'Artist 2',
          audioUrl: 'https://cdn.example.com/next.mp3',
        },
      ];
      svc.state.members = [
        { id: svc.state.selfId, nickname: 'Host', isHost: true, status: 'playing', lastSeen: Date.now() },
        { id: 'g1', nickname: 'Guest 1', isHost: false, status: 'playing', lastSeen: Date.now() },
      ];

      // 1 of 2 is not > floor(2/2)=1; 2 of 2 triggers auto-skip
      svc.handleBroadcastMessage({ type: 'vote_skip', memberId: 'g1', senderId: 'g1', seq: 1 });
      assert.equal(PartyService.getState().currentTrack?.id, 't_guest_1');

      PartyService.voteToSkip();
      assert.equal(PartyService.getState().currentTrack?.id, 't_next_2');
    } finally {
      unregister();
    }
  });
});
