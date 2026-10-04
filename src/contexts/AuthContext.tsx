/**
 * AuthContext — Application-Wide Authentication State (SQL Sensi)
 *
 * Provides a React context that wraps the useAuth hook, making
 * authentication state and actions available to the entire React tree
 * without prop drilling.
 *
 * Architecture rule (architecture.md §3):
 *   Components and pages must consume auth via useAuthContext().
 *   Never import useAuth directly in page components — use this context.
 *
 * Usage:
 *   // In a page or component:
 *   const { user, isAuthenticated, login, logout } = useAuthContext();
 *
 * Provider placement:
 *   Wrap the root layout (app/layout.tsx) with <AuthProvider>.
 *   Because layout.tsx is a Server Component, AuthProvider must be
 *   'use client' and imported into a client boundary wrapper.
 */

'use client';

import React, { createContext, useContext } from 'react';
import { useAuth, UseAuthReturn } from '@/src/hooks/useAuth';

// ─── Context Type ─────────────────────────────────────────────
// Re-export UseAuthReturn as the context shape so consumers
// have a single import point.
export type AuthContextValue = UseAuthReturn;

// ─── Create Context ───────────────────────────────────────────
const AuthContext = createContext<AuthContextValue | null>(null);
AuthContext.displayName = 'AuthContext';

// ─── Provider ─────────────────────────────────────────────────
/**
 * AuthProvider — wraps the app with authentication state.
 * Place this at the root of the React tree (inside app/layout.tsx).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  return <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>;
}

// ─── Consumer Hook ────────────────────────────────────────────
/**
 * useAuthContext — primary hook for consuming auth state in components.
 *
 * Throws if called outside of AuthProvider (catches missing provider bugs
 * immediately rather than silently returning undefined).
 *
 * @example
 *   const { user, isAuthenticated, login, logout, error } = useAuthContext();
 */
export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      '[SQL Sensi] useAuthContext must be used inside <AuthProvider>. ' +
      'Make sure AuthProvider wraps your root layout.'
    );
  }
  return ctx;
}
