/**
 * Audit Service — SQL Sensi V2 Phase 7
 *
 * Append-only log of write attempts (allowed, failed or denied), kept in its own
 * `audit.db` in APP_DATA_DIR. It records METADATA ONLY — operation, best-effort
 * table, outcome, affected-row count, connection, policy version — plus a
 * SHA-256 of the statement text for correlation. It never stores the raw SQL or
 * any row values (rules.md §4). Runs in the main process only.
 */

import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import type { AuditEvent, AuditRecord, ServiceResult, User } from '@/src/types';
import { AppConfig } from '@/src/config';
import { createError } from '@/src/utils/errors';

const AUDIT_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id TEXT,
  connection_id TEXT,
  engine TEXT,
  operation TEXT NOT NULL,
  table_name TEXT,
  outcome TEXT NOT NULL,
  affected_rows INTEGER,
  error_code TEXT,
  sql_sha256 TEXT NOT NULL,
  policy_version INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_events(created_at);
`;

/** SHA-256 hex of a statement's normalized text. Never store the statement itself. */
export function sqlFingerprint(sql: string): string {
  return createHash('sha256').update(sql.trim()).digest('hex');
}

export class AuditService {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;

  constructor(customDbPath?: string) {
    if (customDbPath) {
      this.dbPath = customDbPath;
    } else {
      const dir = AppConfig.database.appDataDir;
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      this.dbPath = path.join(dir, 'audit.db');
    }
    this.init();
  }

  private init(): void {
    if (!this.db) {
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec(AUDIT_TABLE_SQL);
      // Migration: `details` (policy-change summary) was added after the first
      // release; add it to existing audit.db files without touching old rows.
      const columns = this.db.prepare('PRAGMA table_info(audit_events)').all() as Array<{ name: string }>;
      if (!columns.some((c) => c.name === 'details')) {
        this.db.exec('ALTER TABLE audit_events ADD COLUMN details TEXT');
      }
    }
  }

  private getDb(): DatabaseSync {
    this.init();
    if (!this.db) throw new Error('Audit database initialization failed');
    return this.db;
  }

  /** Appends one event. Never throws across the boundary; returns the stored record. */
  public record(event: AuditEvent): ServiceResult<AuditRecord> {
    try {
      const db = this.getDb();
      const id = randomUUID();
      const createdAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO audit_events
          (id, created_at, user_id, connection_id, engine, operation, table_name, outcome, affected_rows, error_code, sql_sha256, policy_version, details)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        createdAt,
        event.userId,
        event.connectionId,
        event.engine,
        event.operation,
        event.tableName,
        event.outcome,
        event.affectedRows,
        event.errorCode,
        event.sqlSha256,
        event.policyVersion,
        event.details ?? null
      );
      return { success: true, data: { ...event, details: event.details ?? null, id, createdAt } };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown audit error';
      return { success: false, error: createError('DATABASE_ERROR', 'Failed to record the audit event.', message) };
    }
  }

  /** Most recent events first. */
  public list(limit = 100): ServiceResult<AuditRecord[]> {
    try {
      const rows = this.getDb()
        .prepare('SELECT * FROM audit_events ORDER BY created_at DESC, id DESC LIMIT ?')
        .all(Math.max(1, Math.min(limit, 1000))) as Array<Record<string, unknown>>;
      return { success: true, data: rows.map(toRecord) };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown audit error';
      return { success: false, error: createError('DATABASE_ERROR', 'Failed to read the audit log.', message) };
    }
  }

  /** Deletes events older than `retentionDays`. Returns how many were removed. */
  public prune(retentionDays: number): ServiceResult<number> {
    try {
      const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000).toISOString();
      const info = this.getDb().prepare('DELETE FROM audit_events WHERE created_at < ?').run(cutoff);
      return { success: true, data: Number(info.changes ?? 0) };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown audit error';
      return { success: false, error: createError('DATABASE_ERROR', 'Failed to prune the audit log.', message) };
    }
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Adds the account email and role to each record by matching `userId` against
 * the given users, so the audit viewer can show WHO ran each statement. A
 * record whose user no longer exists gets `userEmail: null`; its `userId` stays.
 */
export function attachUsers(records: AuditRecord[], users: Pick<User, 'id' | 'email' | 'role'>[]): AuditRecord[] {
  const byId = new Map(users.map((u) => [u.id, u]));
  return records.map((r) => {
    const u = r.userId ? byId.get(r.userId) : undefined;
    return { ...r, userEmail: u?.email ?? null, userRole: u?.role ?? null };
  });
}

function toRecord(row: Record<string, unknown>): AuditRecord {
  return {
    id: String(row.id),
    createdAt: String(row.created_at),
    userId: row.user_id === null ? null : String(row.user_id),
    connectionId: row.connection_id === null ? null : String(row.connection_id),
    engine: (row.engine === null ? null : String(row.engine)) as AuditRecord['engine'],
    operation: String(row.operation) as AuditRecord['operation'],
    tableName: row.table_name === null ? null : String(row.table_name),
    outcome: String(row.outcome) as AuditRecord['outcome'],
    affectedRows: row.affected_rows === null ? null : Number(row.affected_rows),
    errorCode: row.error_code === null ? null : String(row.error_code),
    sqlSha256: String(row.sql_sha256),
    policyVersion: Number(row.policy_version),
    details: row.details === null || row.details === undefined ? null : String(row.details),
  };
}

// ─── Singleton ────────────────────────────────────────────────

let instance: AuditService | null = null;

export function getAuditService(): AuditService {
  if (!instance) instance = new AuditService();
  return instance;
}

export function resetAuditService(): void {
  if (instance) instance.close();
  instance = null;
}
