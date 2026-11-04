/**
 * Auth Session Expiry Regression Tests — SQL Sensi V2 Phase 1
 *
 * Complements auth-login.test.ts (valid / unknown / logged-out sessions) with
 * expiry behaviour, before the V2 role migration touches auth.db.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { AuthService } from '../../src/services/auth/auth.service';

const DAY_MS = 86_400_000;

describe('AuthService — session expiry (regression)', () => {
  let dbPath: string;
  let authService: AuthService;
  let token: string;
  let expiresAt: string;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `auth_session_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    authService = new AuthService(dbPath);

    const email = `session_${Date.now()}@example.com`;
    await authService.register(email, 'ValidPass1!');
    const login = await authService.login(email, 'ValidPass1!');
    if (!login.success) throw new Error('login failed');
    token = login.data.session.token;
    expiresAt = login.data.session.expiresAt;
  });

  afterEach(() => {
    authService.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('issues sessions that expire 7 days after login by default', () => {
    const lifetime = new Date(expiresAt).getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(7 * DAY_MS - 60_000);
    expect(lifetime).toBeLessThanOrEqual(7 * DAY_MS);
  });

  it('accepts a session before it expires', async () => {
    const result = await authService.validateSession(token);
    expect(result.success).toBe(true);
  });

  it('rejects a session whose expiry time has passed', async () => {
    const db = new DatabaseSync(dbPath);
    db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(
      new Date(Date.now() - 1000).toISOString(),
      token
    );
    db.close();

    const result = await authService.validateSession(token);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AUTH_ERROR');
      expect(result.error.message).toMatch(/expired/i);
    }
  });

  it('never returns password material for a valid session', async () => {
    const result = await authService.validateSession(token);
    if (!result.success) throw new Error('expected valid session');
    const keys = Object.keys(result.data);
    expect(keys).not.toEqual(expect.arrayContaining(['password_hash']));
    expect(keys).not.toEqual(expect.arrayContaining(['salt']));
  });
});

describe('AuthService — AUTH_JWT_EXPIRES_IN', () => {
  const originalValue = process.env.AUTH_JWT_EXPIRES_IN;

  afterEach(() => {
    if (originalValue === undefined) delete process.env.AUTH_JWT_EXPIRES_IN;
    else process.env.AUTH_JWT_EXPIRES_IN = originalValue;
  });

  /** Loads AuthService with a fresh AppConfig (it reads env at import time) and logs in once. */
  async function sessionLifetimeMs(envValue: string): Promise<number> {
    process.env.AUTH_JWT_EXPIRES_IN = envValue;
    let Service!: typeof AuthService;
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      Service = require('../../src/services/auth/auth.service').AuthService;
    });

    const dbPath = path.join(os.tmpdir(), `auth_ttl_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
    const service = new Service(dbPath);
    try {
      const email = `ttl_${Date.now()}@example.com`;
      await service.register(email, 'ValidPass1!');
      const login = await service.login(email, 'ValidPass1!');
      if (!login.success) throw new Error('login failed');
      return new Date(login.data.session.expiresAt).getTime() - Date.now();
    } finally {
      service.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    }
  }

  it('honours an hour-based lifetime such as "2h"', async () => {
    const lifetime = await sessionLifetimeMs('2h');
    expect(lifetime).toBeGreaterThan(2 * 3_600_000 - 60_000);
    expect(lifetime).toBeLessThanOrEqual(2 * 3_600_000);
  });

  it('treats a bare number as seconds', async () => {
    const lifetime = await sessionLifetimeMs('900');
    expect(lifetime).toBeGreaterThan(900_000 - 60_000);
    expect(lifetime).toBeLessThanOrEqual(900_000);
  });

  it('falls back to 7 days for an invalid value', async () => {
    const lifetime = await sessionLifetimeMs('forever');
    expect(lifetime).toBeGreaterThan(7 * DAY_MS - 60_000);
    expect(lifetime).toBeLessThanOrEqual(7 * DAY_MS);
  });
});
