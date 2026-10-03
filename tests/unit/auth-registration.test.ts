import * as fs from 'node:fs';
import * as path from 'node:path';
import { AuthService } from '../../src/services/auth/auth.service';

describe('AuthService — User Registration (Day 9)', () => {
  let authService: AuthService | null = null;
  const testDbPath = path.join(__dirname, `test_sensi_auth_${Date.now()}.db`);

  beforeEach(() => {
    authService = new AuthService(testDbPath);
  });

  afterEach(() => {
    if (authService) {
      authService.close();
      authService = null;
    }
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {
        // Ignore file lock cleanup errors in temporary test runs
      }
    }
  });

  it('should register a new user with valid email and password', async () => {
    const service = authService;
    expect(service).not.toBeNull();
    if (!service) return;

    const result = await service.register('user@example.com', 'ValidPass123');

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.user.email).toBe('user@example.com');
      expect(result.data.user.id).toBeDefined();
      expect(result.data.session.token).toHaveLength(64);
      expect(result.data.session.isActive).toBe(true);
    }
  });

  it('should reject registration with invalid email format', async () => {
    const service = authService;
    expect(service).not.toBeNull();
    if (!service) return;

    const result = await service.register('invalid-email-format', 'ValidPass123');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('AUTH_ERROR');
      expect(result.error.message).toContain('Invalid email address format');
    }
  });

  it('should reject registration with weak password (< 8 chars or missing complexity)', async () => {
    const service = authService;
    expect(service).not.toBeNull();
    if (!service) return;

    const res1 = await service.register('user@example.com', 'short');
    expect(res1.success).toBe(false);

    const res2 = await service.register('user@example.com', 'alllowercase1');
    expect(res2.success).toBe(false);

    const res3 = await service.register('user@example.com', 'ALLUPPERCASE1');
    expect(res3.success).toBe(false);
  });

  it('should prevent duplicate registration with the same email (case-insensitive)', async () => {
    const service = authService;
    expect(service).not.toBeNull();
    if (!service) return;

    const res1 = await service.register('John.Doe@Example.com', 'Password123');
    expect(res1.success).toBe(true);

    const res2 = await service.register('john.doe@example.com', 'Password123');
    expect(res2.success).toBe(false);
    if (!res2.success) {
      expect(res2.error.message).toContain('already exists');
    }
  });
});
