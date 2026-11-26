/**
 * Strict validation for audio URLs shared across JTEC Party rooms.
 * Local device paths (file://, content://, capacitor://, blob:, data:, relative paths, localhost)
 * must NEVER be broadcast or treated as playable shared audio URLs across devices.
 */

const BLOCKED_PROTOCOLS = new Set([
  'file:',
  'content:',
  'capacitor:',
  'blob:',
  'data:',
  'filesystem:',
  'ph:',
  'assets-library:',
  'javascript:',
  'vbscript:',
]);

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

export function isShareablePartyAudioUrl(url?: string | null): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed) return false;

  // Reject bare local filesystem paths or relative paths immediately
  if (
    trimmed.startsWith('/') ||
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    /^[a-zA-Z]:[\\/]/.test(trimmed)
  ) {
    return false;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (BLOCKED_PROTOCOLS.has(parsed.protocol.toLowerCase())) {
    return false;
  }

  // Only allow secure HTTPS audio streams for cross-device party playback
  if (parsed.protocol.toLowerCase() !== 'https:') {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (!host || LOCAL_HOSTNAMES.has(host)) {
    return false;
  }

  return true;
}
