/**
 * useAuth — React Hook for Authentication State (SQL Sensi)
 *
 * Provides authentication state management for the renderer process.
 *
 * Day 12 upgrades over Day 10 implementation:
 * - Uses session-storage util (token + expiresAt stored together)
 * - Client-side expiry pre-check on restore (skips IPC if already expired)
 * - Plugs in useSessionExpiry to auto-logout when the session timer fires
 * - Exposes sessionExpiresAt on the return value for UI countdown display
 *
 * Key types (from src/types/index.ts):
 *   AuthResult      = { user: User; session: Session }
 *   Session         = { id, userId, token, expiresAt, createdAt, isActive }
 *   ServiceResult<T> = { success: true; data: T } | { success: false; error: AppError }
 *
 * All auth calls go:
 *   Renderer → IPC bridge (preload) → main process → AuthService → SQLite
 * The renderer never touches crypto directly.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { User, ServiceResult, AuthResult, AppError } from '@/src/types';
import {
  saveSession,
  readSession,
  clearSession,
  isSessionExpired,
} from '@/src/utils/session-storage';
import { useSessionExpiry } from './useSessionExpiry';

// ─── Hook Return Type ─────────────────────────────────────────
export interface UseAuthReturn {
  /** Currently authenticated user, or null if not logged in */
  user: User | null;
  /** Whether a valid session is active */
  isAuthenticated: boolean;
  /** True while the hook is resolving the stored token on mount */
  isLoading: boolean;
  /** Last auth error, cleared on next successful action */
  error: AppError | null;
  /** ISO-8601 expiry time of the current session, or null */
  sessionExpiresAt: string | null;

  login: (email: string, password: string) => Promise<ServiceResult<AuthResult>>;
  register: (email: string, password: string) => Promise<ServiceResult<AuthResult>>;
  logout: () => Promise<void>;
  clearError: () => void;
}

// ─── IPC bridge guard ─────────────────────────────────────────
function getAuthBridge() {
  if (typeof window === 'undefined') return null;
  return window.electronAPI?.auth ?? null;
}

// ─── Hook ─────────────────────────────────────────────────────
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AppError | null>(null);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);

  // ── Auto-logout when session timer fires ─────────────────────
  // useSessionExpiry schedules a single setTimeout that fires at expiresAt.
  // On expiry, we call logout() to clear local state + revoke server-side.
  const handleExpiry = useCallback(() => {
    clearSession();
    setUser(null);
    setSessionExpiresAt(null);
    // Intentionally NOT calling auth bridge logout here — the session is
    // already expired server-side; the IPC call would just be noise.
  }, []);

  useSessionExpiry(sessionExpiresAt, handleExpiry);

  // ── On mount: restore session from localStorage ─────────────
  useEffect(() => {
    const restore = async () => {
      const stored = readSession();

      // No stored token at all
      if (!stored) {
        setIsLoading(false);
        return;
      }

      // Client-side expiry pre-check — avoids wasting an IPC round-trip
      if (isSessionExpired(stored)) {
        clearSession();
        setIsLoading(false);
        return;
      }

      const auth = getAuthBridge();
      if (!auth) {
        // Running in a plain browser (dev preview) — skip IPC validation
        setIsLoading(false);
        return;
      }

      try {
        // Server-side validation (defence in depth: server is the source of truth)
        const result = await auth.validateSession(stored.token);
        if (result.success) {
          setUser(result.data);
          setSessionExpiresAt(stored.expiresAt);
        } else {
          // Token rejected by server — clear it
          clearSession();
        }
      } catch {
        clearSession();
      } finally {
        setIsLoading(false);
      }
    };
    restore();
  }, []);

  // ── login ────────────────────────────────────────────────────
  const login = useCallback(
    async (email: string, password: string): Promise<ServiceResult<AuthResult>> => {
      setError(null);
      const auth = getAuthBridge();
      if (!auth) {
        const err: AppError = {
          code: 'AUTH_ERROR',
          message: 'Auth bridge unavailable — not running in Electron',
        };
        setError(err);
        return { success: false, error: err };
      }

      const result = await auth.login(email, password);
      if (result.success) {
        const { user: loggedInUser, session } = result.data;
        saveSession(session.token, session.expiresAt);
        setUser(loggedInUser);
        setSessionExpiresAt(session.expiresAt);
      } else {
        setError(result.error);
      }
      return result;
    },
    []
  );

  // ── register ─────────────────────────────────────────────────
  const register = useCallback(
    async (email: string, password: string): Promise<ServiceResult<AuthResult>> => {
      setError(null);
      const auth = getAuthBridge();
      if (!auth) {
        const err: AppError = {
          code: 'AUTH_ERROR',
          message: 'Auth bridge unavailable — not running in Electron',
        };
        setError(err);
        return { success: false, error: err };
      }

      const result = await auth.register(email, password);
      if (result.success) {
        const { user: newUser, session } = result.data;
        saveSession(session.token, session.expiresAt);
        setUser(newUser);
        setSessionExpiresAt(session.expiresAt);
      } else {
        setError(result.error);
      }
      return result;
    },
    []
  );

  // ── logout ───────────────────────────────────────────────────
  const logout = useCallback(async (): Promise<void> => {
    const stored = readSession();
    clearSession();
    setUser(null);
    setSessionExpiresAt(null);
    setError(null);

    if (stored?.token) {
      const auth = getAuthBridge();
      await auth?.logout(stored.token).catch(() => {
        // Swallow — local state is already cleared regardless of server result
      });
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    user,
    isAuthenticated: user !== null,
    isLoading,
    error,
    sessionExpiresAt,
    login,
    register,
    logout,
    clearError,
  };
}
