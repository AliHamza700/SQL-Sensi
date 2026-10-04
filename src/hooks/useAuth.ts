/**
 * useAuth — React Hook for Authentication State (SQL Sensi)
 *
 * Provides authentication state management for the renderer process.
 * Persists the session token in localStorage so it survives page reloads.
 * Validates the stored token against the main process on mount.
 *
 * Usage:
 *   const { user, isAuthenticated, isLoading, login, register, logout } = useAuth();
 *
 * Key types (from src/types/index.ts):
 *   AuthResult   = { user: User; session: Session }
 *   Session      = { id, userId, token, expiresAt, createdAt, isActive }
 *   ServiceResult<T> = { success: true; data: T } | { success: false; error: AppError }
 *
 * All auth calls go:
 *   Renderer → IPC bridge (preload) → main process → AuthService → SQLite
 * The renderer never touches crypto directly.
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { User, ServiceResult, AuthResult, AppError } from '@/src/types';

// ─── Storage key ─────────────────────────────────────────────
const SESSION_TOKEN_KEY = 'sql_sensi_session_token';

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

  // ── On mount: restore session from localStorage ─────────────
  useEffect(() => {
    const restore = async () => {
      const token = localStorage.getItem(SESSION_TOKEN_KEY);
      if (!token) {
        setIsLoading(false);
        return;
      }
      const auth = getAuthBridge();
      if (!auth) {
        // Running in a plain browser — skip validation
        setIsLoading(false);
        return;
      }
      try {
        // validateSession returns ServiceResult<User>
        const result = await auth.validateSession(token);
        if (result.success) {
          setUser(result.data);
        } else {
          // Token expired or invalid — clear it
          localStorage.removeItem(SESSION_TOKEN_KEY);
        }
      } catch {
        localStorage.removeItem(SESSION_TOKEN_KEY);
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
        localStorage.setItem(SESSION_TOKEN_KEY, session.token);
        setUser(loggedInUser);
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
        localStorage.setItem(SESSION_TOKEN_KEY, session.token);
        setUser(newUser);
      } else {
        setError(result.error);
      }
      return result;
    },
    []
  );

  // ── logout ───────────────────────────────────────────────────
  const logout = useCallback(async (): Promise<void> => {
    const token = localStorage.getItem(SESSION_TOKEN_KEY);
    localStorage.removeItem(SESSION_TOKEN_KEY);
    setUser(null);
    setError(null);

    if (token) {
      const auth = getAuthBridge();
      await auth?.logout(token).catch(() => {
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
    login,
    register,
    logout,
    clearError,
  };
}
