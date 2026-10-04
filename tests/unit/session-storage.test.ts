/**
 * Session Storage Utility Tests — SQL Sensi (Day 12)
 *
 * Tests for src/utils/session-storage.ts
 * Uses jest-environment jsdom (Node test env provides localStorage mock).
 */

import {
  saveSession,
  readSession,
  clearSession,
  isSessionExpired,
  msUntilExpiry,
} from '../../src/utils/session-storage';

// ─── localStorage mock ────────────────────────────────────────
// The test environment (jsdom / node) may not have localStorage.
// We provide a minimal mock so the utility functions work.
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();

Object.defineProperty(global, 'window', {
  value: { localStorage: localStorageMock },
  writable: true,
});
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// ─── Helpers ──────────────────────────────────────────────────
function futureIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}
function pastIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

// ─── Tests ────────────────────────────────────────────────────
describe('session-storage utility', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  // ── saveSession / readSession ──────────────────────────────
  it('saveSession stores token and expiresAt; readSession retrieves them', () => {
    const token = 'abc123def456';
    const expiresAt = futureIso(7 * 86400 * 1000);

    saveSession(token, expiresAt);
    const stored = readSession();

    expect(stored).not.toBeNull();
    expect(stored!.token).toBe(token);
    expect(stored!.expiresAt).toBe(expiresAt);
  });

  it('readSession returns null when nothing is stored', () => {
    expect(readSession()).toBeNull();
  });

  it('readSession returns null when token is empty string', () => {
    localStorageMock.setItem('sql_sensi_session_token', '');
    expect(readSession()).toBeNull();
  });

  // ── clearSession ───────────────────────────────────────────
  it('clearSession removes both token and expiresAt', () => {
    saveSession('mytoken', futureIso(3600_000));
    clearSession();
    expect(readSession()).toBeNull();
    expect(localStorageMock.getItem('sql_sensi_session_token')).toBeNull();
    expect(localStorageMock.getItem('sql_sensi_session_expires_at')).toBeNull();
  });

  // ── isSessionExpired ───────────────────────────────────────
  it('isSessionExpired returns false for a future expiresAt', () => {
    const session = { token: 't', expiresAt: futureIso(3600_000) };
    expect(isSessionExpired(session)).toBe(false);
  });

  it('isSessionExpired returns true for a past expiresAt', () => {
    const session = { token: 't', expiresAt: pastIso(1000) };
    expect(isSessionExpired(session)).toBe(true);
  });

  it('isSessionExpired returns true when expiresAt is empty string (fail-safe)', () => {
    const session = { token: 't', expiresAt: '' };
    expect(isSessionExpired(session)).toBe(true);
  });

  // ── msUntilExpiry ──────────────────────────────────────────
  it('msUntilExpiry returns a positive value for a future expiry', () => {
    const session = { token: 't', expiresAt: futureIso(60_000) };
    const remaining = msUntilExpiry(session);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60_000);
  });

  it('msUntilExpiry returns 0 for an already-expired session', () => {
    const session = { token: 't', expiresAt: pastIso(5000) };
    expect(msUntilExpiry(session)).toBe(0);
  });

  it('msUntilExpiry returns 0 for empty expiresAt', () => {
    const session = { token: 't', expiresAt: '' };
    expect(msUntilExpiry(session)).toBe(0);
  });

  // ── Round-trip ─────────────────────────────────────────────
  it('save → read → clear → read returns null (full round-trip)', () => {
    saveSession('roundtrip_token', futureIso(86400_000));
    expect(readSession()).not.toBeNull();
    clearSession();
    expect(readSession()).toBeNull();
  });

  // ── Overwrite ──────────────────────────────────────────────
  it('calling saveSession twice overwrites the previous value', () => {
    saveSession('old_token', pastIso(1000));
    saveSession('new_token', futureIso(3600_000));

    const stored = readSession();
    expect(stored!.token).toBe('new_token');
    expect(isSessionExpired(stored!)).toBe(false);
  });
});
