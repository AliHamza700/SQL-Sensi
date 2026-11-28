/**
 * Write Service — SQL Sensi V2 Phase 7
 *
 * Orchestrates a controlled INSERT/UPDATE/DELETE: authorize against identity and
 * administrator policy, gate on confirmation, re-check the active connection
 * immediately before running, execute inside a transaction, and audit the
 * outcome. Runs in the main process only.
 *
 * A write only ever runs when BOTH the application policy allows it AND the
 * database account itself allows it (the engine enforces the latter). The audit
 * record carries no secrets and no row values.
 */

import type {
  AuditEvent,
  AuditOutcome,
  DatabaseEngine,
  ServiceResult,
  User,
  WriteExecution,
  WriteResult,
} from '@/src/types';
import { createError } from '@/src/utils/errors';
import { extractTargetTable, isWriteOperation } from '@/src/utils/sql-operation';
import { getPolicyService, PolicyService } from '@/src/services/policy/policy.service';
import { databaseService } from '@/src/services/database/database.service';
import { AuditService, getAuditService, sqlFingerprint } from '@/src/services/audit/audit.service';

/** The minimal DatabaseService surface this service needs (eases testing). */
export interface WriteExecutor {
  executeWrite(sql: string, params?: unknown[]): Promise<ServiceResult<WriteResult>>;
}

/** Everything the write needs to know about who/where, resolved at the IPC boundary. */
export interface WriteContext {
  user: User | null | undefined;
  connectionId: string | null;
  engine: DatabaseEngine | null;
  /**
   * Re-checks that the connection is still the one this write was prepared for,
   * called immediately before execution. Returns a failed ServiceResult (e.g.
   * CONNECTION_CHANGED) when it is not.
   */
  assertActive: () => ServiceResult<unknown>;
}

export class WriteService {
  constructor(
    private readonly policy: PolicyService = getPolicyService(),
    private readonly db: WriteExecutor = databaseService,
    private readonly audit: AuditService = getAuditService()
  ) {}

  public async execute(
    ctx: WriteContext,
    sql: string,
    params: unknown[] = [],
    confirmed = false
  ): Promise<ServiceResult<WriteExecution>> {
    const decision = this.policy.authorize(ctx.user, sql);
    const operation = decision.operation;
    const fingerprint = sqlFingerprint(sql);
    const tableName = extractTargetTable(sql, operation);

    const audit = (outcome: AuditOutcome, affectedRows: number | null, errorCode: string | null): void => {
      const event: AuditEvent = {
        userId: ctx.user?.id ?? null,
        connectionId: ctx.connectionId,
        engine: ctx.engine,
        operation,
        tableName,
        outcome,
        affectedRows,
        errorCode,
        sqlSha256: fingerprint,
        policyVersion: decision.policyVersion,
      };
      // Auditing must never break the request; swallow its own failure.
      this.audit.record(event);
    };

    // 1. Policy / identity.
    if (!decision.allowed) {
      const code = ctx.user?.role !== 'admin' && isWriteOperation(operation)
        ? 'NOT_AUTHORIZED'
        : 'POLICY_DENIED';
      audit('denied', null, code);
      return { success: false, error: createError(code, decision.reason ?? 'This statement is not permitted.') };
    }

    // 2. Confirmation gate — return the decision and run nothing until confirmed.
    if ((decision.requiresConfirmation || decision.requiresStrongConfirmation) && !confirmed) {
      return { success: true, data: { status: 'confirmation_required', decision } };
    }

    // 3. Re-check the active connection immediately before execution.
    const active = ctx.assertActive();
    if (!active.success) {
      audit('denied', null, active.error.code);
      return { success: false, error: active.error };
    }

    // 4. Execute (the adapter runs it in a transaction).
    const result = await this.db.executeWrite(sql, params);
    if (!result.success) {
      audit('failure', null, result.error.code);
      return { success: false, error: result.error };
    }

    audit('success', result.data.affectedRows, null);
    return {
      success: true,
      data: {
        status: 'executed',
        operation,
        affectedRows: result.data.affectedRows,
        executionTimeMs: result.data.executionTimeMs,
        committed: result.data.committed,
      },
    };
  }
}

// ─── Singleton ────────────────────────────────────────────────

let instance: WriteService | null = null;

export function getWriteService(): WriteService {
  if (!instance) instance = new WriteService();
  return instance;
}

export function resetWriteService(): void {
  instance = null;
}
