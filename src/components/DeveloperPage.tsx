import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  X, RefreshCw, Shield, ShieldCheck, Lock, 
  Users, Smartphone, Globe, AlertCircle, CheckCircle2, 
  Clock, Sparkles, AlertTriangle, Layers, 
  Wifi, Terminal, Search, ArrowUpDown, Edit2, Check, Eye,
  Ban, Unlock, HelpCircle, ChevronRight
} from 'lucide-react';
import { 
  getJtecAdminClient, 
  SupabaseService, 
  CLOUD_CATEGORIES, 
  SourceDiagnosticResult 
} from '../services/supabase';
import { Device, DeviceInfo } from '@capacitor/device';
import { getCurrentAppVersion, NativeUpdateService } from '../services/nativeUpdate';
import { registerBackHandler } from '../services/navigation';
import { BUILD_DATE } from '../version';
import { RequiredUpdateOverlay } from './RequiredUpdateOverlay';
import { 
  parseConfigNotes, 
  getMinVersionDiagnosticInfo, 
  checkMinimumVersion,
  cleanManufacturerAndModel,
  resolveDeviceDisplayName,
  getLastPingDiagnosticInfo,
  PingDiagnosticInfo
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
  device_model?: string | null;
  model?: string | null;
  manufacturer?: string | null;
  owner_label?: string | null;
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
  const [latestVersionName, setLatestVersionName] = useState<string>('');

  // Usage tab data
  const [installs, setInstalls] = useState<AppInstallRow[]>([]);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [usageError, setUsageError] = useState<string | null>(null);

  // Search and filter states
  const [deviceSearch, setDeviceSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'android' | 'web'>('all');
  const [versionFilter, setVersionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'allowed' | 'blocked'>('all');
  const [lastSeenSortDesc, setLastSeenSortDesc] = useState<boolean>(true);

  // Exact timestamp tap display state
  const [expandedTimeDeviceId, setExpandedTimeDeviceId] = useState<string | null>(null);

  // Owner label inline edit state
  const [editingOwnerLabelId, setEditingOwnerLabelId] = useState<string | null>(null);
  const [editingOwnerLabelInput, setEditingOwnerLabelInput] = useState<string>('');
  const [isSavingOwnerLabel, setIsSavingOwnerLabel] = useState(false);
  const [ownerLabelError, setOwnerLabelError] = useState<string | null>(null);

  // Minimum version tab data
  const [appConfig, setAppConfig] = useState<AppConfigRow | null>(null);
  const [editingManualBuild, setEditingManualBuild] = useState<string>('');
  const [editingMessage, setEditingMessage] = useState<string>('');
  const [editingNotes, setEditingNotes] = useState<string>('');
  const [editingApkUrl, setEditingApkUrl] = useState<string>('');
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isSavingManualBuild, setIsSavingManualBuild] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);

  // Block version modal states
  const [blockConfirmTarget, setBlockConfirmTarget] = useState<{ build: number; version: string } | null>(null);
  const [isBlockingVersion, setIsBlockingVersion] = useState(false);
  const [blockActionMessage, setBlockActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Unblock all modal states
  const [showUnblockAllConfirm, setShowUnblockAllConfirm] = useState(false);
  const [isUnblockingAll, setIsUnblockingAll] = useState(false);

  // Required update preview modal
  const [showRequiredUpdatePreview, setShowRequiredUpdatePreview] = useState(false);

  // Connection test tab data
  const [connectionResults, setConnectionResults] = useState<SourceDiagnosticResult[]>([]);
  const [isRunningConnectionTest, setIsRunningConnectionTest] = useState(false);

  // Diagnostics
  const [minVersionDiag, setMinVersionDiag] = useState(() => getMinVersionDiagnosticInfo());
  const [updateDiag, setUpdateDiag] = useState(() => NativeUpdateService.getUpdateDiagnosticInfo());
  const [isCheckingNow, setIsCheckingNow] = useState(false);

  // What this phone reports (Device.getInfo raw values & last ping info)
  const [rawDeviceInfo, setRawDeviceInfo] = useState<DeviceInfo | null>(null);
  const [lastPingDiag, setLastPingDiag] = useState<PingDiagnosticInfo>(() => getLastPingDiagnosticInfo());

  const loadPhoneReports = useCallback(async () => {
    try {
      const info = await Device.getInfo();
      setRawDeviceInfo(info);
    } catch (err) {
      console.warn('Could not read Device.getInfo():', err);
    }
    setLastPingDiag(getLastPingDiagnosticInfo());
  }, []);

  const refreshDiagnostics = useCallback(() => {
    setMinVersionDiag(getMinVersionDiagnosticInfo());
    setUpdateDiag(NativeUpdateService.getUpdateDiagnosticInfo());
    loadPhoneReports();
  }, [loadPhoneReports]);

  const renderRawValue = useCallback((val?: string | null) => {
    if (val === undefined || val === null || String(val).trim() === '') {
      return <span className="text-slate-500 italic">empty</span>;
    }
    return String(val);
  }, []);

  const formatTimestamp = useCallback((ts: number | null): string => {
    if (!ts) return 'Never';
    const diffSec = Math.floor((Date.now() - ts) / 1000);
    if (diffSec < 60) return `${diffSec}s ago (${new Date(ts).toLocaleTimeString()})`;
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago (${new Date(ts).toLocaleTimeString()})`;
    return new Date(ts).toLocaleString();
  }, []);

  // Fetch installed version & latest published release data
  const loadLatestReleaseData = useCallback(async () => {
    try {
      const appInfo = await getCurrentAppVersion();
      setAppVersionInfo({ version: appInfo.version, build: appInfo.build });

      const updateInfo = await NativeUpdateService.checkForUpdate(true);
      if (updateInfo) {
        if (updateInfo.latestBuild) {
          setLatestBuild(updateInfo.latestBuild);
        }
        if (updateInfo.versionName) {
          setLatestVersionName(updateInfo.versionName);
        }
      }
    } catch {
      const diag = NativeUpdateService.getUpdateDiagnosticInfo();
      if (diag.lastFoundBuild) {
        setLatestBuild(diag.lastFoundBuild);
      }
    }
  }, []);

  useEffect(() => {
    loadLatestReleaseData();
    loadPhoneReports();
  }, [loadLatestReleaseData, loadPhoneReports]);

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

      setPassword('');

      if (error || !data.session) {
        setAccessDenied(true);
        return;
      }

      // Verify permission to query app_config
      const { error: testReadError } = await adminClient
        .from('app_config')
        .select('id')
        .limit(1);

      if (testReadError && testReadError.code === '42501') {
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

  // Load real usage data from app_installs
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

  // Load real app_config (id = 1)
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
        setEditingManualBuild(String(data.min_build ?? '0'));
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
      loadUsageData();
      loadMinVersionConfig();
      if (activeTab === 'connection') {
        runConnectionTests();
      }
    }
  }, [session, activeTab, loadUsageData, loadMinVersionConfig, runConnectionTests]);

  // Automatic refresh every 30 seconds while the page is open
  useEffect(() => {
    if (!isOpen || !session) return;
    const interval = setInterval(() => {
      loadUsageData();
      loadMinVersionConfig();
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen, session, loadUsageData, loadMinVersionConfig]);

  // Helper to calculate status badge data
  const getDeviceStatus = useCallback((lastSeenStr: string | null) => {
    if (!lastSeenStr) {
      return { isOnline: false, label: 'Never seen', exactTime: 'Never seen' };
    }
    const ts = new Date(lastSeenStr).getTime();
    if (isNaN(ts)) {
      return { isOnline: false, label: 'Unknown', exactTime: 'Unknown' };
    }
    const diffMs = Date.now() - ts;
    const isOnline = diffMs <= 10 * 60 * 1000; // 10 minutes
    const exactTime = new Date(ts).toLocaleString();

    if (isOnline) {
      return { isOnline: true, label: 'Online now', exactTime };
    }

    const diffMin = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHours / 24);

    let label = '';
    if (diffMin < 60) {
      label = `Last seen ${diffMin}m ago`;
    } else if (diffHours < 24) {
      label = `Last seen ${diffHours}h ago`;
    } else {
      label = `Last seen ${diffDays}d ago`;
    }

    return { isOnline: false, label, exactTime };
  }, []);

  // Save Owner Label with row-change verification and error reporting
  const handleSaveOwnerLabel = async (installId: string) => {
    if (!adminClient || !session) return;
    setIsSavingOwnerLabel(true);
    setOwnerLabelError(null);
    const cleanLabel = editingOwnerLabelInput.trim().slice(0, 60);

    try {
      const { data, error } = await adminClient
        .from('app_installs')
        .update({ owner_label: cleanLabel || null })
        .eq('install_id', installId)
        .select();

      if (error) {
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        throw new Error('Update did not change any row. Check permissions or ID.');
      }

      setInstalls((prev) =>
        prev.map((item) =>
          item.install_id === installId
            ? { ...item, owner_label: cleanLabel || null }
            : item
        )
      );
      setEditingOwnerLabelId(null);
      setEditingOwnerLabelInput('');
    } catch (err: any) {
      setOwnerLabelError(`Failed to update owner label: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSavingOwnerLabel(false);
    }
  };

  // Block version and older logic: sets min_build to targetBuild + 1, verifies row change and reads value back
  const handleConfirmBlockVersion = async () => {
    if (!adminClient || !session || !blockConfirmTarget) return;
    const targetRowBuild = blockConfirmTarget.build;
    const targetMinBuild = targetRowBuild + 1;

    // Safety rule: never allow min_build to be higher than latest published build
    if (targetMinBuild > latestBuild) {
      setBlockActionMessage({
        type: 'error',
        text: `Cannot block: target minimum build (${targetMinBuild}) would be higher than the latest published build (${latestBuild}).`,
      });
      return;
    }

    setIsBlockingVersion(true);
    setBlockActionMessage(null);

    try {
      // 1. Update app_config (id = 1)
      const { data, error } = await adminClient
        .from('app_config')
        .update({ min_build: targetMinBuild })
        .eq('id', 1)
        .select();

      if (error) {
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        throw new Error('Update failed: no row was modified in app_config.');
      }

      // 2. READ THE VALUE BACK from the database to verify
      const { data: readBack, error: readError } = await adminClient
        .from('app_config')
        .select('id, min_build, message, notes, apk_url')
        .eq('id', 1)
        .single();

      if (readError || !readBack) {
        throw new Error(readError?.message || 'Could not verify update from database.');
      }

      if (readBack.min_build !== targetMinBuild) {
        throw new Error(`Verification mismatch: database returned min_build = ${readBack.min_build}, expected ${targetMinBuild}.`);
      }

      // 3. Update local state and show success message
      setAppConfig(readBack as AppConfigRow);
      setEditingManualBuild(String(readBack.min_build));
      setBlockActionMessage({
        type: 'success',
        text: `Saved: builds up to ${targetRowBuild} are blocked.`,
      });
      setBlockConfirmTarget(null);
      refreshDiagnostics();
    } catch (err: any) {
      setBlockActionMessage({
        type: 'error',
        text: `Error updating minimum build: ${err?.message || 'Unknown error'}`,
      });
    } finally {
      setIsBlockingVersion(false);
    }
  };

  // Unblock all versions logic: sets min_build to 0, verifies row change and reads value back
  const handleConfirmUnblockAll = async () => {
    if (!adminClient || !session) return;
    setIsUnblockingAll(true);
    setBlockActionMessage(null);

    try {
      const { data, error } = await adminClient
        .from('app_config')
        .update({ min_build: 0 })
        .eq('id', 1)
        .select();

      if (error) {
        throw new Error(error.message);
      }

      if (!data || data.length === 0) {
        throw new Error('Update failed: no row was modified in app_config.');
      }

      const { data: readBack, error: readError } = await adminClient
        .from('app_config')
        .select('id, min_build, message, notes, apk_url')
        .eq('id', 1)
        .single();

      if (readError || !readBack) {
        throw new Error(readError?.message || 'Could not verify update from database.');
      }

      if (readBack.min_build !== 0) {
        throw new Error(`Verification mismatch: database min_build is ${readBack.min_build}, expected 0.`);
      }

      setAppConfig(readBack as AppConfigRow);
      setEditingManualBuild('0');
      setBlockActionMessage({
        type: 'success',
        text: 'Saved: all builds are unblocked (min_build = 0).',
      });
      setShowUnblockAllConfirm(false);
      refreshDiagnostics();
    } catch (err: any) {
      setBlockActionMessage({
        type: 'error',
        text: `Error unblocking builds: ${err?.message || 'Unknown error'}`,
      });
    } finally {
      setIsUnblockingAll(false);
    }
  };

  // Save manual build number directly with safety checks and read-back
  const handleSaveManualBuild = async () => {
    if (!adminClient || !session) return;
    const parsedBuild = parseInt(editingManualBuild.trim(), 10);
    if (isNaN(parsedBuild) || parsedBuild < 0) {
      setSaveErrorMsg('Please enter a valid non-negative build number.');
      return;
    }

    if (parsedBuild > latestBuild) {
      setSaveErrorMsg(`Cannot set min_build (${parsedBuild}) higher than latest published build (${latestBuild}).`);
      return;
    }

    setIsSavingManualBuild(true);
    setSaveErrorMsg(null);
    setSaveSuccessMsg(null);

    try {
      const { data, error } = await adminClient
        .from('app_config')
        .update({ min_build: parsedBuild })
        .eq('id', 1)
        .select();

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error('Update failed: no row was modified.');

      const { data: readBack, error: readError } = await adminClient
        .from('app_config')
        .select('id, min_build, message, notes, apk_url')
        .eq('id', 1)
        .single();

      if (readError || !readBack) throw new Error(readError?.message || 'Failed to read back config.');
      if (readBack.min_build !== parsedBuild) {
        throw new Error(`Verification mismatch: database has min_build = ${readBack.min_build}, expected ${parsedBuild}.`);
      }

      setAppConfig(readBack as AppConfigRow);
      setSaveSuccessMsg(`Saved: minimum build updated to ${parsedBuild}.`);
      refreshDiagnostics();
    } catch (err: any) {
      setSaveErrorMsg(err?.message || 'Failed to update minimum build.');
    } finally {
      setIsSavingManualBuild(false);
    }
  };

  // Save Message, Notes, and APK URL in Minimum Version tab
  const handleSaveConfigText = async () => {
    if (!adminClient || !session) return;
    setIsSavingConfig(true);
    setSaveErrorMsg(null);
    setSaveSuccessMsg(null);

    try {
      const { data, error } = await adminClient
        .from('app_config')
        .update({
          message: editingMessage.trim() || 'An update is required to continue using JTEC MUSIC.',
          notes: editingNotes.trim() || null,
          apk_url: editingApkUrl.trim() || null,
        })
        .eq('id', 1)
        .select();

      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error('Update failed: no row was modified in app_config.');

      const { data: readBack, error: readError } = await adminClient
        .from('app_config')
        .select('id, min_build, message, notes, apk_url')
        .eq('id', 1)
        .single();

      if (readError || !readBack) throw new Error(readError?.message || 'Failed to read back from database.');

      setAppConfig(readBack as AppConfigRow);
      setSaveSuccessMsg('Configuration text and release notes saved successfully.');
    } catch (err: any) {
      setSaveErrorMsg(err?.message || 'Failed to save configuration.');
    } finally {
      setIsSavingConfig(false);
    }
  };

  // Computed totals for top of Usage Telemetry tab
  const totalInstalls = installs.length;
  const currentMinBuild = appConfig?.min_build ?? 0;

  const {
    onlineNowCount,
    active24hCount,
    active7dCount,
    androidAppCount,
    webAppCount,
    blockedCount,
    allowedCount,
  } = useMemo(() => {
    const now = Date.now();
    const tenMinMs = 10 * 60 * 1000;
    const ms24h = 24 * 60 * 60 * 1000;
    const ms7d = 7 * 24 * 60 * 60 * 1000;

    let online = 0;
    let a24 = 0;
    let a7 = 0;
    let android = 0;
    let web = 0;
    let blocked = 0;
    let allowed = 0;

    installs.forEach((item) => {
      const lastSeenMs = item.last_seen ? new Date(item.last_seen).getTime() : 0;
      if (lastSeenMs > 0) {
        const diff = now - lastSeenMs;
        if (diff <= tenMinMs) online += 1;
        if (diff <= ms24h) a24 += 1;
        if (diff <= ms7d) a7 += 1;
      }

      const pLower = (item.platform || 'web').toLowerCase();
      if (pLower.includes('android')) {
        android += 1;
      } else {
        web += 1;
      }

      const b = item.build;
      if (currentMinBuild > 0 && (b === null || b < currentMinBuild)) {
        blocked += 1;
      } else {
        allowed += 1;
      }
    });

    return {
      onlineNowCount: online,
      active24hCount: a24,
      active7dCount: a7,
      androidAppCount: android,
      webAppCount: web,
      blockedCount: blocked,
      allowedCount: allowed,
    };
  }, [installs, currentMinBuild]);

  // Distinct versions for version filter dropdown
  const distinctVersions = useMemo(() => {
    const set = new Set<string>();
    installs.forEach((i) => {
      if (i.app_version) set.add(i.app_version);
    });
    return Array.from(set).sort().reverse();
  }, [installs]);

  // Filtered and sorted devices list
  const filteredDevices = useMemo(() => {
    let list = [...installs];
    const now = Date.now();

    if (deviceSearch.trim()) {
      const q = deviceSearch.toLowerCase().trim();
      list = list.filter((item) => {
        const owner = (item.owner_label || '').toLowerCase();
        const rawN = (item.device_name || item.name || '').toLowerCase();
        const rawM = (item.device_model || item.model || '').toLowerCase();
        const rawMf = (item.manufacturer || '').toLowerCase();
        const resolved = resolveDeviceDisplayName(item.device_name || item.name, item.manufacturer, item.device_model || item.model, item.platform).toLowerCase();
        const os = (item.os || '').toLowerCase();
        const ver = (item.app_version || '').toLowerCase();
        const id = (item.install_id || '').toLowerCase();
        return (
          owner.includes(q) ||
          rawN.includes(q) ||
          rawM.includes(q) ||
          rawMf.includes(q) ||
          resolved.includes(q) ||
          os.includes(q) ||
          ver.includes(q) ||
          id.includes(q)
        );
      });
    }

    if (platformFilter !== 'all') {
      list = list.filter((item) => {
        const p = (item.platform || 'web').toLowerCase();
        if (platformFilter === 'android') return p.includes('android');
        return !p.includes('android');
      });
    }

    if (versionFilter !== 'all') {
      list = list.filter((item) => (item.app_version || '') === versionFilter);
    }

    if (statusFilter !== 'all') {
      list = list.filter((item) => {
        const b = item.build;
        const isBlocked = currentMinBuild > 0 && (b === null || b < currentMinBuild);
        if (statusFilter === 'blocked') return isBlocked;
        if (statusFilter === 'allowed') return !isBlocked;
        if (statusFilter === 'online') {
          const lastSeenMs = item.last_seen ? new Date(item.last_seen).getTime() : 0;
          return lastSeenMs > 0 && now - lastSeenMs <= 10 * 60 * 1000;
        }
        return true;
      });
    }

    list.sort((a, b) => {
      const timeA = a.last_seen ? new Date(a.last_seen).getTime() : 0;
      const timeB = b.last_seen ? new Date(b.last_seen).getTime() : 0;
      return lastSeenSortDesc ? timeB - timeA : timeA - timeB;
    });

    return list;
  }, [installs, deviceSearch, platformFilter, versionFilter, statusFilter, lastSeenSortDesc, currentMinBuild]);

  // Grouped versions table (group installs by build)
  const versionsTable = useMemo(() => {
    const map = new Map<number, { version: string; count: number }>();
    installs.forEach((item) => {
      const b = item.build ?? 0;
      const v = item.app_version || `Build ${b}`;
      const cur = map.get(b);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(b, { version: v, count: 1 });
      }
    });

    // Ensure latest published build is included in table
    if (latestBuild > 0 && !map.has(latestBuild)) {
      map.set(latestBuild, {
        version: latestVersionName || `v1.0.${latestBuild}`,
        count: 0,
      });
    }

    const total = installs.length;
    const list = Array.from(map.entries()).map(([buildNum, data]) => {
      let status: 'Latest' | 'Blocked' | 'Allowed' = 'Allowed';
      if (buildNum >= latestBuild && latestBuild > 0) {
        status = 'Latest';
      } else if (currentMinBuild > 0 && buildNum < currentMinBuild) {
        status = 'Blocked';
      } else {
        status = 'Allowed';
      }

      return {
        build: buildNum,
        version: data.version,
        count: data.count,
        percentage: total > 0 ? (data.count / total) * 100 : 0,
        status,
      };
    });

    list.sort((a, b) => b.build - a.build);
    return list;
  }, [installs, latestBuild, latestVersionName, currentMinBuild]);

  // Read-only Minimum Version summary sentence (Requirement 3)
  const minVersionSummaryText = useMemo(() => {
    if (currentMinBuild > 1) {
      return `Blocked: builds 100 to ${currentMinBuild - 1}. Allowed: ${currentMinBuild} and above. Latest: ${latestBuild}.`;
    }
    if (currentMinBuild === 1) {
      return `Blocked: build 100. Allowed: 101 and above. Latest: ${latestBuild}.`;
    }
    return `Blocked: None. Allowed: All builds. Latest: ${latestBuild}.`;
  }, [currentMinBuild, latestBuild]);

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
                TAB 1: USAGE TELEMETRY & DEVICES LIST
               ========================================================================= */}
            {activeTab === 'usage' && (
              <div className="space-y-6 max-w-5xl mx-auto">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white tracking-wide">Usage Telemetry</h3>
                    <p className="text-xs text-slate-400">
                      Real-time devices from <code className="text-cyan-300 font-mono">app_installs</code> • Auto-refreshes every 30s
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      loadUsageData();
                      loadMinVersionConfig();
                    }}
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

                {ownerLabelError && (
                  <div className="p-3.5 rounded-2xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{ownerLabelError}</span>
                  </div>
                )}

                {/* Requirement 1: Totals at the top */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {/* Total Installs */}
                  <div className="rounded-2xl border border-cyan-500/30 bg-slate-900/70 p-3.5 shadow-lg flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">All Installs</span>
                    <div className="my-1">
                      <span className="text-2xl font-black text-white font-mono">{totalInstalls.toLocaleString()}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Total devices</span>
                  </div>

                  {/* Online Now */}
                  <div className="rounded-2xl border border-emerald-500/40 bg-slate-900/70 p-3.5 shadow-lg flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Online Now</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    </div>
                    <div className="my-1">
                      <span className="text-2xl font-black text-emerald-400 font-mono">{onlineNowCount.toLocaleString()}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Within 10 min</span>
                  </div>

                  {/* Active 24 Hours */}
                  <div className="rounded-2xl border border-purple-500/30 bg-slate-900/70 p-3.5 shadow-lg flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active 24h</span>
                    <div className="my-1">
                      <span className="text-2xl font-black text-purple-300 font-mono">{active24hCount.toLocaleString()}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {totalInstalls > 0 ? `${((active24hCount / totalInstalls) * 100).toFixed(0)}% of total` : '0%'}
                    </span>
                  </div>

                  {/* Active 7 Days */}
                  <div className="rounded-2xl border border-blue-500/30 bg-slate-900/70 p-3.5 shadow-lg flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active 7d</span>
                    <div className="my-1">
                      <span className="text-2xl font-black text-blue-300 font-mono">{active7dCount.toLocaleString()}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Past 7 days</span>
                  </div>

                  {/* Android App vs Web */}
                  <div className="rounded-2xl border border-teal-500/30 bg-slate-900/70 p-3.5 shadow-lg flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Platform</span>
                    <div className="my-1 text-sm font-bold font-mono">
                      <span className="text-emerald-400">{androidAppCount} APK</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-cyan-400">{webAppCount} Web</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Android vs Web</span>
                  </div>

                  {/* Blocked vs Allowed */}
                  <div className="rounded-2xl border border-rose-500/30 bg-slate-900/70 p-3.5 shadow-lg flex flex-col justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Access Status</span>
                    <div className="my-1 text-sm font-bold font-mono">
                      <span className="text-emerald-400">{allowedCount} Allowed</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-rose-400">{blockedCount} Blocked</span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      {currentMinBuild > 0 ? `Min build: ${currentMinBuild}` : 'No block active'}
                    </span>
                  </div>
                </div>

                {/* =========================================================================
                    REQUIREMENT 2: VERSIONS TABLE
                   ========================================================================= */}
                <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/80 p-5 sm:p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-wider">Versions & Builds</h4>
                        <p className="text-[11px] text-slate-400">
                          Grouped by build number • Latest published: <strong className="text-cyan-300 font-mono">Build {latestBuild} ({latestVersionName || `v${appVersionInfo.version}`})</strong>
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowUnblockAllConfirm(true)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 border border-white/10 flex items-center gap-1.5 transition cursor-pointer active:scale-95"
                    >
                      <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Unblock all</span>
                    </button>
                  </div>

                  {blockActionMessage && (
                    <div className={`p-3 rounded-2xl text-xs flex items-center gap-2 ${
                      blockActionMessage.type === 'success'
                        ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200'
                        : 'bg-rose-950/60 border border-rose-500/40 text-rose-200'
                    }`}>
                      {blockActionMessage.type === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span>{blockActionMessage.text}</span>
                    </div>
                  )}

                  {/* Versions Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-white/10 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          <th className="py-2.5 px-3">Version</th>
                          <th className="py-2.5 px-3">Build</th>
                          <th className="py-2.5 px-3">Devices</th>
                          <th className="py-2.5 px-3">Share</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 font-mono">
                        {versionsTable.map((row) => {
                          const isLatest = row.status === 'Latest';
                          const isBlocked = row.status === 'Blocked';

                          return (
                            <tr key={row.build} className="hover:bg-slate-950/40 transition">
                              <td className="py-3 px-3 font-bold text-white">
                                {row.version}
                              </td>
                              <td className="py-3 px-3 text-cyan-300">
                                Build {row.build}
                              </td>
                              <td className="py-3 px-3 text-slate-200">
                                {row.count} {row.count === 1 ? 'device' : 'devices'}
                              </td>
                              <td className="py-3 px-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-slate-300 text-[11px] w-12">{row.percentage.toFixed(1)}%</span>
                                  <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden hidden sm:block">
                                    <div
                                      className={`h-full rounded-full ${
                                        isLatest
                                          ? 'bg-cyan-400'
                                          : isBlocked
                                          ? 'bg-rose-500'
                                          : 'bg-emerald-400'
                                      }`}
                                      style={{ width: `${Math.max(row.percentage, 2)}%` }}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  isLatest
                                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                                    : isBlocked
                                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                }`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right">
                                {!isLatest ? (
                                  <button
                                    type="button"
                                    onClick={() => setBlockConfirmTarget({ build: row.build, version: row.version })}
                                    className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-white text-[11px] font-semibold transition cursor-pointer active:scale-95"
                                  >
                                    Block this version and older
                                  </button>
                                ) : (
                                  <span className="text-[10px] text-slate-500 font-sans italic">Latest build</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* =========================================================================
                    REQUIREMENT 1: DEVICES DIRECTORY (Search, Filters, Detailed List)
                   ========================================================================= */}
                <div className="rounded-3xl border border-cyan-500/30 bg-slate-900/80 p-5 sm:p-6 shadow-2xl space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-base font-black text-white">Devices Directory</h4>
                        <p className="text-[11px] text-slate-400">
                          Showing {filteredDevices.length} of {installs.length} devices • Click status for exact timestamp
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Search and Filters Bar */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
                    {/* Search Input */}
                    <div className="sm:col-span-4 relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={deviceSearch}
                        onChange={(e) => setDeviceSearch(e.target.value)}
                        placeholder="Search label, phone name, model, OS..."
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
                        <option value="android">Android App</option>
                        <option value="web">Web Browser</option>
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

                    {/* Status Filter */}
                    <div className="sm:col-span-2">
                      <select
                        value={statusFilter}
                        onChange={(e: any) => setStatusFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        <option value="all">All Status</option>
                        <option value="online">Online now</option>
                        <option value="allowed">Allowed</option>
                        <option value="blocked">Blocked</option>
                      </select>
                    </div>

                    {/* Last Seen Sort Toggle */}
                    <div className="sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => setLastSeenSortDesc(!lastSeenSortDesc)}
                        title={lastSeenSortDesc ? 'Sorting: Newest activity first' : 'Sorting: Oldest activity first'}
                        className="w-full h-full py-2 px-2 rounded-xl bg-slate-950 hover:bg-slate-900 border border-white/10 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400" />
                      </button>
                    </div>
                  </div>

                  {/* Devices List Rows */}
                  {filteredDevices.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-slate-950/40 border border-white/5 text-center text-xs text-slate-400">
                      No matching devices found.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                      {filteredDevices.map((row) => {
                        const isAndroid = (row.platform || 'web').toLowerCase().includes('android');
                        const rawName = (row.device_name || row.name || '').trim();
                        const rawModel = (row.device_model || row.model || '').trim();
                        const rawMfg = (row.manufacturer || '').trim();
                        const cleanedMfgModel = cleanManufacturerAndModel(rawMfg, rawModel);
                        const phoneName = resolveDeviceDisplayName(rawName, rawMfg, rawModel, row.platform);
                        const ownerLabel = row.owner_label || 'No label';
                        const osStr = row.os || (isAndroid ? 'Android' : 'Web');
                        const isBlocked = currentMinBuild > 0 && (row.build === null || row.build < currentMinBuild);
                        const status = getDeviceStatus(row.last_seen);
                        const isEditingThisOwner = editingOwnerLabelId === row.install_id;
                        const isTimeExpanded = expandedTimeDeviceId === row.install_id;

                        return (
                          <div
                            key={row.install_id}
                            className="p-4 rounded-2xl bg-slate-950/70 border border-white/5 hover:border-cyan-500/30 transition space-y-3"
                          >
                            {/* Top row: Owner label, Phone Name, and Badges */}
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              {/* Left: Owner Label (with edit icon) & Phone Name */}
                              <div className="flex items-center gap-2.5 flex-wrap">
                                {isEditingThisOwner ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      maxLength={60}
                                      value={editingOwnerLabelInput}
                                      onChange={(e) => setEditingOwnerLabelInput(e.target.value)}
                                      placeholder="Owner label (e.g. John's Tablet)"
                                      className="px-2.5 py-1 rounded-lg bg-slate-900 border border-cyan-400 text-xs text-white font-semibold focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveOwnerLabel(row.install_id)}
                                      disabled={isSavingOwnerLabel}
                                      className="p-1.5 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition cursor-pointer"
                                      title="Save owner label"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingOwnerLabelId(null);
                                        setEditingOwnerLabelInput('');
                                      }}
                                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                                      title="Cancel"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${
                                      row.owner_label
                                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                        : 'bg-slate-900 border-white/10 text-slate-400'
                                    }`}>
                                      {ownerLabel}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingOwnerLabelId(row.install_id);
                                        setEditingOwnerLabelInput(row.owner_label || '');
                                        setOwnerLabelError(null);
                                      }}
                                      className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-300 transition cursor-pointer"
                                      title="Edit owner label"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                <span className="text-sm font-black text-white flex items-center gap-1.5">
                                  <span>{phoneName}</span>
                                </span>
                              </div>

                              {/* Right: Status badge & Blocked/Allowed badge */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Online / Last Seen status badge (Tappable for exact time) */}
                                <button
                                  type="button"
                                  onClick={() => setExpandedTimeDeviceId(isTimeExpanded ? null : row.install_id)}
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1.5 cursor-pointer transition active:scale-95 ${
                                    status.isOnline
                                      ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60'
                                      : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                                  }`}
                                  title="Tap to toggle exact timestamp"
                                >
                                  {status.isOnline ? (
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                  ) : (
                                    <Clock className="w-3 h-3 text-slate-400" />
                                  )}
                                  <span>{status.label}</span>
                                </button>

                                {/* Blocked or Allowed badge */}
                                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                                  isBlocked
                                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                                }`}>
                                  {isBlocked ? 'Blocked' : 'Allowed'}
                                </span>

                                {/* Platform badge */}
                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  isAndroid
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                                    : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
                                }`}>
                                  {isAndroid ? 'Android' : 'Web'}
                                </span>
                              </div>
                            </div>

                            {/* Exact timestamp banner if tapped */}
                            {isTimeExpanded && (
                              <div className="p-2 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-xs text-cyan-200 flex items-center justify-between">
                                <span className="font-mono">Exact last seen: <strong>{status.exactTime}</strong></span>
                                <span className="text-[10px] text-slate-400">Tap status to hide</span>
                              </div>
                            )}

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 border-t border-white/5 text-[11px]">
                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase font-bold">Hardware & OS</span>
                                <span className="text-slate-200 font-medium truncate block">{cleanedMfgModel}</span>
                                <span className="text-slate-400 text-[10px]">{osStr}</span>
                              </div>

                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase font-bold">App Version</span>
                                <span className="text-white font-mono font-bold">
                                  {row.app_version || 'v1.0.1'}
                                </span>
                                <span className="text-cyan-400 font-mono text-[10px] block">
                                  Build {row.build ?? 'Unknown'}
                                </span>
                              </div>

                              <div>
                                <span className="text-slate-500 block text-[9px] uppercase font-bold">First Seen</span>
                                <span className="text-slate-300 font-mono text-[10px] block truncate">
                                  {row.first_seen ? new Date(row.first_seen).toLocaleString() : 'N/A'}
                                </span>
                              </div>

                              <div className="sm:text-right">
                                <span className="text-slate-500 block text-[9px] uppercase font-bold">Total Opens</span>
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
                TAB 2: MINIMUM VERSION (Requirement 3)
               ========================================================================= */}
            {activeTab === 'min_version' && (
              <div className="space-y-6 max-w-3xl mx-auto">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black text-white tracking-wide">Minimum Version & Access Control</h3>
                    <p className="text-xs text-slate-400">
                      Controls access via <code className="text-cyan-300 font-mono">app_config (id = 1)</code>
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      loadMinVersionConfig();
                      loadUsageData();
                    }}
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
                  <div className="p-3.5 rounded-2xl bg-rose-950/50 border border-rose-500/40 text-xs text-rose-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{saveErrorMsg}</span>
                  </div>
                )}

                {/* Requirement 3: Read-only summary card */}
                <div className="rounded-3xl border border-cyan-500/40 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-cyan-950/30 p-5 sm:p-6 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-cyan-400" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Access Enforcement Summary</h4>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                      currentMinBuild > 0
                        ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                        : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                    }`}>
                      {currentMinBuild > 0 ? `Enforcing Min Build ${currentMinBuild}` : 'All Builds Allowed'}
                    </span>
                  </div>

                  {/* The summary sentence */}
                  <div className="p-4 rounded-2xl bg-slate-950/80 border border-cyan-500/30">
                    <p className="text-sm font-mono font-bold text-cyan-300 leading-relaxed">
                      {minVersionSummaryText}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1 flex-wrap gap-2">
                    <span>Configured in database: <strong className="text-white font-mono">{currentMinBuild}</strong></span>
                    <span>Latest published build: <strong className="text-emerald-400 font-mono">{latestBuild}</strong></span>
                  </div>
                </div>

                {/* Versions Table directly in Minimum Version tab for quick version blocking */}
                <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 shadow-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-purple-400" />
                      <h4 className="text-xs font-bold text-white uppercase tracking-wider">Block by Version</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowUnblockAllConfirm(true)}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-white/10 flex items-center gap-1 transition cursor-pointer"
                    >
                      <Unlock className="w-3 h-3 text-emerald-400" />
                      <span>Unblock all</span>
                    </button>
                  </div>

                  <div className="divide-y divide-white/5 text-xs font-mono">
                    {versionsTable.map((row) => {
                      const isLatest = row.status === 'Latest';
                      const isBlocked = row.status === 'Blocked';

                      return (
                        <div key={row.build} className="py-2.5 flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="font-bold text-white">{row.version}</span>
                            <span className="text-slate-400">(Build {row.build})</span>
                            <span className={`text-[10px] font-bold px-2 py-0.2 rounded-full border ${
                              isLatest
                                ? 'bg-purple-500/20 border-purple-500/40 text-purple-300'
                                : isBlocked
                                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            }`}>
                              {row.status}
                            </span>
                            <span className="text-slate-500 text-[11px] font-sans">
                              {row.count} {row.count === 1 ? 'device' : 'devices'}
                            </span>
                          </div>

                          {!isLatest ? (
                            <button
                              type="button"
                              onClick={() => setBlockConfirmTarget({ build: row.build, version: row.version })}
                              className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 hover:text-white text-[11px] font-semibold transition cursor-pointer active:scale-95"
                            >
                              Block this version and older
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-sans italic">Latest published build</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Requirement 3: Advanced field to type a build number directly */}
                <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-5 shadow-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-cyan-400" />
                    <h4 className="text-xs font-bold text-white uppercase tracking-wider">Advanced: Manual Build Number</h4>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Type a build number directly. Phones below this number will be blocked. Cannot exceed latest published build ({latestBuild}).
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="number"
                      min="0"
                      max={latestBuild}
                      step="1"
                      value={editingManualBuild}
                      onChange={(e) => setEditingManualBuild(e.target.value)}
                      placeholder={`0 - ${latestBuild}`}
                      className="w-36 px-3.5 py-2 rounded-xl bg-slate-950 border border-white/10 text-white font-mono text-sm focus:border-cyan-400 focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={handleSaveManualBuild}
                      disabled={isSavingManualBuild || !editingManualBuild}
                      className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-500/20 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                    >
                      {isSavingManualBuild ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving & Verifying...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Apply Build</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Requirement 3: Message, Notes, and APK URL fields and Preview */}
                <div className="rounded-3xl border border-white/10 bg-slate-900/80 p-5 sm:p-6 shadow-xl space-y-4">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Update Screen Customization</h4>

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
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:border-cyan-400 focus:outline-none resize-none"
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
                      placeholder="- Enhanced playback performance&#10;- Fixed update download resume logic&#10;- Brand new telemetry portal"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none resize-y"
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
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                    <p className="text-[10px] text-slate-400">
                      Leave blank to use the default latest release link.
                    </p>
                  </div>

                  {/* Action Buttons: Preview & Save */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
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
                      onClick={handleSaveConfigText}
                      disabled={isSavingConfig}
                      className="py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-lg shadow-cyan-500/20 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50 active:scale-98"
                    >
                      {isSavingConfig ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Save Message & Notes</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* =========================================================================
                TAB 3: UPDATE STATUS & DIAGNOSTICS
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
                    onClick={async () => {
                      setIsCheckingNow(true);
                      try {
                        await Promise.allSettled([
                          NativeUpdateService.checkForUpdate(true),
                          checkMinimumVersion(false),
                        ]);
                        await loadLatestReleaseData();
                      } finally {
                        refreshDiagnostics();
                        setIsCheckingNow(false);
                      }
                    }}
                    disabled={isCheckingNow}
                    className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow-lg shadow-cyan-500/20 disabled:opacity-50 active:scale-98"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingNow ? 'animate-spin' : ''}`} />
                    <span>{isCheckingNow ? 'Checking...' : 'Check now'}</span>
                  </button>
                </div>

                {/* Requirement 1: What this phone reports */}
                <div className="rounded-3xl border border-cyan-500/40 bg-slate-900/90 p-5 sm:p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-wider">What this phone reports</h4>
                        <p className="text-[11px] text-slate-400">Raw values from Device.getInfo() & last ping_install telemetry</p>
                      </div>
                    </div>
                  </div>

                  {/* Raw values from Device.getInfo() */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">name</span>
                      <span className="font-mono text-xs text-white break-all block">
                        {renderRawValue(rawDeviceInfo?.name)}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">model</span>
                      <span className="font-mono text-xs text-white break-all block">
                        {renderRawValue(rawDeviceInfo?.model)}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">manufacturer</span>
                      <span className="font-mono text-xs text-white break-all block">
                        {renderRawValue(rawDeviceInfo?.manufacturer)}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">platform</span>
                      <span className="font-mono text-xs text-white break-all block">
                        {renderRawValue(rawDeviceInfo?.platform)}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">osVersion</span>
                      <span className="font-mono text-xs text-white break-all block">
                        {renderRawValue(rawDeviceInfo?.osVersion)}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">operatingSystem</span>
                      <span className="font-mono text-xs text-white break-all block">
                        {renderRawValue(rawDeviceInfo?.operatingSystem)}
                      </span>
                    </div>
                  </div>

                  {/* Last ping_install details */}
                  <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-cyan-500/30 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Last Sent p_name</span>
                      <span className="font-mono text-xs text-cyan-300 font-bold break-all block">
                        {renderRawValue(lastPingDiag.p_name)}
                      </span>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">ping_install Status</span>
                      <div className="pt-0.5">
                        {lastPingDiag.succeeded === true ? (
                          <span className="text-emerald-400 text-xs font-bold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Succeeded</span>
                          </span>
                        ) : lastPingDiag.succeeded === false ? (
                          <span className="text-rose-400 text-xs font-bold flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Failed {lastPingDiag.error ? `(${lastPingDiag.error})` : ''}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500 text-xs italic">Not sent yet</span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-2xl bg-slate-950/70 border border-white/5 space-y-1">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Last Ping Time</span>
                      <span className="font-mono text-xs text-slate-300 block">
                        {lastPingDiag.timestamp ? new Date(lastPingDiag.timestamp).toLocaleString() : <span className="text-slate-500 italic">Never</span>}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-cyan-500/30 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Installed Version & Build
                    </span>
                    <div className="text-xl font-black text-white font-mono">
                      v{appVersionInfo.version} <span className="text-cyan-400 text-base">(Build {appVersionInfo.build})</span>
                    </div>
                    <span className="text-[10px] text-slate-500">Read natively via App.getInfo()</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-emerald-500/30 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Latest Published Build
                    </span>
                    <div className="text-xl font-black text-emerald-400 font-mono">
                      Build {latestBuild}
                    </div>
                    <span className="text-[10px] text-slate-500">{latestVersionName || 'From latest release'}</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-purple-500/30 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Source
                    </span>
                    <div className="text-xl font-black text-purple-300 font-mono">
                      {updateDiag.lastSource ? updateDiag.lastSource : 'None'}
                    </div>
                    <span className="text-[10px] text-slate-500">latest.json or GitHub API</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Last Check Time
                    </span>
                    <div className="text-sm font-bold text-slate-200 font-mono pt-1">
                      {formatTimestamp(updateDiag.lastCheckTime)}
                    </div>
                    <span className="text-[10px] text-slate-500">Timestamp</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Last Error
                    </span>
                    <div className={`text-xs font-mono font-bold pt-1 break-all ${updateDiag.lastError ? 'text-rose-400' : 'text-slate-400'}`}>
                      {updateDiag.lastError || 'None'}
                    </div>
                    <span className="text-[10px] text-slate-500">Error text or code</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/80 border border-white/10 space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Cloud Min Build
                    </span>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="font-mono text-sm text-cyan-300 font-bold">
                        {currentMinBuild > 0 ? `Build ${currentMinBuild}` : 'No Min Build'}
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
                TAB 4: CONNECTION TEST
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

                        {result && (
                          <div className="pt-2 border-t border-white/5 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between text-slate-400">
                              <span>Project Host:</span>
                              <span className="font-mono text-slate-200">{result.projectHost}</span>
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

      {/* Confirmation Modal for "Block this version and older" (Requirement 2) */}
      {blockConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl border border-rose-500/40 bg-slate-950 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400">
                  <Ban className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Block Version & Older</h3>
                  <p className="text-xs text-slate-400">Target build: {blockConfirmTarget.build}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setBlockConfirmTarget(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-rose-950/30 border border-rose-500/30 space-y-2 text-xs">
              <p className="text-rose-200 font-semibold leading-relaxed">
                All phones on build {blockConfirmTarget.build} or lower will be locked and shown the update screen for {latestVersionName || `v${appVersionInfo.version}`}.
              </p>
              <p className="text-slate-400 pt-1">
                This will set <code className="text-cyan-300 font-mono">app_config.min_build = {blockConfirmTarget.build + 1}</code>.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setBlockConfirmTarget(null)}
                disabled={isBlockingVersion}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmBlockVersion}
                disabled={isBlockingVersion}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-lg shadow-rose-600/30 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isBlockingVersion ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving & Verifying...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Confirm Block</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal for "Unblock all" (Requirement 2) */}
      {showUnblockAllConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-3xl border border-emerald-500/40 bg-slate-950 p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                  <Unlock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Unblock All Builds</h3>
                  <p className="text-xs text-slate-400">Sets min_build to 0</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowUnblockAllConfirm(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-950/30 border border-emerald-500/30 space-y-2 text-xs">
              <p className="text-emerald-200 font-semibold leading-relaxed">
                Are you sure you want to unblock all versions? All devices will be allowed to use the app without requiring an update.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowUnblockAllConfirm(false)}
                disabled={isUnblockingAll}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmUnblockAll}
                disabled={isUnblockingAll}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isUnblockingAll ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Unblocking...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Confirm Unblock All</span>
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
          versionName={latestVersionName || `Build ${latestBuild}`}
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
