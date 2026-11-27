import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { audioEngine } from '../audioEngine';
import { AudioEffectsConfig } from '../../types/music';
import { extractPaletteFromImage, DEFAULT_PALETTES } from '../colorExtractor';

const FULL_PLAYER_PATH = path.resolve(process.cwd(), 'src/components/FullPlayer.tsx');
const EFFECTS_MODAL_PATH = path.resolve(process.cwd(), 'src/components/AudioEffectsModal.tsx');
const MINI_PLAYER_PATH = path.resolve(process.cwd(), 'src/components/MiniPlayer.tsx');
const QUEUE_DRAWER_PATH = path.resolve(process.cwd(), 'src/components/QueueDrawer.tsx');

describe('JTEC Music Player Redesign & Slow + Reverb Preservation', () => {
  test('1. FullPlayer removes CinematicVisualizer, WebGL, and continuous animation loops', () => {
    const src = fs.readFileSync(FULL_PLAYER_PATH, 'utf8');
    assert.equal(src.includes('CinematicVisualizer'), false, 'FullPlayer must not import or render CinematicVisualizer');
    assert.equal(src.includes('webgl'), false, 'FullPlayer must not use WebGL');
    assert.equal(src.includes('<canvas'), false, 'FullPlayer must not render a canvas visualizer');
    assert.equal(src.includes('animate-ping'), false, 'FullPlayer must not use animate-ping');
    assert.equal(src.includes('animate-pulse'), false, 'FullPlayer must not use animate-pulse');

    const miniSrc = fs.readFileSync(MINI_PLAYER_PATH, 'utf8');
    assert.equal(miniSrc.includes('animate-ping'), false, 'MiniPlayer must not run continuous animate-ping');

    const queueSrc = fs.readFileSync(QUEUE_DRAWER_PATH, 'utf8');
    assert.equal(queueSrc.includes('animate-ping'), false, 'QueueDrawer must not run continuous animate-ping');
  });

  test('2. FullPlayer preserves all required controls, artwork fallback, and Android safe areas', () => {
    const src = fs.readFileSync(FULL_PLAYER_PATH, 'utf8');
    const requiredTokens = [
      'onToggleFavorite',
      'onAddToPlaylist',
      'SleepTimerSection',
      'onOpenEffects',
      'onOpenQueue',
      'onTogglePlay',
      'onPrevious',
      'onNext',
      'onCycleRepeat',
      'onToggleShuffle',
      'onOpenSongOptions',
      'onSeek',
      'pt-safe',
      'pb-safe',
      './pwa-192x192.png',
      'object-cover',
    ];
    for (const token of requiredTokens) {
      assert.equal(src.includes(token), true, `FullPlayer missing required token: ${token}`);
    }
  });

  test('3. AudioEffectsModal preserves Slow + Reverb, EQ, Reverb, Echo, and Playback Speed presets', () => {
    const src = fs.readFileSync(EFFECTS_MODAL_PATH, 'utf8');
    const requiredPresets = [
      "'Normal'",
      "'Slow'",
      "'Slow + Reverb'",
      "'Dreamy'",
      "'Night'",
      "'Bass'",
      "'Cinematic'",
    ];
    for (const preset of requiredPresets) {
      assert.equal(src.includes(preset), true, `AudioEffectsModal missing preset ${preset}`);
    }
    assert.equal(src.includes('reverbWet'), true);
    assert.equal(src.includes('echoWet'), true);
    assert.equal(src.includes('bassGain'), true);
    assert.equal(src.includes('trebleGain'), true);
    assert.equal(src.includes('playbackRate'), true);
    assert.equal(src.includes('preservesPitch'), true);
  });

  test('4. Normal playback and Slow + Reverb audio effects remain fully operational in audioEngine', async () => {
    const normalEffects: AudioEffectsConfig = {
      playbackRate: 1.0,
      reverbWet: 0,
      echoWet: 0,
      bassGain: 0,
      trebleGain: 0,
      volume: 1.0,
      presetName: 'Normal',
      preservesPitch: true,
      isEnabled: false,
    };

    const slowReverbEffects: AudioEffectsConfig = {
      playbackRate: 0.85,
      reverbWet: 0.65,
      echoWet: 0.15,
      bassGain: 15,
      trebleGain: -8,
      volume: 0.95,
      presetName: 'Slow + Reverb',
      preservesPitch: false,
      isEnabled: true,
    };

    audioEngine.applyEffects(normalEffects);
    assert.equal(audioEngine.getCurrentEffects().presetName, 'Normal');
    assert.equal(audioEngine.getCurrentEffects().playbackRate, 1.0);

    audioEngine.applyEffects(slowReverbEffects);
    const active = audioEngine.getCurrentEffects();
    assert.equal(active.presetName, 'Slow + Reverb');
    assert.equal(active.playbackRate, 0.85);
    assert.equal(active.reverbWet, 0.65);
    assert.equal(active.echoWet, 0.15);
    assert.equal(active.bassGain, 15);
    assert.equal(active.trebleGain, -8);
    assert.equal(active.preservesPitch, false);

    // Restore neutral effects after test
    audioEngine.applyEffects(normalEffects);
  });

  test('5. extractPaletteFromImage returns fallback cleanly when artwork URL is missing', async () => {
    const pal = await extractPaletteFromImage(undefined);
    assert.equal(pal.hasCover, false);
    assert.equal(pal.primary, DEFAULT_PALETTES[0].primary);
  });
});
