import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { User } from '../../src/types';
import { describePolicyChanges, PolicyService } from '../../src/services/policy/policy.service';

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

  it('refuses CREATE until an administrator permits it, and never for a standard user', () => {
    const ddl = 'CREATE TABLE Doctor (DoctorId INTEGER PRIMARY KEY, Name TEXT NOT NULL)';

    // Off by default.
    expect(policy.authorize(admin, ddl).allowed).toBe(false);
    expect(policy.authorize(admin, ddl).operation).toBe('create');

    // Writes on, but CREATE not in the permitted list.
    policy.updatePolicy(admin, { enableWrites: true, allowedOperations: ['insert'] });
    const notPermitted = policy.authorize(admin, ddl);
    expect(notPermitted.allowed).toBe(false);
    expect(notPermitted.reason).toMatch(/CREATE is not an allowed operation/);

    // Permitted.
    policy.updatePolicy(admin, { allowedOperations: ['insert', 'create'] });
    expect(policy.getPolicy().allowedOperations).toEqual(['insert', 'create']);
    expect(policy.authorize(admin, ddl).allowed).toBe(true);
    expect(policy.authorize(admin, 'CREATE INDEX idx_doc ON Doctor (Name)').allowed).toBe(true);

    // Standard users and destructive DDL stay refused.
    expect(policy.authorize(standard, ddl).allowed).toBe(false);
    expect(policy.authorize(admin, 'DROP TABLE Doctor').allowed).toBe(false);
    expect(policy.authorize(admin, 'ALTER TABLE Doctor ADD COLUMN x INT').allowed).toBe(false);
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

describe('describePolicyChanges', () => {
  let dir: string;
  let policy: PolicyService;
  const secondAdmin: User = { id: 'admin-2', email: 'admin2@x.test', role: 'admin', createdAt: '' };

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-policy-diff-'));
    policy = new PolicyService(dir);
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('lists each setting that changed, in plain language', () => {
    const before = policy.getPolicy();
    const res = policy.updatePolicy(admin, {
      enableWrites: true,
      allowedOperations: ['insert', 'create'],
      requireWriteConfirmation: false,
      broadMutationHandling: 'confirm',
      maxRows: 500,
      audit: { enabled: true, retentionDays: 30 },
    });
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(describePolicyChanges(before, res.data)).toEqual([
      'Write operations: off → on',
      'Permitted operations: +INSERT, +CREATE',
      'Require confirmation: on → off',
      'No-WHERE UPDATE/DELETE: block → confirm',
      `Max rows: ${before.maxRows} → 500`,
      'Audit retention (days): 90 → 30',
    ]);
  });

  it('attributes consecutive changes to the admin who made each one', () => {
    const v1 = policy.getPolicy();
    const first = policy.updatePolicy(admin, { enableWrites: true, allowedOperations: ['insert', 'delete'] });
    expect(first.success).toBe(true);
    if (!first.success) return;
    const second = policy.updatePolicy(secondAdmin, { allowedOperations: ['insert'], enableWrites: false });
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(first.data.updatedByUserId).toBe('admin-1');
    expect(describePolicyChanges(v1, first.data)).toEqual([
      'Write operations: off → on',
      'Permitted operations: +INSERT, +DELETE',
    ]);
    expect(second.data.updatedByUserId).toBe('admin-2');
    expect(describePolicyChanges(first.data, second.data)).toEqual([
      'Write operations: on → off',
      'Permitted operations: -DELETE',
    ]);
  });

  it('is empty when nothing changed', () => {
    const p = policy.getPolicy();
    expect(describePolicyChanges(p, { ...p, version: p.version + 1 })).toEqual([]);
  });
});
