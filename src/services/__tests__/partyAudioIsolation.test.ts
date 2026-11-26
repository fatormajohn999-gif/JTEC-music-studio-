import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Minimal browser DOM/Web Storage/Audio/MediaSession mocks for Node/Bun test
// ---------------------------------------------------------------------------
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

class FakeAudioElement {
  public src = '';
  public currentSrc = '';
  public crossOrigin: string | null = null;
  public preload = 'auto';
  public defaultPlaybackRate = 1.0;
  public playbackRate = 1.0;
  public preservesPitch = true;
  public currentTime = 0;
  public duration = 180;
  public paused = true;
  public error: { code: number; message: string } | null = null;
  public attributes = new Map<string, string>();
  private listeners = new Map<string, Array<(...args: any[]) => void>>();

  public loadCount = 0;
  public pauseCount = 0;
  public playCount = 0;

  addEventListener(type: string, fn: (...args: any[]) => void, options?: { once?: boolean }) {
    const arr = this.listeners.get(type) || [];
    if (options?.once) {
      const wrapper = (...args: any[]) => {
        this.listeners.set(
          type,
          (this.listeners.get(type) || []).filter((f) => f !== wrapper)
        );
        fn(...args);
      };
      arr.push(wrapper);
    } else {
      arr.push(fn);
    }
    this.listeners.set(type, arr);
  }

  emit(type: string) {
    for (const fn of [...(this.listeners.get(type) || [])]) {
      fn();
    }
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === 'src') {
      this.src = '';
      this.currentSrc = '';
    }
  }

  load() {
    this.loadCount += 1;
    this.currentSrc = this.src;
    if (this.src) {
      this.emit('loadedmetadata');
    }
  }

  async play() {
    this.playCount += 1;
    this.paused = false;
    this.emit('play');
  }

  pause() {
    this.pauseCount += 1;
    this.paused = true;
    this.emit('pause');
  }
}

const createdAudioInstances: FakeAudioElement[] = [];
const createdBlobUrls: string[] = [];
const revokedBlobUrls: string[] = [];

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
} else if (!(globalThis as any).window.location) {
  (globalThis as any).window.location = {
    origin: 'https://jtec.app',
    href: 'https://jtec.app/',
    pathname: '/',
    search: '',
  };
}
if (!(globalThis as any).navigator) {
  (globalThis as any).navigator = {};
}
if (!(globalThis as any).navigator.mediaSession) {
  (globalThis as any).navigator.mediaSession = { metadata: null };
}
if (!(globalThis as any).MediaMetadata) {
  (globalThis as any).MediaMetadata = class MockMediaMetadata {
    public title: string;
    public artist: string;
    public album: string;
    public artwork: any[];
    constructor(init: any) {
      this.title = init.title || '';
      this.artist = init.artist || '';
      this.album = init.album || '';
      this.artwork = init.artwork || [];
    }
  };
}
(globalThis as any).Audio = class TestAudio extends FakeAudioElement {
  constructor() {
    super();
    createdAudioInstances.push(this);
  }
};
(globalThis as any).URL.createObjectURL = (blob: Blob) => {
  const url = `blob:test-party-${createdBlobUrls.length + 1}-${blob.size}`;
  createdBlobUrls.push(url);
  return url;
};
(globalThis as any).URL.revokeObjectURL = (url: string) => {
  revokedBlobUrls.push(url);
};

import { PartyAudioEngineClass, partyAudioEngine } from '../../party/PartyAudioEngine';
import { PartyService } from '../../party/PartyService';
import { audioEngine } from '../audioEngine';
import { MediaSessionManager } from '../mediaSession';
import type { Song } from '../../types/music';
import type { PartyTrack } from '../../party/types';

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

const samplePartyTrack: PartyTrack = {
  id: 'party_track_1',
  title: 'Desert Breeze',
  artist: 'Studio Nasheed',
  source: 'cloud',
  audioUrl: 'https://cdn.example.com/audio/desert_breeze.mp3',
  cover: 'https://cdn.example.com/covers/desert_breeze.jpg',
  duration: 215,
};

const samplePartyTrack2: PartyTrack = {
  id: 'party_track_2',
  title: 'Night Reflections',
  artist: 'JTEC Chill',
  source: 'cloud',
  audioUrl: 'https://cdn.example.com/audio/night_reflections.mp3',
  duration: 190,
};

const sampleNormalSong: Song = {
  id: 'local_song_1',
  title: 'Normal Library Track',
  artist: 'Main Artist',
  album: 'Main Album',
  duration: 240,
  artworkUrl: 'https://cdn.example.com/covers/normal.jpg',
  audioUrl: 'https://cdn.example.com/audio/normal.mp3',
  hasStoredBlob: false,
  isFavorite: false,
};

describe('JTEC Party Audio Isolation & Lifecycle', () => {
  beforeEach(async () => {
    createdBlobUrls.length = 0;
    revokedBlobUrls.length = 0;
    await PartyService.leaveRoom(false);
    partyAudioEngine.stopAndUnload();
    audioEngine.pause();
    await MediaSessionManager.clearPartyMediaSession();
  });

  afterEach(async () => {
    await PartyService.leaveRoom(false);
    partyAudioEngine.stopAndUnload();
    await MediaSessionManager.clearPartyMediaSession();
  });

  test('Architectural check: no file under src/party imports normal global audioEngine and onSyncCurrentSong is removed', () => {
    const partyDir = path.resolve(process.cwd(), 'src/party');
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) files.push(full);
      }
    };
    walk(partyDir);

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      assert.equal(
        /services\/audioEngine/.test(content),
        false,
        `Party file ${path.relative(process.cwd(), file)} must never import normal audioEngine`
      );
    }

    const appContent = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    assert.equal(
      appContent.includes('onSyncCurrentSong'),
      false,
      'App.tsx must not sync party tracks into normal currentSong'
    );
  });

  test('Dedicated PartyAudioEngine manages its own HTMLAudioElement, blob URL revocation, and stopAndUnload()', async () => {
    const engine = new PartyAudioEngineClass();
    const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mp3' });

    await engine.loadTrack(blob);
    assert.equal(engine.hasSource(), true);
    const firstBlobUrl = engine.getCurrentObjectUrl();
    assert.ok(firstBlobUrl && firstBlobUrl.startsWith('blob:test-party-'));

    await engine.play();
    assert.equal(engine.isPlaying, true);
    engine.seek(37);
    assert.equal(engine.currentTime, 37);
    engine.setDriftSpeed(1.02);
    assert.equal(engine.getAudioElement()?.playbackRate, 1.02);

    // Loading a URL must revoke the previous blob URL
    await engine.loadTrack('https://cdn.example.com/stream.mp3');
    assert.equal(revokedBlobUrls.includes(firstBlobUrl), true);
    assert.equal(engine.getCurrentObjectUrl(), null);
    assert.equal(engine.getAudioElement()?.crossOrigin, 'anonymous');

    // CORS fallback retry without crossOrigin when audio element emits error
    const el = engine.getAudioElement() as unknown as FakeAudioElement;
    el.error = { code: 4, message: 'CORS error' };
    el.emit('error');
    assert.equal(el.crossOrigin, null);
    assert.equal(el.src, 'https://cdn.example.com/stream.mp3');

    // stopAndUnload stops playback, clears src, resets state
    await engine.play();
    assert.equal(engine.isPlaying, true);
    engine.stopAndUnload();

    assert.equal(engine.isPlaying, false);
    assert.equal(engine.currentTime, 0);
    assert.equal(engine.duration, 0);
    assert.equal(engine.hasSource(), false);
    assert.equal(el.src, '');
  });

  test('Scenario 1 & 6: Play normal music, join party, play party track, leave party -> normal music, position, effects, and metadata stay intact', async () => {
    // 1. Setup normal audio playback with custom Slow + Reverb effects
    await audioEngine.loadAudio(sampleNormalSong.audioUrl!, 42);
    audioEngine.applyEffects({
      presetName: 'Slow + Reverb',
      playbackRate: 0.85,
      reverbWet: 0.4,
      echoWet: 0.15,
      bassGain: 6,
      trebleGain: -2,
      preservesPitch: false,
      volume: 0.9,
      isEnabled: true,
    });
    await audioEngine.play();
    audioEngine.seek(42);
    // Simulate browser timeupdate event emitted after HTMLAudioElement.currentTime seek
    const normalEl = (audioEngine as any).audioElement as FakeAudioElement;
    normalEl.emit('timeupdate');
    await MediaSessionManager.publishNowPlaying(sampleNormalSong, {
      playing: true,
      position: 42,
      duration: 240,
      playbackRate: 0.85,
    });

    assert.equal(audioEngine.isPlaying, true);
    assert.equal(Math.floor(audioEngine.currentTime), 42);

    // 2. Join/host a Party and play a Party track
    const svc = PartyService as any;
    const channel = createFakeChannel();
    svc.channel = channel;
    svc.state.roomCode = 'JT9991';
    svc.state.role = 'host';
    svc.state.isConnected = true;

    PartyService.registerPlayerHandlers({
      loadTrack: async (t) => {
        await partyAudioEngine.loadTrack(t.audioUrl, 0);
        return true;
      },
      play: async () => {
        await partyAudioEngine.play();
      },
      pause: () => partyAudioEngine.pause(),
      seek: (s) => partyAudioEngine.seek(s),
      stopAndUnload: () => partyAudioEngine.stopAndUnload(),
      getCurrentPositionSeconds: () => partyAudioEngine.currentTime,
    });

    await PartyService.hostSelectTrack(samplePartyTrack);
    assert.equal(partyAudioEngine.hasSource(), true);
    assert.equal(MediaSessionManager.isPartyMediaSessionActive(), true);
    assert.equal(
      (globalThis as any).navigator.mediaSession.metadata?.title,
      samplePartyTrack.title
    );

    // Normal audioEngine must remain completely untouched
    assert.equal(audioEngine.isPlaying, true);
    assert.equal(Math.floor(audioEngine.currentTime), 42);
    assert.equal(audioEngine.getCurrentEffects().presetName, 'Slow + Reverb');
    assert.equal(audioEngine.getCurrentEffects().playbackRate, 0.85);

    // 3. Leave Party -> Party stops & unloads, normal MediaSession & playback remain intact
    await PartyService.leaveRoom(true);
    assert.equal(partyAudioEngine.isPlaying, false);
    assert.equal(partyAudioEngine.hasSource(), false);
    assert.equal(MediaSessionManager.isPartyMediaSessionActive(), false);
    assert.equal(audioEngine.isPlaying, true);
    assert.equal(Math.floor(audioEngine.currentTime), 42);
    assert.equal(audioEngine.getCurrentEffects().presetName, 'Slow + Reverb');
  });

  test('Scenario 2 & 3: Host closing room stops playback on host and broadcasts close_room stopping guests cleanly', async () => {
    const svc = PartyService as any;
    const channel = createFakeChannel();

    PartyService.registerPlayerHandlers({
      loadTrack: async (t) => {
        await partyAudioEngine.loadTrack(t.audioUrl, 0);
        return true;
      },
      play: async () => partyAudioEngine.play(),
      pause: () => partyAudioEngine.pause(),
      seek: (s) => partyAudioEngine.seek(s),
      stopAndUnload: () => partyAudioEngine.stopAndUnload(),
      getCurrentPositionSeconds: () => partyAudioEngine.currentTime,
    });

    // Host starts track
    svc.channel = channel;
    svc.state.roomCode = 'JT2222';
    svc.state.role = 'host';
    svc.state.isConnected = true;
    await PartyService.hostSelectTrack(samplePartyTrack);
    svc.executeCountdown(Date.now() - 10);
    assert.equal(partyAudioEngine.isPlaying, true);

    // Host ends party
    await PartyService.leaveRoom(true);
    assert.equal(partyAudioEngine.isPlaying, false);
    assert.equal(partyAudioEngine.hasSource(), false);
    assert.ok(channel.sent.some((m) => m.payload?.type === 'close_room'));

    // Now test Guest receiving close_room
    svc.channel = createFakeChannel();
    svc.state.roomCode = 'JT2222';
    svc.state.role = 'guest';
    svc.state.isConnected = true;
    await partyAudioEngine.loadTrack(samplePartyTrack.audioUrl);
    await partyAudioEngine.play();
    assert.equal(partyAudioEngine.isPlaying, true);

    svc.handleBroadcastMessage({
      type: 'close_room',
      reason: 'The host ended the party.',
      senderId: 'host_user',
      seq: 1,
    });

    assert.equal(PartyService.getState().roomCode, null);
    assert.equal(PartyService.getState().errorMessage, 'The host ended the party.');
    assert.equal(partyAudioEngine.isPlaying, false);
    assert.equal(partyAudioEngine.hasSource(), false);
  });

  test('Scenario 4: Guest connection drop pauses immediately, max reconnect failures unload, and stale realtime messages cannot restart audio', async () => {
    const svc = PartyService as any;
    svc.channel = createFakeChannel();
    svc.state.roomCode = 'JT3333';
    svc.state.role = 'guest';
    svc.state.isConnected = true;
    svc.state.currentTrack = samplePartyTrack;
    svc.state.playbackStatus = 'playing';

    PartyService.registerPlayerHandlers({
      loadTrack: async (t) => {
        await partyAudioEngine.loadTrack(t.audioUrl, 0);
        return true;
      },
      play: async () => partyAudioEngine.play(),
      pause: () => partyAudioEngine.pause(),
      seek: (s) => partyAudioEngine.seek(s),
      stopAndUnload: () => partyAudioEngine.stopAndUnload(),
      getCurrentPositionSeconds: () => partyAudioEngine.currentTime,
    });

    await partyAudioEngine.loadTrack(samplePartyTrack.audioUrl);
    await partyAudioEngine.play();
    assert.equal(partyAudioEngine.isPlaying, true);

    // Immediate connection drop must pause party playback right away
    svc.reconnectAttempts = 0;
    svc.handleConnectionDrop();
    assert.equal(partyAudioEngine.isPlaying, false);
    assert.equal(PartyService.getState().playbackStatus, 'paused');

    // Repeated failures exceeding MAX_RECONNECT_ATTEMPTS trigger full leave & unload
    svc.reconnectAttempts = 5;
    svc.handleConnectionDrop();
    assert.equal(PartyService.getState().roomCode, null);
    assert.equal(partyAudioEngine.hasSource(), false);

    // Clear pending reconnect timer from test
    await PartyService.leaveRoom(false);

    // Stale realtime messages after leaving MUST NOT load or restart party audio
    svc.handleBroadcastMessage({
      type: 'load',
      track: samplePartyTrack,
      commandId: 'stale_cmd_load',
      hostTimestamp: Date.now(),
      senderId: 'host_user',
      seq: 10,
    });
    svc.handleBroadcastMessage({
      type: 'start_countdown',
      commandId: 'stale_cmd_start',
      targetStartTime: Date.now() - 50,
      hostTimestamp: Date.now(),
      senderId: 'host_user',
      seq: 11,
    });
    svc.handleBroadcastMessage({
      type: 'state',
      track: samplePartyTrack,
      status: 'playing',
      positionMs: 12000,
      hostTimestamp: Date.now(),
      senderId: 'host_user',
      seq: 12,
    });

    assert.equal(PartyService.getState().roomCode, null);
    assert.equal(PartyService.getState().currentTrack, null);
    assert.equal(partyAudioEngine.isPlaying, false);
    assert.equal(partyAudioEngine.hasSource(), false);
  });

  test('Scenario 5 & 6: Leaving room aborts slow async track loads and joining a second room works cleanly without stale sequence drops', async () => {
    const svc = PartyService as any;
    let resolveDelayedLoad: ((ok: boolean) => void) | null = null;

    PartyService.registerPlayerHandlers({
      loadTrack: async (t) => {
        if (t.id === samplePartyTrack.id) {
          return await new Promise<boolean>((resolve) => {
            resolveDelayedLoad = resolve;
          });
        }
        await partyAudioEngine.loadTrack(t.audioUrl, 0);
        return true;
      },
      play: async () => partyAudioEngine.play(),
      pause: () => partyAudioEngine.pause(),
      seek: (s) => partyAudioEngine.seek(s),
      stopAndUnload: () => partyAudioEngine.stopAndUnload(),
      getCurrentPositionSeconds: () => partyAudioEngine.currentTime,
    });

    // Room 1 starts a slow track load
    svc.channel = createFakeChannel();
    svc.state.roomCode = 'JT4441';
    svc.state.role = 'guest';
    svc.state.isConnected = true;

    svc.handleBroadcastMessage({
      type: 'load',
      track: samplePartyTrack,
      commandId: 'cmd_r1',
      hostTimestamp: Date.now(),
      senderId: 'host_1',
      seq: 50,
    });

    // User leaves Room 1 BEFORE slow async load resolves
    await PartyService.leaveRoom(true);
    if (resolveDelayedLoad) (resolveDelayedLoad as (ok: boolean) => void)(true);
    await new Promise((r) => setTimeout(r, 15));

    assert.equal(PartyService.getState().roomCode, null);
    assert.equal(PartyService.getState().currentTrack, null);
    assert.equal(partyAudioEngine.hasSource(), false);

    // Join Room 2 and receive seq: 1 (lower than Room 1's seq 50) from another host
    svc.channel = createFakeChannel();
    svc.state.roomCode = 'JT4442';
    svc.state.role = 'guest';
    svc.state.isConnected = true;

    svc.handleBroadcastMessage({
      type: 'load',
      track: samplePartyTrack2,
      commandId: 'cmd_r2',
      hostTimestamp: Date.now(),
      senderId: 'host_1',
      seq: 1,
    });
    await new Promise((r) => setTimeout(r, 15));

    assert.equal(PartyService.getState().currentTrack?.id, samplePartyTrack2.id);
    assert.equal(partyAudioEngine.hasSource(), true);
  });
});
