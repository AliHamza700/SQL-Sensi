/**
 * Audit IPC Handler — Electron Main Process (V2 Phase 7/9)
 *
 * Exposes the write audit log to the renderer for the admin audit viewer.
 * Runs ONLY in the main process.
 *
 * Security:
 * - The caller's identity comes from its session TOKEN, re-validated here on
 *   every call (rules.md §3). The renderer cannot assert its own role.
 * - Reading or pruning the audit log is ADMIN ONLY — audit metadata reveals who
 *   wrote what and when, so a standard user never sees it.
 * - Records are metadata only (no raw SQL, no row values); they are returned as
 *   typed ServiceResult, never raw rows.
 */

import { ipcMain } from 'electron';
import type { AuditRecord, ServiceResult, User } from '../../../src/types';
import { IPC_CHANNELS } from '../../../src/config/ipc-channels';
import { createError } from '../../../src/utils/errors';
import { attachUsers, getAuditService } from '../../../src/services/audit/audit.service';
import { getAuthService } from './auth.ipc';

/** Resolves the caller and requires the admin role, or returns an auth error. */
async function requireAdmin(token: unknown): Promise<ServiceResult<User>> {
  if (typeof token !== 'string' || token.length === 0) {
    return { success: false, error: createError('NOT_AUTHORIZED', 'A valid session is required.') };
  }
  const result = await getAuthService().validateSession(token);
  if (!result.success) {
    return { success: false, error: createError('NOT_AUTHORIZED', 'Your session is invalid or has expired.') };
  }
  if (result.data.role !== 'admin') {
    return { success: false, error: createError('NOT_AUTHORIZED', 'Only an administrator can view the audit log.') };
  }
  return result;
}

export function registerAuditHandlers(): void {
  const audit = getAuditService();

  // ── List recent audit events (admin only) ──────────────────
  ipcMain.handle(
    IPC_CHANNELS.AUDIT_LIST,
    async (_event, token: string, limit?: number): Promise<ServiceResult<AuditRecord[]>> => {
      const user = await requireAdmin(token);
      if (!user.success) return user;
      const n = typeof limit === 'number' && Number.isFinite(limit) ? limit : 100;
      const records = audit.list(n);
      if (!records.success) return records;
      // Show WHO ran each statement: resolve the stored user id to the account
      // email/role. If the user list cannot be read, still return the log.
      const users = await getAuthService().listUsers();
      return { success: true, data: attachUsers(records.data, users.success ? users.data : []) };
    }
  );

  // ── Prune events older than N days (admin only) ─────────────
  ipcMain.handle(
    IPC_CHANNELS.AUDIT_PRUNE,
    async (_event, token: string, retentionDays: number): Promise<ServiceResult<number>> => {
      const user = await requireAdmin(token);
      if (!user.success) return user;
      if (typeof retentionDays !== 'number' || !Number.isFinite(retentionDays) || retentionDays < 1) {
        return { success: false, error: createError('DATABASE_ERROR', 'A positive retention period is required.') };
      }
      return audit.prune(Math.floor(retentionDays));
    }
  );
}
