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
import { AUTH_TABLES_SQL, isValidEmail, validatePasswordStrength } from './auth.schema';
import { hashPassword, verifyPassword, generateSessionToken } from '@/src/utils/crypto';
import { createError } from '@/src/utils/errors';

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
    }
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

      const insertUserStmt = db.prepare(`
        INSERT INTO users (id, email, password_hash, salt, created_at, updated_at, last_login_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      insertUserStmt.run(
        userId,
        normalizedEmail,
        hash,
        salt,
        nowIso,
        nowIso,
        nowIso
      );

      // 5. Create Active Session
      const sessionId = randomUUID();
      const token = generateSessionToken();
      const expiresInSec = typeof AppConfig.auth.jwtExpiresIn === 'number'
        ? AppConfig.auth.jwtExpiresIn
        : 7 * 86400;
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
        SELECT id, email, password_hash, salt, created_at, updated_at, last_login_at
        FROM users WHERE email = ?
      `);
      const row = stmt.get(normalizedEmail) as UserRecord | undefined;

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
      const expiresInSec = typeof AppConfig.auth.jwtExpiresIn === 'number'
        ? AppConfig.auth.jwtExpiresIn
        : 7 * 86400;
      const expiresAtIso = new Date(Date.now() + expiresInSec * 1000).toISOString();

      const insertSessionStmt = db.prepare(`
        INSERT INTO sessions (id, user_id, token, expires_at, created_at, is_active, last_active_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `);
      insertSessionStmt.run(sessionId, row.id, token, expiresAtIso, nowIso, nowIso);

      const user: User = {
        id: row.id,
        email: row.email,
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
        SELECT s.expires_at, s.is_active, u.id, u.email, u.created_at, u.updated_at, u.last_login_at
        FROM sessions s
        JOIN users u ON s.user_id = u.id
        WHERE s.token = ?
      `);
      const row = stmt.get(token) as (SessionRecord & UserRecord) | undefined;

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
   * Close internal database connection (useful for testing).
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
