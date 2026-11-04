import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { ServiceResult, User, WriteResult } from '../../src/types';
import { PolicyService } from '../../src/services/policy/policy.service';
import { AuditService } from '../../src/services/audit/audit.service';
import { WriteService, WriteContext, WriteExecutor } from '../../src/services/writes/write.service';

const admin: User = { id: 'admin-1', email: 'admin@x.test', role: 'admin', createdAt: '' };
const standard: User = { id: 'user-2', email: 'user@x.test', role: 'standard', createdAt: '' };

class FakeExecutor implements WriteExecutor {
  public calls: Array<{ sql: string; params: unknown[] }> = [];
  public result: ServiceResult<WriteResult> = {
    success: true,
    data: { affectedRows: 3, executionTimeMs: 1, committed: true },
  };
  async executeWrite(sql: string, params: unknown[] = []): Promise<ServiceResult<WriteResult>> {
    this.calls.push({ sql, params });
    return this.result;
  }
}

function okContext(overrides: Partial<WriteContext> = {}): WriteContext {
  return {
    user: admin,
    connectionId: 'conn-1',
    engine: 'sqlite',
    assertActive: () => ({ success: true, data: { connectionId: 'conn-1' } }),
    ...overrides,
  };
}

describe('WriteService (V2 Phase 7)', () => {
  let dir: string;
  let policy: PolicyService;
  let audit: AuditService;
  let exec: FakeExecutor;
  let service: WriteService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-write-'));
    policy = new PolicyService(dir);
    audit = new AuditService(path.join(dir, 'audit.db'));
    exec = new FakeExecutor();
    service = new WriteService(policy, exec, audit);
  });

  afterEach(() => {
    audit.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('denies a standard user and does not execute, but audits the denial', async () => {
    const res = await service.execute(okContext({ user: standard }), 'INSERT INTO t (a) VALUES (1)');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('NOT_AUTHORIZED');
    expect(exec.calls).toHaveLength(0);

    const log = audit.list();
    expect(log.success && log.data[0].outcome).toBe('denied');
  });

  it('denies an admin write while writes are disabled', async () => {
    const res = await service.execute(okContext(), 'INSERT INTO t (a) VALUES (1)');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('POLICY_DENIED');
    expect(exec.calls).toHaveLength(0);
  });

  it('requires confirmation, then executes and audits success', async () => {
    policy.updatePolicy(admin, {
      enableWrites: true,
      allowedOperations: ['insert'],
      requireWriteConfirmation: true,
    });

    const pending = await service.execute(okContext(), 'INSERT INTO t (a) VALUES (1)');
    expect(pending.success).toBe(true);
    if (pending.success) expect(pending.data.status).toBe('confirmation_required');
    expect(exec.calls).toHaveLength(0);

    const done = await service.execute(okContext(), 'INSERT INTO t (a) VALUES (1)', [], true);
    expect(done.success).toBe(true);
    if (done.success && done.data.status === 'executed') {
      expect(done.data.affectedRows).toBe(3);
      expect(done.data.operation).toBe('insert');
    }
    expect(exec.calls).toHaveLength(1);

    const log = audit.list();
    expect(log.success && log.data[0].outcome).toBe('success');
    if (log.success) expect(log.data[0].sqlSha256).toHaveLength(64);
  });

  it('re-checks the active connection immediately before executing', async () => {
    policy.updatePolicy(admin, { enableWrites: true, allowedOperations: ['delete'], requireWriteConfirmation: false, broadMutationHandling: 'allow' });

    const ctx = okContext({
      assertActive: () => ({ success: false, error: { code: 'CONNECTION_CHANGED', message: 'changed' } }),
    });
    const res = await service.execute(ctx, 'DELETE FROM t WHERE id = 1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('CONNECTION_CHANGED');
    expect(exec.calls).toHaveLength(0);
  });

  it('propagates an execution failure and audits it', async () => {
    policy.updatePolicy(admin, { enableWrites: true, allowedOperations: ['update'], requireWriteConfirmation: false });
    exec.result = { success: false, error: { code: 'SQL_EXECUTION_ERROR', message: 'boom' } };

    const res = await service.execute(okContext(), 'UPDATE t SET a = 1 WHERE id = 2');
    expect(res.success).toBe(false);
    const log = audit.list();
    expect(log.success && log.data[0].outcome).toBe('failure');
  });

  it('flags a broad DELETE for strong confirmation under confirm policy', async () => {
    policy.updatePolicy(admin, { enableWrites: true, allowedOperations: ['delete'], requireWriteConfirmation: false, broadMutationHandling: 'confirm' });

    const pending = await service.execute(okContext(), 'DELETE FROM t');
    expect(pending.success).toBe(true);
    if (pending.success) expect(pending.data.status).toBe('confirmation_required');

    const done = await service.execute(okContext(), 'DELETE FROM t', [], true);
    expect(done.success && done.data.status).toBe('executed');
  });
});
