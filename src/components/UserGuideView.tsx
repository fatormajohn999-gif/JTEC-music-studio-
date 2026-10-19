import React from 'react';
import { ArrowLeft, BookOpen, Music, Play, Sliders, Sparkles, Disc, Cloud, Search, Moon, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface UserGuideViewProps {
  onBack: () => void;
}

export const UserGuideView: React.FC<UserGuideViewProps> = ({ onBack }) => {
  return (
    <div className="space-y-6 pb-36 px-4 pt-2 max-w-3xl mx-auto animate-in fade-in">
      {/* Top Navigation Bar with Back Button */}
      <div className="flex items-center gap-3 pb-3 border-b border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-cyan-300 font-semibold text-xs active:scale-95 transition cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Settings</span>
        </button>
        <div className="flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white tracking-wide">How to Use JTEC MUSIC</h2>
        </div>
      </div>

      {/* Welcome Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-purple-950/30 to-slate-900/60 border border-cyan-500/30 space-y-2">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          Welcome to Your Premium Offline Audio Experience
        </h3>
        <p className="text-xs text-slate-300 leading-relaxed">
          JTEC MUSIC combines high-fidelity local audio playback, studio-grade DSP slow+reverb effects, real-time audio-reactive visualizers, and curated cloud streaming into a fast, battery-efficient mobile and desktop application.
        </p>
      </div>

      {/* Guide 1: Importing Local Music */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs">1</div>
          <Music className="w-4 h-4 text-cyan-400" />
          <h3>Importing Music from Your Device</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            You can bring your existing music collection into JTEC MUSIC without needing an internet connection:
          </p>
          <ol className="list-decimal list-inside space-y-1.5 text-slate-400 pl-1">
            <li>Tap <strong className="text-white">+ Import Music</strong> on the Home screen or <strong className="text-white">+ Import Audio</strong> in the Library tab.</li>
            <li>Tap <strong className="text-white">Browse Local Audio Files</strong> or drag and drop audio files into the import area.</li>
            <li>Select single or multiple audio files. Supported formats: <span className="text-cyan-300 font-mono">MP3, WAV, FLAC, M4A, AAC, OGG, WEBM</span>.</li>
            <li>The app automatically extracts track tags (title, artist, album, duration, and embedded cover art) and saves the audio files into your device's IndexedDB storage for 100% offline playback.</li>
          </ol>
          <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2 text-[11px] text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Note on Cloud Uploads:</strong> JTEC MUSIC does not support uploading music files to the cloud. All imported tracks stay private and local on your device.
            </span>
          </div>
        </div>
      </section>

      {/* Guide 2: Playing & Navigating Music */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-300 flex items-center justify-center text-xs">2</div>
          <Play className="w-4 h-4 text-purple-400" />
          <h3>Playing Tracks & Navigation Controls</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Starting Playback:</strong> Tap any song card across Home, Library, or Playlists to start playing immediately.
            </li>
            <li>
              <strong className="text-slate-200">Floating MiniPlayer:</strong> Always visible at the bottom of the screen while music is loaded. Tap the play/pause button or next track button directly, or tap anywhere on the bar to expand the <strong>Full Player</strong>.
            </li>
            <li>
              <strong className="text-slate-200">Full Player Controls:</strong> Drag the progress bar to seek through tracks. Tap previous or next buttons to skip songs.
            </li>
            <li>
              <strong className="text-slate-200">Repeat & Shuffle:</strong> Tap the Shuffle icon to randomize playback order. Tap the Repeat icon to cycle between <span className="text-cyan-300">Repeat All</span>, <span className="text-cyan-300">Repeat One</span>, or <span className="text-slate-400">Off</span>.
            </li>
            <li>
              <strong className="text-slate-200">Background Playback:</strong> Audio continues playing smoothly when the app is minimized, when navigating other apps, or when your device screen is locked. Control playback via native notification controls or lock screen media controls.
            </li>
          </ul>
        </div>
      </section>

      {/* Guide 3: Playlists & Library Management */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-7 h-7 rounded-lg bg-pink-500/20 text-pink-300 flex items-center justify-center text-xs">3</div>
          <Disc className="w-4 h-4 text-pink-400" />
          <h3>Playlists, Favorites & Custom Artwork</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Creating Playlists:</strong> Open the <span className="text-white">Playlists</span> tab and tap <span className="text-cyan-300">+ Create</span>. Give your mix a title and choose a custom gradient theme.
            </li>
            <li>
              <strong className="text-slate-200">Adding Tracks to Playlists:</strong> Tap the three dots (<code className="text-slate-200">⋮</code>) on any track and select <span className="text-white">Add to Playlist</span>.
            </li>
            <li>
              <strong className="text-slate-200">Reordering Tracks:</strong> Inside any playlist, use the up/down arrows to reorder songs to your preferred playback sequence.
            </li>
            <li>
              <strong className="text-slate-200">Favorites:</strong> Tap the heart icon (<span className="text-pink-400">♥</span>) on any song or in the Full Player to quickly bookmark tracks in your Favorites.
            </li>
            <li>
              <strong className="text-slate-200">Custom Album Art:</strong> Tap the three dots (<code className="text-slate-200">⋮</code>) on any track and select <span className="text-white">Add/Change Cover</span> to choose an image from your device. The app automatically crops it to a crisp 512x512 square.
            </li>
          </ul>
        </div>
      </section>

      {/* Guide 4: Audio Effects Lab & Visualizers */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center text-xs">4</div>
          <Sliders className="w-4 h-4 text-cyan-400" />
          <h3>Audio Effects Lab & Cinematic Visualizers</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>Customize your listening experience with real-time Web Audio DSP:</p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Slow + Reverb:</strong> Slow down track speed (0.75x–0.90x) and apply custom convolution reverb for that viral, dreamy lo-fi atmosphere.
            </li>
            <li>
              <strong className="text-slate-200">Bass Boost:</strong> Dial in low-end punch (+1dB to +15dB) with a custom shelf filter tuned for headphones and car audio.
            </li>
            <li>
              <strong className="text-slate-200">Equalizer:</strong> Fine-tune Bass, Mid, and Treble frequencies.
            </li>
            <li>
              <strong className="text-slate-200">Cinematic Visualizers:</strong> Select from diverse visual modes including <span className="text-cyan-300">Anime Ninja</span>, <span className="text-purple-300">Chakra Visual World</span>, <span className="text-pink-300">Neon Cyber Waves</span>, <span className="text-emerald-300">Smoke Vanish</span>, and <span className="text-blue-300">Frequency Bars</span>.
            </li>
            <li>
              <strong className="text-slate-200">Performance Mode:</strong> Choose between Ultra (60fps fluid visualizer animations) or Battery Saver (efficient lower frame rate) in Settings.
            </li>
          </ul>
        </div>
      </section>

      {/* Guide 5: Cloud Music & Offline Downloads */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-300 flex items-center justify-center text-xs">5</div>
          <Cloud className="w-4 h-4 text-emerald-400" />
          <h3>Browsing & Downloading from JTEC CLOUD</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Browse Catalogs:</strong> Open the <span className="text-white">Cloud</span> tab to explore curated categories: <span className="text-emerald-300">NASHEED</span>, <span className="text-pink-300">LOVE & CHILL</span>, and <span className="text-cyan-300">JTEC MUSIC</span>.
            </li>
            <li>
              <strong className="text-slate-200">Instant Streaming:</strong> Tap any cloud track to stream it over your internet connection.
            </li>
            <li>
              <strong className="text-slate-200">Download for Offline Play:</strong> Tap the download icon (<span className="text-cyan-300">☁️↓</span>) on any cloud song. The track is downloaded and stored in your device's IndexedDB so you can listen anywhere without Wi-Fi or cellular data.
            </li>
            <li>
              <strong className="text-slate-200">Downloaded Indicator:</strong> Songs stored offline display a green checkmark (<span className="text-emerald-400">✓ Offline</span>) badge.
            </li>
          </ul>
        </div>
      </section>

      {/* Guide 6: Search & Sleep Timer */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-300 flex items-center justify-center text-xs">6</div>
          <Moon className="w-4 h-4 text-blue-400" />
          <h3>Search & Sleep Timer</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Instant Search:</strong> Tap the magnifying glass in the top header or the <span className="text-white">Search</span> tab to filter tracks by title, artist, or album with real-time matching.
            </li>
            <li>
              <strong className="text-slate-200">Sleep Timer:</strong> Tap the Effects or Settings screen to start a timer (15, 30, 45, or 60 minutes). Playback gently fades out and stops when time expires.
            </li>
          </ul>
        </div>
      </section>

      {/* Back Button Footer */}
      <div className="pt-2">
        <button
          type="button"
          onClick={onBack}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-98 transition cursor-pointer"
        >
          ← Return to Player Settings
        </button>
      </div>
    </div>
  );
};
