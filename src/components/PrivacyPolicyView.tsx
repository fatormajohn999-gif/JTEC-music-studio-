import React, { useEffect, useRef } from 'react';
import { ArrowLeft, Shield, HardDrive, Cloud, Key, Trash2, Eye, Lock, FileText, CheckCircle2 } from 'lucide-react';

interface PrivacyPolicyViewProps {
  onBack: () => void;
}

export const PrivacyPolicyView: React.FC<PrivacyPolicyViewProps> = ({ onBack }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    const scrollParent = containerRef.current?.closest('main');
    if (scrollParent) {
      scrollParent.scrollTop = 0;
    }
  }, []);

  return (
    <div ref={containerRef} className="space-y-6 pb-48 px-4 pt-2 max-w-3xl mx-auto animate-in fade-in">
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
          <Shield className="w-5 h-5 text-cyan-400" />
          <h2 className="text-lg font-bold text-white tracking-wide">Privacy Policy</h2>
        </div>
      </div>

      {/* Summary Highlight Box */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-purple-950/30 to-slate-900/60 border border-cyan-500/30 space-y-2">
        <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
          <Lock className="w-4 h-4 text-cyan-400" />
          <span>Offline-First & Privacy By Design</span>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          JTEC MUSIC is engineered as a local-first offline music player. Your personal audio files, playlists, and listening habits remain strictly on your physical device. The application does not track your identity, require a user account, or upload your private audio files to remote servers.
        </p>
      </div>

      {/* Section 1: Local Device Storage */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <HardDrive className="w-4 h-4 text-cyan-400" />
          <h3>1. What Information is Stored Locally on Your Device</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            When you import music files or configure JTEC MUSIC, the following data is saved exclusively inside your browser or device storage:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Local Audio Blobs (IndexedDB):</strong> Imported music files (MP3, WAV, FLAC, M4A, AAC, OGG) and custom album art blobs are stored in the client-side <code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded font-mono">jtec_music_database</code> database.
            </li>
            <li>
              <strong className="text-slate-200">Library Metadata:</strong> Song titles, artist names, album names, durations, year, and date added extracted from file headers.
            </li>
            <li>
              <strong className="text-slate-200">Playlists & Favorites:</strong> Custom playlist groupings, track order, and songs marked as favorites.
            </li>
            <li>
              <strong className="text-slate-200">User Preferences (localStorage):</strong> Selected visualizer mode, performance preset (60fps vs power saving), audio DSP effects (slow+reverb, bass boost, equalizer), and sleep timer durations.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 2: Audio Metadata Processing */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <Eye className="w-4 h-4 text-purple-400" />
          <h3>2. How Offline Music & Metadata Are Handled</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            Audio metadata parsing (ID3v1, ID3v2, MP4/M4A tags, FLAC headers) occurs entirely in client-side JavaScript on your device. Your audio files are never sent to external servers or cloud APIs for analysis or identification. Audio rendering and visualizer frequency transformations utilize the local browser Web Audio API (<code className="text-purple-300 bg-black/40 px-1 py-0.5 rounded font-mono">AudioContext</code> & <code className="text-purple-300 bg-black/40 px-1 py-0.5 rounded font-mono">AnalyserNode</code>).
          </p>
        </div>
      </section>

      {/* Section 3: Cloud Features & Cloud Service Interaction */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <Cloud className="w-4 h-4 text-emerald-400" />
          <h3>3. How Cloud Features Interact with the Cloud Service</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            JTEC MUSIC includes an optional <strong>Cloud Catalog</strong> feature that connects to our secure cloud service via HTTPS endpoints. Here is how this interaction works:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Read-Only Catalog Access:</strong> The app queries the public <code className="text-emerald-300 bg-black/40 px-1 py-0.5 rounded font-mono">songs</code> table in the cloud service solely to display available tracks across curated categories (NASHEED, LOVE & CHILL, and JTEC MUSIC).
            </li>
            <li>
              <strong className="text-slate-200">Streaming & Downloading:</strong> When you stream or download a cloud track, audio is fetched from the public cloud service storage bucket (<code className="text-emerald-300 bg-black/40 px-1 py-0.5 rounded font-mono">music</code>). Downloaded tracks are cached locally into your device's IndexedDB for offline playback.
            </li>
            <li>
              <strong className="text-slate-200">No Cloud Music Uploading:</strong> Cloud music uploading is not supported. Users cannot upload personal audio files from their device to the cloud service or any other remote storage through JTEC MUSIC.
            </li>
            <li>
              <strong className="text-slate-200">No Authentication Required:</strong> You do not need to sign in, create an account, or share personal contact information to browse or stream public cloud music.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 4: Device Permissions */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <Key className="w-4 h-4 text-amber-400" />
          <h3>4. Permissions Requested by the Application</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>Depending on whether you use the Web PWA or Android application, the following system capabilities may be requested:</p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Notifications (Android / PWA):</strong> Used exclusively to show persistent playback controls (Play, Pause, Skip, Track Title, and Artist) in your device's notification shade during background playback.
            </li>
            <li>
              <strong className="text-slate-200">Media Session & Wake Lock:</strong> Used to maintain continuous background music playback when the screen is locked and integrate with hardware media keys or Bluetooth accessories.
            </li>
            <li>
              <strong className="text-slate-200">File Access:</strong> Triggered only through the standard operating system file picker when you manually choose to import audio tracks or select custom album art.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 5: Data Deletion & User Rights */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <Trash2 className="w-4 h-4 text-rose-400" />
          <h3>5. Data Deletion & Complete User Control</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            Because all your data lives locally, you have total control over data deletion at any time:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Individual Track Deletion:</strong> Tap the three dots (<code className="text-slate-200">⋮</code>) on any song and select <span className="text-rose-300">"Remove from Library"</span> to immediately delete the song record and its cached audio file.
            </li>
            <li>
              <strong className="text-slate-200">Clear Offline Music Library:</strong> Tap the button in Settings to permanently wipe all imported songs, downloaded cloud tracks, custom playlists, and cached audio data from IndexedDB.
            </li>
            <li>
              <strong className="text-slate-200">Browser / App Data Reset:</strong> Clearing your browser storage or uninstalling the Android app instantly removes all JTEC MUSIC files and settings with no trace remaining.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 6: Anonymous Install Counting */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <Shield className="w-4 h-4 text-cyan-400" />
          <h3>6. Anonymous Install Counting</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          JTEC MUSIC counts installs with a random anonymous ID, the app version, the phone model and Android version, and an optional device name that you can type yourself. It does not collect your name, email, phone number or location.
        </p>
      </section>

      {/* Section 7: Contact & Updates */}
      <section className="p-5 rounded-2xl bg-slate-900/60 border border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <FileText className="w-4 h-4 text-cyan-400" />
          <h3>7. Policy Updates & Inquiries</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Any future revisions to this policy will be documented within this screen. If you have questions about how JTEC MUSIC handles data or device storage, contact the developer at <a href="mailto:fatormajohn999@gmail.com" className="text-cyan-400 hover:underline font-mono">fatormajohn999@gmail.com</a>.
        </p>
        <div className="pt-2">
          <button
            type="button"
            onClick={onBack}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-98 transition cursor-pointer"
          >
            ← Return to Player Settings
          </button>
        </div>
      </section>
    </div>
  );
};
