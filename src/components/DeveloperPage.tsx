import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  X, RefreshCw, Shield, ShieldCheck, Lock, 
  Users, Smartphone, AlertCircle, CheckCircle2, 
  Clock, Layers, 
  Wifi, Terminal, Search, ArrowUpDown, Edit2, Check, Eye,
  Ban, Unlock, Radio, Activity, LogOut,
  HeartPulse, Database, FileText, Trash2, Filter,
  KeyRound, ShieldAlert, Copy, Music
} from 'lucide-react';
import { 
  getJtecAdminClient, 
  SupabaseService, 
  CLOUD_CATEGORIES, 
  SourceDiagnosticResult,
  setAdminLastOpened,
  getAdminStaySignedIn,
  sanitizeSecretText
} from '../services/supabase';
import {
  AdminAuthResult,
  TotpEnrollmentData,
  verifyAdminAuthorization,
  signInAdminWithPassword,
  verifyAdminMfaChallenge,
  enrollAdminTotpMfa,
  confirmAdminTotpEnrollment,
  unenrollAdminTotpMfa,
  assertActiveAdminSession,
  signOutAdmin,
  recordAdminAuditEvent,
  touchAdminActivity,
  getAdminLoginCooldownRemainingMs,
} from '../services/adminAuth';
import { Device, DeviceInfo } from '@capacitor/device';
import { getCurrentAppVersion, NativeUpdateService } from '../services/nativeUpdate';
import { registerBackHandler } from '../services/navigation';
import { BUILD_DATE } from '../version';
import { RequiredUpdateOverlay } from './RequiredUpdateOverlay';
import { VisualizerDiagnostics, VisualizerPerformanceStats } from '../services/visualizerDiagnostics';
import { 
  isNativeAndroid,
  parseConfigNotes, 
  getMinVersionDiagnosticInfo, 
  checkMinimumVersion,
  cleanManufacturerAndModel,
  resolveDeviceDisplayName,
  getLastPingDiagnosticInfo,
  PingDiagnosticInfo
} from '../services/appConfig';
import { getPartyBackendStatus } from '../party/backend';
import { PartyService } from '../party/PartyService';
import { AppLogger, LogSeverity, LogProjectScope } from '../services/appLogger';
import { HealthMonitorService, HealthStatus, OverallHealthStatus, MonitoredProjectId } from '../services/healthMonitor';
import { fetchPartyAdminTelemetry, PartyActivitySnapshot } from '../services/partyAdminTelemetry';
import { VersionsBuildsCard } from './developer/VersionsBuildsCard';
import { PartyActivityPanel } from './developer/PartyActivityPanel';
import { MusicManagerPanel } from './developer/MusicManagerPanel';

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

type DeveloperTab = 'health_logs' | 'usage' | 'min_version' | 'update_status' | 'connection' | 'party_activity' | 'music_manager';

export const DeveloperPage: React.FC<DeveloperPageProps> = ({ isOpen, onClose }) => {
  const [adminClient] = useState(() => getJtecAdminClient());
  const [session, setSession] = useState<any>(null);
  const [authStage, setAuthStage] = useState<'login' | 'mfa_enrollment_required' | 'mfa_required' | 'authorized'>('login');
  const [authResult, setAuthResult] = useState<AdminAuthResult | null>(null);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DeveloperTab>('usage');

  // Sign-in & 2FA MFA states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [staySignedIn, setStaySignedIn] = useState(true);
  const staySignedInRef = useRef(staySignedIn);
  staySignedInRef.current = staySignedIn;
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [isVerifyingMfa, setIsVerifyingMfa] = useState(false);

  // Security & 2FA enrollment modal states
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [enrollData, setEnrollData] = useState<TotpEnrollmentData | null>(null);
  const [enrollCode, setEnrollCode] = useState('');
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [enrollSuccess, setEnrollSuccess] = useState<string | null>(null);
  const [isStartingEnroll, setIsStartingEnroll] = useState(false);
  const [isConfirmingEnroll, setIsConfirmingEnroll] = useState(false);
  const [isUnenrollingId, setIsUnenrollingId] = useState<string | null>(null);
  const [copiedSecret, setCopiedSecret] = useState(false);

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

  // JTEC Party real users & activity telemetry (dedicated Party Supabase only)
  const [partyStatus, setPartyStatus] = useState(() => getPartyBackendStatus());
  const [partyActivity, setPartyActivity] = useState<PartyActivitySnapshot | null>(null);
  const [isLoadingPartyActivity, setIsLoadingPartyActivity] = useState(false);

  // Health & Structured Logs state (active only while Developer Portal is open & authenticated)
  const [overallHealth, setOverallHealth] = useState(() => HealthMonitorService.getOverallHealth());
  const [projectSnapshots, setProjectSnapshots] = useState(() => HealthMonitorService.getProjectSnapshots());
  const [partyDiagnostics, setPartyDiagnostics] = useState(() => PartyService.getDiagnostics());
  const [partyLiveState, setPartyLiveState] = useState(() => PartyService.getState());
  const [logRevision, setLogRevision] = useState(0);
  const [logViewMode, setLogViewMode] = useState<'all' | 'by_project'>('all');
  const [selectedLogProjectTab, setSelectedLogProjectTab] = useState<MonitoredProjectId>('jtec_party');
  const [logSeverityFilter, setLogSeverityFilter] = useState<LogSeverity | 'ALL'>('ALL');
  const [logComponentFilter, setLogComponentFilter] = useState<string>('ALL');
  const [logProjectFilter, setLogProjectFilter] = useState<LogProjectScope | 'ALL'>('ALL');
  const [logDateFilter, setLogDateFilter] = useState<string>('ALL');
  const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);

  const loadPartyActivity = useCallback(async () => {
    setIsLoadingPartyActivity(true);
    try {
      const snapshot = await fetchPartyAdminTelemetry();
      setPartyActivity(snapshot);
    } finally {
      setIsLoadingPartyActivity(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || !session) return;

    setOverallHealth(HealthMonitorService.getOverallHealth());
    setProjectSnapshots(HealthMonitorService.getProjectSnapshots());
    setPartyDiagnostics(PartyService.getDiagnostics());
    setPartyLiveState(PartyService.getState());
    setPartyStatus(getPartyBackendStatus());

    const unsubHealth = HealthMonitorService.subscribe(() => {
      setOverallHealth(HealthMonitorService.getOverallHealth());
      setProjectSnapshots(HealthMonitorService.getProjectSnapshots());
    });
    const unsubLogs = AppLogger.subscribe(() => {
      setLogRevision((r) => r + 1);
    });
    const unsubParty = PartyService.subscribe((nextPartyState) => {
      setPartyLiveState(nextPartyState);
      setPartyDiagnostics(PartyService.getDiagnostics());
      setPartyStatus(getPartyBackendStatus());
    });

    return () => {
      unsubHealth();
      unsubLogs();
      unsubParty();
    };
  }, [isOpen, session]);

  useEffect(() => {
    if (isOpen && session && (activeTab === 'party_activity' || activeTab === 'health_logs')) {
      setPartyStatus(getPartyBackendStatus());
      setPartyDiagnostics(PartyService.getDiagnostics());
      const timer = setInterval(() => {
        setPartyStatus(getPartyBackendStatus());
        setPartyDiagnostics(PartyService.getDiagnostics());
      }, 3000);
      return () => clearInterval(timer);
    }
  }, [isOpen, session, activeTab]);

  // Diagnostics
  const [minVersionDiag, setMinVersionDiag] = useState(() => getMinVersionDiagnosticInfo());
  const [updateDiag, setUpdateDiag] = useState(() => NativeUpdateService.getUpdateDiagnosticInfo());
  const [isCheckingNow, setIsCheckingNow] = useState(false);
  const [visualizerStats, setVisualizerStats] = useState<VisualizerPerformanceStats>(() => VisualizerDiagnostics.getStats());

  useEffect(() => {
    if (isOpen) {
      return VisualizerDiagnostics.subscribe((stats) => {
        setVisualizerStats(stats);
      });
    }
  }, [isOpen]);

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

  // Fetch installed version & latest published Android APK release data
  const loadLatestReleaseData = useCallback(async () => {
    try {
      const appInfo = await getCurrentAppVersion();
      setAppVersionInfo({ version: appInfo.version, build: appInfo.build });

      const releaseInfo = isNativeAndroid()
        ? await NativeUpdateService.checkForUpdate(true)
        : await NativeUpdateService.fetchLatestPublishedAndroidRelease();

      if (releaseInfo) {
        if (releaseInfo.latestBuild) {
          setLatestBuild(releaseInfo.latestBuild);
        }
        if (releaseInfo.versionName) {
          setLatestVersionName(releaseInfo.versionName);
        }
      } else {
        const diag = NativeUpdateService.getUpdateDiagnosticInfo();
        if (diag.lastFoundBuild) {
          setLatestBuild(diag.lastFoundBuild);
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

  const clearSensitivePortalState = useCallback(() => {
    setSession(null);
    setAuthStage('login');
    setAuthResult(null);
    setPassword('');
    setMfaCode('');
    setMfaError(null);
    setInstalls([]);
    setAppConfig(null);
    setPartyActivity(null);
    setConnectionResults([]);
    setEditingManualBuild('');
    setEditingMessage('');
    setEditingNotes('');
    setEditingApkUrl('');
    setEnrollData(null);
    setEnrollCode('');
    setEnrollError(null);
    setEnrollSuccess(null);
    setShowSecurityModal(false);
    setBlockConfirmTarget(null);
    setShowUnblockAllConfirm(false);
    setShowRequiredUpdatePreview(false);
  }, []);

  // Server-verified admin session & MFA check
  const verifySession = useCallback(async () => {
    if (!adminClient) {
      clearSensitivePortalState();
      setIsCheckingSession(false);
      return;
    }

    setIsCheckingSession(true);

    try {
      const savedStay = await getAdminStaySignedIn();
      setStaySignedIn(savedStay);
      staySignedInRef.current = savedStay;

      const res = await verifyAdminAuthorization(adminClient, { checkInactivity: false });
      setAuthResult(res);

      if (res.stage === 'authorized' && res.session) {
        setSession(res.session);
        setAuthStage('authorized');
        setAccessDenied(false);
        setAuthErrorMessage(null);
        if (res.user?.email) {
          setEmail(res.user.email);
        }
      } else if (res.stage === 'mfa_enrollment_required') {
        setSession(null);
        setAuthStage('mfa_enrollment_required');
        setAccessDenied(false);
        setAuthErrorMessage(null);
        if (res.user?.email) {
          setEmail(res.user.email);
        }
      } else if (res.stage === 'mfa_required') {
        setSession(null);
        setAuthStage('mfa_required');
        setAccessDenied(false);
        setAuthErrorMessage(null);
        if (res.user?.email) {
          setEmail(res.user.email);
        }
      } else {
        clearSensitivePortalState();
        if (res.stage === 'denied' || res.reason) {
          setAccessDenied(true);
          setAuthErrorMessage(res.reason || 'Access denied. Admin authorization required.');
        } else {
          setAccessDenied(false);
          setAuthErrorMessage(null);
        }
      }
    } catch (err) {
      clearSensitivePortalState();
      setAccessDenied(true);
      setAuthErrorMessage(sanitizeSecretText(err) || 'Session verification error.');
    } finally {
      setIsCheckingSession(false);
    }
  }, [adminClient, clearSensitivePortalState]);

  useEffect(() => {
    if (isOpen) {
      verifySession();
    }
  }, [isOpen, verifySession]);

  // Enforce 30-minute idle timeout while portal is open & authorized
  useEffect(() => {
    if (!isOpen || authStage !== 'authorized' || !session) return;

    const handleActivity = () => touchAdminActivity();
    window.addEventListener('pointerdown', handleActivity, { passive: true });
    window.addEventListener('keydown', handleActivity);
    window.addEventListener('scroll', handleActivity, { passive: true });

    const idleCheckTimer = setInterval(async () => {
      const res = await verifyAdminAuthorization(adminClient, { checkInactivity: true });
      if (res.stage === 'authorized') {
        if (res.session) setSession(res.session);
        return;
      }
      if (res.enforcementMode === 'unavailable') {
        // Brief network/edge blip: keep current UI state intact instead of forcing a login loop
        return;
      }
      if (res.stage === 'mfa_required') {
        setSession(null);
        setAuthStage('mfa_required');
        setAuthResult(res);
        return;
      }
      clearSensitivePortalState();
      setAccessDenied(true);
      setAuthErrorMessage(res.reason || 'Admin session expired due to inactivity. Please sign in again.');
    }, 60 * 1000);

    return () => {
      window.removeEventListener('pointerdown', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('scroll', handleActivity);
      clearInterval(idleCheckTimer);
    };
  }, [isOpen, authStage, session, adminClient, clearSensitivePortalState]);

  // Handle Close: clears tokens immediately if staySignedIn is off or MFA is unfinished
  const handleClose = useCallback(async () => {
    if (!staySignedInRef.current || authStage !== 'authorized') {
      await signOutAdmin(adminClient, 'local').catch(() => {});
      clearSensitivePortalState();
    } else if (session) {
      await setAdminLastOpened(Date.now()).catch(() => {});
    }
    setPassword('');
    setAccessDenied(false);
    setAuthErrorMessage(null);
    setShowSecurityModal(false);
    onClose();
  }, [adminClient, authStage, session, clearSensitivePortalState, onClose]);

  // Handle explicit Sign out (global server revocation + local/session wipe)
  const handleSignOut = useCallback(async (scope: 'global' | 'local' = 'global') => {
    await signOutAdmin(adminClient, scope).catch(() => {});
    clearSensitivePortalState();
    setAccessDenied(false);
    setAuthErrorMessage(null);
    setActiveTab('usage');
  }, [adminClient, clearSensitivePortalState]);

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
    if (!adminClient || !email.trim() || !password) {
      setAccessDenied(true);
      setAuthErrorMessage('Please enter a valid admin email and password.');
      return;
    }

    const cooldownMs = getAdminLoginCooldownRemainingMs();
    if (cooldownMs > 0) {
      setAccessDenied(true);
      setAuthErrorMessage(`Too many failed attempts. Please wait ${Math.ceil(cooldownMs / 1000)}s.`);
      return;
    }

    setIsSigningIn(true);
    setAccessDenied(false);
    setAuthErrorMessage(null);

    try {
      const submittedPassword = password;
      setPassword('');

      const res = await signInAdminWithPassword(adminClient, email.trim(), submittedPassword, staySignedIn);
      setAuthResult(res);

      if (res.stage === 'authorized' && res.session) {
        setSession(res.session);
        setAuthStage('authorized');
        setAccessDenied(false);
        setAuthErrorMessage(null);
      } else if (res.stage === 'mfa_enrollment_required') {
        setSession(null);
        setAuthStage('mfa_enrollment_required');
        setEnrollData(null);
        setEnrollCode('');
        setEnrollError(null);
        setEnrollSuccess(null);
      } else if (res.stage === 'mfa_required') {
        setSession(null);
        setAuthStage('mfa_required');
        setMfaCode('');
        setMfaError(null);
      } else {
        clearSensitivePortalState();
        setAccessDenied(true);
        setAuthErrorMessage(res.reason || 'Access denied. Check your email, password, or admin permissions.');
      }
    } catch (err) {
      setPassword('');
      clearSensitivePortalState();
      setAccessDenied(true);
      setAuthErrorMessage(sanitizeSecretText(err) || 'Authentication failed.');
    } finally {
      setIsSigningIn(false);
    }
  };

  // Second-factor (TOTP MFA) challenge handler
  const handleVerifyMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    const factorId = authResult?.totpFactors?.[0]?.id;
    if (!adminClient || !factorId) {
      setMfaError('No verified authenticator factor found. Sign in again.');
      return;
    }

    setIsVerifyingMfa(true);
    setMfaError(null);

    try {
      const res = await verifyAdminMfaChallenge(adminClient, factorId, mfaCode);
      setMfaCode('');
      setAuthResult(res);

      if (res.stage === 'authorized' && res.session) {
        setSession(res.session);
        setAuthStage('authorized');
        setMfaError(null);
      } else if (res.stage === 'mfa_required') {
        setMfaError(res.reason || 'Invalid or expired authenticator code.');
      } else {
        clearSensitivePortalState();
        setAccessDenied(true);
        setAuthErrorMessage(res.reason || 'Access denied.');
      }
    } catch (err) {
      setMfaCode('');
      setMfaError(sanitizeSecretText(err) || 'Could not verify 2FA code.');
    } finally {
      setIsVerifyingMfa(false);
    }
  };

  // Start TOTP 2FA enrollment inside Security modal
  const handleStartTotpEnroll = async () => {
    setIsStartingEnroll(true);
    setEnrollError(null);
    setEnrollSuccess(null);
    const { data, error } = await enrollAdminTotpMfa(adminClient);
    setIsStartingEnroll(false);
    if (error || !data) {
      setEnrollError(error || 'Could not initialize 2FA setup.');
      return;
    }
    setEnrollData(data);
    setEnrollCode('');
  };

  const handleConfirmTotpEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollData) return;
    setIsConfirmingEnroll(true);
    setEnrollError(null);

    const { success, error } = await confirmAdminTotpEnrollment(adminClient, enrollData.factorId, enrollCode);
    setIsConfirmingEnroll(false);

    if (!success) {
      setEnrollError(error || 'Verification failed.');
      return;
    }

    setEnrollCode('');
    setEnrollData(null);
    setEnrollSuccess('Two-factor authentication (TOTP) is now enabled and active (AAL2).');
    await verifySession();
  };

  const handleUnenrollFactor = async (factorId: string) => {
    setIsUnenrollingId(factorId);
    setEnrollError(null);
    setEnrollSuccess(null);
    const { success, error } = await unenrollAdminTotpMfa(adminClient, factorId);
    setIsUnenrollingId(null);
    if (!success) {
      setEnrollError(error || 'Could not remove authenticator factor.');
      return;
    }
    setEnrollSuccess('Authenticator factor removed.');
    await verifySession();
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
      if (activeTab === 'party_activity') {
        loadPartyActivity();
      }
    }
  }, [session, activeTab, loadUsageData, loadMinVersionConfig, runConnectionTests, loadPartyActivity]);

  // Automatic refresh every 30 seconds while the page is open
  useEffect(() => {
    if (!isOpen || !session) return;
    const interval = setInterval(() => {
      loadUsageData();
      loadMinVersionConfig();
      if (activeTab === 'party_activity') {
        loadPartyActivity();
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [isOpen, session, activeTab, loadUsageData, loadMinVersionConfig, loadPartyActivity]);

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

  // Save Owner Label with pre-flight session check, row-change verification, and audit logging
  const handleSaveOwnerLabel = async (installId: string) => {
    if (!adminClient || !session) return;
    setIsSavingOwnerLabel(true);
    setOwnerLabelError(null);
    const cleanLabel = editingOwnerLabelInput.trim().slice(0, 60);

    try {
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        clearSensitivePortalState();
        setAccessDenied(true);
        setAuthErrorMessage(authCheck.reason || 'Admin session expired.');
        return;
      }

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

      await recordAdminAuditEvent(adminClient, 'owner_label_updated', {
        install_id: installId,
        has_label: Boolean(cleanLabel),
      });

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
      setOwnerLabelError(`Failed to update owner label: ${sanitizeSecretText(err?.message) || 'Unknown error'}`);
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
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        clearSensitivePortalState();
        setAccessDenied(true);
        setAuthErrorMessage(authCheck.reason || 'Admin session expired.');
        return;
      }

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

      await recordAdminAuditEvent(adminClient, 'min_build_blocked', {
        blocked_up_to: targetRowBuild,
        min_build: targetMinBuild,
      });

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
        text: `Error updating minimum build: ${sanitizeSecretText(err?.message) || 'Unknown error'}`,
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
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        clearSensitivePortalState();
        setAccessDenied(true);
        setAuthErrorMessage(authCheck.reason || 'Admin session expired.');
        return;
      }

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

      await recordAdminAuditEvent(adminClient, 'min_build_unblocked_all', { min_build: 0 });

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
        text: `Error unblocking builds: ${sanitizeSecretText(err?.message) || 'Unknown error'}`,
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
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        clearSensitivePortalState();
        setAccessDenied(true);
        setAuthErrorMessage(authCheck.reason || 'Admin session expired.');
        return;
      }

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

      await recordAdminAuditEvent(adminClient, 'min_build_updated', { min_build: parsedBuild });

      setAppConfig(readBack as AppConfigRow);
      setSaveSuccessMsg(`Saved: minimum build updated to ${parsedBuild}.`);
      refreshDiagnostics();
    } catch (err: any) {
      setSaveErrorMsg(sanitizeSecretText(err?.message) || 'Failed to update minimum build.');
    } finally {
      setIsSavingManualBuild(false);
    }
  };

  // Save Message, Notes, and APK URL in Minimum Version tab (with HTTPS validation)
  const handleSaveConfigText = async () => {
    if (!adminClient || !session) return;

    const cleanApkUrl = editingApkUrl.trim();
    if (cleanApkUrl) {
      try {
        const parsed = new URL(cleanApkUrl);
        if (parsed.protocol !== 'https:') {
          setSaveErrorMsg('Direct APK URL must use a valid https:// address.');
          return;
        }
      } catch {
        setSaveErrorMsg('Direct APK URL is not a valid https:// URL.');
        return;
      }
    }

    setIsSavingConfig(true);
    setSaveErrorMsg(null);
    setSaveSuccessMsg(null);

    try {
      const authCheck = await assertActiveAdminSession(adminClient);
      if (!authCheck.ok) {
        clearSensitivePortalState();
        setAccessDenied(true);
        setAuthErrorMessage(authCheck.reason || 'Admin session expired.');
        return;
      }

      const { data, error } = await adminClient
        .from('app_config')
        .update({
          message: editingMessage.trim() || 'An update is required to continue using JTEC MUSIC.',
          notes: editingNotes.trim() || null,
          apk_url: cleanApkUrl || null,
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

      await recordAdminAuditEvent(adminClient, 'app_config_text_updated', {
        has_apk_url: Boolean(cleanApkUrl),
      });

      setAppConfig(readBack as AppConfigRow);
      setSaveSuccessMsg('Configuration text and release notes saved successfully.');
    } catch (err: any) {
      setSaveErrorMsg(sanitizeSecretText(err?.message) || 'Failed to save configuration.');
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
        // Minimum-version blocking compares ONLY Android builds; web installs are excluded from Blocked/Allowed counts
        const b = item.build;
        if (currentMinBuild > 0 && (b === null || b < currentMinBuild)) {
          blocked += 1;
        } else {
          allowed += 1;
        }
      } else {
        web += 1;
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
        const isAndroid = (item.platform || 'web').toLowerCase().includes('android');
        const b = item.build;
        const isBlocked = isAndroid && currentMinBuild > 0 && (b === null || b < currentMinBuild);
        if (statusFilter === 'blocked') return isAndroid && isBlocked;
        if (statusFilter === 'allowed') return isAndroid && !isBlocked;
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

  // Grouped versions table (Android builds grouped by build; Web installs in their own always-allowed row)
  const versionsTable = useMemo(() => {
    const androidMap = new Map<number, { version: string; count: number }>();
    let webCount = 0;

    installs.forEach((item) => {
      const isAndroid = (item.platform || 'web').toLowerCase().includes('android');
      if (!isAndroid) {
        webCount += 1;
        return;
      }
      const b = item.build ?? 0;
      const v = item.app_version || `Build ${b}`;
      const cur = androidMap.get(b);
      if (cur) {
        cur.count += 1;
      } else {
        androidMap.set(b, { version: v, count: 1 });
      }
    });

    // Ensure latest published Android build is included in table
    if (latestBuild > 0 && !androidMap.has(latestBuild)) {
      androidMap.set(latestBuild, {
        version: latestVersionName || `v1.0.${latestBuild}`,
        count: 0,
      });
    }

    type VersionRowStatus = 'Latest' | 'Blocked' | 'Allowed' | 'Web • always allowed';
    interface VersionTableRow {
      key: string;
      isWeb: boolean;
      build: number | null;
      version: string;
      count: number;
      percentage: number;
      status: VersionRowStatus;
    }

    const total = installs.length;
    const androidList: VersionTableRow[] = Array.from(androidMap.entries()).map(([buildNum, data]) => {
      let status: VersionRowStatus = 'Allowed';
      if (buildNum >= latestBuild && latestBuild > 0) {
        status = 'Latest';
      } else if (currentMinBuild > 0 && buildNum < currentMinBuild) {
        status = 'Blocked';
      } else {
        status = 'Allowed';
      }

      return {
        key: `android-${buildNum}`,
        isWeb: false,
        build: buildNum,
        version: data.version,
        count: data.count,
        percentage: total > 0 ? (data.count / total) * 100 : 0,
        status,
      };
    });

    androidList.sort((a, b) => (b.build ?? 0) - (a.build ?? 0));

    if (webCount > 0) {
      androidList.push({
        key: 'web-always-allowed',
        isWeb: true,
        build: null,
        version: 'Web version',
        count: webCount,
        percentage: total > 0 ? (webCount / total) * 100 : 0,
        status: 'Web • always allowed',
      });
    }

    return androidList;
  }, [installs, latestBuild, latestVersionName, currentMinBuild]);

  // Read-only Minimum Version summary sentence (Android builds only; Web is always allowed)
  const minVersionSummaryText = useMemo(() => {
    if (currentMinBuild > 1) {
      return `Android blocked: builds 100 to ${currentMinBuild - 1}. Android allowed: ${currentMinBuild} and above. Web: always allowed. Latest Android: ${latestBuild}.`;
    }
    if (currentMinBuild === 1) {
      return `Android blocked: build 100. Android allowed: 101 and above. Web: always allowed. Latest Android: ${latestBuild}.`;
    }
    return `Blocked: None. Allowed: All Android builds (Web: always allowed). Latest Android: ${latestBuild}.`;
  }, [currentMinBuild, latestBuild]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#060913] text-slate-100 flex flex-col font-sans select-none overflow-hidden animate-in fade-in duration-200">
      {/* Top Header */}
      <header className="px-3.5 sm:px-6 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] border-b border-slate-800 bg-slate-950/95 backdrop-blur-md shrink-0">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 rounded-xl bg-slate-900 border border-cyan-500/35 flex items-center justify-center text-cyan-400 shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                  Developer Portal
                </h2>
                {session && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/12 border border-emerald-500/35 text-emerald-300 whitespace-nowrap shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>Admin Authenticated</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono tabular-nums truncate mt-0.5">
                {isNativeAndroid() ? `v${appVersionInfo.version} · Build ${appVersionInfo.build}` : 'Web Build'} · {BUILD_DATE}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {authStage === 'authorized' && session && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEnrollError(null);
                    setEnrollSuccess(null);
                    setShowSecurityModal(true);
                  }}
                  className={`min-h-[40px] px-3 py-2 rounded-xl border text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
                    authResult?.hasVerifiedMfa
                      ? 'bg-emerald-950/50 hover:bg-emerald-900/60 border-emerald-500/40 text-emerald-200'
                      : 'bg-cyan-950/50 hover:bg-cyan-900/70 border-cyan-500/35 text-cyan-200'
                  }`}
                  title="Security, 2FA & Active Session Settings"
                >
                  <KeyRound className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">2FA Active (AAL2)</span>
                  <span className="sm:hidden">2FA</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSignOut('global')}
                  className="min-h-[40px] px-3 sm:px-3.5 py-2 rounded-xl bg-rose-950/50 hover:bg-rose-900/70 border border-rose-500/35 text-rose-200 hover:text-white text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 active:scale-95"
                  title="Sign out from all devices and clear session"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>Sign Out</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="min-w-[40px] min-h-[40px] px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition cursor-pointer flex items-center justify-center shrink-0 active:scale-95"
              aria-label="Close Developer Portal"
              title="Close Developer Portal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      {isCheckingSession ? (
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="flex flex-col items-center gap-3 text-center">
            <RefreshCw className="w-7 h-7 text-cyan-400 animate-spin" />
            <span className="text-xs text-slate-400 font-medium tracking-wide">
              Verifying server admin credentials &amp; assurance level...
            </span>
          </div>
        </div>
      ) : authStage === 'mfa_required' ? (
        /* =========================================================================
            STATE 1B: 2FA / TOTP AUTHENTICATOR CHALLENGE
           ========================================================================= */
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/95 p-5 sm:p-7 shadow-xl space-y-5">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-950 border border-emerald-500/40 text-emerald-400 mb-1">
                <KeyRound className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">Two-Factor Verification</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Enter the 6-digit verification code from your authenticator app for{' '}
                <span className="text-slate-200 font-mono">{authResult?.user?.email || email}</span>.
              </p>
            </div>

            {mfaError && (
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{mfaError}</span>
              </div>
            )}

            <form onSubmit={handleVerifyMfa} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Authenticator Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/[^\d\s]/g, ''))}
                  placeholder="000000"
                  required
                  className="w-full min-h-[46px] px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-center font-mono text-lg tracking-[0.35em] placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none transition"
                />
              </div>

              <button
                type="submit"
                disabled={isVerifyingMfa}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isVerifyingMfa ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying 2FA...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify &amp; Unlock Portal</span>
                  </>
                )}
              </button>
            </form>

            <button
              type="button"
              onClick={() => handleSignOut('local')}
              className="w-full min-h-[40px] py-2 px-4 rounded-xl text-xs font-semibold bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            >
              Cancel &amp; Sign Out
            </button>
          </div>
        </div>
      ) : authStage === 'mfa_enrollment_required' ? (
        /* =========================================================================
            STATE 1C: MANDATORY TOTP 2FA ENROLLMENT GATE (AAL1 BLOCKED)
           ========================================================================= */
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-lg w-full rounded-2xl border border-slate-800 bg-slate-900/95 p-5 sm:p-7 shadow-xl space-y-5">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-950 border border-amber-500/40 text-amber-400 mb-1">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">Mandatory 2FA Setup Required</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every JTEC administrator (<span className="text-slate-200 font-mono">{authResult?.user?.email || email}</span>) must enroll a TOTP authenticator app before accessing device telemetry, version controls, or audit logs.
              </p>
            </div>

            {enrollError && (
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{enrollError}</span>
              </div>
            )}

            {!enrollData ? (
              <button
                type="button"
                onClick={handleStartTotpEnroll}
                disabled={isStartingEnroll}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isStartingEnroll ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Generating Authenticator QR...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>Set Up Authenticator App (TOTP)</span>
                  </>
                )}
              </button>
            ) : (
              <form onSubmit={handleConfirmTotpEnroll} className="space-y-4">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Scan this QR code with Google Authenticator, 1Password, or Authy (or copy the secret key), then enter the 6-digit code to activate AAL2 access.
                </p>

                {enrollData.qrImageSrc && (
                  <div className="flex justify-center p-3 rounded-xl bg-white w-fit mx-auto">
                    <img
                      src={enrollData.qrImageSrc}
                      alt="Authenticator QR Code"
                      className="w-40 h-40 object-contain"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                  <code className="text-[11px] font-mono text-cyan-300 break-all flex-1 select-all">
                    {enrollData.secret}
                  </code>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(enrollData.secret);
                      setCopiedSecret(true);
                      setTimeout(() => setCopiedSecret(false), 2000);
                    }}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Copy className="w-3 h-3" />
                    <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 block">6-Digit Authenticator Code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={7}
                    value={enrollCode}
                    onChange={(e) => setEnrollCode(e.target.value.replace(/[^\d\s]/g, ''))}
                    placeholder="000000"
                    required
                    className="w-full min-h-[46px] px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-center font-mono text-lg tracking-[0.35em] placeholder:text-slate-600 focus:border-emerald-400 focus:outline-none transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isConfirmingEnroll}
                  className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-xs bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isConfirmingEnroll ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Verifying &amp; Activating...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>Verify &amp; Unlock Portal</span>
                    </>
                  )}
                </button>
              </form>
            )}

            <button
              type="button"
              onClick={() => handleSignOut('local')}
              className="w-full min-h-[40px] py-2 px-4 rounded-xl text-xs font-semibold bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
            >
              Cancel &amp; Sign Out
            </button>
          </div>
        </div>
      ) : authStage !== 'authorized' || !session ? (
        /* =========================================================================
            STATE 1: ADMIN SIGN-IN SCREEN
           ========================================================================= */
        <div className="flex-1 overflow-y-auto flex items-center justify-center p-4 sm:p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-800 bg-slate-900/95 p-5 sm:p-7 shadow-xl space-y-5">
            <div className="text-center space-y-2">
              <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-slate-950 border border-cyan-500/35 text-cyan-400 mb-1">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-white tracking-tight">Developer Sign In</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Sign in with your authorized JTEC administrator account. Anonymous or non-admin accounts are rejected by server policy.
              </p>
            </div>

            {accessDenied && (
              <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{authErrorMessage || 'Access denied. Check your email, password, or admin permissions.'}</span>
              </div>
            )}

            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@jtecmusic.com"
                  autoComplete="username"
                  required
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 block">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoComplete="current-password"
                  required
                  className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none transition"
                />
              </div>

              {/* Stay signed in on this phone switch */}
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/75 border border-slate-800/80">
                <div className="space-y-0.5 min-w-0">
                  <span className="text-xs font-semibold text-white block">Stay signed in on this device</span>
                  <span className="text-[11px] text-slate-400 block">Uses session storage when off; 30m idle lock active</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={staySignedIn}
                  onClick={() => setStaySignedIn((prev) => !prev)}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    staySignedIn ? 'bg-cyan-500' : 'bg-slate-800'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      staySignedIn ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <button
                type="submit"
                disabled={isSigningIn}
                className="w-full min-h-[44px] py-2.5 px-4 rounded-xl font-bold text-xs bg-cyan-500 hover:bg-cyan-400 text-slate-950 active:scale-98 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
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

            <div className="pt-1 text-center text-[11px] text-slate-400">
              {staySignedIn
                ? 'Session expires after 7 days max or 30m portal inactivity. Password is never stored.'
                : 'Session stored in tab sessionStorage and clears on close. Password is never stored.'}
            </div>
          </div>
        </div>
      ) : (
        /* =========================================================================
            STATE 2: AUTHENTICATED TABS
           ========================================================================= */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Tab Navigation */}
          <nav className="border-b border-slate-800 bg-slate-950/80 shrink-0" aria-label="Developer Portal sections">
            <div className="max-w-6xl mx-auto px-3 sm:px-6 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveTab('usage')}
                className={`min-h-[44px] px-3.5 py-2.5 text-xs font-semibold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'usage'
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/8'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                <Users className="w-3.5 h-3.5 shrink-0" />
                <span>Usage Telemetry</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('health_logs')}
                className={`min-h-[44px] px-3.5 py-2.5 text-xs font-semibold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'health_logs'
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/8'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                <HeartPulse className="w-3.5 h-3.5 shrink-0" />
                <span>Health &amp; Logs</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('min_version');
                  refreshDiagnostics();
                }}
                className={`min-h-[44px] px-3.5 py-2.5 text-xs font-semibold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'min_version'
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/8'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                <Shield className="w-3.5 h-3.5 shrink-0" />
                <span>Minimum Version</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveTab('update_status');
                  refreshDiagnostics();
                }}
                className={`min-h-[44px] px-3.5 py-2.5 text-xs font-semibold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'update_status'
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/8'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>Update Status</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('connection')}
                className={`min-h-[44px] px-3.5 py-2.5 text-xs font-semibold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'connection'
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/8'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                <Wifi className="w-3.5 h-3.5 shrink-0" />
                <span>Connection Test</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('party_activity')}
                className={`min-h-[44px] px-3.5 py-2.5 text-xs font-semibold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'party_activity'
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/8'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                <Radio className="w-3.5 h-3.5 shrink-0" />
                <span>Party Users &amp; Activity</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('music_manager')}
                className={`min-h-[44px] px-3.5 py-2.5 text-xs font-semibold transition flex items-center gap-2 border-b-2 cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'music_manager'
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/8'
                    : 'border-transparent text-slate-400 hover:text-slate-100'
                }`}
              >
                <Music className="w-3.5 h-3.5 shrink-0" />
                <span>Music Manager</span>
              </button>
            </div>
          </nav>

          {/* Tab Panels */}
          <div className="flex-1 overflow-y-auto px-3.5 sm:px-6 py-4 sm:py-6 space-y-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
            {/* =========================================================================
                TAB 0: APPLICATION HEALTH, SUPABASE MONITORING & DEVICE LOGS
               ========================================================================= */}
            {activeTab === 'health_logs' && (() => {
              const logStats = AppLogger.getStats();
              const distinctComponents = AppLogger.getDistinctComponents();
              const distinctDates = AppLogger.getDistinctDates();
              const partyHealthSnapshot = projectSnapshots.find((p) => p.id === 'jtec_party');

              const statusBadgeStyle = (status: HealthStatus | OverallHealthStatus) => {
                switch (status) {
                  case 'HEALTHY':
                    return 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300';
                  case 'DEGRADED':
                    return 'bg-amber-500/20 border-amber-500/40 text-amber-300';
                  case 'ERROR':
                    return 'bg-rose-500/20 border-rose-500/40 text-rose-300';
                  case 'OFFLINE':
                    return 'bg-slate-700/60 border-slate-500/40 text-slate-200';
                  case 'NOT CONFIGURED':
                    return 'bg-slate-800/80 border-white/15 text-slate-400';
                  case 'NOT TESTED':
                  default:
                    return 'bg-cyan-500/15 border-cyan-500/35 text-cyan-200';
                }
              };

              const severityBadgeStyle = (sev: LogSeverity) => {
                switch (sev) {
                  case 'SUCCESS':
                    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35';
                  case 'WARNING':
                    return 'bg-amber-500/20 text-amber-300 border-amber-500/35';
                  case 'ERROR':
                    return 'bg-rose-500/20 text-rose-300 border-rose-500/35';
                  case 'INFO':
                  default:
                    return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/35';
                }
              };

              const filteredDeviceLogs =
                logViewMode === 'all'
                  ? AppLogger.getLogs({
                      severity: logSeverityFilter,
                      component: logComponentFilter,
                      project: logProjectFilter,
                      dateKey: logDateFilter,
                    })
                  : AppLogger.getLogs({
                      severity: logSeverityFilter,
                      project: selectedLogProjectTab,
                    });

              const selectedProjectAllLogs = AppLogger.getLogs({ project: selectedLogProjectTab });
              const selectedProjectSuccessCount = selectedProjectAllLogs.filter((l) => l.severity === 'SUCCESS').length;
              const selectedProjectErrorCount = selectedProjectAllLogs.filter((l) => l.severity === 'ERROR').length;

              return (
                <div className="space-y-6 max-w-6xl mx-auto" data-log-revision={logRevision}>
                  {/* Top Control Header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                        <HeartPulse className="w-5 h-5 text-cyan-400 shrink-0" />
                        <span>System Health &amp; Diagnostics</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Live health monitoring per Supabase project, JTEC Party diagnostics &amp; local device logs
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => HealthMonitorService.testPartyConnection()}
                        disabled={Boolean(partyHealthSnapshot?.isTesting)}
                        className="min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-100 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <Radio className={`w-3.5 h-3.5 text-cyan-400 ${partyHealthSnapshot?.isTesting ? 'animate-spin' : ''}`} />
                        <span>{partyHealthSnapshot?.isTesting ? 'Testing Party...' : 'Test JTEC Party'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => HealthMonitorService.refreshAllHealthChecks()}
                        disabled={overallHealth.isRefreshingAll}
                        className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${overallHealth.isRefreshingAll ? 'animate-spin' : ''}`} />
                        <span>{overallHealth.isRefreshingAll ? 'Testing All...' : 'Refresh All Checks'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Overall Application Health */}
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800/80">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-950 border border-cyan-500/35 flex items-center justify-center text-cyan-400 shrink-0">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white">Overall Application Health</h4>
                          <p className="text-xs text-slate-400 truncate">Aggregated status from tested Supabase projects, network &amp; device logs</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold border whitespace-nowrap ${statusBadgeStyle(overallHealth.status)}`}>
                        {overallHealth.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                        <span className="text-[11px] font-medium text-slate-400 block">App Version &amp; Build</span>
                        <span className="font-mono tabular-nums font-semibold text-white block break-words">
                          {isNativeAndroid() ? `v${appVersionInfo.version} (Build ${appVersionInfo.build})` : `Web · ${BUILD_DATE}`}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                        <span className="text-[11px] font-medium text-slate-400 block">Device Connection</span>
                        <span className={`font-mono font-semibold flex items-center gap-1.5 ${overallHealth.isOnline ? 'text-emerald-300' : 'text-rose-300'}`}>
                          <span className={`w-2 h-2 rounded-full ${overallHealth.isOnline ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                          <span>{overallHealth.isOnline ? 'Online' : 'Offline'}</span>
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                        <span className="text-[11px] font-medium text-slate-400 block">Last Full Health Check</span>
                        <span className="font-mono tabular-nums text-slate-200 block break-words">
                          {formatTimestamp(overallHealth.lastHealthCheckAt)}
                        </span>
                      </div>

                      <div className="p-3.5 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                        <span className="text-[11px] font-medium text-slate-400 block">Local Log Counts</span>
                        <div className="font-mono tabular-nums text-xs flex items-center gap-2 flex-wrap">
                          <span className="text-rose-300 font-semibold">{logStats.error} Err</span>
                          <span className="text-amber-300 font-semibold">{logStats.warning} Warn</span>
                          <span className="text-emerald-300 font-semibold">{logStats.success} Ok</span>
                        </div>
                      </div>
                    </div>

                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
                      <span className="text-[11px] font-semibold text-slate-400 block mb-1">
                        Most Recent Application Error (This Device)
                      </span>
                      {logStats.latestError ? (
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <div className="flex items-start sm:items-center gap-2 min-w-0 flex-wrap">
                            <span className="px-2 py-0.5 rounded bg-rose-500/15 border border-rose-500/35 text-rose-300 font-mono text-[11px] shrink-0">
                              {logStats.latestError.component}
                            </span>
                            <span className="text-rose-200 font-medium break-words">
                              {logStats.latestError.message}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono tabular-nums text-slate-400 shrink-0">
                            {formatTimestamp(logStats.latestError.timestamp)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-emerald-300/90 font-medium">No errors recorded on this device.</span>
                      )}
                    </div>
                  </section>

                  {/* Supabase Project Monitoring */}
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-cyan-400 shrink-0" />
                        <h4 className="text-sm font-bold text-white">
                          Supabase Project Monitoring
                        </h4>
                      </div>
                      <span className="text-xs text-slate-400">
                        Configured projects start as <strong className="text-cyan-300 font-mono">NOT TESTED</strong> until checked
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {projectSnapshots.map((proj) => (
                        <div
                          key={proj.id}
                          className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-5 space-y-3.5"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h5 className="text-sm font-bold text-white">{proj.name}</h5>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                                  proj.configStatus === 'CONFIGURED'
                                    ? 'bg-emerald-500/12 border-emerald-500/30 text-emerald-300'
                                    : 'bg-slate-800 border-slate-700 text-slate-400'
                                }`}>
                                  {proj.configStatus}
                                </span>
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">{proj.subtitle}</p>
                              <p className="text-[11px] font-mono text-cyan-300/90 mt-1 truncate">Host: {proj.maskedHost}</p>
                            </div>

                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${statusBadgeStyle(proj.healthStatus)}`}>
                                {proj.healthStatus}
                              </span>
                              <button
                                type="button"
                                onClick={() => HealthMonitorService.testProjectHealth(proj.id)}
                                disabled={proj.isTesting}
                                className="min-h-[34px] px-3 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-white flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                              >
                                <RefreshCw className={`w-3 h-3 ${proj.isTesting ? 'animate-spin text-cyan-400' : ''}`} />
                                <span>{proj.isTesting ? 'Testing...' : 'Test'}</span>
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2.5 text-xs pt-2 border-t border-slate-800/80">
                            <div className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800/80">
                              <span className="text-[10px] font-medium text-slate-400 block">DB Read Result</span>
                              <span className="font-mono text-[11px] text-slate-200 break-words">{proj.dbReadResult}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800/80">
                              <span className="text-[10px] font-medium text-slate-400 block">
                                {proj.id === 'jtec_party' ? 'Realtime Status' : 'Storage Test'}
                              </span>
                              <span className="font-mono text-[11px] text-slate-200 break-words">
                                {proj.id === 'jtec_party' ? proj.realtimeStatus : proj.storageTestResult}
                              </span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800/80">
                              <span className="text-[10px] font-medium text-slate-400 block">Last Successful Check</span>
                              <span className="font-mono tabular-nums text-[11px] text-slate-300 break-words">{formatTimestamp(proj.lastSuccessfulCheck)}</span>
                            </div>
                            <div className="p-2.5 rounded-xl bg-slate-950/75 border border-slate-800/80">
                              <span className="text-[10px] font-medium text-slate-400 block">Last Failed Check</span>
                              <span className="font-mono tabular-nums text-[11px] text-slate-300 break-words">{formatTimestamp(proj.lastFailedCheck)}</span>
                            </div>
                          </div>

                          <div className="space-y-1.5 text-[11px] pt-1">
                            <div className="flex items-center justify-between gap-2 text-slate-400">
                              <span className="shrink-0">Last Successful Op:</span>
                              <span className="font-mono text-emerald-300 truncate max-w-[65%]" title={proj.lastSuccessfulOperation || ''}>
                                {proj.lastSuccessfulOperation || 'None yet'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-2 text-slate-400">
                              <span className="shrink-0">Most Recent Event:</span>
                              <span className="font-mono tabular-nums text-slate-300 truncate">{formatTimestamp(proj.lastEventTimestamp)}</span>
                            </div>
                            {proj.lastErrorMessage && (
                              <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/35 text-rose-200 text-[11px] font-mono break-words">
                                Error: {proj.lastErrorMessage}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Dedicated JTEC Party Monitoring */}
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
                    <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800/80">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-950 border border-cyan-500/35 flex items-center justify-center text-cyan-400 shrink-0">
                          <Radio className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white">Dedicated JTEC Party Monitoring</h4>
                          <p className="text-xs text-slate-400 truncate">
                            Isolated project (<span className="font-mono text-cyan-300">{partyDiagnostics.maskedHost}</span>) · Real-time presence &amp; channel sync
                          </p>
                        </div>
                      </div>

                      <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border whitespace-nowrap ${
                        partyDiagnostics.connectionStatus === 'SUBSCRIBED'
                          ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                          : partyDiagnostics.connectionStatus === 'CHANNEL_ERROR' || partyDiagnostics.connectionStatus === 'TIMED_OUT'
                          ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                          : 'bg-slate-950 border-slate-700 text-slate-300'
                      }`}>
                        Room RT: {partyDiagnostics.connectionStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 text-xs">
                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-0.5 min-w-0">
                        <span className="text-[11px] text-slate-400 block">Party Config / Host</span>
                        <span className="font-mono font-semibold text-slate-100 block truncate">
                          {partyDiagnostics.isConfigured ? partyDiagnostics.maskedHost : 'NOT CONFIGURED'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-0.5">
                        <span className="text-[11px] text-slate-400 block">Online Presence Channel</span>
                        <span className="font-mono font-semibold text-cyan-300 block">
                          {partyStatus.onlineChannelState || 'DISCONNECTED'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-0.5 min-w-0">
                        <span className="text-[11px] text-slate-400 block">Online Party Users</span>
                        {typeof partyStatus.onlineUsersCount === 'number' ? (
                          <span className="font-mono tabular-nums font-bold text-emerald-300 block">
                            {partyStatus.onlineUsersCount} online (Realtime)
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-amber-300 block truncate" title={partyStatus.onlineUsersUnavailableReason || ''}>
                            Unavailable ({partyStatus.onlineUsersUnavailableReason || 'not subscribed'})
                          </span>
                        )}
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-0.5 min-w-0">
                        <span className="text-[11px] text-slate-400 block">Room Channel &amp; Code</span>
                        <span className="font-mono font-semibold text-white block truncate">
                          {partyDiagnostics.roomCode && !partyDiagnostics.isBotDemoRoom
                            ? `${partyDiagnostics.roomCode} (${partyDiagnostics.connectionStatus})`
                            : 'None'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-0.5">
                        <span className="text-[11px] text-slate-400 block">Host vs Guest Role</span>
                        <span className="font-mono font-semibold text-cyan-300 uppercase block">
                          {partyDiagnostics.role || 'None'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-0.5">
                        <span className="text-[11px] text-slate-400 block">Room Participants</span>
                        <span className="font-mono tabular-nums text-white block">
                          {partyDiagnostics.realParticipantsCount} active
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-0.5 min-w-0">
                        <span className="text-[11px] text-slate-400 block">Playback Sync &amp; Latency</span>
                        <span className="font-mono tabular-nums text-slate-200 block truncate">
                          {partyLiveState.roomCode
                            ? `${partyLiveState.role === 'host' ? 'Host' : Math.abs(partyDiagnostics.currentDriftMs) < 150 ? 'Synced' : `Adjusting (${Math.round(partyDiagnostics.currentDriftMs)}ms)`} · ${partyDiagnostics.currentLatencyMs}ms`
                            : 'Idle'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-0.5">
                        <span className="text-[11px] text-slate-400 block">Reconnect Attempts</span>
                        <span className="font-mono tabular-nums font-semibold text-slate-200 block">
                          {partyDiagnostics.reconnectAttempts}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                        <span className="text-[11px] text-slate-400 block">Last Successful Broadcast</span>
                        <span className="font-mono text-[11px] text-emerald-300 block break-words">
                          {partyDiagnostics.lastSuccessfulBroadcastAt
                            ? `${partyDiagnostics.lastSuccessfulBroadcastType || 'msg'} · ${formatTimestamp(partyDiagnostics.lastSuccessfulBroadcastAt)}`
                            : 'None'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                        <span className="text-[11px] text-slate-400 block">Last Failed Broadcast</span>
                        <span className={`font-mono text-[11px] block break-words ${partyDiagnostics.lastFailedBroadcastError ? 'text-rose-300' : 'text-slate-400'}`}>
                          {partyDiagnostics.lastFailedBroadcastError
                            ? `${partyDiagnostics.lastFailedBroadcastError} · ${formatTimestamp(partyDiagnostics.lastFailedBroadcastAt)}`
                            : 'None'}
                        </span>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                        <span className="text-[11px] text-slate-400 block">Most Recent Party Error</span>
                        <span className={`font-mono text-[11px] block break-words ${
                          partyDiagnostics.lastErrorMessage || partyStatus.lastError || partyHealthSnapshot?.lastErrorMessage
                            ? 'text-rose-300 font-semibold'
                            : 'text-slate-400'
                        }`}>
                          {partyDiagnostics.lastErrorMessage ||
                            partyStatus.lastError ||
                            partyHealthSnapshot?.lastErrorMessage ||
                            'None'}
                        </span>
                      </div>
                    </div>
                  </section>

                  {/* Structured Application Logs */}
                  <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-white">Application Logs</h4>
                          <p className="text-xs text-slate-400">
                            Device-local diagnostic stream · <span className="font-mono tabular-nums text-cyan-300">{logStats.total}</span> stored entries
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="inline-flex rounded-xl bg-slate-950 p-1 border border-slate-800">
                          <button
                            type="button"
                            onClick={() => setLogViewMode('all')}
                            className={`min-h-[32px] px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                              logViewMode === 'all' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            All Device Logs
                          </button>
                          <button
                            type="button"
                            onClick={() => setLogViewMode('by_project')}
                            className={`min-h-[32px] px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap ${
                              logViewMode === 'by_project' ? 'bg-cyan-500 text-slate-950' : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            Per-Supabase Project
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowClearLogsConfirm(true)}
                          disabled={logStats.total === 0}
                          className="min-h-[40px] px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 whitespace-nowrap"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Clear Logs</span>
                        </button>
                      </div>
                    </div>

                    {logViewMode === 'by_project' ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {projectSnapshots.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedLogProjectTab(p.id)}
                              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition cursor-pointer ${
                                selectedLogProjectTab === p.id
                                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                                  : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white'
                              }`}
                            >
                              {p.name}
                            </button>
                          ))}
                        </div>

                        <div className="flex items-center justify-between flex-wrap gap-2 p-3 rounded-2xl bg-slate-950/70 border border-white/5 text-xs">
                          <div className="flex items-center gap-3">
                            <span className="text-slate-300 font-bold">
                              Isolated logs for {projectSnapshots.find((p) => p.id === selectedLogProjectTab)?.name}
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-[10px]">
                              {selectedProjectSuccessCount} Success
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 font-mono text-[10px]">
                              {selectedProjectErrorCount} Error
                            </span>
                          </div>

                          <select
                            value={logSeverityFilter}
                            onChange={(e) => setLogSeverityFilter(e.target.value as LogSeverity | 'ALL')}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                          >
                            <option value="ALL">All Severities</option>
                            <option value="ERROR">Errors Only</option>
                            <option value="WARNING">Warnings Only</option>
                            <option value="SUCCESS">Success Only</option>
                            <option value="INFO">Info Only</option>
                          </select>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                            <Filter className="w-3 h-3" /> Severity
                          </label>
                          <select
                            value={logSeverityFilter}
                            onChange={(e) => setLogSeverityFilter(e.target.value as LogSeverity | 'ALL')}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                          >
                            <option value="ALL">All Severities</option>
                            <option value="ERROR">ERROR</option>
                            <option value="WARNING">WARNING</option>
                            <option value="SUCCESS">SUCCESS</option>
                            <option value="INFO">INFO</option>
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400 block">Component / Service</label>
                          <select
                            value={logComponentFilter}
                            onChange={(e) => setLogComponentFilter(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                          >
                            <option value="ALL">All Components</option>
                            {distinctComponents.map((comp) => (
                              <option key={comp} value={comp}>
                                {comp}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400 block">Project Scope</label>
                          <select
                            value={logProjectFilter}
                            onChange={(e) => setLogProjectFilter(e.target.value as LogProjectScope | 'ALL')}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                          >
                            <option value="ALL">All Scopes</option>
                            <option value="app">App General</option>
                            <option value="jtec_main">JTEC Music Main</option>
                            <option value="jtec_party">JTEC Party</option>
                            <option value="nasheed">Nasheed</option>
                            {HealthMonitorService.isLoveChillConfigured() && (
                              <option value="love_chill">Love & Chill</option>
                            )}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-bold uppercase text-slate-400 block">Date Range</label>
                          <select
                            value={logDateFilter}
                            onChange={(e) => setLogDateFilter(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                          >
                            <option value="ALL">All Dates</option>
                            <option value="TODAY">Today</option>
                            <option value="24H">Last 24 Hours</option>
                            <option value="7D">Last 7 Days</option>
                            {distinctDates.map((d) => (
                              <option key={d} value={d}>
                                {d}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    )}

                    <div className="max-h-96 overflow-y-auto space-y-2 p-3 rounded-xl bg-slate-950/85 border border-slate-800">
                      {filteredDeviceLogs.length === 0 ? (
                        <p className="text-xs text-slate-400 text-center py-8">
                          No log entries match the current filters on this device.
                        </p>
                      ) : (
                        filteredDeviceLogs.slice(0, 150).map((entry) => (
                          <div
                            key={entry.id}
                            className="p-3 rounded-xl bg-slate-900/90 border border-slate-800/80 space-y-1.5 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${severityBadgeStyle(entry.severity)}`}>
                                  {entry.severity}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[10px]">
                                  {entry.component}
                                </span>
                                <span className="px-2 py-0.5 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 font-mono text-[10px]">
                                  {entry.project}
                                </span>
                                <span className="text-[11px] font-mono text-slate-400">
                                  {entry.event}
                                </span>
                              </div>
                              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                                {new Date(entry.timestamp).toLocaleString()}
                              </span>
                            </div>

                            <p className="text-slate-100 leading-snug break-words">{entry.message}</p>

                            {entry.details && Object.keys(entry.details).length > 0 && (
                              <p className="text-[11px] font-mono text-slate-400 break-all">
                                {JSON.stringify(entry.details)}
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </div>
              );
            })()}

            {/* =========================================================================
                TAB 1: USAGE TELEMETRY & DEVICES LIST
               ========================================================================= */}
            {activeTab === 'usage' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-white tracking-tight">Usage Telemetry</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Real-time devices from <code className="text-cyan-300 font-mono">app_installs</code> · Auto-refreshes every 30s
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      loadUsageData();
                      loadMinVersionConfig();
                    }}
                    disabled={isLoadingUsage}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border border-slate-700/80 disabled:opacity-50 shrink-0 self-start sm:self-auto whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingUsage ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {usageError && (
                  <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200">
                    {usageError}
                  </div>
                )}

                {ownerLabelError && (
                  <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{ownerLabelError}</span>
                  </div>
                )}

                {/* Totals KPI Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 sm:p-4 flex flex-col justify-between">
                    <span className="text-xs font-medium text-slate-400">All Installs</span>
                    <div className="my-1.5">
                      <span className="text-2xl font-bold text-white font-mono tabular-nums">{totalInstalls.toLocaleString()}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">Total devices</span>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 sm:p-4 flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-slate-400">Online Now</span>
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                    </div>
                    <div className="my-1.5">
                      <span className="text-2xl font-bold text-emerald-300 font-mono tabular-nums">{onlineNowCount.toLocaleString()}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">Within 10 min</span>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 sm:p-4 flex flex-col justify-between">
                    <span className="text-xs font-medium text-slate-400">Active 24h</span>
                    <div className="my-1.5">
                      <span className="text-2xl font-bold text-cyan-300 font-mono tabular-nums">{active24hCount.toLocaleString()}</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {totalInstalls > 0 ? `${((active24hCount / totalInstalls) * 100).toFixed(0)}% of total` : '0% of total'}
                    </span>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 sm:p-4 flex flex-col justify-between">
                    <span className="text-xs font-medium text-slate-400">Active 7d</span>
                    <div className="my-1.5">
                      <span className="text-2xl font-bold text-sky-300 font-mono tabular-nums">{active7dCount.toLocaleString()}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">Past 7 days</span>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 sm:p-4 flex flex-col justify-between">
                    <span className="text-xs font-medium text-slate-400">Platform</span>
                    <div className="my-1.5 text-sm font-bold font-mono tabular-nums">
                      <span className="text-emerald-300">{androidAppCount} APK</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-cyan-300">{webAppCount} Web</span>
                    </div>
                    <span className="text-[11px] text-slate-400">Android vs Web</span>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-3.5 sm:p-4 flex flex-col justify-between">
                    <span className="text-xs font-medium text-slate-400">Access Status</span>
                    <div className="my-1.5 text-sm font-bold font-mono tabular-nums">
                      <span className="text-emerald-300">{allowedCount} Ok</span>
                      <span className="text-slate-500 mx-1">/</span>
                      <span className="text-rose-300">{blockedCount} Blk</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                      {currentMinBuild > 0 ? `Min build: ${currentMinBuild}` : 'No block active'}
                    </span>
                  </div>
                </div>

                {/* Versions & Builds (Responsive Desktop Table & Mobile Cards) */}
                <VersionsBuildsCard
                  versionsTable={versionsTable}
                  latestBuild={latestBuild}
                  latestVersionName={latestVersionName}
                  currentAppVersion={appVersionInfo.version}
                  blockActionMessage={blockActionMessage}
                  onOpenUnblockAll={() => setShowUnblockAllConfirm(true)}
                  onRequestBlockVersion={(target) => setBlockConfirmTarget(target)}
                />

                {/* Devices Directory */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-bold text-white">Devices Directory</h4>
                        <p className="text-xs text-slate-400">
                          Showing {filteredDevices.length} of {installs.length} devices · Tap status for exact timestamp
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Search and Filters Bar */}
                  <div className="grid grid-cols-2 sm:grid-cols-12 gap-2.5">
                    <div className="col-span-2 sm:col-span-4 relative">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={deviceSearch}
                        onChange={(e) => setDeviceSearch(e.target.value)}
                        placeholder="Search label, phone name, model, OS..."
                        className="w-full min-h-[40px] pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400"
                      />
                    </div>

                    <div className="col-span-1 sm:col-span-3">
                      <select
                        value={platformFilter}
                        onChange={(e: any) => setPlatformFilter(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        <option value="all">All Platforms</option>
                        <option value="android">Android App</option>
                        <option value="web">Web Browser</option>
                      </select>
                    </div>

                    <div className="col-span-1 sm:col-span-2">
                      <select
                        value={versionFilter}
                        onChange={(e) => setVersionFilter(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        <option value="all">All Versions</option>
                        {distinctVersions.map((v) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-1 sm:col-span-2">
                      <select
                        value={statusFilter}
                        onChange={(e: any) => setStatusFilter(e.target.value)}
                        className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        <option value="all">All Status</option>
                        <option value="online">Online now</option>
                        <option value="allowed">Allowed</option>
                        <option value="blocked">Blocked</option>
                      </select>
                    </div>

                    <div className="col-span-1 sm:col-span-1">
                      <button
                        type="button"
                        onClick={() => setLastSeenSortDesc(!lastSeenSortDesc)}
                        title={lastSeenSortDesc ? 'Sorting: Newest activity first' : 'Sorting: Oldest activity first'}
                        className="w-full min-h-[40px] py-2 px-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <ArrowUpDown className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="sm:hidden">Sort</span>
                      </button>
                    </div>
                  </div>

                  {/* Devices List Rows */}
                  {filteredDevices.length === 0 ? (
                    <div className="p-8 rounded-xl bg-slate-950/60 border border-slate-800 text-center text-xs text-slate-400">
                      No matching devices found.
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-0.5">
                      {filteredDevices.map((row) => {
                        const isAndroid = (row.platform || 'web').toLowerCase().includes('android');
                        const rawName = (row.device_name || row.name || '').trim();
                        const rawModel = (row.device_model || row.model || '').trim();
                        const rawMfg = (row.manufacturer || '').trim();
                        const cleanedMfgModel = cleanManufacturerAndModel(rawMfg, rawModel);
                        const phoneName = resolveDeviceDisplayName(rawName, rawMfg, rawModel, row.platform);
                        const ownerLabel = row.owner_label || 'No label';
                        const osStr = row.os || (isAndroid ? 'Android' : 'Web');
                        const isBlocked = isAndroid && currentMinBuild > 0 && (row.build === null || row.build < currentMinBuild);
                        const status = getDeviceStatus(row.last_seen);
                        const isEditingThisOwner = editingOwnerLabelId === row.install_id;
                        const isTimeExpanded = expandedTimeDeviceId === row.install_id;

                        return (
                          <div
                            key={row.install_id}
                            className="p-3.5 sm:p-4 rounded-xl bg-slate-950/75 border border-slate-800/80 hover:border-cyan-500/35 transition space-y-3"
                          >
                            {/* Top row: Owner label, Phone Name, and Badges */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                                {isEditingThisOwner ? (
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <input
                                      type="text"
                                      maxLength={60}
                                      value={editingOwnerLabelInput}
                                      onChange={(e) => setEditingOwnerLabelInput(e.target.value)}
                                      placeholder="Owner label (e.g. John's Tablet)"
                                      className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-900 border border-cyan-400 text-xs text-white font-semibold focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleSaveOwnerLabel(row.install_id)}
                                      disabled={isSavingOwnerLabel}
                                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition cursor-pointer"
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
                                      className="min-h-[34px] px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                                      title="Cancel"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                                      row.owner_label
                                        ? 'bg-amber-500/15 border-amber-500/35 text-amber-200'
                                        : 'bg-slate-900 border-slate-800 text-slate-400'
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
                                      className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-cyan-300 transition cursor-pointer"
                                      title="Edit owner label"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}

                                <span className="text-sm font-bold text-white truncate">
                                  {phoneName}
                                </span>
                              </div>

                              {/* Status, Access, Platform Badges */}
                              <div className="flex items-center gap-2 flex-wrap shrink-0">
                                <button
                                  type="button"
                                  onClick={() => setExpandedTimeDeviceId(isTimeExpanded ? null : row.install_id)}
                                  className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-semibold border flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                                    status.isOnline
                                      ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300 hover:bg-emerald-500/20'
                                      : 'bg-slate-900 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                                  }`}
                                  title="Tap to toggle exact timestamp"
                                >
                                  {status.isOnline ? (
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  ) : (
                                    <Clock className="w-3 h-3 text-slate-400" />
                                  )}
                                  <span>{status.label}</span>
                                </button>

                                {isAndroid ? (
                                  <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap ${
                                    isBlocked
                                      ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                                      : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                                  }`}>
                                    {isBlocked ? 'Blocked' : 'Allowed'}
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border whitespace-nowrap bg-cyan-500/12 border-cyan-500/35 text-cyan-300">
                                    Web · Always Allowed
                                  </span>
                                )}

                                <span className="text-[11px] font-medium text-slate-400 px-1.5">
                                  {isAndroid ? 'Android' : 'Web'}
                                </span>
                              </div>
                            </div>

                            {isTimeExpanded && (
                              <div className="p-2.5 rounded-lg bg-slate-900 border border-cyan-500/30 text-xs text-cyan-200 flex items-center justify-between gap-2 flex-wrap">
                                <span className="font-mono tabular-nums">Exact last seen: <strong>{status.exactTime}</strong></span>
                                <span className="text-[11px] text-slate-400">Tap status to hide</span>
                              </div>
                            )}

                            {/* Details Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2.5 border-t border-slate-800/80 text-xs">
                              <div className="min-w-0">
                                <span className="text-slate-400 block text-[11px]">Hardware &amp; OS</span>
                                <span className="text-slate-200 font-medium truncate block">{cleanedMfgModel}</span>
                                <span className="text-slate-400 text-[11px] block truncate">{osStr}</span>
                              </div>

                              <div className="min-w-0">
                                <span className="text-slate-400 block text-[11px]">App Version</span>
                                <span className="text-white font-mono font-semibold block truncate">
                                  {row.app_version || 'v1.0.1'}
                                </span>
                                <span className="text-cyan-300 font-mono tabular-nums text-[11px] block">
                                  Build {row.build ?? 'Unknown'}
                                </span>
                              </div>

                              <div className="min-w-0">
                                <span className="text-slate-400 block text-[11px]">First Seen</span>
                                <span className="text-slate-300 font-mono tabular-nums text-[11px] block truncate">
                                  {row.first_seen ? new Date(row.first_seen).toLocaleString() : 'N/A'}
                                </span>
                              </div>

                              <div className="sm:text-right">
                                <span className="text-slate-400 block text-[11px]">Total Opens</span>
                                <span className="text-xs font-mono tabular-nums font-semibold text-cyan-300">
                                  {(row.opens ?? 1).toLocaleString()} {row.opens === 1 ? 'open' : 'opens'}
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              </div>
            )}

            {/* =========================================================================
                TAB 2: MINIMUM VERSION (Requirement 3)
               ========================================================================= */}
            {activeTab === 'min_version' && (
              <div className="space-y-6 max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-white tracking-tight">Minimum Version &amp; Access Control</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
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
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border border-slate-700/80 disabled:opacity-50 shrink-0 self-start sm:self-auto whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingConfig ? 'animate-spin text-cyan-400' : ''}`} />
                    <span>Refresh</span>
                  </button>
                </div>

                {saveSuccessMsg && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-500/35 flex items-center gap-2.5 text-xs text-emerald-200">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>{saveSuccessMsg}</span>
                  </div>
                )}

                {saveErrorMsg && (
                  <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200 flex items-center gap-2.5">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{saveErrorMsg}</span>
                  </div>
                )}

                {/* Read-only summary card */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
                      <h4 className="text-sm font-bold text-white">Access Enforcement Summary</h4>
                    </div>
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap ${
                      currentMinBuild > 0
                        ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                        : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                    }`}>
                      {currentMinBuild > 0 ? `Enforcing Min Build ${currentMinBuild}` : 'All Builds Allowed'}
                    </span>
                  </div>

                  <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/80 border border-slate-800">
                    <p className="text-xs sm:text-sm font-mono tabular-nums font-semibold text-cyan-300 leading-relaxed break-words">
                      {minVersionSummaryText}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400 pt-1 flex-wrap gap-2">
                    <span>Configured in database: <strong className="text-white font-mono tabular-nums">{currentMinBuild}</strong></span>
                    <span>Latest published build: <strong className="text-emerald-300 font-mono tabular-nums">{latestBuild}</strong></span>
                  </div>
                </section>

                {/* Versions quick-blocking list */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-3.5">
                  <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-2.5">
                      <Layers className="w-4 h-4 text-cyan-400 shrink-0" />
                      <h4 className="text-sm font-bold text-white">Block by Version</h4>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowUnblockAllConfirm(true)}
                      className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-xs font-semibold text-slate-200 border border-slate-700/80 flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Unlock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>Unblock All</span>
                    </button>
                  </div>

                  <div className="divide-y divide-slate-800/80 text-xs">
                    {versionsTable.map((row) => {
                      const isLatest = row.status === 'Latest';
                      const isBlocked = row.status === 'Blocked';
                      const isWebRow = row.isWeb;

                      return (
                        <div key={row.key} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-white">{row.version}</span>
                            {!isWebRow && row.build !== null && (
                              <span className="font-mono tabular-nums text-cyan-300">Build {row.build}</span>
                            )}
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                              isWebRow
                                ? 'bg-cyan-500/12 border-cyan-500/35 text-cyan-300'
                                : isLatest
                                ? 'bg-sky-500/15 border-sky-400/35 text-sky-200'
                                : isBlocked
                                ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                                : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                            }`}>
                              {row.isWeb ? 'Web · Always Allowed' : row.status}
                            </span>
                            <span className="text-slate-400 text-[11px] font-mono tabular-nums">
                              · {row.count} {row.count === 1 ? 'device' : 'devices'}
                            </span>
                          </div>

                          <div className="shrink-0">
                            {isWebRow ? (
                              <span className="text-[11px] text-slate-400">Always allowed</span>
                            ) : !isLatest && row.build !== null ? (
                              <button
                                type="button"
                                onClick={() => setBlockConfirmTarget({ build: row.build!, version: row.version })}
                                className="min-h-[36px] px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 hover:text-white text-xs font-semibold transition cursor-pointer whitespace-nowrap"
                              >
                                Block &le; Build {row.build}
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400">Latest published build</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>

                {/* Manual Build Number */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
                    <h4 className="text-sm font-bold text-white">Advanced: Manual Build Number</h4>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Type a build number directly. Android phones below this number will be blocked. Cannot exceed latest published build (<span className="font-mono tabular-nums text-slate-200">{latestBuild}</span>).
                  </p>

                  <div className="flex flex-wrap items-center gap-2.5 pt-1">
                    <input
                      type="number"
                      min="0"
                      max={latestBuild}
                      step="1"
                      value={editingManualBuild}
                      onChange={(e) => setEditingManualBuild(e.target.value)}
                      placeholder={`0 - ${latestBuild}`}
                      className="w-36 min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono tabular-nums text-sm focus:border-cyan-400 focus:outline-none"
                    />

                    <button
                      type="button"
                      onClick={handleSaveManualBuild}
                      disabled={isSavingManualBuild || !editingManualBuild}
                      className="min-h-[42px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
                    >
                      {isSavingManualBuild ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving &amp; Verifying...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Apply Build</span>
                        </>
                      )}
                    </button>
                  </div>
                </section>

                {/* Message, Notes, and APK URL fields and Preview */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
                  <h4 className="text-sm font-bold text-white pb-2 border-b border-slate-800/80">
                    Update Screen Customization
                  </h4>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Update Message for Blocked Users
                    </label>
                    <textarea
                      rows={2}
                      value={editingMessage}
                      onChange={(e) => setEditingMessage(e.target.value)}
                      placeholder="An update is required to continue using JTEC MUSIC."
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:border-cyan-400 focus:outline-none resize-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <label className="text-xs font-semibold text-slate-300">
                        Release Notes Bullets (Multi-line)
                      </label>
                      <span className="text-[11px] text-slate-400">One bullet per line starting with &quot;- &quot;</span>
                    </div>
                    <textarea
                      rows={4}
                      value={editingNotes}
                      onChange={(e) => setEditingNotes(e.target.value)}
                      placeholder="- Enhanced playback performance&#10;- Fixed update download resume logic&#10;- Brand new telemetry portal"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs font-mono focus:border-cyan-400 focus:outline-none resize-y"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300 block">
                      Direct APK Download URL
                    </label>
                    <input
                      type="url"
                      value={editingApkUrl}
                      onChange={(e) => setEditingApkUrl(e.target.value)}
                      placeholder="https://github.com/fatormajohn999-gif/JTEC-music-studio-/releases/latest/download/JTEC-MUSIC.apk"
                      className="w-full min-h-[42px] px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-xs focus:border-cyan-400 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-400">
                      Leave blank to use the default latest release link.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowRequiredUpdatePreview(true)}
                      className="min-h-[44px] py-2.5 px-4 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-semibold text-xs border border-slate-700/80 transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Eye className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span>Preview Screen</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveConfigText}
                      disabled={isSavingConfig}
                      className="min-h-[44px] py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isSavingConfig ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Saving...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4 shrink-0" />
                          <span>Save Message &amp; Notes</span>
                        </>
                      )}
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* =========================================================================
                TAB 3: UPDATE STATUS & DIAGNOSTICS
               ========================================================================= */}
            {activeTab === 'update_status' && (
              <div className="space-y-6 max-w-6xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                      <Clock className="w-5 h-5 text-cyan-400 shrink-0" />
                      <span>Update Status &amp; Device Diagnostics</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Live release telemetry, visualizer performance, and update checker for this device
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      setIsCheckingNow(true);
                      try {
                        if (isNativeAndroid()) {
                          await Promise.allSettled([
                            NativeUpdateService.checkForUpdate(true),
                            checkMinimumVersion(false),
                          ]);
                        }
                        await loadLatestReleaseData();
                      } finally {
                        refreshDiagnostics();
                        setIsCheckingNow(false);
                      }
                    }}
                    disabled={isCheckingNow}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shrink-0 self-start sm:self-auto whitespace-nowrap"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isCheckingNow ? 'animate-spin' : ''}`} />
                    <span>{isCheckingNow ? 'Checking...' : 'Check now'}</span>
                  </button>
                </div>

                {/* Visualizer performance telemetry box */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-800/80">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                        <Activity className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white">Visualizer Performance</h4>
                        <p className="text-xs text-slate-400 truncate">Live frame time, draw latency, quality step &amp; particle counts</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold px-2.5 py-1 rounded-lg bg-cyan-500/12 text-cyan-300 border border-cyan-500/30 whitespace-nowrap">
                      Live Telemetry
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                      <span className="text-[11px] text-slate-400 block">Current Theme</span>
                      <span className="font-mono text-xs font-semibold text-cyan-300 block truncate">
                        {visualizerStats.theme === 'jt_night' ? 'JT Night' : visualizerStats.theme}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                      <span className="text-[11px] text-slate-400 block">Avg Frame Time</span>
                      <span className="font-mono tabular-nums text-xs font-semibold text-white block">
                        {visualizerStats.avgFrameTimeMs.toFixed(1)} ms ({visualizerStats.fps} FPS)
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                      <span className="text-[11px] text-slate-400 block">Draw Time</span>
                      <span className="font-mono tabular-nums text-xs font-semibold text-emerald-300 block">
                        {visualizerStats.drawTimeMs.toFixed(2)} ms
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                      <span className="text-[11px] text-slate-400 block">Quality Step</span>
                      <span className="font-mono text-xs font-semibold uppercase text-cyan-200 block">
                        {visualizerStats.qualityStep}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                      <span className="text-[11px] text-slate-400 block">Bubbles Drawn</span>
                      <span className="font-mono tabular-nums text-xs font-semibold text-white block">
                        {visualizerStats.bubblesCount}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                      <span className="text-[11px] text-slate-400 block">Stars Drawn</span>
                      <span className="font-mono tabular-nums text-xs font-semibold text-white block">
                        {visualizerStats.starsCount}
                      </span>
                    </div>
                  </div>
                </section>

                {/* What this phone reports */}
                <section className="rounded-2xl border border-slate-800 bg-slate-900/90 p-4 sm:p-6 space-y-4">
                  <div className="flex items-center gap-3 pb-3 border-b border-slate-800/80">
                    <div className="w-9 h-9 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                      <Smartphone className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-white">What This Device Reports</h4>
                      <p className="text-xs text-slate-400 truncate">Raw values from Device.getInfo() &amp; last ping_install telemetry</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1 min-w-0">
                      <span className="text-[11px] text-slate-400 block">name</span>
                      <span className="font-mono text-xs text-white break-words block">
                        {renderRawValue(rawDeviceInfo?.name)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1 min-w-0">
                      <span className="text-[11px] text-slate-400 block">model</span>
                      <span className="font-mono text-xs text-white break-words block">
                        {renderRawValue(rawDeviceInfo?.model)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1 min-w-0">
                      <span className="text-[11px] text-slate-400 block">manufacturer</span>
                      <span className="font-mono text-xs text-white break-words block">
                        {renderRawValue(rawDeviceInfo?.manufacturer)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1 min-w-0">
                      <span className="text-[11px] text-slate-400 block">platform</span>
                      <span className="font-mono text-xs text-white break-words block">
                        {renderRawValue(rawDeviceInfo?.platform)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1 min-w-0">
                      <span className="text-[11px] text-slate-400 block">osVersion</span>
                      <span className="font-mono text-xs text-white break-words block">
                        {renderRawValue(rawDeviceInfo?.osVersion)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1 min-w-0">
                      <span className="text-[11px] text-slate-400 block">operatingSystem</span>
                      <span className="font-mono text-xs text-white break-words block">
                        {renderRawValue(rawDeviceInfo?.operatingSystem)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1 min-w-0">
                      <span className="text-[11px] text-slate-400 block">Last Sent p_name</span>
                      <span className="font-mono text-xs text-cyan-300 font-semibold break-words block">
                        {renderRawValue(lastPingDiag.p_name)}
                      </span>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                      <span className="text-[11px] text-slate-400 block">ping_install Status</span>
                      <div className="pt-0.5">
                        {lastPingDiag.succeeded === true ? (
                          <span className="text-emerald-300 text-xs font-semibold flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Succeeded</span>
                          </span>
                        ) : lastPingDiag.succeeded === false ? (
                          <span className="text-rose-300 text-xs font-semibold flex items-center gap-1.5 break-words">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Failed {lastPingDiag.error ? `(${lastPingDiag.error})` : ''}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Not sent yet</span>
                        )}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/75 border border-slate-800/80 space-y-1">
                      <span className="text-[11px] text-slate-400 block">Last Ping Time</span>
                      <span className="font-mono tabular-nums text-xs text-slate-300 block">
                        {lastPingDiag.timestamp ? new Date(lastPingDiag.timestamp).toLocaleString() : <span className="text-slate-400 italic">Never</span>}
                      </span>
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-xs font-medium text-slate-400">
                      Installed Version &amp; Build
                    </span>
                    <div className="text-lg font-bold text-white font-mono tabular-nums">
                      {isNativeAndroid() ? (
                        <>
                          v{appVersionInfo.version} <span className="text-cyan-300 text-sm">(Build {appVersionInfo.build})</span>
                        </>
                      ) : (
                        <>
                          Web Build <span className="text-cyan-300 text-sm">({BUILD_DATE})</span>
                        </>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 block">
                      {isNativeAndroid() ? 'Read natively via App.getInfo()' : 'Web app (always allowed)'}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-xs font-medium text-slate-400">
                      Latest Published Build
                    </span>
                    <div className="text-lg font-bold text-emerald-300 font-mono tabular-nums">
                      Build {latestBuild}
                    </div>
                    <span className="text-[11px] text-slate-400 block truncate">{latestVersionName || 'From latest release'}</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-xs font-medium text-slate-400">
                      Source
                    </span>
                    <div className="text-lg font-bold text-cyan-300 font-mono truncate">
                      {updateDiag.lastSource ? updateDiag.lastSource : 'None'}
                    </div>
                    <span className="text-[11px] text-slate-400 block">latest.json or GitHub API</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-xs font-medium text-slate-400">
                      Last Check Time
                    </span>
                    <div className="text-sm font-semibold text-slate-200 font-mono tabular-nums pt-0.5">
                      {formatTimestamp(updateDiag.lastCheckTime)}
                    </div>
                    <span className="text-[11px] text-slate-400 block">Timestamp</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-xs font-medium text-slate-400">
                      Last Error
                    </span>
                    <div className={`text-xs font-mono font-semibold pt-0.5 break-words ${updateDiag.lastError ? 'text-rose-300' : 'text-slate-400'}`}>
                      {updateDiag.lastError || 'None'}
                    </div>
                    <span className="text-[11px] text-slate-400 block">Error text or code</span>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-1">
                    <span className="text-xs font-medium text-slate-400">
                      Cloud Min Build
                    </span>
                    <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                      <span className="font-mono tabular-nums text-sm text-cyan-300 font-bold">
                        {currentMinBuild > 0 ? `Build ${currentMinBuild}` : 'No Min Build'}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${
                        !isNativeAndroid()
                          ? 'bg-cyan-500/12 border-cyan-500/35 text-cyan-300'
                          : minVersionDiag.isBlocked
                          ? 'bg-rose-500/15 border-rose-500/35 text-rose-300'
                          : 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                      }`}>
                        {!isNativeAndroid()
                          ? 'Web · Always Allowed'
                          : minVersionDiag.isBlocked
                          ? 'Blocked'
                          : 'Allowed'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 block">
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
              <div className="space-y-5 max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold text-white tracking-tight">Connection Test</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Public read check across all cloud sources</p>
                  </div>

                  <button
                    type="button"
                    onClick={runConnectionTests}
                    disabled={isRunningConnectionTest}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border border-slate-700/80 disabled:opacity-50 shrink-0 self-start sm:self-auto whitespace-nowrap"
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
                        className="p-4 sm:p-5 rounded-2xl border border-slate-800 bg-slate-900/90 space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: result?.success ? '#10b981' : isPending ? '#eab308' : '#ef4444' }}
                            />
                            <div className="min-w-0">
                              <h4 className="text-sm font-bold text-white truncate">{cat.title}</h4>
                              <p className="text-xs text-slate-400 truncate">{cat.subtitle}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {isPending ? (
                              <span className="text-xs text-amber-300 font-semibold flex items-center gap-1.5 whitespace-nowrap">
                                <RefreshCw className="w-3 h-3 animate-spin" /> Testing...
                              </span>
                            ) : result ? (
                              <span
                                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border whitespace-nowrap ${
                                  result.success
                                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                                    : 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                                }`}
                              >
                                {result.success ? 'Read Works (HTTP ' + result.httpStatus + ')' : 'Failed (HTTP ' + result.httpStatus + ')'}
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Not tested yet</span>
                            )}
                          </div>
                        </div>

                        {result && (
                          <div className="pt-2.5 border-t border-slate-800/80 space-y-1.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-slate-400">
                              <span>Project Host:</span>
                              <span className="font-mono text-slate-200 break-all">{result.projectHost}</span>
                            </div>

                            {result.errorMessage && (
                              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/35 text-rose-200 text-xs mt-2 break-words">
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

            {/* =========================================================================
                TAB 5: JTEC PARTY USERS & ACTIVITY (Real Party Supabase Only)
               ========================================================================= */}
            {activeTab === 'party_activity' && (
              <PartyActivityPanel
                partyStatus={partyStatus}
                partyDiagnostics={partyDiagnostics}
                partyLiveState={partyLiveState}
                partyActivity={partyActivity}
                isLoading={isLoadingPartyActivity}
                onRefresh={loadPartyActivity}
                formatTimestamp={formatTimestamp}
              />
            )}

            {activeTab === 'music_manager' && (
              <MusicManagerPanel
                adminClient={adminClient}
                onUnauthorized={async () => {
                  const res = await verifyAdminAuthorization(adminClient, { checkInactivity: true });
                  if (res.stage === 'authorized' || res.enforcementMode === 'unavailable') {
                    return;
                  }
                  if (res.stage === 'mfa_required') {
                    setSession(null);
                    setAuthStage('mfa_required');
                    setAuthResult(res);
                    return;
                  }
                  clearSensitivePortalState();
                  setAccessDenied(true);
                  setAuthErrorMessage(res.reason || 'Admin session expired or missing 2FA (AAL2). Please sign in again.');
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Confirmation Modal for "Block this version and older" */}
      {blockConfirmTarget && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-slate-700 bg-slate-950 p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-400 shrink-0">
                  <Ban className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white">Block Version &amp; Older</h3>
                  <p className="text-xs font-mono tabular-nums text-slate-400">Target build: {blockConfirmTarget.build}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setBlockConfirmTarget(null)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-950/35 border border-rose-500/30 space-y-2 text-xs">
              <p className="text-rose-200 font-medium leading-relaxed">
                All Android phones on build {blockConfirmTarget.build} or lower will be locked and shown the update screen for {latestVersionName || `v${appVersionInfo.version}`}.
              </p>
              <p className="text-slate-400 pt-0.5">
                This will set <code className="text-cyan-300 font-mono tabular-nums">app_config.min_build = {blockConfirmTarget.build + 1}</code>.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setBlockConfirmTarget(null)}
                disabled={isBlockingVersion}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmBlockVersion}
                disabled={isBlockingVersion}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isBlockingVersion ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving &amp; Verifying...</span>
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

      {/* Confirmation Modal for "Unblock All" */}
      {showUnblockAllConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-slate-700 bg-slate-950 p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400 shrink-0">
                  <Unlock className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white">Unblock All Builds</h3>
                  <p className="text-xs font-mono text-slate-400">Sets min_build to 0</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowUnblockAllConfirm(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-emerald-950/35 border border-emerald-500/30 text-xs">
              <p className="text-emerald-200 font-medium leading-relaxed">
                Are you sure you want to unblock all versions? All devices will be allowed to use the app without requiring an update.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowUnblockAllConfirm(false)}
                disabled={isUnblockingAll}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmUnblockAll}
                disabled={isUnblockingAll}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
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

      {/* Confirmation Modal for Clear Local Device Logs */}
      {showClearLogsConfirm && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-slate-700 bg-slate-950 p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-center justify-center text-rose-400 shrink-0">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white">Clear Device Logs</h3>
                  <p className="text-xs text-slate-400">Removes saved diagnostic logs on this device</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowClearLogsConfirm(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-rose-950/35 border border-rose-500/30 text-xs text-rose-200 leading-relaxed">
              This will permanently clear all local diagnostic logs stored on this device. No database records or music files are affected.
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowClearLogsConfirm(false)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => {
                  AppLogger.clearLogs();
                  setShowClearLogsConfirm(false);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Confirm Clear Logs</span>
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

      {/* Admin Security, 2FA Enrollment & Session Management Modal */}
      {showSecurityModal && authStage === 'authorized' && session && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-700 bg-slate-950 p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center text-cyan-300 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-white">Admin Security &amp; 2FA</h3>
                  <p className="text-xs font-mono text-slate-400 truncate">
                    {authResult?.user?.email || email}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowSecurityModal(false)}
                className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                aria-label="Close security modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 block">Server Authorization</span>
                <span
                  className={`font-semibold block ${
                    authResult?.enforcementMode === 'enforced' ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {authResult?.enforcementMode === 'enforced'
                    ? 'Active (admin_users + AAL2 RLS)'
                    : 'Unavailable (SQL Migration Required)'}
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-1">
                <span className="text-[11px] text-slate-400 block">Session Assurance Level</span>
                <span className="font-mono font-semibold text-cyan-300 uppercase block">
                  {authResult?.assuranceLevel || 'aal1'}{' '}
                  {authResult?.hasVerifiedMfa ? '(2FA Protected)' : '(2FA Required)'}
                </span>
              </div>
            </div>

            {enrollError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{enrollError}</span>
              </div>
            )}

            {enrollSuccess && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/35 text-xs text-emerald-200 flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>{enrollSuccess}</span>
              </div>
            )}

            {/* Enrolled Factors */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white">Authenticator App (TOTP 2FA)</span>
                {!enrollData && (
                  <button
                    type="button"
                    onClick={handleStartTotpEnroll}
                    disabled={isStartingEnroll}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-[11px] transition cursor-pointer disabled:opacity-50"
                  >
                    {isStartingEnroll ? 'Starting...' : 'Enroll Authenticator'}
                  </button>
                )}
              </div>

              {authResult?.totpFactors && authResult.totpFactors.length > 0 ? (
                <div className="space-y-2">
                  {authResult.totpFactors.map((factor) => (
                    <div
                      key={factor.id}
                      className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-emerald-300 block truncate">
                          {factor.friendly_name || 'TOTP Authenticator'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">Status: verified</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleUnenrollFactor(factor.id)}
                        disabled={isUnenrollingId === factor.id}
                        className="px-2.5 py-1 rounded-lg bg-rose-950/50 hover:bg-rose-900/60 border border-rose-500/35 text-rose-200 text-[11px] font-semibold cursor-pointer disabled:opacity-50"
                      >
                        {isUnenrollingId === factor.id ? 'Removing...' : 'Remove'}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  No verified authenticator enrolled yet. Enroll Google Authenticator, 1Password, or Authy for AAL2 admin protection.
                </p>
              )}

              {/* Enrollment QR & Secret Step */}
              {enrollData && (
                <form onSubmit={handleConfirmTotpEnroll} className="pt-3 border-t border-slate-800 space-y-3">
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Scan this QR code with your authenticator app or copy the manual setup secret, then enter the generated 6-digit code below.
                  </p>

                  {enrollData.qrImageSrc && (
                    <div className="flex justify-center p-3 rounded-xl bg-white w-fit mx-auto">
                      <img
                        src={enrollData.qrImageSrc}
                        alt="Authenticator QR Code"
                        className="w-40 h-40 object-contain"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800">
                    <code className="text-[11px] font-mono text-cyan-300 break-all flex-1 select-all">
                      {enrollData.secret}
                    </code>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText(enrollData.secret);
                        setCopiedSecret(true);
                        setTimeout(() => setCopiedSecret(false), 2000);
                      }}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Copy className="w-3 h-3" />
                      <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={7}
                      value={enrollCode}
                      onChange={(e) => setEnrollCode(e.target.value.replace(/[^\d\s]/g, ''))}
                      placeholder="6-digit code"
                      required
                      className="flex-1 min-w-[140px] min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white font-mono text-sm text-center tracking-widest focus:border-emerald-400 focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isConfirmingEnroll}
                      className="min-h-[40px] px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-50"
                    >
                      {isConfirmingEnroll ? 'Verifying...' : 'Confirm 2FA'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEnrollData(null);
                        setEnrollCode('');
                      }}
                      className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleSignOut('global')}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/35 text-rose-200 font-bold text-xs cursor-pointer flex items-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out All Devices</span>
              </button>

              <button
                type="button"
                onClick={() => verifySession()}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                Re-verify Server Session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
