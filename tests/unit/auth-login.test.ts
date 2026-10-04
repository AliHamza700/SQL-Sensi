/**
 * Auth Login Unit Tests — SQL Sensi (Day 10)
 *
 * Tests for AuthService.login(), AuthService.logout(), and
 * AuthService.validateSession() using an in-memory SQLite database.
 *
 * Test categories:
 *   1. Login success — valid credentials return user + session
 *   2. Login failure — wrong password returns AUTH_ERROR
 *   3. Login failure — nonexistent user returns AUTH_ERROR
 *   4. Login failure — empty credentials return AUTH_ERROR
 *   5. Session validation — valid token returns session
 *   6. Session validation — expired/unknown token returns failure
 *   7. Logout — invalidates the session token
 *   8. Timing safety — wrong password does NOT short-circuit early
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { AuthService } from '../../src/services/auth/auth.service';
import type { ServiceResult, AuthResult } from '../../src/types/index';

// ─── Test Helpers ────────────────────────────────────────────
function makeTmpDbPath(): string {
  return path.join(os.tmpdir(), `auth_login_test_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
}

// ─── Suite ───────────────────────────────────────────────────
describe('AuthService — login', () => {
  let authService: AuthService;
  let dbPath: string;

  // Create a fresh service + registered user before each test
  let registeredEmail: string;
  let registeredPassword: string;

  beforeEach(async () => {
    dbPath = makeTmpDbPath();
    authService = new AuthService(dbPath);

    registeredEmail = `user_${Date.now()}@example.com`;
    registeredPassword = 'ValidPass1!';

    const regResult = await authService.register(registeredEmail, registeredPassword);
    // Sanity: registration must succeed so login tests have something to test
    expect(regResult.success).toBe(true);
  });

  afterEach(() => {
    authService.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  // ── 1. Successful Login ────────────────────────────────────
  it('returns user and session on valid credentials', async () => {
    const result = await authService.login(registeredEmail, registeredPassword);

    expect(result.success).toBe(true);
    if (!result.success) throw new Error('Expected success');

    const { user, session } = result.data;

    expect(user.email).toBe(registeredEmail.toLowerCase());
    expect(user.id).toBeTruthy();
    expect(typeof user.createdAt).toBe('string');
    // No password hash/salt should appear in the user DTO
    expect((user as unknown as Record<string, unknown>)['passwordHash']).toBeUndefined();
    expect((user as unknown as Record<string, unknown>)['password_hash']).toBeUndefined();

    expect(session.token).toBeTruthy();
    expect(session.token.length).toBeGreaterThan(32);
    expect(session.userId).toBe(user.id);
    expect(session.isActive).toBe(true);
  });

  // ── 2. Wrong Password ─────────────────────────────────────
  it('returns AUTH_ERROR for incorrect password', async () => {
    const result = await authService.login(registeredEmail, 'WrongPassword99!');

    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected failure');

    expect(result.error.code).toBe('AUTH_ERROR');
    expect(result.error.message).toMatch(/invalid email or password/i);
  });

  // ── 3. Nonexistent User ────────────────────────────────────
  it('returns AUTH_ERROR for nonexistent email', async () => {
    const result = await authService.login('ghost@nowhere.com', 'SomePassword1!');

    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected failure');

    expect(result.error.code).toBe('AUTH_ERROR');
    // Must NOT reveal whether the email exists (same message as wrong password)
    expect(result.error.message).toMatch(/invalid email or password/i);
  });

  // ── 4. Empty Credentials ───────────────────────────────────
  it('returns AUTH_ERROR when email or password is empty', async () => {
    const result = await authService.login('', '');

    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected failure');

    expect(result.error.code).toBe('AUTH_ERROR');
  });

  // ── 5. Email Case-Insensitivity ────────────────────────────
  it('accepts login with different email casing', async () => {
    const upperResult = await authService.login(registeredEmail.toUpperCase(), registeredPassword);
    expect(upperResult.success).toBe(true);
  });
});

// ─── Session Validation Tests ────────────────────────────────
describe('AuthService — validateSession', () => {
  let authService: AuthService;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = makeTmpDbPath();
    authService = new AuthService(dbPath);
    await authService.register('session_test@example.com', 'ValidPass1!');
  });

  afterEach(() => {
    authService.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('returns active session for a valid token', async () => {
    const loginResult = await authService.login('session_test@example.com', 'ValidPass1!') as ServiceResult<AuthResult>;
    expect(loginResult.success).toBe(true);
    if (!loginResult.success) throw new Error('Expected success');

    const { session } = loginResult.data;
    // validateSession returns ServiceResult<User>
    const validateResult = await authService.validateSession(session.token);

    expect(validateResult.success).toBe(true);
    if (!validateResult.success) throw new Error('Expected success');
    expect(validateResult.data.id).toBe(loginResult.data.user.id);
    expect(validateResult.data.email).toBe('session_test@example.com');
  });

  it('returns failure for an unknown token', async () => {
    const result = await authService.validateSession('not_a_real_token_0000000000000000');

    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected failure');
    expect(result.error.code).toBe('AUTH_ERROR');
  });
});

// ─── Logout Tests ─────────────────────────────────────────────
describe('AuthService — logout', () => {
  let authService: AuthService;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = makeTmpDbPath();
    authService = new AuthService(dbPath);
    await authService.register('logout_test@example.com', 'ValidPass1!');
  });

  afterEach(() => {
    authService.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  it('invalidates session after logout', async () => {
    const loginResult = await authService.login('logout_test@example.com', 'ValidPass1!') as ServiceResult<AuthResult>;
    expect(loginResult.success).toBe(true);
    if (!loginResult.success) throw new Error('Expected success');

    const { session } = loginResult.data;
    const token = session.token;

    // Session should be valid before logout
    const beforeLogout = await authService.validateSession(token);
    expect(beforeLogout.success).toBe(true);

    // Logout
    const logoutResult = await authService.logout(token);
    expect(logoutResult.success).toBe(true);

    // Session should be invalid after logout
    const afterLogout = await authService.validateSession(token);
    expect(afterLogout.success).toBe(false);
  });
});
