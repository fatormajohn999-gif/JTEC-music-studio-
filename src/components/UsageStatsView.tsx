import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  ArrowLeft, RefreshCw, Shield, ShieldCheck, Lock, LogOut, 
  Users, Smartphone, Globe, AlertCircle, CheckCircle2, 
  Calendar, Clock, Sparkles, AlertTriangle, Layers, ChevronRight, X
} from 'lucide-react';
import { getJtecAdminClient, SupabaseService } from '../services/supabase';

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

interface UsageStatsViewProps {
  onBack: () => void;
}

export const UsageStatsView: React.FC<UsageStatsViewProps> = ({ onBack }) => {
  const [adminClient] = useState(() => getJtecAdminClient());
  const [session, setSession] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Sign in form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data state
  const [installs, setInstalls] = useState<AppInstallRow[]>([]);
  const [appConfig, setAppConfig] = useState<AppConfigRow | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Minimum build edit state
  const [editingMinBuild, setEditingMinBuild] = useState<string>('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Check initial session
  useEffect(() => {
    if (!adminClient) {
      setCheckingAuth(false);
      return;
    }

    adminClient.auth.getSession().then(({ data: { session: initialSession } }) => {
      setSession(initialSession);
      setCheckingAuth(false);
    }).catch(() => {
      setCheckingAuth(false);
    });

    const { data: authListener } = adminClient.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [adminClient]);

  // Handle Admin Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminClient) {
      setAuthError('Supabase client for JTEC Main is not configured. Check build environment variables.');
      return;
    }
    if (!email.trim() || !password) {
      setAuthError('Please enter both email and password.');
      return;
    }

    setIsSigningIn(true);
    setAuthError(null);

    try {
      const { data, error } = await adminClient.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setAuthError(error.message || 'Authentication failed. Please verify your admin credentials.');
      } else if (data.session) {
        setSession(data.session);
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Failed to sign in. Please check your internet connection.');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    if (!adminClient) return;
    try {
      await adminClient.auth.signOut();
      setSession(null);
      setInstalls([]);
      setAppConfig(null);
    } catch (err) {
      console.warn('Sign out error:', err);
    }
  };

  // Fetch Usage Stats and App Config
  const loadStatsAndConfig = useCallback(async () => {
    if (!adminClient || !session) return;

    setIsLoadingData(true);
    setDataError(null);
    setSaveSuccessMsg(null);
    setSaveErrorMsg(null);

    try {
      // 1. Fetch app_installs
      const { data: installsData, error: installsError } = await adminClient
        .from('app_installs')
        .select('install_id, first_seen, last_seen, app_version, build, platform, opens')
        .order('last_seen', { ascending: false });

      if (installsError) {
        throw new Error(`Failed to load app_installs: ${installsError.message}`);
      }

      setInstalls((installsData as AppInstallRow[]) || []);

      // 2. Fetch app_config for min_build
      const { data: configData, error: configError } = await adminClient
        .from('app_config')
        .select('id, min_build, message')
        .eq('id', 1)
        .maybeSingle();

      if (!configError && configData) {
        setAppConfig(configData as AppConfigRow);
        setEditingMinBuild(String(configData.min_build ?? ''));
      }
    } catch (err: any) {
      setDataError(err?.message || 'Error loading usage statistics. Verify admin permissions.');
    } finally {
      setIsLoadingData(false);
    }
  }, [adminClient, session]);

  // Load data whenever session becomes available
  useEffect(() => {
    if (session) {
      loadStatsAndConfig();
    }
  }, [session, loadStatsAndConfig]);

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
        .update({ min_build: newBuildNum })
        .eq('id', 1);

      if (error) {
        throw new Error(error.message);
      }

      setAppConfig((prev) => (prev ? { ...prev, min_build: newBuildNum } : { id: 1, min_build: newBuildNum }));
      setSaveSuccessMsg(`Minimum build updated to ${newBuildNum} successfully.`);
      setShowConfirmModal(false);
    } catch (err: any) {
      setSaveErrorMsg(`Failed to update minimum build: ${err?.message || 'Unknown error'}`);
      setShowConfirmModal(false);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Computations
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

  // Loading spinner during auth initialization
  if (checkingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[340px] p-8 text-center space-y-4">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-sm font-semibold text-slate-300">Checking admin session...</p>
      </div>
    );
  }

  // Not signed in: Show Admin Sign-In Screen
  if (!session) {
    return (
      <div className="max-w-md mx-auto space-y-6 pt-4 pb-12">
        {/* Back navigation */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer border border-white/10"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Catalogs</span>
          </button>
        </div>

        {/* Sign In Card */}
        <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-slate-900/90 via-slate-950/95 to-slate-950 p-7 sm:p-8 shadow-2xl shadow-cyan-950/30 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center shadow-lg shadow-cyan-500/10">
                <ShieldCheck className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white tracking-wide">
                  JTEC Cloud Admin
                </h2>
                <p className="text-xs text-slate-400 font-medium">
                  Usage Stats & App Configuration
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Sign in with your JTEC Supabase admin credentials to access live usage metrics, version adoption, and minimum build controls.
            </p>

            {authError && (
              <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Admin Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@jtecmusic.com"
                  autoComplete="email"
                  required
                  className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-white/10 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-white placeholder-slate-500 text-sm transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-white/10 focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/20 text-white placeholder-slate-500 text-sm transition"
                />
              </div>

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-cyan-500/20 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50"
              >
                {isSigningIn ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-slate-950" />
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-slate-950" />
                    <span>Sign In to Admin Dashboard</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-white/5 flex items-center justify-center gap-2 text-[11px] text-slate-400">
              <Shield className="w-3.5 h-3.5 text-cyan-400" />
              <span>Uses authenticated admin session • No service_role key</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Signed In: Show Usage Stats Screen
  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            className="px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer border border-white/10"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Catalogs</span>
          </button>

          <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/40 text-cyan-300">
            JTEC Main Source
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-white/10 text-xs text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="font-medium truncate max-w-[170px]" title={session.user?.email || 'Admin'}>
              {session.user?.email || 'Admin'}
            </span>
          </div>

          <button
            type="button"
            onClick={loadStatsAndConfig}
            disabled={isLoadingData}
            className="px-3.5 py-2 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-white/10 disabled:opacity-50"
            title="Refresh statistics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="px-3 py-2 rounded-xl bg-red-950/40 hover:bg-red-900/60 text-red-300 hover:text-red-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-red-500/30"
            title="Sign out of admin session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Screen Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-black text-white tracking-wide flex items-center gap-2.5">
          <span>Usage Statistics</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1 font-medium">
          Real-time install telemetry, user activity windows, and version distribution from <code className="text-cyan-300 font-mono">app_installs</code>.
        </p>
      </div>

      {dataError && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 flex items-start gap-3 text-xs text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">{dataError}</p>
            <p className="text-slate-400">Ensure the authenticated admin user has SELECT permissions on table app_installs.</p>
          </div>
        </div>
      )}

      {/* Primary Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Total Installs */}
        <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/70 p-5 shadow-xl shadow-cyan-950/10 flex flex-col justify-between min-h-[130px] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>TOTAL INSTALLS</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="my-2">
            <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              {totalInstalls.toLocaleString()}
            </span>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Unique install IDs recorded
          </p>
        </div>

        {/* Metric 2: Active in Last 24 Hours */}
        <div className="rounded-3xl border border-emerald-500/30 bg-slate-900/70 p-5 shadow-xl shadow-emerald-950/10 flex flex-col justify-between min-h-[130px] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>ACTIVE (24 HOURS)</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight">
              {active24h.toLocaleString()}
            </span>
            {totalInstalls > 0 && (
              <span className="text-xs font-bold text-emerald-400/80">
                ({((active24h / totalInstalls) * 100).toFixed(0)}%)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Active within the past 24h
          </p>
        </div>

        {/* Metric 3: Active in Last 7 & 30 Days */}
        <div className="rounded-3xl border border-purple-500/30 bg-slate-900/70 p-5 shadow-xl shadow-purple-950/10 flex flex-col justify-between min-h-[130px] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>ACTIVE WINDOWS</span>
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          <div className="my-2 grid grid-cols-2 gap-2">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">7 Days</p>
              <p className="text-2xl font-black text-purple-300">{active7d.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-400">30 Days</p>
              <p className="text-2xl font-black text-slate-200">{active30d.toLocaleString()}</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            Weekly and monthly active users
          </p>
        </div>

        {/* Metric 4: New Installs (7 Days) */}
        <div className="rounded-3xl border border-amber-500/30 bg-slate-900/70 p-5 shadow-xl shadow-amber-950/10 flex flex-col justify-between min-h-[130px] relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-center justify-between text-xs font-bold text-slate-400">
            <span>NEW INSTALLS (7D)</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="my-2 flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight">
              {new7d.toLocaleString()}
            </span>
            {totalInstalls > 0 && (
              <span className="text-xs font-bold text-amber-400/80">
                ({((new7d / totalInstalls) * 100).toFixed(0)}%)
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400 font-medium">
            First seen in the past 7 days
          </p>
        </div>
      </div>

      {/* Middle Grid: Minimum Build Box & Platform Split */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Minimum Build Box */}
        <div className="rounded-3xl border border-cyan-500/40 bg-gradient-to-b from-slate-900/90 to-slate-950 p-6 shadow-xl relative overflow-hidden flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-cyan-400" />
                </div>
                <h2 className="text-base font-bold text-white tracking-wide">
                  Minimum Build Control
                </h2>
              </div>

              <span className="text-[11px] font-mono px-2.5 py-1 rounded-full bg-slate-800 text-cyan-300 border border-white/10">
                table: app_config (id = 1)
              </span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              Configure the minimum required build threshold. Devices running a build number below this value are prompted with a mandatory update screen.
            </p>

            {/* Note requirement */}
            <div className="p-3.5 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center gap-2.5 text-xs text-cyan-200">
              <AlertTriangle className="w-4 h-4 text-cyan-400 shrink-0" />
              <span className="font-semibold">Apps below this build must update.</span>
            </div>

            {saveSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{saveSuccessMsg}</span>
              </div>
            )}

            {saveErrorMsg && (
              <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 flex items-center gap-2 text-xs text-red-200">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{saveErrorMsg}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/10 space-y-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Current Min Build
                </span>
                <p className="text-2xl font-black text-cyan-400 font-mono">
                  {appConfig?.min_build ?? 'Not set'}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-white/10 space-y-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  New Target Build
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={editingMinBuild}
                    onChange={(e) => setEditingMinBuild(e.target.value)}
                    placeholder="e.g. 101"
                    className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-white/20 text-white font-mono text-base focus:border-cyan-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-5 mt-4 border-t border-white/10 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Requires confirmation modal
            </span>

            <button
              type="button"
              onClick={() => setShowConfirmModal(true)}
              disabled={isSavingConfig || !editingMinBuild || String(appConfig?.min_build) === editingMinBuild}
              className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Update Minimum Build</span>
            </button>
          </div>
        </div>

        {/* Platform Breakdown Box */}
        <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/70 p-6 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-950/60 border border-purple-500/40 flex items-center justify-center">
                  <Smartphone className="w-4 h-4 text-purple-400" />
                </div>
                <h2 className="text-base font-bold text-white tracking-wide">
                  Platform Split
                </h2>
              </div>

              <span className="text-xs font-semibold text-slate-400">
                {totalInstalls} total
              </span>
            </div>

            <p className="text-xs text-slate-300 font-medium">
              Device operating systems and clients reporting install pings.
            </p>

            <div className="space-y-3 pt-2">
              {platformStats.map((item) => (
                <div key={item.platform} className="p-3.5 rounded-2xl bg-slate-950/50 border border-white/5 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {item.platform === 'android' ? (
                        <Smartphone className="w-4 h-4 text-emerald-400" />
                      ) : item.platform === 'ios' ? (
                        <Smartphone className="w-4 h-4 text-purple-400" />
                      ) : (
                        <Globe className="w-4 h-4 text-cyan-400" />
                      )}
                      <span className="font-bold text-white">{item.label}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-300 font-semibold">{item.count.toLocaleString()}</span>
                      <span className="text-[11px] font-bold text-cyan-400 px-2 py-0.5 rounded-full bg-cyan-950/60 border border-cyan-500/30">
                        {item.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
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

          <div className="pt-4 border-t border-white/5 text-[11px] text-slate-400 text-center">
            Reported anonymously via the Supabase <code className="text-slate-300">ping_install</code> RPC.
          </div>
        </div>
      </div>

      {/* Version Distribution List (Newest First) */}
      <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/70 p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center">
              <Layers className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Version Adoption
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                Installs grouped by app version, ordered newest first with percentage share
              </p>
            </div>
          </div>

          <span className="text-xs font-semibold text-slate-300 bg-slate-800/80 px-3 py-1 rounded-full border border-white/10 self-start sm:self-auto">
            {versionStats.length} version{versionStats.length === 1 ? '' : 's'} recorded
          </span>
        </div>

        {versionStats.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-950/40 border border-white/5 space-y-2">
            <Layers className="w-6 h-6 text-slate-500 mx-auto" />
            <p className="text-xs text-slate-400 font-medium">No version install records found yet in table <code className="text-cyan-400">app_installs</code>.</p>
          </div>
        ) : (
          <div className="space-y-2.5 pt-2">
            {versionStats.map((v, index) => {
              const isNewest = index === 0;
              const isBelowMin = appConfig?.min_build && v.maxBuild > 0 ? v.maxBuild < appConfig.min_build : false;

              return (
                <div
                  key={v.version}
                  className={`p-4 rounded-2xl border transition-all ${
                    isNewest
                      ? 'bg-cyan-950/30 border-cyan-500/40 shadow-lg shadow-cyan-950/20'
                      : 'bg-slate-950/50 border-white/5 hover:border-white/10'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-lg bg-slate-900 border border-white/10 flex items-center justify-center text-xs font-black text-slate-300 font-mono">
                        #{index + 1}
                      </div>

                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-white font-mono">
                            {v.version}
                          </span>

                          {v.maxBuild > 0 && (
                            <span className="text-[11px] font-mono text-slate-400">
                              (Build {v.maxBuild})
                            </span>
                          )}

                          {isNewest && (
                            <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-400 text-cyan-300">
                              Latest Version
                            </span>
                          )}

                          {isBelowMin && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-950/60 border border-red-500/40 text-red-300">
                              Below Minimum
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-end sm:self-auto">
                      <div className="text-right">
                        <span className="text-sm font-black text-white font-mono">
                          {v.count.toLocaleString()}
                        </span>
                        <span className="text-xs text-slate-400 ml-1">installs</span>
                      </div>

                      <span className="text-xs font-bold text-cyan-300 px-2.5 py-1 rounded-xl bg-slate-900 border border-cyan-500/30 min-w-[56px] text-center">
                        {v.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 rounded-full bg-slate-800/80 overflow-hidden mt-3">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isNewest ? 'bg-gradient-to-r from-cyan-400 to-blue-500' : 'bg-slate-500'
                      }`}
                      style={{ width: `${Math.max(v.percentage, 1)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal for Minimum Build Update */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl border border-cyan-500/40 bg-slate-950 p-6 sm:p-7 shadow-2xl shadow-cyan-950/50 space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Confirm Minimum Build Update
                  </h3>
                  <p className="text-xs text-slate-400">
                    Changes take effect across all app clients
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-white/10 space-y-2 text-xs">
              <p className="text-slate-200 leading-relaxed">
                Are you sure you want to change the minimum required build to <strong className="text-cyan-400 font-mono text-sm">{editingMinBuild}</strong>?
              </p>
              <p className="text-amber-300 font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>Apps below this build must update.</span>
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSavingConfig}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmSaveMinBuild}
                disabled={isSavingConfig}
                className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingConfig ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-950" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-950" />
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
