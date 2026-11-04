/**
 * Authentication Service Implementation — SQL Sensi
 *
 * Implements IAuthService using Node.js built-in `node:sqlite` (DatabaseSync)
 * for the internal application store (`sensi_app.db`).
 *
 * Security features (AUTH_DESIGN.md §3, PRD.md §5):
 * - Passwords hashed via scrypt (64-byte key + 16-byte random salt)
 * - Timing-safe password comparisons
 * - Case-insensitive email uniqueness check
 * - Strict DTO projection (password hash & salt never cross service boundary)
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { IAuthService } from '@/src/services/interfaces';
import type {
  User,
  UserRecord,
  Session,
  SessionRecord,
  AuthResult,
  ServiceResult,
} from '@/src/types';
import { AppConfig } from '@/src/config';
import { AUTH_TABLES_SQL, AUTH_SCHEMA_VERSION, isValidEmail, validatePasswordStrength } from './auth.schema';
import type { UserRole } from '@/src/types';
import { hashPassword, verifyPassword, generateSessionToken } from '@/src/utils/crypto';
import { createError } from '@/src/utils/errors';
import { parseDurationToSeconds } from '@/src/utils';

/** Used when AUTH_JWT_EXPIRES_IN is missing or invalid */
const DEFAULT_SESSION_SECONDS = 7 * 86400;

export class AuthService implements IAuthService {
  private db: DatabaseSync | null = null;
  private dbPath: string;

  constructor(customDbPath?: string) {
    if (customDbPath) {
      this.dbPath = customDbPath;
    } else {
      const appDir = AppConfig.database.appDataDir;
      if (!fs.existsSync(appDir)) {
        fs.mkdirSync(appDir, { recursive: true });
      }
      this.dbPath = path.join(appDir, 'sensi_app.db');
    }
    this.initDatabase();
  }

  /**
   * Initializes internal SQLite database connection and DDL tables.
   */
  private initDatabase(): void {
    if (!this.db) {
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.db.exec(AUTH_TABLES_SQL);
      this.migrate(this.db);
    }
  }

  /**
   * Brings an existing auth DB up to the current schema version (V2 Phase 6:
   * add `users.role`, promote the first account to admin). A pre-V2 DB is
   * backed up with `VACUUM INTO` before any ALTER. Idempotent and gated by
   * PRAGMA user_version, so it is a no-op on an already-migrated or fresh DB.
   */
  private migrate(db: DatabaseSync): void {
    const versionRow = db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined;
    const version = Number(versionRow?.user_version ?? 0);
    if (version >= AUTH_SCHEMA_VERSION) return;

    // Does the role column already exist? (fresh DBs created with the new DDL do)
    const columns = db.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
    const hasRole = columns.some((c) => c.name === 'role');

    if (!hasRole) {
      // An existing V1 DB is about to be altered — back it up first.
      try {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        db.exec(`VACUUM INTO '${this.dbPath.replace(/'/g, "''")}.backup-authv0-${stamp}'`);
      } catch (e) {
        console.warn('[AuthService] Could not back up before migration:', e);
      }
      db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'standard'");
    }

    // Promote the earliest account to admin if none is set yet (existing users).
    const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
    if (!admin) {
      const first = db.prepare('SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1').get() as { id?: string } | undefined;
      if (first?.id) {
        db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(first.id);
      }
    }

    db.exec(`PRAGMA user_version = ${AUTH_SCHEMA_VERSION}`);
  }

  /**
   * Safe accessor for initialized database instance.
   */
  private getDb(): DatabaseSync {
    this.initDatabase();
    if (!this.db) {
      throw new Error('Database initialization failed');
    }
    return this.db;
  }

  /**
   * Registers a new user account with email and password.
   */
  public async register(
    email: string,
    password: string
  ): Promise<ServiceResult<AuthResult>> {
    try {
      const db = this.getDb();
      const normalizedEmail = email.trim().toLowerCase();

      // 1. Input Validation — Email format
      if (!isValidEmail(normalizedEmail)) {
        return {
          success: false,
          error: createError(
            'AUTH_ERROR',
            'Invalid email address format.',
            'Please enter a valid email address (e.g. user@example.com).'
          ),
        };
      }

      // 2. Input Validation — Password strength
      const pwdStrength = validatePasswordStrength(password);
      if (!pwdStrength.valid) {
        return {
          success: false,
          error: createError(
            'AUTH_ERROR',
            pwdStrength.reason || 'Password does not meet strength requirements.',
            'Password must be at least 8 characters long and contain uppercase, lowercase, and numeric characters.'
          ),
        };
      }

      // 3. Duplicate Email Check
      const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
      const existingUser = checkStmt.get(normalizedEmail);

      if (existingUser) {
        return {
          success: false,
          error: createError(
            'AUTH_ERROR',
            'An account with this email address already exists.',
            'If you already have an account, please log in instead.'
          ),
        };
      }

      // 4. Hash Password & Prepare User Record
      const userId = randomUUID();
      const nowIso = new Date().toISOString();
      const { hash, salt } = hashPassword(password);

      // The first account ever created becomes the administrator (V2 Phase 6).
      const userCount = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
      const role: UserRole = userCount === 0 ? 'admin' : 'standard';

      const insertUserStmt = db.prepare(`
        INSERT INTO users (id, email, password_hash, salt, role, created_at, updated_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertUserStmt.run(
        userId,
        normalizedEmail,
        hash,
        salt,
        role,
        nowIso,
        nowIso,
        nowIso
      );

      // 5. Create Active Session
      const sessionId = randomUUID();
      const token = generateSessionToken();
      const expiresInSec = parseDurationToSeconds(AppConfig.auth.jwtExpiresIn) ?? DEFAULT_SESSION_SECONDS;
      const expiresAtIso = new Date(Date.now() + expiresInSec * 1000).toISOString();

      const insertSessionStmt = db.prepare(`
        INSERT INTO sessions (id, user_id, token, expires_at, created_at, is_active, last_active_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `);

      insertSessionStmt.run(
        sessionId,
        userId,
        token,
        expiresAtIso,
        nowIso,
        nowIso
      );

      // 6. Project DTOs (Zero plaintext secrets)
      const user: User = {
        id: userId,
        email: normalizedEmail,
        role,
        createdAt: nowIso,
        updatedAt: nowIso,
        lastLoginAt: nowIso,
      };

      const session: Session = {
        id: sessionId,
        userId,
        token,
        expiresAt: expiresAtIso,
        createdAt: nowIso,
        isActive: true,
      };

      return {
        success: true,
        data: { user, session },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown database error during registration.';
      return {
        success: false,
        error: createError('DATABASE_ERROR', 'Registration failed.', message),
      };
    }
  }

  /**
   * Authenticates user and issues an active session token.
   */
  public async login(
    email: string,
    password: string
  ): Promise<ServiceResult<AuthResult>> {
    try {
      const db = this.getDb();
      const normalizedEmail = email.trim().toLowerCase();

      if (!normalizedEmail || !password) {
        return {
          success: false,
          error: createError('AUTH_ERROR', 'Email and password are required.'),
        };
      }

      const stmt = db.prepare(`
        SELECT id, email, password_hash, salt, role, created_at, updated_at, last_login_at
        FROM users WHERE email = ?
      `);
      const row = stmt.get(normalizedEmail) as (UserRecord & { role?: UserRole }) | undefined;

      if (!row) {
        return {
          success: false,
          error: createError(
            'AUTH_ERROR',
            'Invalid email or password.',
            'Please verify your credentials and try again.'
          ),
        };
      }

      const isPasswordValid = verifyPassword(password, row.password_hash || row.passwordHash || '', row.salt);
      if (!isPasswordValid) {
        return {
          success: false,
          error: createError(
            'AUTH_ERROR',
            'Invalid email or password.',
            'Please verify your credentials and try again.'
          ),
        };
      }

      const nowIso = new Date().toISOString();
      const updateLoginStmt = db.prepare('UPDATE users SET last_login_at = ? WHERE id = ?');
      updateLoginStmt.run(nowIso, row.id);

      const sessionId = randomUUID();
      const token = generateSessionToken();
      const expiresInSec = parseDurationToSeconds(AppConfig.auth.jwtExpiresIn) ?? DEFAULT_SESSION_SECONDS;
      const expiresAtIso = new Date(Date.now() + expiresInSec * 1000).toISOString();

      const insertSessionStmt = db.prepare(`
        INSERT INTO sessions (id, user_id, token, expires_at, created_at, is_active, last_active_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `);
      insertSessionStmt.run(sessionId, row.id, token, expiresAtIso, nowIso, nowIso);

      const user: User = {
        id: row.id,
        email: row.email,
        role: row.role === 'admin' ? 'admin' : 'standard',
        createdAt: row.created_at || row.createdAt || nowIso,
        updatedAt: row.updated_at || row.updatedAt || nowIso,
        lastLoginAt: nowIso,
      };

      const session: Session = {
        id: sessionId,
        userId: row.id,
        token,
        expiresAt: expiresAtIso,
        createdAt: nowIso,
        isActive: true,
      };

      return {
        success: true,
        data: { user, session },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown database error during login.';
      return {
        success: false,
        error: createError('DATABASE_ERROR', 'Login failed.', message),
      };
    }
  }

  /**
   * Revokes an active session token upon logout.
   */
  public async logout(token: string): Promise<ServiceResult<void>> {
    try {
      const db = this.getDb();
      const stmt = db.prepare('UPDATE sessions SET is_active = 0 WHERE token = ?');
      stmt.run(token);
      return { success: true, data: undefined };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Logout error';
      return {
        success: false,
        error: createError('DATABASE_ERROR', 'Logout failed.', message),
      };
    }
  }

  /**
   * Validates active session token.
   */
  public async validateSession(token: string): Promise<ServiceResult<User>> {
    try {
      const db = this.getDb();
      const stmt = db.prepare(`
        SELECT s.expires_at, s.is_active, u.id, u.email, u.role, u.created_at, u.updated_at, u.last_login_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
      `);
      const row = stmt.get(token) as (SessionRecord & UserRecord & { role?: UserRole }) | undefined;

      const isActive = Boolean(row?.is_active || row?.isActive);
      if (!row || !isActive) {
        return {
          success: false,
          error: createError('AUTH_ERROR', 'Session invalid or revoked.'),
        };
      }

      const expiresAtStr = row.expires_at || row.expiresAt || '';
      if (new Date(expiresAtStr).getTime() < Date.now()) {
        return {
          success: false,
          error: createError('AUTH_ERROR', 'Session has expired.'),
        };
      }

      const user: User = {
        id: row.id,
        email: row.email,
        role: row.role === 'admin' ? 'admin' : 'standard',
        createdAt: row.created_at || row.createdAt || '',
        updatedAt: row.updated_at || row.updatedAt || '',
        lastLoginAt: row.last_login_at || row.lastLoginAt || null,
      };

      return { success: true, data: user };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Session validation error';
      return {
        success: false,
        error: createError('DATABASE_ERROR', 'Session check failed.', message),
      };
    }
  }

  /**
   * Lists every account (no secrets). For the admin role-management screen.
   * Ordered oldest first so the original bootstrap admin is on top.
   */
  public async listUsers(): Promise<ServiceResult<User[]>> {
    try {
      const db = this.getDb();
      const rows = db
        .prepare('SELECT id, email, role, created_at, updated_at, last_login_at FROM users ORDER BY created_at ASC, id ASC')
        .all() as unknown as Array<UserRecord & { role?: UserRole }>;
      const users: User[] = rows.map((row) => ({
        id: row.id,
        email: row.email,
        role: row.role === 'admin' ? 'admin' : 'standard',
        createdAt: row.created_at || row.createdAt || '',
        updatedAt: row.updated_at || row.updatedAt || '',
        lastLoginAt: row.last_login_at || row.lastLoginAt || null,
      }));
      return { success: true, data: users };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown database error';
      return { success: false, error: createError('DATABASE_ERROR', 'Could not list users.', message) };
    }
  }

  /**
   * Sets a user's role. Caller authorization (admin-only) is enforced at the IPC
   * boundary; this method additionally refuses to remove the LAST admin, so the
   * app can never be locked out of its own safety controls.
   */
  public async setUserRole(targetUserId: string, role: UserRole): Promise<ServiceResult<User>> {
    try {
      if (role !== 'admin' && role !== 'standard') {
        return { success: false, error: createError('AUTH_ERROR', 'Role must be "admin" or "standard".') };
      }
      const db = this.getDb();
      const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(targetUserId) as { id: string; role?: UserRole } | undefined;
      if (!target) {
        return { success: false, error: createError('AUTH_ERROR', 'That user no longer exists.') };
      }

      // Guard: never demote the final admin (would lock everyone out of policy/audit).
      if (role === 'standard' && target.role === 'admin') {
        const admins = (db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get() as { n: number }).n;
        if (admins <= 1) {
          return { success: false, error: createError('NOT_AUTHORIZED', 'This is the only administrator. Promote another account to admin before demoting this one.') };
        }
      }

      const now = new Date().toISOString();
      db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE id = ?').run(role, now, targetUserId);
      const updated = db.prepare('SELECT id, email, role, created_at, updated_at, last_login_at FROM users WHERE id = ?').get(targetUserId) as unknown as UserRecord & { role?: UserRole };
      return {
        success: true,
        data: {
          id: updated.id,
          email: updated.email,
          role: updated.role === 'admin' ? 'admin' : 'standard',
          createdAt: updated.created_at || '',
          updatedAt: updated.updated_at || now,
          lastLoginAt: updated.last_login_at || null,
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown database error';
      return { success: false, error: createError('DATABASE_ERROR', 'Could not change the user role.', message) };
    }
  }

  /**
   * Close internal database connection (useful for testing).
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
