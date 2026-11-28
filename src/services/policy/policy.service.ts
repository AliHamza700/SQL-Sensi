/**
 * Policy Service — SQL Sensi V2 Phase 6
 *
 * Trusted, main-process owner of the administrator-configurable write/safety
 * policy and of every authorization decision about running SQL. Nothing in the
 * renderer is trusted to make these calls; the UI only reflects them.
 *
 * Guarantees:
 *   - Writes are DENIED BY DEFAULT until an administrator enables them.
 *   - Only an `admin` user can change the policy or run a write.
 *   - Application policy can only ever be MORE restrictive than the database
 *     account; it never grants a privilege the server account lacks (rules.md §4).
 *   - The policy is stored as `policy.json` in APP_DATA_DIR. It holds no secrets.
 *
 * Every method returns `ServiceResult<T>` or a plain `PolicyDecision`; nothing
 * throws across the service boundary.
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import type {
  PolicyDecision,
  ServiceResult,
  User,
  WriteOperation,
  WritePolicy,
} from '@/src/types';
import { AppConfig } from '@/src/config';
import { createError } from '@/src/utils/errors';
import {
  classifySqlOperation,
  isBroadMutation,
  isWriteOperation,
} from '@/src/utils/sql-operation';

const POLICY_FILE = 'policy.json';
const ALL_WRITE_OPS: WriteOperation[] = ['insert', 'update', 'delete', 'create'];

/** The safe starting policy: writes off, strongest safeguards on. */
export function defaultWritePolicy(): WritePolicy {
  return {
    version: 1,
    enableWrites: false,
    allowedOperations: [],
    requireSqlPreview: true,
    requireWriteConfirmation: true,
    broadMutationHandling: 'block',
    useTransaction: true,
    maxRows: AppConfig.query.maxRows,
    statementTimeoutMs: AppConfig.query.timeoutMs,
    audit: { enabled: true, retentionDays: 90 },
    updatedAt: new Date(0).toISOString(),
    updatedByUserId: null,
  };
}

const onOff = (v: boolean): string => (v ? 'on' : 'off');

/**
 * Human-readable list of what differs between two policies, for the audit log
 * (e.g. ["Write operations: off → on", "Permitted operations: +CREATE"]).
 * Empty when no setting changed. Settings only — the policy holds no secrets.
 */
export function describePolicyChanges(before: WritePolicy, after: WritePolicy): string[] {
  const changes: string[] = [];
  const flag = (label: string, a: boolean, b: boolean) => {
    if (a !== b) changes.push(`${label}: ${onOff(a)} → ${onOff(b)}`);
  };
  const value = (label: string, a: string | number, b: string | number) => {
    if (a !== b) changes.push(`${label}: ${a} → ${b}`);
  };

  flag('Write operations', before.enableWrites, after.enableWrites);

  const added = after.allowedOperations.filter((op) => !before.allowedOperations.includes(op));
  const removed = before.allowedOperations.filter((op) => !after.allowedOperations.includes(op));
  if (added.length || removed.length) {
    const parts = [...added.map((op) => `+${op.toUpperCase()}`), ...removed.map((op) => `-${op.toUpperCase()}`)];
    changes.push(`Permitted operations: ${parts.join(', ')}`);
  }

  flag('Require SQL preview', before.requireSqlPreview, after.requireSqlPreview);
  flag('Require confirmation', before.requireWriteConfirmation, after.requireWriteConfirmation);
  value('No-WHERE UPDATE/DELETE', before.broadMutationHandling, after.broadMutationHandling);
  flag('Use transaction', before.useTransaction, after.useTransaction);
  value('Max rows', before.maxRows, after.maxRows);
  value('Statement timeout (ms)', before.statementTimeoutMs, after.statementTimeoutMs);
  flag('Audit logging', before.audit.enabled, after.audit.enabled);
  value('Audit retention (days)', before.audit.retentionDays, after.audit.retentionDays);
  return changes;
}

/** Fields a caller may change. Everything else on WritePolicy is derived/managed. */
export type WritePolicyPatch = Partial<
  Pick<
    WritePolicy,
    | 'enableWrites'
    | 'allowedOperations'
    | 'requireSqlPreview'
    | 'requireWriteConfirmation'
    | 'broadMutationHandling'
    | 'useTransaction'
    | 'maxRows'
    | 'statementTimeoutMs'
    | 'audit'
  >
>;

export class PolicyService {
  private policy: WritePolicy | null = null;
  private readonly filePath: string;

  constructor(customDir?: string) {
    const dir = customDir ?? AppConfig.database.appDataDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.filePath = path.join(dir, POLICY_FILE);
  }

  // ─── Read ───────────────────────────────────────────────────

  /** The current policy, loaded from disk once and cached. Never throws. */
  public getPolicy(): WritePolicy {
    if (this.policy) return this.policy;
    this.policy = this.load();
    return this.policy;
  }

  /** Whether a user may change the policy (admin only). */
  public canConfigurePolicy(user: User | null | undefined): boolean {
    return user?.role === 'admin';
  }

  // ─── Write ──────────────────────────────────────────────────

  /**
   * Updates the policy. Admin-only. Sanitizes every field, bumps the version,
   * and persists atomically. A standard user is rejected with NOT_AUTHORIZED.
   */
  public updatePolicy(user: User | null | undefined, patch: WritePolicyPatch): ServiceResult<WritePolicy> {
    if (!this.canConfigurePolicy(user)) {
      return {
        success: false,
        error: createError('NOT_AUTHORIZED', 'Only an administrator can change the safety policy.'),
      };
    }

    const current = this.getPolicy();
    const next: WritePolicy = {
      ...current,
      ...this.sanitize(patch, current),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedByUserId: user!.id,
    };

    try {
      this.save(next);
      this.policy = next;
      return { success: true, data: next };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not save the policy file.';
      return { success: false, error: createError('DATABASE_ERROR', 'Failed to save the safety policy.', message) };
    }
  }

  // ─── Authorization ──────────────────────────────────────────

  /**
   * Decides whether `sql` may run for `user` under the current policy. A denial
   * is a normal decision (allowed=false with a reason), not an error. Reads are
   * always allowed here (the engine enforces read-only); writes require an admin
   * identity, writes to be enabled, and the operation to be permitted. The
   * caller MUST re-check the active connection and re-run this immediately
   * before execution (Phase 7).
   */
  public authorize(user: User | null | undefined, sql: string): PolicyDecision {
    const policy = this.getPolicy();
    const operation = classifySqlOperation(sql);
    const base: PolicyDecision = {
      allowed: false,
      operation,
      policyVersion: policy.version,
      requiresPreview: false,
      requiresConfirmation: false,
      requiresStrongConfirmation: false,
    };

    if (operation === 'read') {
      return { ...base, allowed: true };
    }

    if (operation === 'ddl') {
      return { ...base, reason: 'ALTER, DROP and other schema or destructive statements are outside Version 2 scope. Only CREATE TABLE, CREATE INDEX and CREATE VIEW can run, when an administrator permits CREATE.' };
    }

    if (operation === 'other') {
      return { ...base, reason: 'This statement could not be classified as a supported read or write, so it is refused.' };
    }

    // From here, operation is insert/update/delete/create.
    if (user?.role !== 'admin') {
      return { ...base, reason: 'Only an administrator can run write operations.' };
    }
    if (!policy.enableWrites) {
      return { ...base, reason: 'Writes are disabled. An administrator must enable them in Safety settings first.' };
    }
    if (!isWriteOperation(operation) || !policy.allowedOperations.includes(operation)) {
      return { ...base, reason: `${operation.toUpperCase()} is not an allowed operation under the current policy.` };
    }

    const broad = isBroadMutation(sql, operation);
    if (broad && policy.broadMutationHandling === 'block') {
      return { ...base, reason: `This ${operation.toUpperCase()} has no WHERE clause and would affect every row; it is blocked by policy.` };
    }

    return {
      ...base,
      allowed: true,
      requiresPreview: policy.requireSqlPreview,
      requiresConfirmation: policy.requireWriteConfirmation,
      requiresStrongConfirmation: broad && policy.broadMutationHandling === 'confirm',
    };
  }

  // ─── Internals ──────────────────────────────────────────────

  private sanitize(patch: WritePolicyPatch, current: WritePolicy): WritePolicyPatch {
    const out: WritePolicyPatch = {};
    if (typeof patch.enableWrites === 'boolean') out.enableWrites = patch.enableWrites;
    if (typeof patch.requireSqlPreview === 'boolean') out.requireSqlPreview = patch.requireSqlPreview;
    if (typeof patch.requireWriteConfirmation === 'boolean') out.requireWriteConfirmation = patch.requireWriteConfirmation;
    if (typeof patch.useTransaction === 'boolean') out.useTransaction = patch.useTransaction;

    if (Array.isArray(patch.allowedOperations)) {
      out.allowedOperations = ALL_WRITE_OPS.filter((op) => patch.allowedOperations!.includes(op));
    }
    if (patch.broadMutationHandling === 'block' || patch.broadMutationHandling === 'confirm' || patch.broadMutationHandling === 'allow') {
      out.broadMutationHandling = patch.broadMutationHandling;
    }
    if (typeof patch.maxRows === 'number' && Number.isFinite(patch.maxRows)) {
      out.maxRows = Math.max(1, Math.floor(patch.maxRows));
    }
    if (typeof patch.statementTimeoutMs === 'number' && Number.isFinite(patch.statementTimeoutMs)) {
      out.statementTimeoutMs = Math.max(1000, Math.floor(patch.statementTimeoutMs));
    }
    if (patch.audit && typeof patch.audit === 'object') {
      out.audit = {
        enabled: typeof patch.audit.enabled === 'boolean' ? patch.audit.enabled : current.audit.enabled,
        retentionDays:
          typeof patch.audit.retentionDays === 'number' && Number.isFinite(patch.audit.retentionDays)
            ? Math.max(1, Math.floor(patch.audit.retentionDays))
            : current.audit.retentionDays,
      };
    }
    return out;
  }

  private load(): WritePolicy {
    try {
      if (!fs.existsSync(this.filePath)) return defaultWritePolicy();
      const raw = fs.readFileSync(this.filePath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<WritePolicy>;
      // Merge over defaults so a file written by an older version stays valid.
      const base = defaultWritePolicy();
      return {
        ...base,
        ...parsed,
        allowedOperations: Array.isArray(parsed.allowedOperations)
          ? ALL_WRITE_OPS.filter((op) => parsed.allowedOperations!.includes(op))
          : base.allowedOperations,
        audit: { ...base.audit, ...(parsed.audit ?? {}) },
        version: typeof parsed.version === 'number' && parsed.version >= 1 ? parsed.version : base.version,
      };
    } catch {
      // A corrupt policy file must fail safe (writes off), never open writes up.
      return defaultWritePolicy();
    }
  }

  private save(policy: WritePolicy): void {
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(policy, null, 2), 'utf-8');
    fs.renameSync(tmp, this.filePath);
  }
}

// ─── Singleton ────────────────────────────────────────────────

let instance: PolicyService | null = null;

/** Lazily-created shared instance for the main process. */
export function getPolicyService(): PolicyService {
  if (!instance) instance = new PolicyService();
  return instance;
}

/** Test seam: reset the shared instance. */
export function resetPolicyService(): void {
  instance = null;
}
