import { Song } from '../types/music';

// Converts an AudioBuffer to a valid WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  const channels: Float32Array[] = [];
  let sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function setUint16(data: number) {
    out.setUint16(pos, data, true);
    pos += 2;
  }
  function setUint32(data: number) {
    out.setUint32(pos, data, true);
    pos += 4;
  }

  // RIFF identifier
  setUint32(0x46464952); // "RIFF"
  setUint32(length - 8);  // file length - 8
  setUint32(0x45564157); // "WAVE"

  // format chunk identifier
  setUint32(0x20746d66); // "fmt "
  setUint32(16);         // format chunk length 16
  setUint16(1);          // sample format 1 (PCM)
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2);              // block align
  setUint16(16);                         // bits per sample

  // data chunk identifier
  setUint32(0x61746164); // "data"
  setUint32(length - pos - 4); // chunk length

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out.buffer], { type: 'audio/wav' });
}

// Generate Track 1: "Neon Skyline (Synthwave)" - 30 seconds loop
export async function generateDemoTrack1(): Promise<{ song: Song; blob: Blob }> {
  const duration = 28;
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  const bpm = 110;
  const beatSec = 60 / bpm;
  const sixteenth = beatSec / 4;

  // Master bus
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.85;
  masterGain.connect(offlineCtx.destination);

  // Synth Bass Chords
  const chords = [
    [130.81, 155.56, 196.00], // C minor
    [116.54, 146.83, 174.61], // Bb major
    [103.83, 130.81, 155.56], // Ab major
    [116.54, 146.83, 174.61], // Bb major
  ];

  const totalBeats = Math.floor(duration / beatSec);

  for (let beat = 0; beat < totalBeats; beat++) {
    const time = beat * beatSec;
    const chordIndex = Math.floor(beat / 4) % chords.length;
    const currentChord = chords[chordIndex];

    // Kick on beats 0, 1, 2, 3
    const kickOsc = offlineCtx.createOscillator();
    const kickGain = offlineCtx.createGain();
    kickOsc.frequency.setValueAtTime(140, time);
    kickOsc.frequency.exponentialRampToValueAtTime(38, time + 0.12);
    kickGain.gain.setValueAtTime(0.9, time);
    kickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
    kickOsc.connect(kickGain);
    kickGain.connect(masterGain);
    kickOsc.start(time);
    kickOsc.stop(time + 0.3);

    // Snare / Clap on beat 1 and 3
    if (beat % 2 === 1) {
      const snareFilter = offlineCtx.createBiquadFilter();
      snareFilter.type = 'highpass';
      snareFilter.frequency.value = 800;
      const snareGain = offlineCtx.createGain();
      snareGain.gain.setValueAtTime(0.4, time);
      snareGain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
      
      const noiseBuffer = offlineCtx.createBuffer(1, sampleRate * 0.2, sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < noiseBuffer.length; i++) {
        output[i] = Math.random() * 2 - 1;
      }
      const whiteNoise = offlineCtx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.connect(snareFilter);
      snareFilter.connect(snareGain);
      snareGain.connect(masterGain);
      whiteNoise.start(time);
      whiteNoise.stop(time + 0.2);
    }

    // Hi-hats every sixteenth
    for (let step = 0; step < 4; step++) {
      const hatTime = time + step * sixteenth;
      const hatFilter = offlineCtx.createBiquadFilter();
      hatFilter.type = 'highpass';
      hatFilter.frequency.value = 6000;
      const hatGain = offlineCtx.createGain();
      hatGain.gain.setValueAtTime(step % 2 === 0 ? 0.25 : 0.12, hatTime);
      hatGain.gain.exponentialRampToValueAtTime(0.001, hatTime + 0.05);

      const hatNoise = offlineCtx.createBuffer(1, sampleRate * 0.06, sampleRate);
      const hatOut = hatNoise.getChannelData(0);
      for (let i = 0; i < hatNoise.length; i++) {
        hatOut[i] = Math.random() * 2 - 1;
      }
      const hatSource = offlineCtx.createBufferSource();
      hatSource.buffer = hatNoise;
      hatSource.connect(hatFilter);
      hatFilter.connect(hatGain);
      hatGain.connect(masterGain);
      hatSource.start(hatTime);
      hatSource.stop(hatTime + 0.06);
    }

    // Synth Bass
    const bassOsc = offlineCtx.createOscillator();
    const bassGain = offlineCtx.createGain();
    const bassFilter = offlineCtx.createBiquadFilter();
    bassFilter.type = 'lowpass';
    bassFilter.frequency.setValueAtTime(800, time);
    bassFilter.frequency.exponentialRampToValueAtTime(300, time + beatSec * 0.8);

    bassOsc.type = 'sawtooth';
    bassOsc.frequency.value = currentChord[0] / 2; // sub octave
    bassGain.gain.setValueAtTime(0.35, time);
    bassGain.gain.exponentialRampToValueAtTime(0.01, time + beatSec * 0.9);

    bassOsc.connect(bassFilter);
    bassFilter.connect(bassGain);
    bassGain.connect(masterGain);
    bassOsc.start(time);
    bassOsc.stop(time + beatSec);

    // Synth Arpeggio Melody
    if (beat >= 4) {
      for (let noteStep = 0; noteStep < 2; noteStep++) {
        const noteTime = time + noteStep * (beatSec / 2);
        const arpFreq = currentChord[(beat * 2 + noteStep) % currentChord.length] * 2;
        const arpOsc = offlineCtx.createOscillator();
        const arpGain = offlineCtx.createGain();
        arpOsc.type = 'triangle';
        arpOsc.frequency.value = arpFreq;
        arpGain.gain.setValueAtTime(0.2, noteTime);
        arpGain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

        arpOsc.connect(arpGain);
        arpGain.connect(masterGain);
        arpOsc.start(noteTime);
        arpOsc.stop(noteTime + 0.4);
      }
    }
  }

  const renderedBuffer = await offlineCtx.startRendering();
  const blob = audioBufferToWav(renderedBuffer);

  const song: Song = {
    id: 'demo-track-1',
    title: 'Neon Skyline (Synthwave)',
    artist: 'JTEC Sound Lab',
    album: 'Cyber Dreams Vol. 1',
    duration: Math.round(duration),
    artworkUrl: '',
    format: 'wav',
    size: blob.size,
    dateAdded: Date.now() - 1000 * 60 * 60 * 24,
    isFavorite: true,
    hasStoredBlob: true,
    isDemo: true,
    year: '2026',
  };

  return { song, blob };
}

// Generate Track 2: "Midnight Reverie (Lo-Fi Chill)" - 26 seconds loop
export async function generateDemoTrack2(): Promise<{ song: Song; blob: Blob }> {
  const duration = 26;
  const sampleRate = 44100;
  const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

  const bpm = 82;
  const beatSec = 60 / bpm;

  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 0.85;
  masterGain.connect(offlineCtx.destination);

  // Soft lush piano/rhodes chords
  const chords = [
    [261.63, 311.13, 392.00, 466.16], // Cm7
    [220.00, 261.63, 329.63, 392.00], // Am7
    [246.94, 293.66, 369.99, 440.00], // Bm7
    [196.00, 246.94, 293.66, 349.23], // G7
  ];

  const totalBeats = Math.floor(duration / beatSec);

  for (let beat = 0; beat < totalBeats; beat++) {
    const time = beat * beatSec;
    const chordIdx = Math.floor(beat / 4) % chords.length;
    const chord = chords[chordIdx];

    // Vinyl Warmth / Kick
    if (beat % 4 === 0 || (beat % 4 === 2 && beat % 8 === 2)) {
      const kick = offlineCtx.createOscillator();
      const kGain = offlineCtx.createGain();
      kick.frequency.setValueAtTime(110, time);
      kick.frequency.exponentialRampToValueAtTime(45, time + 0.15);
      kGain.gain.setValueAtTime(0.7, time);
      kGain.gain.exponentialRampToValueAtTime(0.001, time + 0.28);
      kick.connect(kGain);
      kGain.connect(masterGain);
      kick.start(time);
      kick.stop(time + 0.3);
    }

    // Warm Lo-Fi Snare on 2 and 4
    if (beat % 2 === 1) {
      const snare = offlineCtx.createOscillator();
      const sGain = offlineCtx.createGain();
      snare.type = 'triangle';
      snare.frequency.setValueAtTime(180, time);
      snare.frequency.exponentialRampToValueAtTime(90, time + 0.15);
      sGain.gain.setValueAtTime(0.4, time);
      sGain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);
      snare.connect(sGain);
      sGain.connect(masterGain);
      snare.start(time);
      snare.stop(time + 0.2);
    }

    // Electric Piano chord strike on beat 0 of bar
    if (beat % 2 === 0) {
      chord.forEach((freq) => {
        const osc = offlineCtx.createOscillator();
        const gain = offlineCtx.createGain();
        const filter = offlineCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1400; // Warm muffled sound

        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.18, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + beatSec * 1.8);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(masterGain);
        osc.start(time);
        osc.stop(time + beatSec * 1.9);
      });
    }
  }

  const renderedBuffer = await offlineCtx.startRendering();
  const blob = audioBufferToWav(renderedBuffer);

  const song: Song = {
    id: 'demo-track-2',
    title: 'Midnight Reverie (Lo-Fi Chill)',
    artist: 'JTEC Sound Lab',
    album: 'Night Vibes',
    duration: Math.round(duration),
    artworkUrl: '',
    format: 'wav',
    size: blob.size,
    dateAdded: Date.now() - 1000 * 60 * 60 * 12,
    isFavorite: false,
    hasStoredBlob: true,
    isDemo: true,
    year: '2026',
  };

  return { song, blob };
}
