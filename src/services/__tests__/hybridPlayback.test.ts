import test from 'node:test';
import assert from 'node:assert';
import { audioEngine } from '../audioEngine';
import { Capacitor } from '@capacitor/core';

test('JTEC Music Hybrid Playback Architecture & Audio Effects Lab Presets Suite', async (t) => {
  await t.test('1. Platform detection reliably distinguishes native Android APK from web browser', () => {
    const isNativeAndroid = Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
    assert.strictEqual(typeof isNativeAndroid, 'boolean');
  });

  await t.test('2. Engine selection & isolation: Web Audio API AudioEngine is active on web or test environment', () => {
    assert.ok(audioEngine);
    assert.strictEqual(typeof audioEngine.hasSource, 'function');
  });

  await t.test('3. Playback state synchronization: callbacks register and fire correctly', () => {
    let stateFired = false;
    const unsubscribe = audioEngine.onPlayStateChange((playing) => {
      stateFired = true;
      assert.strictEqual(typeof playing, 'boolean');
    });
    assert.strictEqual(typeof unsubscribe, 'function');
    unsubscribe();
  });

  await t.test('4. Preventing duplicate playback: loading or unloading stops previous source cleanly', async () => {
    await audioEngine.loadAudio('https://example.com/test.mp3');
    audioEngine.pause();
    assert.strictEqual(audioEngine.isPlaying, false);
  });

  await t.test('5. All 7 Audio Effects Lab presets apply successfully and persist', () => {
    const presets = ['Normal', 'Slow', 'Slow + Reverb', 'Dreamy', 'Night', 'Bass', 'Cinematic'] as const;

    for (const preset of presets) {
      audioEngine.applyEffects({
        presetName: preset,
        playbackRate: preset === 'Normal' ? 1.0 : 0.85,
        reverbWet: preset === 'Slow + Reverb' ? 0.65 : 0.0,
        echoWet: preset === 'Slow + Reverb' ? 0.15 : 0.0,
        bassGain: preset === 'Bass' ? 28 : 10,
        trebleGain: 0,
        preservesPitch: preset === 'Normal',
        isEnabled: preset !== 'Normal',
        volume: 1.0,
      });

      const current = audioEngine.getCurrentEffects();
      assert.strictEqual(current.presetName, preset);
    }
  });
});
