/**
 * useSessionExpiry — Background Session Expiry Watcher (SQL Sensi)
 *
 * Watches the session expiry time and fires onExpired() when the
 * session token reaches its expiry, even if the user is idle.
 *
 * Mechanism:
 * - On mount (or when expiresAt changes), calculates ms until expiry.
 * - If already expired, fires onExpired() immediately (next tick).
 * - Otherwise, sets a single setTimeout that fires exactly at expiry.
 * - The timer is cancelled if the component unmounts or expiresAt changes
 *   (e.g. session was refreshed or the user logged out).
 *
 * Usage (inside AuthContext / useAuth):
 *   useSessionExpiry(session?.expiresAt ?? null, () => logout());
 *
 * Security rule: this is the ONLY mechanism that auto-invalidates the
 * client-side session. The server also enforces expiry independently via
 * AuthService.validateSession() — defence in depth.
 */

'use client';

import { useEffect, useRef } from 'react';

/**
 * @param expiresAt - ISO-8601 string when the session expires, or null if no session
 * @param onExpired - callback fired when the timer reaches expiry
 */
export function useSessionExpiry(
  expiresAt: string | null,
  onExpired: () => void
): void {
  // Keep onExpired in a ref so we never need to add it to the dependency array
  // (avoids re-scheduling the timer if the caller passes a new function reference)
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  });

  useEffect(() => {
    if (!expiresAt) return; // No active session — nothing to watch

    const expiryMs = new Date(expiresAt).getTime();
    const nowMs = Date.now();
    const remainingMs = expiryMs - nowMs;

    if (remainingMs <= 0) {
      // Already expired — fire on next tick to avoid state update during render
      const id = setTimeout(() => onExpiredRef.current(), 0);
      return () => clearTimeout(id);
    }

    // Cap at 24 hours to avoid timer issues with very large values.
    // The timer will re-schedule itself via the expiresAt dependency change
    // if the session is somehow renewed with a longer expiry.
    const safeRemaining = Math.min(remainingMs, 24 * 60 * 60 * 1000);
    const id = setTimeout(() => onExpiredRef.current(), safeRemaining);
    return () => clearTimeout(id);
  }, [expiresAt]);
}
