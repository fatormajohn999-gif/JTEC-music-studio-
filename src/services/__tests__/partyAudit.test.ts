import { describe, test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// Provide minimal browser Web Storage / navigator mocks before importing PartyService
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

const mockLocalStorage = new MemoryStorage();
const mockSessionStorage = new MemoryStorage();

if (!(globalThis as any).localStorage) {
  (globalThis as any).localStorage = mockLocalStorage;
}
if (!(globalThis as any).sessionStorage) {
  (globalThis as any).sessionStorage = mockSessionStorage;
}
if (!(globalThis as any).window) {
  (globalThis as any).window = {
    localStorage: mockLocalStorage,
    sessionStorage: mockSessionStorage,
    location: { origin: 'https://jtec.app', pathname: '/', search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
}

import { isShareablePartyAudioUrl } from '../../party/utils/audioValidation';
import { PartyService } from '../../party/PartyService';
import type { PartyTrack } from '../../party/types';

function createFakeChannel(sendStatus: 'ok' | 'timed out' | 'error' = 'ok') {
  const sent: Array<{ type: string; event: string; payload: any }> = [];
  return {
    sent,
    send: async (msg: { type: string; event: string; payload: any }) => {
      sent.push(msg);
      return sendStatus;
    },
    track: async () => 'ok',
    untrack: async () => 'ok',
    unsubscribe: async () => 'ok',
    presenceState: () => ({}),
  };
}

describe('isShareablePartyAudioUrl security validation', () => {
  test('accepts valid HTTPS streaming URLs', () => {
    assert.equal(
      isShareablePartyAudioUrl('https://abc.supabase.co/storage/v1/object/public/music/song.mp3'),
      true
    );
    assert.equal(
      isShareablePartyAudioUrl('https://prod-1.storage.jamendo.com/?trackid=1889218&format=mp31'),
      true
    );
    assert.equal(
      isShareablePartyAudioUrl('https://archive.org/download/IslamicNasheedCollection/bismillah.mp3'),
      true
    );
  });

  test('rejects local phone paths, blob URLs, data URLs, file schemes, localhost, and http', () => {
    const invalidInputs = [
      '',
      '   ',
      null,
      undefined,
      '/storage/emulated/0/Music/local.mp3',
      './music/local.mp3',
      '../audio.mp3',
      'C:\\Users\\user\\Music\\song.mp3',
      'file:///storage/emulated/0/Music/song.mp3',
      'content://media/external/audio/media/42',
      'capacitor://localhost/_capacitor_file_/song.mp3',
      'blob:https://jtec.app/1234-5678',
      'data:audio/mpeg;base64,SUQz',
      'http://localhost:3000/track.mp3',
      'http://127.0.0.1:8080/track.mp3',
      'http://example.com/insecure.mp3',
    ];

    for (const url of invalidInputs) {
      assert.equal(isShareablePartyAudioUrl(url as any), false, `Expected false for ${String(url)}`);
    }
  });
});

describe('PartyService chat & queue audit', () => {
  beforeEach(async () => {
    await PartyService.leaveRoom(false);
    PartyService.clearErrorMessage();
  });

  test('sendChatMessage fails cleanly when not in a room or disconnected', async () => {
    const noRoom = await PartyService.sendChatMessage('Hello');
    assert.equal(noRoom.ok, false);
    assert.match(noRoom.error || '', /Join a party room/i);

    const svc = PartyService as any;
    svc.state.roomCode = 'AB12CD';
    svc.state.isConnected = false;
    svc.channel = null;

    const disconnected = await PartyService.sendChatMessage('Hello offline');
    assert.equal(disconnected.ok, false);
    assert.match(disconnected.error || '', /disconnected/i);
    assert.equal(PartyService.getState().chatMessages.length, 0);
  });

  test('sendChatMessage does not append message if Realtime ack fails, and succeeds when ok', async () => {
    const svc = PartyService as any;
    svc.state.roomCode = 'RM44XY';
    svc.state.isConnected = true;

    const failingChannel = createFakeChannel('timed out');
    svc.channel = failingChannel;
    const failedRes = await PartyService.sendChatMessage('Will fail');
    assert.equal(failedRes.ok, false);
    assert.equal(PartyService.getState().chatMessages.length, 0);

    const okChannel = createFakeChannel('ok');
    svc.channel = okChannel;
    const okRes = await PartyService.sendChatMessage('Salam everyone');
    assert.equal(okRes.ok, true);
    assert.equal(PartyService.getState().chatMessages.length, 1);
    assert.equal(PartyService.getState().chatMessages[0].text, 'Salam everyone');
    assert.equal(okChannel.sent.length, 1);
    assert.equal(okChannel.sent[0].payload.type, 'chat_msg');
  });

  test('host sends chat_history_sync on guest hello and guest deduplicates/sorts history', async () => {
    const svc = PartyService as any;
    const fakeChannel = createFakeChannel('ok');
    svc.state.roomCode = 'HIST99';
    svc.state.role = 'host';
    svc.state.isConnected = true;
    svc.channel = fakeChannel;

    await PartyService.sendChatMessage('First message from host');

    svc.handleBroadcastMessage({
      type: 'hello',
      memberId: 'guest_device_2',
      nickname: 'Guest Two',
      senderId: 'guest_device_2',
      seq: 1,
    });

    const historySync = fakeChannel.sent.find((s) => s.payload.type === 'chat_history_sync');
    assert.ok(historySync, 'Host should broadcast chat_history_sync to joining guest');
    assert.equal(historySync.payload.targetMemberId, 'guest_device_2');
    assert.equal(historySync.payload.messages.length, 1);
    assert.equal(historySync.payload.messages[0].text, 'First message from host');

    // Now test guest side merge + deduplication
    await PartyService.leaveRoom(false);
    svc.state.roomCode = 'HIST99';
    svc.state.role = 'guest';
    svc.state.isConnected = true;
    svc.channel = createFakeChannel('ok');

    svc.handleBroadcastMessage({
      type: 'chat_msg',
      id: 'm_2',
      senderId: 'host_id',
      senderName: 'Host',
      text: 'Newer message',
      timestamp: 2000,
      seq: 2,
    });

    svc.handleBroadcastMessage({
      type: 'chat_history_sync',
      senderId: 'host_id',
      seq: 3,
      messages: [
        { id: 'm_1', senderId: 'host_id', senderName: 'Host', text: 'Older message', timestamp: 1000 },
        { id: 'm_2', senderId: 'host_id', senderName: 'Host', text: 'Newer message', timestamp: 2000 },
      ],
    });

    const msgs = PartyService.getState().chatMessages;
    assert.equal(msgs.length, 2);
    assert.equal(msgs[0].id, 'm_1');
    assert.equal(msgs[1].id, 'm_2');
  });

  test('queue and hostSelectTrack reject local device paths and attribute valid HTTPS tracks', async () => {
    const svc = PartyService as any;
    svc.state.roomCode = 'QTEST1';
    svc.state.role = 'host';
    svc.state.nickname = 'DJ Host';
    svc.state.isConnected = true;
    svc.channel = createFakeChannel('ok');

    // Prevent audioEngine touch by mocking playerHandlers
    const unregister = PartyService.registerPlayerHandlers({
      loadTrack: async () => true,
      play: async () => {},
      pause: () => {},
      seek: () => {},
      getCurrentPositionSeconds: () => 0,
    });

    try {
      const localTrack: PartyTrack = {
        source: 'local',
        id: 'local_1',
        title: 'Local Phone Track',
        artist: 'Device',
        audioUrl: 'file:///storage/emulated/0/song.mp3',
      };

      const cloudTrack: PartyTrack = {
        source: 'jtec_main',
        id: 'cloud_1',
        title: 'Authorized Cloud Track',
        artist: 'JTEC Artist',
        audioUrl: 'https://cdn.example.com/music/track1.mp3',
      };

      const cloudTrack2: PartyTrack = {
        source: 'jamendo',
        id: 'jam_2',
        title: 'Second Shareable Track',
        artist: 'Jamendo Artist',
        audioUrl: 'https://cdn.example.com/music/track2.mp3',
      };

      await assert.rejects(() => PartyService.hostSelectTrack(localTrack), /local path or lacks an authorized HTTPS/i);

      const res = PartyService.addTracksToQueue([localTrack, cloudTrack, cloudTrack2]);
      assert.equal(res.addedCount, 2);
      assert.equal(res.rejectedCount, 1);

      const st = PartyService.getState();
      assert.equal(st.currentTrack?.id, 'cloud_1');
      assert.equal(st.currentTrack?.addedBy?.name, 'DJ Host');
      assert.equal(st.queue.length, 1);
      assert.equal(st.queue[0].id, 'jam_2');
      assert.equal(st.queue[0].addedBy?.name, 'DJ Host');
    } finally {
      unregister();
    }
  });

  test('guest queue additions are blocked unless allowGuestQueue is enabled and URLs are sanitized', () => {
    const svc = PartyService as any;
    svc.state.roomCode = 'GUESTQ';
    svc.state.role = 'guest';
    svc.state.allowGuestQueue = false;
    svc.state.isConnected = true;
    svc.channel = createFakeChannel('ok');

    const validTrack: PartyTrack = {
      source: 'jtec_main',
      id: 'c1',
      title: 'Cloud Song',
      artist: 'Artist',
      audioUrl: 'https://cdn.example.com/song.mp3',
    };

    const blockedRes = PartyService.addTracksToQueue([validTrack]);
    assert.equal(blockedRes.addedCount, 0);
    assert.match(blockedRes.error || '', /Only the host/i);

    // Host ignores forged local paths inside queue_update
    svc.handleBroadcastMessage({
      type: 'queue_update',
      senderId: 'host_1',
      seq: 5,
      queue: [
        validTrack,
        {
          source: 'local',
          id: 'bad',
          title: 'Forged Local Path',
          artist: 'Bad',
          audioUrl: 'blob:https://evil.local/123',
        },
      ],
    });

    assert.equal(PartyService.getState().queue.length, 1);
    assert.equal(PartyService.getState().queue[0].id, 'c1');
  });

  test('unavailable or unauthorized track load transitions cleanly out of loading with an error', async () => {
    const svc = PartyService as any;
    svc.state.roomCode = 'ERR01';
    svc.state.role = 'host';
    svc.state.isConnected = true;
    svc.channel = createFakeChannel('ok');

    const unregister = PartyService.registerPlayerHandlers({
      loadTrack: async () => false,
      play: async () => {},
      pause: () => {},
      seek: () => {},
      getCurrentPositionSeconds: () => 0,
    });

    try {
      await PartyService.hostSelectTrack({
        source: 'jtec_main',
        id: 'broken_1',
        title: 'Broken Audio',
        artist: 'Missing File',
        audioUrl: 'https://cdn.example.com/missing.mp3',
      });

      const st = PartyService.getState();
      assert.notEqual(st.playbackStatus, 'loading');
      assert.match(st.errorMessage || '', /Unable to stream/i);
    } finally {
      unregister();
    }
  });
});
