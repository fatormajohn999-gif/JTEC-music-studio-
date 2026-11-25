import { SupabaseClient, Session, User, Factor } from '@supabase/supabase-js';
import {
  clearAdminAuthTokens,
  getAdminLastOpened,
  getAdminStaySignedIn,
  setAdminLastOpened,
  setAdminStaySignedIn,
  sanitizeSecretText,
} from './supabase';

// Session & security boundaries
export const ADMIN_IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes of active portal inactivity
export const ADMIN_PERSISTED_MAX_INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max persisted inactivity
export const ADMIN_SESSION_MAX_AGE_NON_PERSISTENT_MS = 12 * 60 * 60 * 1000; // 12 hours max when not staying signed in
export const ADMIN_TOKEN_REFRESH_BUFFER_MS = 60 * 1000; // Refresh JWT when <= 60s remaining

const MAX_FAILED_ATTEMPTS = 5;
const BASE_LOCKOUT_MS = 30 * 1000; // 30 seconds initial lockout after 5 failures

export type AdminAuthStage =
  | 'unauthenticated'
  | 'mfa_required'
  | 'authorized'
  | 'denied';

export type ServerEnforcementMode =
  | 'enforced'
  | 'transition_missing_sql';

export interface AdminVerifyRpcResponse {
  is_admin: boolean;
  is_anonymous?: boolean;
  role?: string | null;
  mfa_required?: boolean;
  has_verified_mfa?: boolean;
  current_aal?: string | null;
  aal_enforced?: boolean;
  user_id?: string;
  email?: string | null;
  reason?: string | null;
}

export interface AdminAuthResult {
  stage: AdminAuthStage;
  session: Session | null;
  user: User | null;
  assuranceLevel: 'aal1' | 'aal2' | null;
  nextAssuranceLevel: 'aal1' | 'aal2' | null;
  hasVerifiedMfa: boolean;
  totpFactors: Factor[];
  enforcementMode: ServerEnforcementMode;
  reason: string | null;
}

export interface TotpEnrollmentData {
  factorId: string;
  qrImageSrc: string;
  secret: string;
  uri: string;
  friendlyName: string;
}

// In-memory login throttle & activity tracking
let failedAttemptCount = 0;
let lockoutUntilMs = 0;
let lastActiveInteractionMs = Date.now();

export function touchAdminActivity(): void {
  lastActiveInteractionMs = Date.now();
}

export function getLastAdminActivity(): number {
  return lastActiveInteractionMs;
}

export function resetAdminLoginThrottle(): void {
  failedAttemptCount = 0;
  lockoutUntilMs = 0;
}

export function getAdminLoginCooldownRemainingMs(): number {
  const remaining = lockoutUntilMs - Date.now();
  return remaining > 0 ? remaining : 0;
}

function recordFailedLoginAttempt(): number {
  failedAttemptCount += 1;
  if (failedAttemptCount >= MAX_FAILED_ATTEMPTS) {
    const multiplier = Math.min(8, Math.pow(2, failedAttemptCount - MAX_FAILED_ATTEMPTS));
    lockoutUntilMs = Date.now() + BASE_LOCKOUT_MS * multiplier;
  }
  return getAdminLoginCooldownRemainingMs();
}

/**
 * Checks whether a Supabase User object is an anonymous session.
 * Anonymous users must never gain admin privileges.
 */
export function isAnonymousUser(
  user: User | null | undefined,
  amr?: Array<string | { method?: string }>
): boolean {
  if (!user) return true;
  if ((user as any).is_anonymous === true) return true;
  if (user.app_metadata?.provider === 'anonymous') return true;
  if (
    Array.isArray(user.app_metadata?.providers) &&
    user.app_metadata.providers.length === 1 &&
    user.app_metadata.providers[0] === 'anonymous'
  ) {
    return true;
  }
  if (
    Array.isArray(amr) &&
    amr.some((entry) => (typeof entry === 'string' ? entry === 'anonymous' : entry?.method === 'anonymous'))
  ) {
    return true;
  }
  return false;
}

function getAllowedAdminEmailsFromEnv(): string[] {
  const raw =
    (import.meta.env.VITE_ADMIN_ALLOWED_EMAILS as string | undefined) ||
    (import.meta.env.VITE_ADMIN_EMAIL as string | undefined) ||
    '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function isRpcMissingError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const msg = String(err.message || '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    msg.includes('could not find the function') ||
    (msg.includes('function') && msg.includes('does not exist'))
  );
}

function isPermissionDeniedError(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const status = Number((err as any).status || 0);
  const msg = String(err.message || '').toLowerCase();
  return (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    msg.includes('permission denied') ||
    msg.includes('row-level security') ||
    msg.includes('not authorized') ||
    msg.includes('jwt')
  );
}

/**
 * Normalizes a Supabase TOTP QR SVG payload into a safe data URI for <img> rendering.
 * Never returns executable URLs or raw HTML for innerHTML injection.
 */
export function toSafeQrImageSrc(rawQrCode: string): string {
  const trimmed = (rawQrCode || '').trim();
  if (trimmed.startsWith('data:image/svg+xml')) {
    return trimmed;
  }
  if (trimmed.startsWith('<svg')) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed)}`;
  }
  return '';
}

/**
 * Validates and authorizes the current admin session against the Supabase Auth server
 * and trusted database layer (`verify_admin_access` RPC + MFA Assurance Level).
 */
export async function verifyAdminAuthorization(
  client: SupabaseClient | null,
  options: { checkInactivity?: boolean } = {}
): Promise<AdminAuthResult> {
  if (!client) {
    return {
      stage: 'unauthenticated',
      session: null,
      user: null,
      assuranceLevel: null,
      nextAssuranceLevel: null,
      hasVerifiedMfa: false,
      totpFactors: [],
      enforcementMode: 'transition_missing_sql',
      reason: 'Admin client is not configured.',
    };
  }

  try {
    // 1. Check persisted inactivity expiration
    const staySignedIn = await getAdminStaySignedIn();
    const lastOpened = await getAdminLastOpened();
    const maxAllowedAge = staySignedIn
      ? ADMIN_PERSISTED_MAX_INACTIVITY_MS
      : ADMIN_SESSION_MAX_AGE_NON_PERSISTENT_MS;

    if (lastOpened && Date.now() - lastOpened > maxAllowedAge) {
      await clearAdminAuthTokens('local');
      return {
        stage: 'unauthenticated',
        session: null,
        user: null,
        assuranceLevel: null,
        nextAssuranceLevel: null,
        hasVerifiedMfa: false,
        totpFactors: [],
        enforcementMode: 'transition_missing_sql',
        reason: 'Admin session expired due to inactivity.',
      };
    }

    if (options.checkInactivity && Date.now() - lastActiveInteractionMs > ADMIN_IDLE_TIMEOUT_MS) {
      await clearAdminAuthTokens('local');
      return {
        stage: 'unauthenticated',
        session: null,
        user: null,
        assuranceLevel: null,
        nextAssuranceLevel: null,
        hasVerifiedMfa: false,
        totpFactors: [],
        enforcementMode: 'transition_missing_sql',
        reason: 'Session locked after 30 minutes of inactivity.',
      };
    }

    // 2. Read current local session
    const { data: sessionData, error: sessionErr } = await client.auth.getSession();
    if (sessionErr || !sessionData?.session) {
      return {
        stage: 'unauthenticated',
        session: null,
        user: null,
        assuranceLevel: null,
        nextAssuranceLevel: null,
        hasVerifiedMfa: false,
        totpFactors: [],
        enforcementMode: 'transition_missing_sql',
        reason: null,
      };
    }

    let activeSession = sessionData.session;

    // 3. Refresh token if expired or expiring soon
    const expiresAtMs = activeSession.expires_at ? activeSession.expires_at * 1000 : 0;
    if (expiresAtMs > 0 && expiresAtMs <= Date.now() + ADMIN_TOKEN_REFRESH_BUFFER_MS) {
      const { data: refreshData, error: refreshErr } = await client.auth.refreshSession();
      if (refreshErr || !refreshData?.session) {
        await clearAdminAuthTokens('local');
        return {
          stage: 'unauthenticated',
          session: null,
          user: null,
          assuranceLevel: null,
          nextAssuranceLevel: null,
          hasVerifiedMfa: false,
          totpFactors: [],
          enforcementMode: 'transition_missing_sql',
          reason: 'Session expired. Please sign in again.',
        };
      }
      activeSession = refreshData.session;
    }

    // 4. Server-verify JWT via auth.getUser() (prevents forged/revoked localStorage sessions)
    const { data: userData, error: userErr } = await client.auth.getUser(activeSession.access_token);
    const verifiedUser = userData?.user;
    if (userErr || !verifiedUser) {
      await clearAdminAuthTokens('local');
      return {
        stage: 'unauthenticated',
        session: null,
        user: null,
        assuranceLevel: null,
        nextAssuranceLevel: null,
        hasVerifiedMfa: false,
        totpFactors: [],
        enforcementMode: 'transition_missing_sql',
        reason: 'Session is no longer valid. Please sign in again.',
      };
    }

    // 5. Inspect MFA assurance level & factors
    let assuranceLevel: 'aal1' | 'aal2' | null = 'aal1';
    let nextAssuranceLevel: 'aal1' | 'aal2' | null = 'aal1';
    let amrMethods: Array<string | { method?: string }> = [];
    let verifiedTotpFactors: Factor[] = [];

    try {
      const { data: aalData } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalData) {
        assuranceLevel = (aalData.currentLevel as 'aal1' | 'aal2') || 'aal1';
        nextAssuranceLevel = (aalData.nextLevel as 'aal1' | 'aal2') || 'aal1';
        amrMethods = Array.isArray(aalData.currentAuthenticationMethods)
          ? aalData.currentAuthenticationMethods
          : [];
      }
      const { data: factorsData } = await client.auth.mfa.listFactors();
      if (factorsData?.totp) {
        verifiedTotpFactors = factorsData.totp.filter((f) => f.status === 'verified');
      }
    } catch {
      // MFA API errors fall back to session AAL claims if present
    }

    // 6. Strictly reject anonymous or unconfirmed accounts
    if (isAnonymousUser(verifiedUser, amrMethods)) {
      await clearAdminAuthTokens('local');
      return {
        stage: 'denied',
        session: null,
        user: null,
        assuranceLevel: null,
        nextAssuranceLevel: null,
        hasVerifiedMfa: false,
        totpFactors: [],
        enforcementMode: 'enforced',
        reason: 'Anonymous accounts are never permitted to access admin controls.',
      };
    }

    if (!verifiedUser.email || !verifiedUser.email_confirmed_at) {
      await clearAdminAuthTokens('local');
      return {
        stage: 'denied',
        session: null,
        user: null,
        assuranceLevel: null,
        nextAssuranceLevel: null,
        hasVerifiedMfa: false,
        totpFactors: [],
        enforcementMode: 'enforced',
        reason: 'Admin account email must be verified.',
      };
    }

    // 7. Enforce optional build-time email allowlist if configured
    const envAllowlist = getAllowedAdminEmailsFromEnv();
    if (envAllowlist.length > 0 && !envAllowlist.includes(verifiedUser.email.toLowerCase())) {
      await clearAdminAuthTokens('local');
      return {
        stage: 'denied',
        session: null,
        user: null,
        assuranceLevel: null,
        nextAssuranceLevel: null,
        hasVerifiedMfa: false,
        totpFactors: [],
        enforcementMode: 'enforced',
        reason: 'This account is not in the authorized administrator allowlist.',
      };
    }

    // 8. Verify admin authorization at the trusted database layer (verify_admin_access RPC)
    let enforcementMode: ServerEnforcementMode = 'enforced';
    let serverMfaRequired = false;
    const { data: rpcData, error: rpcError } = await client.rpc('verify_admin_access');

    if (!rpcError && rpcData) {
      const result = rpcData as AdminVerifyRpcResponse;
      if (result.is_admin !== true || result.is_anonymous === true) {
        await clearAdminAuthTokens('local');
        return {
          stage: 'denied',
          session: null,
          user: null,
          assuranceLevel: null,
          nextAssuranceLevel: null,
          hasVerifiedMfa: false,
          totpFactors: [],
          enforcementMode: 'enforced',
          reason: result.reason || 'Access denied: account is not an authorized JTEC administrator.',
        };
      }
      serverMfaRequired = Boolean(result.mfa_required);
    } else if (rpcError && isPermissionDeniedError(rpcError)) {
      await clearAdminAuthTokens('local');
      return {
        stage: 'denied',
        session: null,
        user: null,
        assuranceLevel: null,
        nextAssuranceLevel: null,
        hasVerifiedMfa: false,
        totpFactors: [],
        enforcementMode: 'enforced',
        reason: 'Access denied by server authorization policy.',
      };
    } else if (rpcError && isRpcMissingError(rpcError)) {
      // Transition path ONLY when the SQL migration has not yet been installed in Supabase.
      // Never use public app_config SELECT for authorization; probe protected app_installs instead.
      enforcementMode = 'transition_missing_sql';
      const hasTrustedAppMetaRole =
        verifiedUser.app_metadata?.role === 'admin' ||
        verifiedUser.app_metadata?.is_admin === true;

      if (!hasTrustedAppMetaRole) {
        const { error: installsProbeErr } = await client
          .from('app_installs')
          .select('install_id', { count: 'exact', head: true })
          .limit(1);

        if (installsProbeErr && isPermissionDeniedError(installsProbeErr)) {
          await clearAdminAuthTokens('local');
          return {
            stage: 'denied',
            session: null,
            user: null,
            assuranceLevel: null,
            nextAssuranceLevel: null,
            hasVerifiedMfa: false,
            totpFactors: [],
            enforcementMode,
            reason: 'Access denied: missing administrator permissions.',
          };
        }
      }
    } else if (rpcError) {
      await clearAdminAuthTokens('local');
      return {
        stage: 'denied',
        session: null,
        user: null,
        assuranceLevel: null,
        nextAssuranceLevel: null,
        hasVerifiedMfa: false,
        totpFactors: [],
        enforcementMode: 'enforced',
        reason: sanitizeSecretText(rpcError.message) || 'Could not verify administrator permissions.',
      };
    }

    // 9. Enforce MFA (aal2) before unlocking Portal if TOTP is enrolled or required
    const hasVerifiedMfa = verifiedTotpFactors.length > 0;
    const needsMfaStep =
      (hasVerifiedMfa && assuranceLevel !== 'aal2') ||
      (serverMfaRequired && assuranceLevel !== 'aal2') ||
      (nextAssuranceLevel === 'aal2' && assuranceLevel !== 'aal2');

    if (needsMfaStep) {
      return {
        stage: 'mfa_required',
        session: activeSession,
        user: verifiedUser,
        assuranceLevel,
        nextAssuranceLevel,
        hasVerifiedMfa,
        totpFactors: verifiedTotpFactors,
        enforcementMode,
        reason: null,
      };
    }

    // 10. All checks passed! Update activity timestamps
    await setAdminLastOpened(Date.now());
    touchAdminActivity();

    return {
      stage: 'authorized',
      session: activeSession,
      user: verifiedUser,
      assuranceLevel,
      nextAssuranceLevel,
      hasVerifiedMfa,
      totpFactors: verifiedTotpFactors,
      enforcementMode,
      reason: null,
    };
  } catch (err) {
    return {
      stage: 'unauthenticated',
      session: null,
      user: null,
      assuranceLevel: null,
      nextAssuranceLevel: null,
      hasVerifiedMfa: false,
      totpFactors: [],
      enforcementMode: 'enforced',
      reason: sanitizeSecretText(err) || 'Session verification error.',
    };
  }
}

/**
 * Performs email/password sign-in followed by strict server-verified admin & MFA checks.
 */
export async function signInAdminWithPassword(
  client: SupabaseClient | null,
  email: string,
  password: string,
  staySignedIn: boolean
): Promise<AdminAuthResult> {
  const cooldownMs = getAdminLoginCooldownRemainingMs();
  if (cooldownMs > 0) {
    const secs = Math.ceil(cooldownMs / 1000);
    return {
      stage: 'denied',
      session: null,
      user: null,
      assuranceLevel: null,
      nextAssuranceLevel: null,
      hasVerifiedMfa: false,
      totpFactors: [],
      enforcementMode: 'enforced',
      reason: `Too many failed sign-in attempts. Wait ${secs}s before trying again.`,
    };
  }

  if (!client || !email.trim() || !password) {
    return {
      stage: 'denied',
      session: null,
      user: null,
      assuranceLevel: null,
      nextAssuranceLevel: null,
      hasVerifiedMfa: false,
      totpFactors: [],
      enforcementMode: 'enforced',
      reason: 'Please enter a valid email and password.',
    };
  }

  // Persist staySignedIn preference BEFORE creating the session so the storage adapter
  // routes non-persistent Web logins into sessionStorage instead of localStorage.
  await setAdminStaySignedIn(staySignedIn);
  await setAdminLastOpened(Date.now());
  touchAdminActivity();

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.session) {
    const waitMs = recordFailedLoginAttempt();
    await clearAdminAuthTokens('local');
    const baseMsg = 'Invalid credentials or unauthorized account.';
    return {
      stage: 'denied',
      session: null,
      user: null,
      assuranceLevel: null,
      nextAssuranceLevel: null,
      hasVerifiedMfa: false,
      totpFactors: [],
      enforcementMode: 'enforced',
      reason:
        waitMs > 0
          ? `${baseMsg} Too many attempts — locked for ${Math.ceil(waitMs / 1000)}s.`
          : baseMsg,
    };
  }

  const authResult = await verifyAdminAuthorization(client, { checkInactivity: false });
  if (authResult.stage === 'authorized' || authResult.stage === 'mfa_required') {
    resetAdminLoginThrottle();
    if (authResult.stage === 'authorized') {
      await recordAdminAuditEvent(client, 'admin_login_verified', {
        assurance_level: authResult.assuranceLevel,
        enforcement_mode: authResult.enforcementMode,
      });
    }
  } else {
    recordFailedLoginAttempt();
  }

  return authResult;
}

/**
 * Verifies a 6-digit TOTP code against the admin's enrolled Supabase MFA factor,
 * elevating the JWT to AAL2 and re-verifying admin access.
 */
export async function verifyAdminMfaChallenge(
  client: SupabaseClient | null,
  factorId: string,
  rawCode: string
): Promise<AdminAuthResult> {
  if (!client) {
    return {
      stage: 'unauthenticated',
      session: null,
      user: null,
      assuranceLevel: null,
      nextAssuranceLevel: null,
      hasVerifiedMfa: false,
      totpFactors: [],
      enforcementMode: 'enforced',
      reason: 'Admin client is unavailable.',
    };
  }

  const cleanCode = rawCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return {
      stage: 'mfa_required',
      session: null,
      user: null,
      assuranceLevel: 'aal1',
      nextAssuranceLevel: 'aal2',
      hasVerifiedMfa: true,
      totpFactors: [],
      enforcementMode: 'enforced',
      reason: 'Enter the 6-digit code from your authenticator app.',
    };
  }

  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId,
    code: cleanCode,
  });

  if (error) {
    recordFailedLoginAttempt();
    return {
      stage: 'mfa_required',
      session: null,
      user: null,
      assuranceLevel: 'aal1',
      nextAssuranceLevel: 'aal2',
      hasVerifiedMfa: true,
      totpFactors: [],
      enforcementMode: 'enforced',
      reason: 'Invalid or expired authenticator code. Try the latest 6-digit code.',
    };
  }

  resetAdminLoginThrottle();
  const result = await verifyAdminAuthorization(client, { checkInactivity: false });
  if (result.stage === 'authorized') {
    await recordAdminAuditEvent(client, 'admin_mfa_verified', {
      assurance_level: result.assuranceLevel,
      factor_id: factorId,
    });
  }
  return result;
}

/**
 * Starts TOTP 2FA enrollment using Supabase Auth native MFA.
 */
export async function enrollAdminTotpMfa(
  client: SupabaseClient | null,
  friendlyName = 'JTEC Admin Authenticator'
): Promise<{ data: TotpEnrollmentData | null; error: string | null }> {
  if (!client) return { data: null, error: 'Admin client unavailable.' };

  // Clean up any stale unverified TOTP factors so re-enrollment succeeds cleanly
  try {
    const { data: existingFactors } = await client.auth.mfa.listFactors();
    const unverified = (existingFactors?.all || []).filter(
      (f) => f.factor_type === 'totp' && (f.status as string) !== 'verified'
    );
    for (const stale of unverified) {
      await client.auth.mfa.unenroll({ factorId: stale.id }).catch(() => {});
    }
  } catch {
    // proceed to enroll
  }

  const uniqueName = `${friendlyName} (${new Date().toISOString().slice(0, 10)})`;
  const { data, error } = await client.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: uniqueName,
    issuer: 'JTEC MUSIC Admin',
  });

  if (error || !data || data.type !== 'totp') {
    const raw = sanitizeSecretText(error?.message || 'Could not start 2FA enrollment.');
    const lower = raw.toLowerCase();
    if (lower.includes('disabled') || lower.includes('not enabled')) {
      return {
        data: null,
        error:
          'TOTP MFA is currently disabled in Supabase Auth settings. Enable Time-based One-Time Password (TOTP) under Authentication -> Multi-Factor Auth in your jtec_main Supabase dashboard.',
      };
    }
    return { data: null, error: raw };
  }

  return {
    data: {
      factorId: data.id,
      qrImageSrc: toSafeQrImageSrc(data.totp.qr_code),
      secret: data.totp.secret,
      uri: data.totp.uri,
      friendlyName: data.friendly_name || uniqueName,
    },
    error: null,
  };
}

/**
 * Confirms TOTP enrollment by verifying the first 6-digit code from the authenticator app.
 */
export async function confirmAdminTotpEnrollment(
  client: SupabaseClient | null,
  factorId: string,
  rawCode: string
): Promise<{ success: boolean; error: string | null }> {
  if (!client) return { success: false, error: 'Admin client unavailable.' };
  const cleanCode = rawCode.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(cleanCode)) {
    return { success: false, error: 'Enter the 6-digit code from your authenticator app.' };
  }

  const { error } = await client.auth.mfa.challengeAndVerify({
    factorId,
    code: cleanCode,
  });

  if (error) {
    return {
      success: false,
      error: sanitizeSecretText(error.message) || 'Code verification failed. Check device time sync and try again.',
    };
  }

  await recordAdminAuditEvent(client, 'admin_mfa_enrolled', { factor_id: factorId });
  return { success: true, error: null };
}

/**
 * Removes an enrolled TOTP factor (Supabase requires an active AAL2 session).
 */
export async function unenrollAdminTotpMfa(
  client: SupabaseClient | null,
  factorId: string
): Promise<{ success: boolean; error: string | null }> {
  if (!client) return { success: false, error: 'Admin client unavailable.' };

  const { error } = await client.auth.mfa.unenroll({ factorId });
  if (error) {
    return {
      success: false,
      error: sanitizeSecretText(error.message) || 'Could not remove 2FA factor. Ensure you are verified with 2FA (AAL2).',
    };
  }

  await recordAdminAuditEvent(client, 'admin_mfa_unenrolled', { factor_id: factorId });
  return { success: true, error: null };
}

/**
 * Pre-flight session check executed immediately before any sensitive admin write operation.
 * Ensures the session is non-anonymous, not expired, not idle-timed-out, and at AAL2 if MFA is enrolled.
 */
export async function assertActiveAdminSession(client: SupabaseClient | null): Promise<{
  ok: boolean;
  reason?: string;
}> {
  const result = await verifyAdminAuthorization(client, { checkInactivity: true });
  if (result.stage !== 'authorized') {
    return {
      ok: false,
      reason: result.reason || 'Admin session expired or lacks authorization. Please re-authenticate.',
    };
  }
  touchAdminActivity();
  return { ok: true };
}

/**
 * Performs complete admin sign-out: server-side token revocation + local storage wipe.
 */
export async function signOutAdmin(
  client: SupabaseClient | null,
  scope: 'global' | 'local' = 'global'
): Promise<void> {
  if (client) {
    await recordAdminAuditEvent(client, 'admin_logout', { scope }).catch(() => {});
  }
  await clearAdminAuthTokens(scope);
}

/**
 * Records an admin security or configuration change in the server audit log (non-blocking).
 */
export async function recordAdminAuditEvent(
  client: SupabaseClient | null,
  action: string,
  details: Record<string, unknown> = {}
): Promise<void> {
  if (!client) return;
  try {
    await client.rpc('log_admin_action', {
      p_action: action,
      p_details: details,
    });
  } catch {
    // Ignore when audit RPC has not been applied yet
  }
}
