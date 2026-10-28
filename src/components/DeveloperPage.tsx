import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, RefreshCw, Shield, ShieldCheck, Lock, 
  Users, Smartphone, Globe, AlertCircle, CheckCircle2, 
  Calendar, Clock, Sparkles, AlertTriangle, Layers, 
  Wifi, Server, Terminal, ArrowRight
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

export interface AppInstallRow {
  install_id: string;
  first_seen: string | null;
  last_seen: string | null;
  app_version: string | null;
  build: number | null;
  platform: string | null;
  opens: number | null;
}

export interface AppConfigRow {
  id: number;
  min_build: number;
  message?: string;
}

interface DeveloperPageProps {
  isOpen: boolean;
  onClose: () => void;
}

type DeveloperTab = 'usage' | 'min_version' | 'connection';

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

  // Minimum version tab data
  const [appConfig, setAppConfig] = useState<AppConfigRow | null>(null);
  const [editingMinBuild, setEditingMinBuild] = useState<string>('');
  const [editingMessage, setEditingMessage] = useState<string>('');
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Connection test tab data
  const [connectionResults, setConnectionResults] = useState<SourceDiagnosticResult[]>([]);
  const [isRunningConnectionTest, setIsRunningConnectionTest] = useState(false);

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
    }).catch(() => {
      // ignore
    });
  }, []);

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
        .select('install_id, first_seen, last_seen, app_version, build, platform, opens')
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
        .select('id, min_build, message')
        .eq('id', 1)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      if (data) {
        setAppConfig(data as AppConfigRow);
        setEditingMinBuild(String(data.min_build ?? ''));
        setEditingMessage(data.message || '');
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

  // Save updated min_build
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
        })
        .eq('id', 1);

      if (error) {
        throw new Error(error.message);
      }

      setAppConfig({
        id: 1,
        min_build: newBuildNum,
        message: editingMessage.trim() || 'An update is required to continue using JTEC MUSIC.',
      });
      setSaveSuccessMsg(`Minimum build updated to ${newBuildNum} successfully.`);
      setShowConfirmModal(false);
    } catch (err: any) {
      setSaveErrorMsg(err?.message || 'Failed to update minimum build.');
      setShowConfirmModal(false);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Computations for Usage Tab
  const totalInstalls = installs.length;

  const { active24h, active7d, active30d, new7d } = useMemo(() => {
    const now = Date.now();
    const ms24h = 24 * 60 * 60 * 1000;
    const ms7d = 7 * 24 * 60 * 60 * 1000;
    const ms30d = 30 * 24 * 60 * 60 * 1000;

    let a24 = 0;
    let a7 = 0;
    let a30 = 0;
    let n7 = 0;

    for (const item of installs) {
      if (item.last_seen) {
        const lastTime = new Date(item.last_seen).getTime();
        if (!isNaN(lastTime)) {
          const diff = now - lastTime;
          if (diff <= ms24h) a24++;
          if (diff <= ms7d) a7++;
          if (diff <= ms30d) a30++;
        }
      }
      if (item.first_seen) {
        const firstTime = new Date(item.first_seen).getTime();
        if (!isNaN(firstTime)) {
          if (now - firstTime <= ms7d) n7++;
        }
      }
    }

    return { active24h: a24, active7d: a7, active30d: a30, new7d: n7 };
  }, [installs]);

  // Version breakdown (newest first, count, percentage)
  const versionStats = useMemo(() => {
    const map = new Map<string, { count: number; maxBuild: number }>();

    for (const item of installs) {
      const v = (item.app_version || 'Unknown').trim();
      const b = Number(item.build) || 0;
      const existing = map.get(v);
      if (existing) {
        existing.count += 1;
        if (b > existing.maxBuild) existing.maxBuild = b;
      } else {
        map.set(v, { count: 1, maxBuild: b });
      }
    }

    const list = Array.from(map.entries()).map(([version, data]) => ({
      version,
      maxBuild: data.maxBuild,
      count: data.count,
      percentage: totalInstalls > 0 ? (data.count / totalInstalls) * 100 : 0,
    }));

    // Sort newest first by maxBuild descending, then by version string descending
    list.sort((a, b) => {
      if (b.maxBuild !== a.maxBuild) return b.maxBuild - a.maxBuild;
      return b.version.localeCompare(a.version, undefined, { numeric: true, sensitivity: 'base' });
    });

    return list;
  }, [installs, totalInstalls]);

  // Platform breakdown
  const platformStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of installs) {
      const p = (item.platform || 'web').toLowerCase().trim();
      map.set(p, (map.get(p) || 0) + 1);
    }

    const primaryPlatforms = ['android', 'web', 'ios'];
    for (const key of map.keys()) {
      if (!primaryPlatforms.includes(key)) primaryPlatforms.push(key);
    }

    return primaryPlatforms.map((p) => {
      const count = map.get(p) || 0;
      let label = 'Web';
      if (p === 'android') label = 'Android';
      else if (p === 'ios') label = 'iOS';
      else label = p.toUpperCase();

      return {
        platform: p,
        label,
        count,
        percentage: totalInstalls > 0 ? (count / totalInstalls) * 100 : 0,
      };
    });
  }, [installs, totalInstalls]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#070b18] text-white flex flex-col overflow-hidden animate-fadeIn">
      {/* Top Bar Header */}
      <div className="px-4 py-3.5 border-b border-white/10 bg-slate-950/90 backdrop-blur-md flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-950/80 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white tracking-wide">Developer</h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                v{appVersionInfo.version} (Build {appVersionInfo.build})
              </span>
            </div>
            <p className="text-[10px] text-slate-400">Hidden developer administration console</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-white/10"
        >
          <X className="w-4 h-4" />
          <span>Close</span>
        </button>
      </div>

      {/* Screen Body */}
      {!session ? (
        /* Sign-In View */
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-6 sm:p-7 shadow-2xl shadow-cyan-950/30 space-y-5 relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-cyan-950/70 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-md">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-wide">Admin Sign-In</h3>
                <p className="text-xs text-slate-400">JTEC Main Supabase source</p>
              </div>
            </div>

            {/* Error strictly "Access denied" per requirement */}
            {accessDenied && (
              <div className="p-3 rounded-2xl bg-red-950/50 border border-red-500/40 flex items-center gap-2 text-xs text-red-200 font-semibold animate-shake">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>Access denied</span>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@jtecmusic.com"
                  autoComplete="off"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 focus:border-cyan-400 focus:outline-none text-white placeholder-slate-500 text-xs transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="off"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/10 focus:border-cyan-400 focus:outline-none text-white placeholder-slate-500 text-xs transition"
                />
              </div>

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 mt-2"
              >
                {isSigningIn ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-950" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-white/5 text-[10px] text-slate-400 text-center">
              Uses normal Supabase Auth with anon key. Never uses a service_role key.
            </div>
          </div>
        </div>
      ) : (
        /* Authenticated Developer Dashboard with 3 Tabs */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs bar */}
          <div className="px-4 border-b border-white/10 bg-slate-900/60 flex items-center justify-between gap-2 overflow-x-auto shrink-0">
            <div className="flex items-center gap-1 py-2">
              <button
                type="button"
                onClick={() => setActiveTab('usage')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  activeTab === 'usage'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>Usage</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('min_version')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  activeTab === 'min_version'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Minimum version</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('connection')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                  activeTab === 'connection'
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>Connection test</span>
              </button>
            </div>

            <div className="flex items-center gap-2 py-2">
              <span className="text-[11px] text-slate-400 truncate max-w-[140px] hidden sm:inline" title={session.user?.email || 'Admin'}>
                {session.user?.email}
              </span>
            </div>
          </div>

          {/* Scrollable Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
            {/* =========================================================================
                TAB A: USAGE
               ========================================================================= */}
            {activeTab === 'usage' && (
              <div className="space-y-5 max-w-5xl mx-auto">
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
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

                {saveErrorMsg && (
                  <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-center gap-2 text-xs text-red-200">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span>{saveErrorMsg}</span>
                  </div>
                )}

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

                    {/* Warning requirement */}
                    <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-start gap-2.5 text-xs text-amber-200">
                      <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <span>Apps with a build below this number will be blocked until they update.</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowConfirmModal(true)}
                      disabled={isSavingConfig || !editingMinBuild}
                      className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Save Minimum Version</span>
                    </button>
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
    </div>
  );
};
