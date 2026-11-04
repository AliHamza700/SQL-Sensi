import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AuditEvent } from '../../src/types';
import { AuditService, sqlFingerprint } from '../../src/services/audit/audit.service';

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
