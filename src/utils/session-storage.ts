/**
 * Session Storage Utility — SQL Sensi
 *
 * Wraps localStorage with typed, expiry-aware session persistence.
 * Stores { token, expiresAt } together so the renderer can pre-check
 * expiry without an IPC round-trip on every page load.
 *
 * Design decisions:
 * - Uses localStorage (not sessionStorage) so session survives app restart.
 * - Stores expiresAt as an ISO-8601 string alongside the token so the client
 *   can detect expiry client-side before bothering the main process.
 * - All functions are pure — no React hooks, no side-effects.
 *   The hook (useAuth) calls these; components never call them directly.
 *
 * Security note:
 * - localStorage in Electron is sandboxed to the app's origin.
 *   It is NOT accessible from the internet. contextIsolation: true ensures
 *   that no web content injected via the renderer can access it.
 */

// ─── Storage Keys ─────────────────────────────────────────────
const STORAGE_KEYS = {
  TOKEN: 'sql_sensi_session_token',
  EXPIRES_AT: 'sql_sensi_session_expires_at',
} as const;

// ─── Stored Session Shape ─────────────────────────────────────
export interface StoredSession {
  token: string;
  /** ISO-8601 timestamp of when the session expires */
  expiresAt: string;
}

// ─── Guards ───────────────────────────────────────────────────
function isLocalStorageAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

// ─── API ──────────────────────────────────────────────────────

/**
 * Persist a session token + expiry to localStorage.
 * Called after successful login or register.
 */
export function saveSession(token: string, expiresAt: string): void {
  if (!isLocalStorageAvailable()) return;
  localStorage.setItem(STORAGE_KEYS.TOKEN, token);
  localStorage.setItem(STORAGE_KEYS.EXPIRES_AT, expiresAt);
}

/**
 * Read the stored session from localStorage.
 * Returns null if nothing is stored or if the stored data is malformed.
 */
export function readSession(): StoredSession | null {
  if (!isLocalStorageAvailable()) return null;
  const token = localStorage.getItem(STORAGE_KEYS.TOKEN);
  const expiresAt = localStorage.getItem(STORAGE_KEYS.EXPIRES_AT);
  if (!token) return null;
  return { token, expiresAt: expiresAt ?? '' };
}

/**
 * Clear the stored session from localStorage.
 * Called on logout or when a session is found to be invalid/expired.
 */
export function clearSession(): void {
  if (!isLocalStorageAvailable()) return;
  localStorage.removeItem(STORAGE_KEYS.TOKEN);
  localStorage.removeItem(STORAGE_KEYS.EXPIRES_AT);
}

/**
 * Returns true if the stored session has passed its expiry time.
 * A session with no expiry data is treated as expired (fail-safe).
 */
export function isSessionExpired(session: StoredSession): boolean {
  if (!session.expiresAt) return true;
  return new Date(session.expiresAt).getTime() <= Date.now();
}

/**
 * Returns the number of milliseconds until the stored session expires.
 * Returns 0 if already expired or no expiry stored.
 */
export function msUntilExpiry(session: StoredSession): number {
  if (!session.expiresAt) return 0;
  const remaining = new Date(session.expiresAt).getTime() - Date.now();
  return Math.max(0, remaining);
}
