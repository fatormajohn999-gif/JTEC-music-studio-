import React, { useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Shield,
  HardDrive,
  Cloud,
  Key,
  Trash2,
  Lock,
  FileText,
  Radio,
  BarChart3,
  Globe,
  ShieldCheck,
} from 'lucide-react';

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
    <div
      ref={containerRef}
      className="min-h-full bg-gradient-to-b from-[#0E1320] via-[#0A0D15] to-[#080A10] pb-40 px-4 sm:px-6 pt-3 max-w-3xl mx-auto animate-in fade-in duration-200 space-y-5"
    >
      {/* Top Navigation Header */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-white/10">
        <button
          type="button"
          onClick={onBack}
          className="h-9 px-3 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 text-cyan-300 font-semibold text-xs active:scale-95 transition flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
          <h2 className="text-base sm:text-lg font-extrabold text-white tracking-tight truncate">
            Privacy Policy
          </h2>
        </div>

        <div className="w-14 shrink-0" />
      </div>

      {/* Summary Banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-br from-[#142338] via-[#151A2E] to-[#241536] border border-cyan-400/35 shadow-xl space-y-2.5">
        <div className="flex items-center gap-2.5 text-cyan-300 font-extrabold text-sm">
          <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
          <span>Privacy First & Transparent by Design</span>
        </div>
        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          JTEC MUSIC is built as an offline-first music player with optional cloud catalogs and real-time group listening. Your imported audio files, custom playlists, and sound settings stay on your device. Ordinary listening requires no user account, email address, or phone number.
        </p>
      </div>

      {/* Section 1: Ordinary Listeners & JTEC Cloud */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center justify-center shrink-0">
            <Cloud className="w-4 h-4" />
          </div>
          <h3>1. JTEC Cloud Browsing & Streaming (Listeners)</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            JTEC MUSIC connects to curated cloud music catalogs (such as <strong>NASHEED</strong>, <strong>LOVE &amp; CHILL</strong>, and <strong>JTEC MUSIC</strong>) over HTTPS so listeners can browse, stream, and download tracks for offline playback.
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Public Catalog Queries:</strong> For listeners, JTEC Cloud reads public song metadata and streams or downloads audio files from cloud storage without requiring any sign-in or personal profile.
            </li>
            <li>
              <strong className="text-slate-200">Offline Caching:</strong> When you choose to download a cloud track, the audio file and artwork are saved locally inside your device&apos;s storage so you can play them without an internet connection.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 2: Authorized Administrator Cloud Management */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <h3>2. Authorized Administrator Cloud Management</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            Public users cannot upload audio files from their devices to JTEC Cloud. Any music files you import from your phone or computer remain strictly private on your device.
          </p>
          <p className="text-slate-400">
            Adding, editing, replacing, or deleting tracks in the public JTEC Cloud catalogs is restricted exclusively to the authorized app administrator through a protected, authenticated administrator portal verified with multi-factor authentication (TOTP).
          </p>
        </div>
      </section>

      {/* Section 3: Local Imports, Metadata & Preferences */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-300 flex items-center justify-center shrink-0">
            <HardDrive className="w-4 h-4" />
          </div>
          <h3>3. Local Music Imports & On-Device Storage</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            When you import local tracks or customize player settings, data is processed and saved locally on your device:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Audio &amp; Library Database (IndexedDB):</strong> Imported audio files, offline downloads, track metadata, custom album art, playlists, favorites, and playback position are stored inside your local <code className="text-cyan-300 bg-black/40 px-1 py-0.5 rounded font-mono">jtec_music_database</code> store.
            </li>
            <li>
              <strong className="text-slate-200">On-Device Tag &amp; Audio Processing:</strong> Embedded song metadata (ID3, MP4, FLAC headers) and Web Audio API effects (Slow + Reverb, Echo, Equalizer, and playback speed) run entirely on your device. Your local files are never uploaded for scanning or identification.
            </li>
            <li>
              <strong className="text-slate-200">Settings Persistence:</strong> Playback preferences, Slow + Reverb settings, Wi-Fi-only download rules, and display options are stored locally via browser storage and Android native preferences.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 4: JTEC Party Profiles, Rooms, Messages & Activity */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-[#17192B] to-[#101320] border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 flex items-center justify-center shrink-0">
            <Radio className="w-4 h-4" />
          </div>
          <h3>4. JTEC Party Profiles, Chat &amp; Room Activity</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            JTEC Party is optional and only connects when you open JTEC Party to create a profile, manage friends, or join a listening room:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Party Profile Data:</strong> Creating a JTEC Party profile uses an anonymous session and stores your chosen <strong>username</strong>, a generated <strong>8-character Party ID</strong>, and an <strong>optional profile picture</strong> (compressed locally before saving).
            </li>
            <li>
              <strong className="text-slate-200">Friends, Invites &amp; Presence:</strong> JTEC Party stores friend lists, friend requests, blocked user choices, room invites, and online/last-seen presence so friends can invite you to listen together.
            </li>
            <li>
              <strong className="text-slate-200">Live Room Activity &amp; Messages:</strong> Inside a room, room codes, member listening status, shared queue items, live chat messages, emoji reactions, and playback synchronization timestamps are shared in real time with participants in that room.
            </li>
            <li>
              <strong className="text-slate-200">Profile Deletion &amp; Leaving Rooms:</strong> Leaving or ending a room disconnects you from the room channel and stops Party audio immediately. You can permanently delete your JTEC Party profile at any time from the JTEC Party Profile tab.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 5: Anonymous Installation Counting */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-300 flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <h3>5. Anonymous Installation Counting &amp; Update Checks</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            To understand app adoption and compatibility across devices, JTEC MUSIC sends a lightweight anonymous install ping when the app starts or returns to the foreground:
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Data Sent:</strong> A randomly generated anonymous install ID, app version, build number, platform (Android, Web, or iOS), device manufacturer, device model, OS version, and the device display name (or browser/OS type on web), along with anonymous open/last-seen counters.
            </li>
            <li>
              <strong className="text-slate-200">Never Collected:</strong> Install counting does not collect your name, email address, phone number, contacts, GPS location, or the music you listen to.
            </li>
            <li>
              <strong className="text-slate-200">Android Update Checks:</strong> On Android, the app also checks minimum supported build requirements and release availability so you can stay on compatible versions.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 6: Device Permissions & Notifications */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-center shrink-0">
            <Key className="w-4 h-4" />
          </div>
          <h3>6. Device Permissions, Notifications &amp; Home Widget</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Notifications:</strong> Requested on Android or web only so JTEC MUSIC can display persistent lock-screen and notification shade playback controls, track titles, and cover art during playback.
            </li>
            <li>
              <strong className="text-slate-200">Media Session &amp; Background Playback:</strong> Integrates with lock-screen controls, Android home-screen widget state, and Bluetooth/headset media keys without collecting listening history externally.
            </li>
            <li>
              <strong className="text-slate-200">File &amp; Photo Selection:</strong> System file and photo pickers open only when you manually import local songs, set custom album covers, or pick a JTEC Party profile picture.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 7: Local Storage & Data Deletion */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 flex items-center justify-center shrink-0">
            <Trash2 className="w-4 h-4" />
          </div>
          <h3>7. Managing &amp; Deleting Your Data</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Manage Downloads &amp; Songs:</strong> Remove individual tracks from your Library or delete specific offline downloads inside <strong>Settings → Downloads &amp; Storage → Manage downloads</strong>.
            </li>
            <li>
              <strong className="text-slate-200">Clear Offline Music Library:</strong> Permanently wipe all imported songs, downloaded audio files, playlists, and cached local data from IndexedDB in <strong>Settings → Downloads &amp; Storage</strong>.
            </li>
            <li>
              <strong className="text-slate-200">Uninstall or Clear App Data:</strong> Clearing your browser site data or uninstalling the Android app deletes all offline tracks, playlists, and local preferences saved inside the app.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 8: Third-Party Services & External Music Providers */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-[#151B2B] to-[#101420] border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
            <Globe className="w-4 h-4" />
          </div>
          <h3>8. Third-Party Services &amp; External Music Providers</h3>
        </div>
        <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
          <p>
            When you use online features, JTEC MUSIC communicates directly over HTTPS with the following services (which may process standard network request information such as your IP address according to their own privacy policies):
          </p>
          <ul className="list-disc list-inside space-y-1.5 text-slate-400 pl-1">
            <li>
              <strong className="text-slate-200">Supabase:</strong> Hosts public JTEC Cloud music catalogs, anonymous install counting, app update configuration checks, and JTEC Party real-time rooms, chat, and social profiles.
            </li>
            <li>
              <strong className="text-slate-200">Jamendo:</strong> Provides Creative Commons independent music searches, artwork, streams, and permitted downloads in the Jamendo Indie section.
            </li>
            <li>
              <strong className="text-slate-200">Internet Archive (Archive.org):</strong> Provides public Nasheed Archive searches, metadata, cover images, and audio streams/downloads.
            </li>
            <li>
              <strong className="text-slate-200">GitHub Releases:</strong> Provides official Android release metadata and APK download packages when checking for or downloading app updates.
            </li>
          </ul>
        </div>
      </section>

      {/* Section 9: Contact & Policy Updates */}
      <section className="p-5 rounded-2xl bg-gradient-to-br from-[#141A29] to-[#0F131F] border border-white/10 space-y-3">
        <div className="flex items-center gap-2.5 text-white font-bold text-sm">
          <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
          <h3>9. Policy Updates &amp; Contact</h3>
        </div>
        <p className="text-xs text-slate-300 leading-relaxed">
          Updates to this policy are published directly inside this screen. If you have questions about how JTEC MUSIC handles your data or device storage, contact Johnny TEC (JTEC) at{' '}
          <a
            href="mailto:fatormajohn999@gmail.com"
            className="text-cyan-400 hover:underline font-mono"
          >
            fatormajohn999@gmail.com
          </a>.
        </p>

        <div className="pt-2">
          <button
            type="button"
            onClick={onBack}
            className="w-full min-h-[46px] py-3 rounded-2xl bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 hover:brightness-110 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 active:scale-[0.99] transition cursor-pointer"
          >
            ← Return to Settings
          </button>
        </div>
      </section>
    </div>
  );
};
