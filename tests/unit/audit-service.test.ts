import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AuditEvent } from '../../src/types';
import { AuditService, attachUsers, sqlFingerprint } from '../../src/services/audit/audit.service';

function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    userId: 'admin-1',
    connectionId: 'conn-1',
    engine: 'sqlite',
    operation: 'insert',
    tableName: 'products',
    outcome: 'success',
    affectedRows: 1,
    errorCode: null,
    sqlSha256: sqlFingerprint("INSERT INTO products VALUES (1)"),
    policyVersion: 2,
    ...overrides,
  };
}

describe('AuditService (V2 Phase 7)', () => {
  let dir: string;
  let audit: AuditService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-audit-'));
    audit = new AuditService(path.join(dir, 'audit.db'));
  });

  afterEach(() => {
    audit.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('records an event and lists it back, newest first', () => {
    audit.record(event({ operation: 'insert' }));
    audit.record(event({ operation: 'delete', outcome: 'denied', affectedRows: null, errorCode: 'POLICY_DENIED' }));

    const list = audit.list();
    expect(list.success).toBe(true);
    if (list.success) {
      expect(list.data).toHaveLength(2);
      expect(list.data[0].operation).toBe('delete');
      expect(list.data[0].outcome).toBe('denied');
      expect(list.data[1].operation).toBe('insert');
    }
  });

  it('stores only a fingerprint, never raw SQL', () => {
    const stored = audit.record(event());
    expect(stored.success).toBe(true);
    if (stored.success) {
      expect(stored.data.sqlSha256).toHaveLength(64);
      expect(stored.data).not.toHaveProperty('sql');
    }
  });

  it('produces a stable fingerprint', () => {
    expect(sqlFingerprint('DELETE FROM t ')).toBe(sqlFingerprint('DELETE FROM t'));
    expect(sqlFingerprint('DELETE FROM t')).not.toBe(sqlFingerprint('DELETE FROM u'));
  });

  it('prunes old events', () => {
    audit.record(event());
    audit.record(event());
    // retentionDays = -1 puts the cutoff in the future, so everything is "old".
    const pruned = audit.prune(-1);
    expect(pruned.success && pruned.data).toBe(2);
    const list = audit.list();
    expect(list.success && list.data).toHaveLength(0);
  });
});

describe('AuditService policy-change events', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-audit-policy-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('stores and returns who changed the policy and what changed', () => {
    const audit = new AuditService(path.join(dir, 'audit.db'));
    audit.record(event({
      userId: 'admin-2',
      operation: 'policy_change',
      tableName: null,
      engine: null,
      connectionId: null,
      affectedRows: null,
      sqlSha256: '',
      policyVersion: 7,
      details: 'Write operations: on → off; Permitted operations: -DELETE',
    }));
    const list = audit.list();
    audit.close();
    expect(list.success).toBe(true);
    if (!list.success) return;
    expect(list.data[0]).toMatchObject({
      userId: 'admin-2',
      operation: 'policy_change',
      policyVersion: 7,
      details: 'Write operations: on → off; Permitted operations: -DELETE',
    });
  });

  it('upgrades an audit.db created before the details column existed', () => {
    const dbPath = path.join(dir, 'old-audit.db');
    const old = new DatabaseSync(dbPath);
    old.exec(`CREATE TABLE audit_events (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, user_id TEXT, connection_id TEXT, engine TEXT,
      operation TEXT NOT NULL, table_name TEXT, outcome TEXT NOT NULL, affected_rows INTEGER,
      error_code TEXT, sql_sha256 TEXT NOT NULL, policy_version INTEGER NOT NULL)`);
    old.exec(`INSERT INTO audit_events VALUES ('old-1', '2026-11-01T00:00:00.000Z', 'admin-1', 'c1', 'sqlite',
      'insert', 'Genre', 'success', 1, NULL, 'abc', 2)`);
    old.close();

    const audit = new AuditService(dbPath);
    const recorded = audit.record(event({ operation: 'policy_change', details: 'Max rows: 1000 → 500' }));
    const list = audit.list();
    audit.close();

    expect(recorded.success).toBe(true);
    expect(list.success).toBe(true);
    if (!list.success) return;
    expect(list.data).toHaveLength(2);
    expect(list.data.find((r) => r.id === 'old-1')).toMatchObject({ tableName: 'Genre', details: null });
    expect(list.data.find((r) => r.operation === 'policy_change')?.details).toBe('Max rows: 1000 → 500');
  });
});

describe('attachUsers', () => {
  const base = { id: 'r', createdAt: '2026-11-23T10:00:00.000Z' };

  it('shows which of two administrators ran each statement', () => {
    const records = [
      { ...base, ...event({ userId: 'admin-1' }), id: 'r1' },
      { ...base, ...event({ userId: 'admin-2', operation: 'delete' }), id: 'r2' },
    ];
    const users = [
      { id: 'admin-1', email: 'first.admin@x.test', role: 'admin' as const },
      { id: 'admin-2', email: 'second.admin@x.test', role: 'admin' as const },
    ];

    const out = attachUsers(records, users);
    expect(out.map((r) => [r.id, r.userEmail, r.userRole])).toEqual([
      ['r1', 'first.admin@x.test', 'admin'],
      ['r2', 'second.admin@x.test', 'admin'],
    ]);
  });

  it('keeps the id but no email for a deleted user or no user', () => {
    const out = attachUsers(
      [
        { ...base, ...event({ userId: 'gone' }), id: 'r1' },
        { ...base, ...event({ userId: null }), id: 'r2' },
      ],
      [],
    );
    expect(out[0]).toMatchObject({ userId: 'gone', userEmail: null, userRole: null });
    expect(out[1]).toMatchObject({ userId: null, userEmail: null, userRole: null });
  });
});
