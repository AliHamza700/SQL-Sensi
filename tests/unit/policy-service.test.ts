import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { User } from '../../src/types';
import { PolicyService } from '../../src/services/policy/policy.service';

const admin: User = { id: 'admin-1', email: 'admin@x.test', role: 'admin', createdAt: '' };
const standard: User = { id: 'user-2', email: 'user@x.test', role: 'standard', createdAt: '' };

describe('PolicyService', () => {
  let dir: string;
  let policy: PolicyService;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-policy-'));
    policy = new PolicyService(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('denies writes by default', () => {
    const p = policy.getPolicy();
    expect(p.enableWrites).toBe(false);
    expect(p.allowedOperations).toEqual([]);

    const decision = policy.authorize(admin, 'DELETE FROM t WHERE id = 1');
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/disabled/i);
  });

  it('always allows reads, even for a standard user', () => {
    expect(policy.authorize(standard, 'SELECT * FROM t').allowed).toBe(true);
    expect(policy.authorize(admin, 'SELECT * FROM t').operation).toBe('read');
  });

  it('refuses ddl and unclassifiable statements', () => {
    expect(policy.authorize(admin, 'DROP TABLE t').allowed).toBe(false);
    expect(policy.authorize(admin, 'DROP TABLE t').operation).toBe('ddl');
    expect(policy.authorize(admin, 'REPLACE INTO t VALUES (1)').allowed).toBe(false);
  });

  it('only an administrator can change the policy', () => {
    const denied = policy.updatePolicy(standard, { enableWrites: true });
    expect(denied.success).toBe(false);
    if (!denied.success) expect(denied.error.code).toBe('NOT_AUTHORIZED');

    const ok = policy.updatePolicy(admin, {
      enableWrites: true,
      allowedOperations: ['insert', 'update', 'delete'],
    });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.version).toBe(2);
      expect(ok.data.updatedByUserId).toBe('admin-1');
    }
  });

  it('allows an admin write once writes are enabled, but never a standard user', () => {
    policy.updatePolicy(admin, { enableWrites: true, allowedOperations: ['insert', 'update', 'delete'] });

    expect(policy.authorize(admin, 'INSERT INTO t (a) VALUES (1)').allowed).toBe(true);

    const standardWrite = policy.authorize(standard, 'INSERT INTO t (a) VALUES (1)');
    expect(standardWrite.allowed).toBe(false);
    expect(standardWrite.reason).toMatch(/administrator/i);
  });

  it('honours broad-mutation handling', () => {
    // block (default-ish, set explicitly)
    policy.updatePolicy(admin, { enableWrites: true, allowedOperations: ['delete'], broadMutationHandling: 'block' });
    expect(policy.authorize(admin, 'DELETE FROM t').allowed).toBe(false);
    expect(policy.authorize(admin, 'DELETE FROM t WHERE id = 1').allowed).toBe(true);

    // confirm
    policy.updatePolicy(admin, { broadMutationHandling: 'confirm' });
    const broad = policy.authorize(admin, 'DELETE FROM t');
    expect(broad.allowed).toBe(true);
    expect(broad.requiresStrongConfirmation).toBe(true);
  });

  it('respects allowedOperations granularity', () => {
    policy.updatePolicy(admin, { enableWrites: true, allowedOperations: ['insert'] });
    expect(policy.authorize(admin, 'INSERT INTO t VALUES (1)').allowed).toBe(true);
    expect(policy.authorize(admin, 'UPDATE t SET a = 1 WHERE id = 1').allowed).toBe(false);
  });

  it('persists across instances', () => {
    policy.updatePolicy(admin, { enableWrites: true, allowedOperations: ['insert'] });
    const reopened = new PolicyService(dir);
    const p = reopened.getPolicy();
    expect(p.enableWrites).toBe(true);
    expect(p.version).toBe(2);
    expect(p.allowedOperations).toEqual(['insert']);
  });

  it('fails safe (writes off) when the policy file is corrupt', () => {
    fs.writeFileSync(path.join(dir, 'policy.json'), '{ not valid json');
    const p = new PolicyService(dir).getPolicy();
    expect(p.enableWrites).toBe(false);
  });
});
