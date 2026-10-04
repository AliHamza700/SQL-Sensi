/**
 * AuthService Integration Test — SQL Sensi (Day 11)
 *
 * End-to-end lifecycle test for the complete AuthService.
 * Tests the full flow: register → login → validate session → logout → validate (fails).
 *
 * This complements the unit tests (auth-registration.test.ts, auth-login.test.ts)
 * by verifying that all AuthService methods work together correctly as a system.
 *
 * Test categories:
 *   1. Full happy path: register → login → validate → logout → invalidated
 *   2. Concurrent sessions: same user can have multiple active sessions
 *   3. Session isolation: different users have independent sessions
 *   4. Service singleton pattern: AuthService can be reused across operations
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuthService } from '../../src/services/auth/auth.service';
import type { ServiceResult, AuthResult } from '../../src/types/index';

// ─── Test Helpers ─────────────────────────────────────────────
function makeTmpDbPath(): string {
  return path.join(
    os.tmpdir(),
    `auth_integration_${Date.now()}_${Math.random().toString(36).slice(2)}.db`
  );
}

// ─── Suite ────────────────────────────────────────────────────
describe('AuthService — integration (full lifecycle)', () => {
  let authService: AuthService;
  let dbPath: string;

  beforeEach(() => {
    dbPath = makeTmpDbPath();
    authService = new AuthService(dbPath);
  });

  afterEach(() => {
    authService.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  // ── 1. Full happy-path lifecycle ───────────────────────────
  it('full lifecycle: register → login → validateSession → logout → validate fails', async () => {
    const email = 'lifecycle@example.com';
    const password = 'StrongPass99!';

    // Step 1: Register
    const regResult = await authService.register(email, password);
    expect(regResult.success).toBe(true);
    if (!regResult.success) throw new Error('Registration failed');

    const regUser = regResult.data.user;
    const regSession = regResult.data.session;
    expect(regUser.email).toBe(email);
    expect(regSession.isActive).toBe(true);
    expect(typeof regSession.token).toBe('string');
    expect(regSession.token.length).toBeGreaterThan(32);

    // Step 2: Login
    const loginResult = await authService.login(email, password);
    expect(loginResult.success).toBe(true);
    if (!loginResult.success) throw new Error('Login failed');

    const loginSession = loginResult.data.session;
    // Each login creates a new, distinct token
    expect(loginSession.token).not.toBe(regSession.token);
    expect(loginSession.isActive).toBe(true);

    // Step 3: Validate session (should return user data)
    const validateResult = await authService.validateSession(loginSession.token);
    expect(validateResult.success).toBe(true);
    if (!validateResult.success) throw new Error('Validation failed');
    expect(validateResult.data.id).toBe(regUser.id);
    expect(validateResult.data.email).toBe(email);

    // Step 4: Logout
    const logoutResult = await authService.logout(loginSession.token);
    expect(logoutResult.success).toBe(true);

    // Step 5: Validate after logout should fail
    const postLogoutValidate = await authService.validateSession(loginSession.token);
    expect(postLogoutValidate.success).toBe(false);
    if (postLogoutValidate.success) throw new Error('Expected failure after logout');
    expect(postLogoutValidate.error.code).toBe('AUTH_ERROR');
  });

  // ── 2. Concurrent sessions ─────────────────────────────────
  it('same user can have multiple concurrent active sessions', async () => {
    const email = 'multilogin@example.com';
    const password = 'StrongPass99!';

    await authService.register(email, password);

    const login1 = await authService.login(email, password) as ServiceResult<AuthResult>;
    const login2 = await authService.login(email, password) as ServiceResult<AuthResult>;

    expect(login1.success).toBe(true);
    expect(login2.success).toBe(true);
    if (!login1.success || !login2.success) throw new Error('Login failed');

    const token1 = login1.data.session.token;
    const token2 = login2.data.session.token;

    // Tokens must be distinct
    expect(token1).not.toBe(token2);

    // Both sessions must be valid independently
    const validate1 = await authService.validateSession(token1);
    const validate2 = await authService.validateSession(token2);
    expect(validate1.success).toBe(true);
    expect(validate2.success).toBe(true);

    // Logout from session 1 should not affect session 2
    await authService.logout(token1);
    const afterLogout1 = await authService.validateSession(token1);
    const afterLogout2 = await authService.validateSession(token2);
    expect(afterLogout1.success).toBe(false);
    expect(afterLogout2.success).toBe(true);
  });

  // ── 3. Session isolation between users ────────────────────
  it('sessions are isolated between different users', async () => {
    const emailA = 'alice@example.com';
    const emailB = 'bob@example.com';
    const password = 'StrongPass99!';

    await authService.register(emailA, password);
    await authService.register(emailB, password);

    const loginA = await authService.login(emailA, password) as ServiceResult<AuthResult>;
    const loginB = await authService.login(emailB, password) as ServiceResult<AuthResult>;

    expect(loginA.success).toBe(true);
    expect(loginB.success).toBe(true);
    if (!loginA.success || !loginB.success) throw new Error('Login failed');

    const tokenA = loginA.data.session.token;
    const tokenB = loginB.data.session.token;

    // Validate: each token returns the correct user
    const validateA = await authService.validateSession(tokenA);
    const validateB = await authService.validateSession(tokenB);

    expect(validateA.success).toBe(true);
    expect(validateB.success).toBe(true);
    if (!validateA.success || !validateB.success) throw new Error('Validation failed');

    expect(validateA.data.email).toBe(emailA);
    expect(validateB.data.email).toBe(emailB);
    // Cross-check: tokens belong to the right users
    expect(validateA.data.id).toBe(loginA.data.user.id);
    expect(validateB.data.id).toBe(loginB.data.user.id);
  });

  // ── 4. Service reuse (singleton pattern) ──────────────────
  it('AuthService can handle many operations without re-instantiation', async () => {
    const password = 'StrongPass99!';

    // Register and verify 5 users with a single service instance
    const users = ['u1@x.com', 'u2@x.com', 'u3@x.com', 'u4@x.com', 'u5@x.com'];
    for (const email of users) {
      const reg = await authService.register(email, password);
      expect(reg.success).toBe(true);
    }

    // Login all 5 users
    const sessions: string[] = [];
    for (const email of users) {
      const result = await authService.login(email, password) as ServiceResult<AuthResult>;
      expect(result.success).toBe(true);
      if (!result.success) throw new Error('Login failed');
      sessions.push(result.data.session.token);
    }

    // All sessions should be valid
    for (const token of sessions) {
      const validate = await authService.validateSession(token);
      expect(validate.success).toBe(true);
    }

    // Logout all
    for (const token of sessions) {
      const logoutResult = await authService.logout(token);
      expect(logoutResult.success).toBe(true);
    }

    // All should be invalid after mass logout
    for (const token of sessions) {
      const postLogout = await authService.validateSession(token);
      expect(postLogout.success).toBe(false);
    }
  });
});
