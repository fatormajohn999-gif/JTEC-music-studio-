import React, { useState } from 'react';
import { 
  X, Database, CheckCircle2, AlertCircle, Copy, Check, ExternalLink, 
  HardDrive, Wifi, RefreshCw, Trash2, Shield, BellRing, Settings2
} from 'lucide-react';
import { 
  SupabaseService, SUPABASE_SQL_SETUP, SUPABASE_STORAGE_FIX_SQL, CloudSettings, formatBytes 
} from '../services/supabase';

interface CloudSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshCloud: () => Promise<void>;
  onClearOfflineDownloads: () => Promise<void>;
  onConfigChanged: () => void;
}

const QUOTA_OPTIONS = [
  { label: '500 MB', bytes: 524288000 },
  { label: '1 GB (Free Tier)', bytes: 1073741824 },
  { label: '2 GB', bytes: 2147483648 },
  { label: '5 GB', bytes: 5368709120 },
  { label: '10 GB', bytes: 10737418240 },
];

export const CloudSettingsModal: React.FC<CloudSettingsModalProps> = ({
  isOpen,
  onClose,
  onRefreshCloud,
  onClearOfflineDownloads,
  onConfigChanged,
}) => {
  const currentConfig = SupabaseService.getConfig();
  const [url, setUrl] = useState(currentConfig.url);
  const [anonKey, setAnonKey] = useState(currentConfig.anonKey);
  const [isTesting, setIsTesting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isClearingOffline, setIsClearingOffline] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    tableExists: boolean;
    bucketsExist: boolean;
  } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedStorageSql, setCopiedStorageSql] = useState(false);
  const [showSql, setShowSql] = useState(false);

  // Cloud preferences
  const [cloudSettings, setCloudSettings] = useState<CloudSettings>(
    SupabaseService.getCloudSettings()
  );

  if (!isOpen) return null;

  const handleUpdateSetting = <K extends keyof CloudSettings>(
    key: K,
    val: CloudSettings[K]
  ) => {
    const updated = SupabaseService.saveCloudSettings({ [key]: val });
    setCloudSettings(updated);
    onConfigChanged();
  };

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || !anonKey.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    const result = await SupabaseService.testConnection(url, anonKey);
    setIsTesting(false);
    setTestResult(result);

    if (result.success) {
      SupabaseService.saveConfig(url, anonKey);
      onConfigChanged();
    }
  };

  const handleDisconnect = () => {
    SupabaseService.clearConfig();
    setUrl('');
    setAnonKey('');
    setTestResult(null);
    onConfigChanged();
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SUPABASE_SQL_SETUP);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleCopyStorageFixSql = () => {
    navigator.clipboard.writeText(SUPABASE_STORAGE_FIX_SQL);
    setCopiedStorageSql(true);
    setTimeout(() => setCopiedStorageSql(false), 2500);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshCloud();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClearOffline = async () => {
    setIsClearingOffline(true);
    try {
      await onClearOfflineDownloads();
      setShowClearConfirm(false);
    } finally {
      setIsClearingOffline(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-xl rounded-3xl bg-[#090d20] border border-cyan-500/30 p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-400 to-purple-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Settings2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                Cloud Settings
              </h2>
              <p className="text-xs text-slate-400">
                Synchronization, storage quotas & Supabase connection
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section 1: Sync Preferences */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Synchronization & Downloads</span>
          </h3>

          <div className="space-y-2 bg-slate-900/60 rounded-2xl p-4 border border-white/5">
            {/* Cloud Sync */}
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <div>
                <p className="text-xs font-bold text-white">Cloud Sync</p>
                <p className="text-[11px] text-slate-400">
                  Keep cloud tracks and metadata synchronized
                </p>
              </div>
              <button
                onClick={() => handleUpdateSetting('cloudSync', !cloudSettings.cloudSync)}
                className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                  cloudSettings.cloudSync ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    cloudSettings.cloudSync ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Auto-download favorites */}
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <div>
                <p className="text-xs font-bold text-white">Auto-download Favorites</p>
                <p className="text-[11px] text-slate-400">
                  Automatically download starred cloud tracks for offline access
                </p>
              </div>
              <button
                onClick={() =>
                  handleUpdateSetting('autoDownloadFavorites', !cloudSettings.autoDownloadFavorites)
                }
                className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                  cloudSettings.autoDownloadFavorites ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    cloudSettings.autoDownloadFavorites ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Wi-Fi only download */}
            <div className="flex items-center justify-between py-1.5 border-b border-white/5">
              <div>
                <p className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Download on Wi-Fi Only</span>
                </p>
                <p className="text-[11px] text-slate-400">
                  Save mobile data when downloading offline songs
                </p>
              </div>
              <button
                onClick={() => handleUpdateSetting('wifiOnly', !cloudSettings.wifiOnly)}
                className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                  cloudSettings.wifiOnly ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    cloudSettings.wifiOnly ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Auto-sync playlists */}
            <div className="flex items-center justify-between py-1.5">
              <div>
                <p className="text-xs font-bold text-white">Auto-sync Playlists</p>
                <p className="text-[11px] text-slate-400">
                  Sync playlist tracks with cloud library availability
                </p>
              </div>
              <button
                onClick={() =>
                  handleUpdateSetting('autoSyncPlaylists', !cloudSettings.autoSyncPlaylists)
                }
                className={`w-11 h-6 rounded-full transition-colors p-0.5 ${
                  cloudSettings.autoSyncPlaylists ? 'bg-cyan-500' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    cloudSettings.autoSyncPlaylists ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Section 2: Storage Warnings & Quota */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
            <BellRing className="w-3.5 h-3.5" />
            <span>Storage Quota & Warnings</span>
          </h3>

          <div className="space-y-3 bg-slate-900/60 rounded-2xl p-4 border border-white/5">
            {/* Storage Quota Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-white block">
                Supabase Storage Plan Quota
              </label>
              <p className="text-[11px] text-slate-400">
                Matches storage percentage and available space to your exact Supabase plan.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1">
                {QUOTA_OPTIONS.map((opt) => (
                  <button
                    key={opt.bytes}
                    onClick={() => handleUpdateSetting('maxCloudQuotaBytes', opt.bytes)}
                    className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
                      cloudSettings.maxCloudQuotaBytes === opt.bytes
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400'
                        : 'bg-black/30 text-slate-400 border-white/5 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Storage Warning Threshold */}
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <div>
                <p className="text-xs font-bold text-white">Storage Warnings</p>
                <p className="text-[11px] text-slate-400">
                  Alert when cloud space runs low
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleUpdateSetting('warningThreshold', 75)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                    cloudSettings.warningThreshold === 75
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-black/30 text-slate-400 border-white/5'
                  }`}
                >
                  75%
                </button>
                <button
                  onClick={() => handleUpdateSetting('warningThreshold', 90)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                    cloudSettings.warningThreshold === 90
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-black/30 text-slate-400 border-white/5'
                  }`}
                >
                  90%
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Supabase Connection Details */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
              <Database className="w-3.5 h-3.5" />
              <span>Supabase Project Connection</span>
            </h3>

            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${
                currentConfig.isConfigured
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}
            >
              {currentConfig.isConfigured ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          <form onSubmit={handleTestAndSave} className="space-y-3 bg-slate-900/60 rounded-2xl p-4 border border-white/5">
            <div>
              <label className="text-xs text-slate-300 block mb-1 font-medium">
                Supabase Project URL
              </label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-project-id.supabase.co"
                required
                className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="text-xs text-slate-300 block mb-1 font-medium">
                Public Anon Key (Safe for browser)
              </label>
              <input
                type="password"
                value={anonKey}
                onChange={(e) => setAnonKey(e.target.value)}
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                required
                className="w-full px-3.5 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 font-mono"
              />
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-xl text-xs space-y-1.5 border animate-in fade-in ${
                  testResult.success
                    ? 'bg-emerald-950/40 border-emerald-500/30 text-emerald-300'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {testResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span className="font-semibold">{testResult.message}</span>
                </div>
                {testResult.success && (
                  <div className="text-[11px] text-slate-300 space-y-0.5 pl-6 font-mono">
                    <p>✓ Database Table "songs": {testResult.tableExists ? 'Ready' : 'Missing (Run SQL)'}</p>
                    <p>✓ Storage Bucket "music": {testResult.bucketsExist ? 'Ready' : 'Bucket required'}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-2">
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isTesting || !url || !anonKey}
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-400 to-purple-600 text-white font-bold text-xs shadow-lg shadow-cyan-500/20 hover:brightness-110 active:scale-95 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {isTesting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <span>Save & Connect</span>
                  )}
                </button>

                {currentConfig.isConfigured && (
                  <button
                    type="button"
                    onClick={handleDisconnect}
                    className="px-3 py-2 rounded-xl bg-slate-800 text-slate-400 hover:text-rose-400 hover:bg-rose-950/20 text-xs font-semibold transition"
                  >
                    Disconnect
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowSql(!showSql)}
                className="text-xs text-cyan-400 hover:underline"
              >
                {showSql ? 'Hide SQL Schema' : 'View SQL Schema'}
              </button>
            </div>

            {/* SQL Setup Script Helper */}
            {showSql && (
              <div className="pt-3 border-t border-white/10 space-y-3 animate-in fade-in">
                {/* Quick Storage RLS Fix */}
                <div className="p-3 rounded-xl bg-black/60 border border-cyan-500/30 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[11px] font-bold text-cyan-300">
                        ⚡ Quick Fix: Storage "music" Bucket RLS
                      </p>
                      <p className="text-[10px] text-slate-400">
                        Run if upload fails with "row-level security policy"
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyStorageFixSql}
                      className="px-2.5 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[11px] font-bold flex items-center gap-1.5 hover:bg-cyan-500/30 transition shrink-0 cursor-pointer"
                    >
                      {copiedStorageSql ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied Quick Fix!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Storage Fix</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-2 rounded-lg bg-slate-950/80 text-[9px] text-cyan-200/90 font-mono overflow-x-auto whitespace-pre">
                    {SUPABASE_STORAGE_FIX_SQL}
                  </pre>
                </div>

                {/* Full Database + Storage Schema */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-300">
                      Full Database & Storage Setup SQL:
                    </span>
                    <button
                      type="button"
                      onClick={handleCopySql}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 border border-white/10 text-[11px] flex items-center gap-1.5 hover:bg-slate-700 hover:text-white transition cursor-pointer"
                    >
                      {copiedSql ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span>Copied Full Schema!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Full Schema</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-black/60 border border-white/5 text-[10px] text-cyan-200 font-mono overflow-x-auto max-h-40 custom-scrollbar whitespace-pre">
                    {SUPABASE_SQL_SETUP}
                  </pre>
                </div>
              </div>
            )}
          </form>
        </div>

        {/* Section 4: Maintenance Actions */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            Maintenance & Storage Cleanup
          </h3>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full sm:w-auto flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-200 hover:text-white hover:border-cyan-500/40 text-xs font-semibold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
              <span>Refresh & Sync Cloud</span>
            </button>

            {showClearConfirm ? (
              <div className="w-full sm:w-auto flex items-center gap-1.5">
                <button
                  onClick={handleClearOffline}
                  disabled={isClearingOffline}
                  className="px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition disabled:opacity-50"
                >
                  {isClearingOffline ? 'Clearing...' : 'Confirm Clear'}
                </button>
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 text-slate-300 text-xs transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="w-full sm:w-auto flex-1 px-4 py-2.5 rounded-xl bg-rose-950/30 border border-rose-500/20 text-rose-300 hover:bg-rose-950/50 hover:border-rose-500/40 text-xs font-semibold flex items-center justify-center gap-2 transition"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Clear Offline Downloads</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
