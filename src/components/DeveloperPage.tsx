import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, RefreshCw, Shield, ShieldCheck, Lock, 
  Users, Smartphone, Globe, AlertCircle, CheckCircle2, 
  Calendar, Clock, Sparkles, AlertTriangle, Layers, 
  Wifi, Server, Terminal, ArrowRight, Search, Filter,
  ArrowUpDown, Edit2, Check, Eye
} from 'lucide-react';
import { 
  getJtecAdminClient, 
  SupabaseService, 
  CLOUD_CATEGORIES, 
  SourceDiagnosticResult,
  CloudCategoryKey 
} from '../services/supabase';
import { getCurrentAppVersion, NativeUpdateService } from '../services/nativeUpdate';
import { registerBackHandler } from '../services/navigation';
import { APP_VERSION, BUILD_DATE } from '../version';
import { RequiredUpdateOverlay } from './RequiredUpdateOverlay';
import { 
  parseConfigNotes, 
  getMinVersionDiagnosticInfo, 
  checkMinimumVersion 
} from '../services/appConfig';

export interface AppInstallRow {
  install_id: string;
  first_seen: string | null;
  last_seen: string | null;
  app_version: string | null;
  build: number | null;
  platform: string | null;
  opens: number | null;
  device_name?: string | null;
  name?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  os?: string | null;
}

export interface AppConfigRow {
  id: number;
  min_build: number;
  message?: string;
  notes?: string;
  apk_url?: string;
}

interface DeveloperPageProps {
  isOpen: boolean;
  onClose: () => void;
}

type DeveloperTab = 'usage' | 'min_version' | 'update_status' | 'connection';

export const DeveloperPage: React.FC<DeveloperPageProps> = ({ isOpen, onClose }) => {
  const [adminClient] = useState(() => getJtecAdminClient());
  const [session, setSession] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<DeveloperTab>('usage');

  // Sign-in states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // App version & build information
  const [appVersionInfo, setAppVersionInfo] = useState<{ version: string; build: number }>({
    version: '1.0.1',
    build: 101,
  });
  const [latestBuild, setLatestBuild] = useState<number>(101);

  // Usage tab data
  const [installs, setInstalls] = useState<AppInstallRow[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  // Device search, filter, and sorting states
  const [deviceSearch, setDeviceSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'android' | 'web' | 'ios'>('all');
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [lastSeenSortDesc, setLastSeenSortDesc] = useState<boolean>(true);

  // Device name inline edit state
  const [editingDeviceId, setEditingDeviceId] = useState<string | null>(null);
  const [editingDeviceNameInput, setEditingDeviceNameInput] = useState<string>('');
  const [isSavingDeviceName, setIsSavingDeviceName] = useState(false);

  // Minimum version tab data
  const [appConfig, setAppConfig] = useState<AppConfigRow | null>(null);
  const [editingMinBuild, setEditingMinBuild] = useState<string>('');
  const [editingMessage, setEditingMessage] = useState<string>('');
  const [editingNotes, setEditingNotes] = useState<string>('');
  const [editingApkUrl, setEditingApkUrl] = useState<string>('');
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Required update preview modal
  const [showRequiredUpdatePreview, setShowRequiredUpdatePreview] = useState(false);

  // Connection test tab data
  const [connectionResults, setConnectionResults] = useState<SourceDiagnosticResult[]>([]);
  const [isRunningConnectionTest, setIsRunningConnectionTest] = useState(false);

  // Device Update & Minimum Version Diagnostics
  const [minVersionDiag, setMinVersionDiag] = useState(() => getMinVersionDiagnosticInfo());
  const [updateDiag, setUpdateDiag] = useState(() => NativeUpdateService.getUpdateDiagnosticInfo());
  const [isCheckingNow, setIsCheckingNow] = useState(false);

  const refreshDiagnostics = useCallback(() => {
    setMinVersionDiag(getMinVersionDiagnosticInfo());
    setUpdateDiag(NativeUpdateService.getUpdateDiagnosticInfo());
  }, []);

  const formatTimestamp = useCallback((ts: number | null): string => {
    if (!ts) return 'Never';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago (${new Date(ts).toLocaleTimeString()})`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago (${new Date(ts).toLocaleTimeString()})`;
    return new Date(ts).toLocaleString();
  }, []);

  const handleCheckNow = useCallback(async () => {
    setIsCheckingNow(true);
    try {
      await Promise.allSettled([
        NativeUpdateService.checkForUpdate(true),
        checkMinimumVersion(false),
      ]);
      const appInfo = await getCurrentAppVersion();
      setAppVersionInfo({ version: appInfo.version, build: appInfo.build });
    } catch (err) {
      console.warn('Developer Check Now notice:', err);
    } finally {
      refreshDiagnostics();
      setIsCheckingNow(false);
    }
  }, [refreshDiagnostics]);

  // Fetch version & latest build on mount
  useEffect(() => {
    getCurrentAppVersion().then((info) => {
      setAppVersionInfo({ version: info.version, build: info.build });
      setLatestBuild(info.build);
    });

    NativeUpdateService.checkForUpdate().then((updateInfo) => {
      if (updateInfo?.latestBuild) {
        setLatestBuild(updateInfo.latestBuild);
      }
      refreshDiagnostics();
    }).catch(() => {
      refreshDiagnostics();
    });
  }, [refreshDiagnostics]);

  // Handle Close & Sign out
  const handleClose = useCallback(async () => {
    try {
      if (adminClient) {
        await adminClient.auth.signOut();
      }
    } catch {
      // ignore
    }
    setSession(null);
    setPassword('');
    setAccessDenied(false);
    onClose();
  }, [adminClient, onClose]);

  // Register hardware / system back button handler while developer page is open
  useEffect(() => {
    if (isOpen) {
      return registerBackHandler('developer_page', 100, () => {
        handleClose();
        return true;
      });
    }
  }, [isOpen, handleClose]);

  // Admin Sign-in handler
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminClient) {
      setAccessDenied(true);
      return;
    }
    if (!email.trim() || !password) {
      setAccessDenied(true);
      return;
    }

    setIsSigningIn(true);
    setAccessDenied(false);

    try {
      const { data, error } = await adminClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      // Clear password field immediately
      setPassword('');

      if (error || !data.session) {
        setAccessDenied(true);
        return;
      }

      // Verify the signed-in account is allowed to read app_config or app_installs
      const { error: testReadError } = await adminClient
        .from('app_config')
        .select('id')
        .limit(1);

      if (testReadError && testReadError.code === '42501') {
        // Permissions denied for this user on Supabase side
        await adminClient.auth.signOut();
        setAccessDenied(true);
        return;
      }

      setSession(data.session);
    } catch {
      setPassword('');
      setAccessDenied(true);
    } finally {
      setIsSigningIn(false);
    }
  };

  // Load Usage Installs
  const loadUsageData = useCallback(async () => {
    if (!adminClient || !session) return;
    setIsLoadingUsage(true);
    setUsageError(null);

    try {
      const { data, error } = await adminClient
        .from('app_installs')
        .select('*')
        .order('last_seen', { ascending: false });

      if (error) {
        throw new Error(error.message);
      }
      setInstalls((data as AppInstallRow[]) || []);
    } catch (err: any) {
      setUsageError(err?.message || 'Failed to load app_installs.');
    } finally {
      setIsLoadingUsage(false);
    }
  }, [adminClient, session]);

  // Load Minimum Version Config
  const loadMinVersionConfig = useCallback(async () => {
    if (!adminClient || !session) return;
    setIsLoadingConfig(true);
    setSaveErrorMsg(null);

    try {
      const { data, error } = await adminClient
        .from('app_config')
        .select('id, min_build, message, notes, apk_url')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        setAppConfig(data as AppConfigRow);
        setEditingMinBuild(String(data.min_build ?? ''));
        setEditingMessage(data.message || '');
        setEditingNotes(data.notes || '');
        setEditingApkUrl(data.apk_url || '');
      }
    } catch (err: any) {
      setSaveErrorMsg(err?.message || 'Failed to load app_config.');
    } finally {
      setIsLoadingConfig(false);
    }
  }, [adminClient, session]);

  // Run Connection Tests for each cloud source
  const runConnectionTests = useCallback(async () => {
    setIsRunningConnectionTest(true);
    try {
      const results = await SupabaseService.testAllSources();
      setConnectionResults(results);
    } catch {
      // ignore
    } finally {
      setIsRunningConnectionTest(false);
    }
  }, []);

  // When session is active, load data for active tab
  useEffect(() => {
    if (session) {
      if (activeTab === 'usage') {
        loadUsageData();
      } else if (activeTab === 'min_version') {
        loadMinVersionConfig();
      } else if (activeTab === 'connection') {
        runConnectionTests();
      }
    }
  }, [session, activeTab, loadUsageData, loadMinVersionConfig, runConnectionTests]);

  // Save updated min_build, message, notes, and apk_url
  const handleConfirmSaveMinBuild = async () => {
    if (!adminClient || !session) return;
    const newBuildNum = parseInt(editingMinBuild.trim(), 10);
    if (isNaN(newBuildNum) || newBuildNum < 0) {
      setSaveErrorMsg('Please enter a valid positive build number.');
      setShowConfirmModal(false);
      return;
    }

    setIsSavingConfig(true);
    setSaveErrorMsg(null);
    setSaveSuccessMsg(null);

    try {
      const { error } = await adminClient
        .from('app_config')
        .update({
          min_build: newBuildNum,
          message: editingMessage.trim() || 'An update is required to continue using JTEC MUSIC.',
          notes: editingNotes.trim() || null,
          apk_url: editingApkUrl.trim() || null,
        })
        .eq('id', 1);

      if (error) {
        throw new Error(error.message);
      }

      setAppConfig({
        id: 1,
        min_build: newBuildNum,
        message: editingMessage.trim() || 'An update is required to continue using JTEC MUSIC.',
        notes: editingNotes.trim(),
        apk_url: editingApkUrl.trim(),
      });
      setSaveSuccessMsg(`Minimum version configuration saved successfully.`);
      setShowConfirmModal(false);
    } catch (err: any) {
      setSaveErrorMsg(err?.message || 'Failed to update minimum version.');
      setShowConfirmModal(false);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Device Name Editing
  const handleStartEditDevice = (row: AppInstallRow) => {
    setEditingDeviceId(row.install_id);
    setEditingDeviceNameInput(row.device_name || row.name || '');
  };

  const handleCancelEditDevice = () => {
    setEditingDeviceId(null);
    setEditingDeviceNameInput('');
  };

  const handleSaveDeviceName = async (installId: string) => {
    if (!adminClient || !session) return;
    setIsSavingDeviceName(true);
    const cleanName = editingDeviceNameInput.trim().slice(0, 40);

    try {
      const { error } = await adminClient
        .from('app_installs')
        .update({ device_name: cleanName || null })
        .eq('install_id', installId);

      if (error) {
        throw new Error(error.message);
      }

      setInstalls((prev) =>
        prev.map((item) =>
          item.install_id === installId
            ? { ...item, device_name: cleanName || null }
            : item
        )
      );
      setEditingDeviceId(null);
      setEditingDeviceNameInput('');
    } catch (err: any) {
      alert(`Failed to update device name: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSavingDeviceName(false);
    }
  };

  // Computations for Usage Tab
  const totalInstalls = installs.length;

  const totalAndroidInstalls = useMemo(() => {
    return installs.filter((i) => (i.platform || '').toLowerCase().includes('android')).length;
  }, [installs]);

  const totalWebInstalls = useMemo(() => {
    return installs.filter((i) => (i.platform || '').toLowerCase().includes('web')).length;
  }, [installs]);

  const { active24h, active7d, active30d, new7d } = useMemo(() => {
    const now = Date.now();
    const ms24h = 24 * 60 * 60 * 1000;
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    const ms30d = 30 * 24 * 60 * 60 * 1000;

    let a24 = 0;
    let a7 = 0;
    let a30 = 0;
    let n7 = 0;

    installs.forEach((item) => {
      if (item.last_seen) {
        const t = new Date(item.last_seen).getTime();
        const diff = now - t;
        if (diff <= ms24h) a24 += 1;
        if (diff <= ms7d) a7 += 1;
        if (diff <= ms30d) a30 += 1;
      }
      if (item.first_seen) {
        const ft = new Date(item.first_seen).getTime();
        if (now - ft <= ms7d) {
          n7 += 1;
        }
      }
    });

    return { active24h: a24, active7d: a7, active30d: a30, new7d: n7 };
  }, [installs]);

  // Installs per version
  const versionStats = useMemo(() => {
    const map = new Map<string, { count: number; maxBuild: number }>();
    installs.forEach((item) => {
      const ver = item.app_version || 'Unknown';
      const b = item.build || 0;
      const cur = map.get(ver) || { count: 0, maxBuild: 0 };
      map.set(ver, {
        count: cur.count + 1,
        maxBuild: Math.max(cur.maxBuild, b),
      });
    });

    const list = Array.from(map.entries()).map(([ver, data]) => ({
      version: ver,
      count: data.count,
      maxBuild: data.maxBuild,
      percentage: totalInstalls > 0 ? (data.count / totalInstalls) * 100 : 0,
    }));

    list.sort((a, b) => {
      if (b.maxBuild !== a.maxBuild) {
        return b.maxBuild - a.maxBuild;
      }
      return b.version.localeCompare(a.version);
    });

    return list;
  }, [installs, totalInstalls]);

  // Unique versions list for dropdown filter
  const distinctVersions = useMemo(() => {
    const set = new Set<string>();
    installs.forEach((i) => {
      if (i.app_version) set.add(i.app_version);
    });
    return Array.from(set).sort().reverse();
  }, [installs]);

  // Platform Split
  const platformStats = useMemo(() => {
    const map = new Map<string, number>();
    installs.forEach((item) => {
      const p = (item.platform || 'web').toLowerCase();
      map.set(p, (map.get(p) || 0) + 1);
    });

    const list = ['android', 'web', 'ios'].map((key) => {
      const c = map.get(key) || 0;
      return {
        platform: key,
        label: key === 'android' ? 'Android APK' : key === 'web' ? 'Web Browser' : 'iOS',
        count: c,
        percentage: totalInstalls > 0 ? (c / totalInstalls) * 100 : 0,
      };
    });

    return list;
  }, [installs, totalInstalls]);

  // Filtered and Sorted Devices List
  const filteredDevices = useMemo(() => {
    let list = [...installs];

    if (deviceSearch.trim()) {
      const q = deviceSearch.toLowerCase().trim();
      list = list.filter((item) => {
        const name = (item.device_name || item.name || '').toLowerCase();
        const model = (item.model || '').toLowerCase();
        const mfg = (item.manufacturer || '').toLowerCase();
        const os = (item.os || '').toLowerCase();
        const ver = (item.app_version || '').toLowerCase();
        const id = (item.install_id || '').toLowerCase();
        return (
          name.includes(q) ||
          model.includes(q) ||
          mfg.includes(q) ||
          os.includes(q) ||
          ver.includes(q) ||
          id.includes(q)
        );
      });
    }

    if (platformFilter !== 'all') {
      list = list.filter((item) => (item.platform || '').toLowerCase().includes(platformFilter));
    }

    if (versionFilter !== 'all') {
      list = list.filter((item) => (item.app_version || '') === versionFilter);
    }

    list.sort((a, b) => {
      const timeA = a.last_seen ? new Date(a.last_seen).getTime() : 0;
      const timeB = b.last_seen ? new Date(b.last_seen).getTime() : 0;
      return lastSeenSortDesc ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [installs, deviceSearch, platformFilter, versionFilter, lastSeenSortDesc]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#070a16] text-slate-100 flex flex-col font-sans select-none overflow-hidden animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="px-4 sm:px-6 py-3.5 border-b border-cyan-500/20 bg-slate-950/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black text-white tracking-wider flex items-center gap-2">
              <span>DEVELOPER PORTAL</span>
              {session && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300">
                  ADMIN AUTHENTICATED
                </span>
              )}
            </h2>
            <p className="text-[10px] text-slate-400 font-mono">
              Build {appVersionInfo.build} • {BUILD_DATE}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white transition cursor-pointer active:scale-95"
          aria-label="Close Developer Page"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Main Content Area */}
      {!session ? (
        /* =========================================================================
            STATE 1: ADMIN SIGN-IN SCREEN
           ========================================================================= */
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl border border-cyan-500/30 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-xl space-y-6">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 mb-1">
                <Lock className="w-6 h-6" />
              </div>
              <h3 className="text-xl font-black text-white tracking-wide">Developer Sign In</h3>
              <p className="text-xs text-slate-400">
                Sign in with your JTEC admin credentials to access telemetry and version control.
              </p>
            </div>

            {accessDenied && (
              <div className="p-3.5 rounded-2xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>Access denied. Check your email, password, or admin permissions.</span>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@jtecmusic.com"
                  autoComplete="username"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300 block">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 text-white shadow-lg shadow-cyan-500/25 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isSigningIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Authenticate</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 text-center text-[11px] text-slate-500">
              Session signs out automatically when closed. Never stores password.
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
            STATE 2: AUTHENTICATED TABS
           ========================================================================= */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab Navigation */}
          <div className="px-4 sm:px-6 pt-3 border-b border-white/10 bg-slate-950/60 flex items-center gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('usage')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
                activeTab === 'usage'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Usage Telemetry</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('min_version');
                refreshDiagnostics();
              }}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
                activeTab === 'min_version'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Minimum Version</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('update_status');
                refreshDiagnostics();
              }}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
                activeTab === 'update_status'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Update Status</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('connection')}
              className={`px-4 py-2.5 rounded-t-xl text-xs font-bold transition flex items-center gap-2 border-b-2 cursor-pointer ${
                activeTab === 'connection'
                  ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                  : 'border-transparent text-slate-400 hover:text-white'
              }`}
            >
              <Wifi className="w-3.5 h-3.5" />
              <span>Connection Test</span>
            </button>
          </div>

          {/* Tab Panels */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* =========================================================================
                TAB A: USAGE
               ========================================================================= */}
            {activeTab === 'usage' && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white tracking-wide">Usage Telemetry</h3>
                    <p className="text-xs text-slate-400">From table <code className="text-cyan-300 font-mono">app_installs</code></p>
                  </div>

                  <button
                    type="button"
                    onClick={loadUsageData}
                    disabled={isLoadingUsage}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-white/10 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsage ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {usageError && (
                  <div className="p-3.5 rounded-2xl bg-red-950/50 border border-red-500/40 text-xs text-red-200">
                    {usageError}
                  </div>
                )}

                {/* Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {/* Total Installs */}
                  <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-4 shadow-lg flex flex-col justify-between min-h-[115px]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                      <span>TOTAL INSTALLS</span>
                      <Users className="w-4 h-4 text-cyan-400" />
                    </div>
                    <div className="my-1.5">
                      <span className="text-3xl font-black text-white">{totalInstalls.toLocaleString()}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">All registered devices</p>
                  </div>

                  {/* Active 24 Hours */}
                  <div className="rounded-2xl border border-emerald-500/30 bg-slate-900/70 p-4 shadow-lg flex flex-col justify-between min-h-[115px]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                      <span>ACTIVE (LAST 24H)</span>
                      <Clock className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div className="my-1.5 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-emerald-400">{active24h.toLocaleString()}</span>
                      {totalInstalls > 0 && (
                        <span className="text-xs font-bold text-emerald-400/80">
                          ({((active24h / totalInstalls) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">Opened in the last 24h</p>
                  </div>

                  {/* Active 7 Days & 30 Days */}
                  <div className="rounded-2xl border border-purple-500/30 bg-slate-900/70 p-4 shadow-lg flex flex-col justify-between min-h-[115px]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                      <span>ACTIVE WINDOWS</span>
                      <Calendar className="w-4 h-4 text-purple-400" />
                    </div>
                    <div className="my-1.5 grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">7 Days</span>
                        <span className="text-xl font-black text-purple-300">{active7d.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-[9px] uppercase font-bold text-slate-400 block">30 Days</span>
                        <span className="text-xl font-black text-slate-200">{active30d.toLocaleString()}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-slate-400">Active users 7d & 30d</p>
                  </div>

                  {/* New Installs in 7 Days */}
                  <div className="rounded-2xl border border-amber-500/30 bg-slate-900/70 p-4 shadow-lg flex flex-col justify-between min-h-[115px]">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                      <span>NEW (LAST 7 DAYS)</span>
                      <Sparkles className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="my-1.5 flex items-baseline gap-2">
                      <span className="text-3xl font-black text-amber-400">{new7d.toLocaleString()}</span>
                      {totalInstalls > 0 && (
                        <span className="text-xs font-bold text-amber-400/80">
                          ({((new7d / totalInstalls) * 100).toFixed(0)}%)
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">First seen within 7 days</p>
                  </div>
                </div>

                {/* Platform Split & Version Lists */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Platform Split */}
                  <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/70 p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-purple-400" />
                        <h4 className="text-sm font-bold text-white">Platform Split</h4>
                      </div>
                      <span className="text-xs text-slate-400">{totalInstalls} total</span>
                    </div>

                    <div className="space-y-3">
                      {platformStats.map((item) => (
                        <div key={item.platform} className="p-3 rounded-2xl bg-slate-950/60 border border-white/5 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-bold text-white">{item.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-300">{item.count.toLocaleString()}</span>
                              <span className="text-[10px] font-bold text-cyan-400 px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/30">
                                {item.percentage.toFixed(1)}%
                              </span>
                            </div>
                          </div>

                          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                item.platform === 'android'
                                  ? 'bg-emerald-500'
                                  : item.platform === 'ios'
                                  ? 'bg-purple-500'
                                  : 'bg-cyan-500'
                              }`}
                              style={{ width: `${Math.max(item.percentage, 2)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Installs per Version (Newest First) */}
                  <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/70 p-5 shadow-xl space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Layers className="w-4 h-4 text-cyan-400" />
                        <h4 className="text-sm font-bold text-white">Installs per Version</h4>
                      </div>
                      <span className="text-xs text-slate-400">Newest first</span>
                    </div>

                    {versionStats.length === 0 ? (
                      <p className="text-xs text-slate-400 py-6 text-center">No install rows recorded yet.</p>
                    ) : (
                      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                        {versionStats.map((v, idx) => (
                          <div
                            key={v.version}
                            className={`p-3 rounded-2xl border transition ${
                              idx === 0
                                ? 'bg-cyan-950/30 border-cyan-500/40'
                                : 'bg-slate-950/50 border-white/5'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-white">{v.version}</span>
                                {v.maxBuild > 0 && (
                                   <span className="text-[10px] font-mono text-slate-400">
                                     (Build {v.maxBuild})
                                   </span>
                                )}
                                {idx === 0 && (
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400 text-cyan-300">
                                    Latest
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="font-mono text-slate-300 font-bold">{v.count}</span>
                                <span className="text-[11px] font-bold text-cyan-300 px-2 py-0.5 rounded-lg bg-slate-900 border border-cyan-500/30">
                                  {v.percentage.toFixed(1)}%
                                </span>
                              </div>
                            </div>

                            <div className="w-full h-1 rounded-full bg-slate-800/80 overflow-hidden mt-2">
                              <div
                                className={`h-full rounded-full ${
                                  idx === 0 ? 'bg-gradient-to-r from-cyan-400 to-blue-500' : 'bg-slate-500'
                                }`}
                                style={{ width: `${Math.max(v.percentage, 1)}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* =========================================================================
                    DEVICES SECTION: Totals (APK & Web), Searchable & Filterable List
                   ========================================================================= */}
                <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/80 p-5 sm:p-6 shadow-2xl space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-base font-black text-white">Devices Directory</h4>
                        <p className="text-[11px] text-slate-400">
                          Inspect individual installations, edit device names, and view client telemetry
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Totals for Android APK and Web */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-emerald-500/30 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Android App (APK) Installs
                        </span>
                        <div className="text-2xl font-black text-emerald-400 font-mono">
                          {totalAndroidInstalls.toLocaleString()}
                        </div>
                        <span className="text-[10px] text-slate-500">Native Android packages</span>
                      </div>
                      <Smartphone className="w-8 h-8 text-emerald-400/40" />
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-cyan-500/30 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Web Installs
                        </span>
                        <div className="text-2xl font-black text-cyan-400 font-mono">
                          {totalWebInstalls.toLocaleString()}
                        </div>
                        <span className="text-[10px] text-slate-500">Browser & PWA sessions</span>
                      </div>
                      <Globe className="w-8 h-8 text-cyan-400/40" />
                    </div>
                  </div>

                  {/* Search and Filters Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
                    {/* Search Input */}
                    <div className="sm:col-span-5 relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={deviceSearch}
                        onChange={(e) => setDeviceSearch(e.target.value)}
                        placeholder="Search device name, model, OS or version..."
                        className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    {/* Platform Filter */}
                    <div className="sm:col-span-3">
                      <select
                        value={platformFilter}
                        onChange={(e: any) => setPlatformFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        <option value="all">All Platforms</option>
                        <option value="android">Android (APK)</option>
                        <option value="web">Web Browser</option>
                        <option value="ios">iOS</option>
                      </select>
                    </div>

                    {/* Version Filter */}
                    <div className="sm:col-span-2">
                      <select
                        value={versionFilter}
                        onChange={(e) => setVersionFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        <option value="all">All Versions</option>
                        {distinctVersions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Last Seen Sort Toggle */}
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => setLastSeenSortDesc(!lastSeenSortDesc)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <ArrowUpDown className="w-3 h-3 text-cyan-400" />
                        <span>{lastSeenSortDesc ? 'Newest' : 'Oldest'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Devices List Rows */}
                  {filteredDevices.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-slate-950/40 border border-white/5 text-center text-xs text-slate-400">
                      No matching devices found.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {filteredDevices.map((row) => {
                        const displayName = row.device_name || row.name || 'Unnamed';
                        const isEditingThis = editingDeviceId === row.install_id;
                        const platformLower = (row.platform || 'web').toLowerCase();
                        const isAndroid = platformLower.includes('android');
                        const isIos = platformLower.includes('ios');

                        const mfgAndModel = [row.manufacturer, row.model].filter(Boolean).join(' ') || 'Device unknown';
                        const osStr = row.os || 'OS unknown';
                        const firstSeenStr = row.first_seen ? new Date(row.first_seen).toLocaleString() : 'N/A';
                        const lastSeenStr = row.last_seen ? new Date(row.last_seen).toLocaleString() : 'N/A';

                        return (
                          <div
                            key={row.install_id}
                            className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 hover:border-cyan-500/30 transition space-y-3"
                          >
                            {/* Device Name Row & Platform Badge */}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isEditingThis ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      maxLength={40}
                                      value={editingDeviceNameInput}
                                      onChange={(e) => setEditingDeviceNameInput(e.target.value)}
                                      placeholder="Device name (e.g. Living Room Tablet)"
                                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-cyan-400 text-xs text-white font-semibold focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveDeviceName(row.install_id)}
                                      disabled={isSavingDeviceName}
                                      className="p-1.5 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition cursor-pointer"
                                      title="Save device name"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={handleCancelEditDevice}
                                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                                      title="Cancel"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-white">{displayName}</span>
                                    <button
                                      type="button"
                                      onClick={() => handleStartEditDevice(row)}
                                      className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-300 transition cursor-pointer"
                                      title="Edit device name"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                    isAndroid
                                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                                      : isIos
                                      ? 'bg-purple-500/15 border-purple-500/40 text-purple-300'
                                      : 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                                  }`}
                                >
                                  {isAndroid ? 'Android' : isIos ? 'iOS' : 'Web'}
                                </span>
                                <span className="text-[11px] font-mono text-cyan-400 px-2 py-0.5 rounded-lg bg-slate-900 border border-white/5">
                                  {row.app_version || 'v1.0.1'}
                                  {row.build ? ` (Build ${row.build})` : ''}
                                </span>
                              </div>
                            </div>

                            {/* Details Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 border-t border-white/5 text-[11px]">
                              <div>
                                <span className="text-slate-500 block text-[10px] uppercase font-bold">Hardware</span>
                                <span className="text-slate-200 font-medium truncate block">{mfgAndModel}</span>
                                <span className="text-slate-400 text-[10px]">{osStr}</span>
                              </div>

                              <div>
                                <span className="text-slate-500 block text-[10px] uppercase font-bold">Activity</span>
                                <span className="text-slate-300 font-mono text-[10px] block">
                                  Last: <strong className="text-slate-200">{lastSeenStr}</strong>
                                </span>
                                <span className="text-slate-500 font-mono text-[10px] block">
                                  First: {firstSeenStr}
                                </span>
                              </div>

                              <div className="sm:text-right flex sm:flex-col justify-between sm:justify-start items-center sm:items-end">
                                <span className="text-slate-500 text-[10px] uppercase font-bold">Total Opens</span>
                                <span className="text-xs font-mono font-bold text-cyan-300">
                                  {row.opens ?? 1} {row.opens === 1 ? 'open' : 'opens'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* =========================================================================
                TAB B: MINIMUM VERSION
               ========================================================================= */}
            {activeTab === 'min_version' && (
              <div className="space-y-5 max-w-2xl mx-auto">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white tracking-wide">Minimum Version</h3>
                    <p className="text-xs text-slate-400">Reads and updates <code className="text-cyan-300 font-mono">app_config (id = 1)</code></p>
                  </div>

                  <button
                    type="button"
                    onClick={loadMinVersionConfig}
                    disabled={isLoadingConfig}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-white/10 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingConfig ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {saveSuccessMsg && (
                  <div className="p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{saveSuccessMsg}</span>
                  </div>
                )}

                {/* "This phone" Status Box */}
                <div className="rounded-3xl border border-cyan-500/40 bg-slate-900/90 p-5 shadow-xl space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">This Phone Status</h4>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      minVersionDiag.isBlocked
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                        : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    }`}>
                      {minVersionDiag.isBlocked ? 'Blocked (Update Required)' : 'Allowed (Not Blocked)'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 block font-medium">Installed Version & Build</span>
                      <span className="font-mono font-bold text-white text-sm">v{appVersionInfo.version} ({appVersionInfo.build})</span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 block font-medium">Cloud min_build</span>
                      <span className="font-mono font-bold text-cyan-300 text-sm">
                        {minVersionDiag.minBuild !== null ? `Build ${minVersionDiag.minBuild}` : 'Not set'}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 block font-medium">When Last Read</span>
                      <span className="font-mono text-slate-300 text-[11px] block truncate">
                        {formatTimestamp(minVersionDiag.lastReadTime)}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 block font-medium">Blocked?</span>
                      <span className={`font-mono font-black text-sm ${minVersionDiag.isBlocked ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {minVersionDiag.isBlocked ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-cyan-500/40 bg-gradient-to-b from-slate-900/90 to-slate-950 p-6 shadow-xl space-y-5">
                  {/* Current info & Latest build comparison */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-white/10 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Configured Min Build
                      </span>
                      <p className="text-2xl font-black text-cyan-400 font-mono">
                        {appConfig?.min_build ?? 'Not set'}
                      </p>
                      <p className="text-[10px] text-slate-500">From table app_config</p>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-950/70 border border-cyan-500/30 space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Current Latest Build
                      </span>
                      <p className="text-2xl font-black text-emerald-400 font-mono">
                        Build {latestBuild}
                      </p>
                      <p className="text-[10px] text-slate-500">Installed build: {appVersionInfo.build}</p>
                    </div>
                  </div>

                  {/* Form fields */}
                  <div className="space-y-4 pt-2">
                    {/* Minimum Required Build */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        Minimum Required Build Number
                      </label>
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={editingMinBuild}
                        onChange={(e) => setEditingMinBuild(e.target.value)}
                        placeholder="e.g. 101"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none"
                      />
                    </div>

                    {/* Update Message */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        Update Message for Blocked Users
                      </label>
                      <textarea
                        rows={2}
                        value={editingMessage}
                        onChange={(e) => setEditingMessage(e.target.value)}
                        placeholder="An update is required to continue using JTEC MUSIC."
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white text-xs focus:border-cyan-400 focus:outline-none resize-none"
                      />
                    </div>

                    {/* Multi-line Notes */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                          Release Notes Bullets (Multi-line)
                        </label>
                        <span className="text-[10px] text-slate-400">One bullet per line starting with &quot;- &quot;</span>
                      </div>
                      <textarea
                        rows={4}
                        value={editingNotes}
                        onChange={(e) => setEditingNotes(e.target.value)}
                        placeholder="- Enhanced playback performance and instant caching&#10;- Fixed update download resume logic&#10;- Brand new device tracking portal"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none resize-y"
                      />
                    </div>

                    {/* APK URL */}
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                        Direct APK Download URL
                      </label>
                      <input
                        type="url"
                        value={editingApkUrl}
                        onChange={(e) => setEditingApkUrl(e.target.value)}
                        placeholder="https://github.com/fatormajohn999-gif/JTEC-music-studio-/releases/latest/download/JTEC-MUSIC.apk"
                        className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                      />
                      <p className="text-[10px] text-slate-400">
                        Leave blank to use the default latest release link.
                      </p>
                    </div>

                    {/* Warning requirement */}
                    <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>Apps with a build below this number will be blocked until they update.</span>
                    </div>

                    {/* Action Buttons: Preview & Save */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <button
                        type="button"
                        onClick={() => setShowRequiredUpdatePreview(true)}
                        className="py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-white/10 transition cursor-pointer flex items-center justify-center gap-2 active:scale-98"
                      >
                        <Eye className="w-4 h-4 text-cyan-400" />
                        <span>Preview Screen</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setShowConfirmModal(true)}
                        disabled={isSavingConfig || !editingMinBuild}
                        className="py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Save Minimum Version</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                TAB: UPDATE STATUS & DIAGNOSTICS
               ========================================================================= */}
            {activeTab === 'update_status' && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-base font-black text-white flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-400" />
                      <span>Update Status & Device Diagnostics</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Live release telemetry, diagnostic logs, and update checker for this device
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleCheckNow}
                    disabled={isCheckingNow}
                    className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50 active:scale-98"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingNow ? 'animate-spin' : ''}`} />
                    <span>{isCheckingNow ? 'Checking...' : 'Check now'}</span>
                  </button>
                </div>

                {/* Primary Telemetry Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {/* Installed version and build */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/30 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Installed Version & Build
                    </span>
                    <div className="text-xl font-black text-white font-mono">
                      v{appVersionInfo.version} <span className="text-cyan-400 text-base">(Build {appVersionInfo.build})</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Read natively via App.getInfo()</span>
                  </div>

                  {/* Latest build found */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/30 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Latest Build Found
                    </span>
                    <div className="text-xl font-black text-emerald-400 font-mono">
                      {updateDiag.lastFoundBuild ? `Build ${updateDiag.lastFoundBuild}` : 'None'}
                    </div>
                    <span className="text-[10px] text-slate-500">From latest release asset</span>
                  </div>

                  {/* Source */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-purple-500/30 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Source
                    </span>
                    <div className="text-xl font-black text-purple-300 font-mono">
                      {updateDiag.lastSource ? updateDiag.lastSource : 'None'}
                    </div>
                    <span className="text-[10px] text-slate-500">latest.json (primary) or GitHub API</span>
                  </div>

                  {/* Last check time */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Last Check Time
                    </span>
                    <div className="text-sm font-bold text-slate-200 font-mono pt-1">
                      {formatTimestamp(updateDiag.lastCheckTime)}
                    </div>
                    <span className="text-[10px] text-slate-500">Automatic or manual check timestamp</span>
                  </div>

                  {/* Last error */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Last Error
                    </span>
                    <div className={`text-xs font-mono font-bold pt-1 break-all ${updateDiag.lastError ? 'text-rose-400' : 'text-slate-400'}`}>
                      {updateDiag.lastError || 'None'}
                    </div>
                    <span className="text-[10px] text-slate-500">Error text or code</span>
                  </div>

                  {/* Minimum Version & Block Status */}
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Cloud Minimum Version
                    </span>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="font-mono text-sm text-cyan-300 font-bold">
                        {minVersionDiag.minBuild !== null ? `Min Build ${minVersionDiag.minBuild}` : 'No Min Build'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        minVersionDiag.isBlocked
                          ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                          : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                      }`}>
                        {minVersionDiag.isBlocked ? 'Blocked' : 'Allowed'}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Read: {formatTimestamp(minVersionDiag.lastReadTime)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                TAB C: CONNECTION TEST
               ========================================================================= */}
            {activeTab === 'connection' && (
              <div className="space-y-5 max-w-3xl mx-auto">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white tracking-wide">Connection Test</h3>
                    <p className="text-xs text-slate-400">Public read check across all cloud sources</p>
                  </div>

                  <button
                    type="button"
                    onClick={runConnectionTests}
                    disabled={isRunningConnectionTest}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-white/10 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRunningConnectionTest ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>Run Test</span>
                  </button>
                </div>

                {/* Overall App Version & Build display */}
                <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-cyan-400" />
                    <span className="font-bold text-white">App Client</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono">
                    <span className="text-slate-300">Version: {appVersionInfo.version}</span>
                    <span className="text-cyan-400">Build: {appVersionInfo.build}</span>
                  </div>
                </div>

                {/* Source diagnostic cards */}
                <div className="space-y-3.5">
                  {CLOUD_CATEGORIES.map((cat) => {
                    const result = connectionResults.find((r) => r.categoryKey === cat.key);
                    const isPending = isRunningConnectionTest && !result;

                    return (
                      <div
                        key={cat.key}
                        className="p-5 rounded-2xl border border-white/10 bg-slate-900/70 space-y-3"
                      >
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: result?.success ? '#10b981' : isPending ? '#eab308' : '#ef4444' }}
                            />
                            <div>
                              <h4 className="text-sm font-bold text-white">{cat.title}</h4>
                              <p className="text-[11px] text-slate-400">{cat.subtitle}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {isPending ? (
                              <span className="text-xs text-yellow-400 font-semibold flex items-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Testing...
                              </span>
                            ) : result ? (
                              <span
                                className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                                  result.success
                                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                                    : 'bg-red-950/60 text-red-300 border-red-500/40'
                                }`}
                              >
                                {result.success ? 'Read Works (HTTP ' + result.httpStatus + ')' : 'Failed (HTTP ' + result.httpStatus + ')'}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-500">Not tested yet</span>
                            )}
                          </div>
                        </div>

                        {/* Details */}
                        {result && (
                          <div className="pt-2 border-t border-white/5 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Project Host:</span>
                              <span className="font-mono text-slate-200">{result.projectHost}</span>
                            </div>

                            <div className="flex items-center justify-between text-slate-400">
                              <span>App Version:</span>
                              <span className="font-mono text-slate-200">{result.appVersion}</span>
                            </div>

                            {result.errorMessage && (
                              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-200 text-xs mt-2">
                                <span className="font-semibold block">Error:</span>
                                <span>{result.errorMessage}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for Minimum Version Tab */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl border border-cyan-500/40 bg-slate-950 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Confirm Minimum Build</h3>
                  <p className="text-xs text-slate-400">Target build: {editingMinBuild}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 space-y-2 text-xs">
              <p className="text-amber-300 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Apps with a build below this number will be blocked until they update.</span>
              </p>
              <p className="text-slate-300">
                Are you sure you want to set the minimum required build to <strong className="text-white font-mono">{editingMinBuild}</strong>?
              </p>
              {editingNotes && (
                <div className="mt-2 pt-2 border-t border-white/5">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">Notes Bullets:</span>
                  <div className="text-[11px] text-slate-300 space-y-0.5">
                    {parseConfigNotes(editingNotes).map((b, i) => (
                      <div key={i} className="flex items-start gap-1.5">
                        <span className="text-cyan-400">•</span>
                        <span>{b}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSavingConfig}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmSaveMinBuild}
                disabled={isSavingConfig}
                className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingConfig ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Confirm & Save</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Preview of Required Update Screen */}
      {showRequiredUpdatePreview && (
        <RequiredUpdateOverlay
          versionName={editingMinBuild ? `Build ${editingMinBuild}` : 'Build 999'}
          customMessage={editingMessage || 'An update is required to continue using JTEC MUSIC.'}
          notesBullets={parseConfigNotes(editingNotes)}
          apkUrl={editingApkUrl}
          isPreview={true}
          onClosePreview={() => setShowRequiredUpdatePreview(false)}
        />
      )}
    </div>
  );
};
