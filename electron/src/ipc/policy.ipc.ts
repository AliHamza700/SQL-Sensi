/**
 * Policy IPC Handler — Electron Main Process (V2 Phase 6)
 *
 * Exposes the administrator safety policy and the authorization check to the
 * renderer. Runs ONLY in the main process.
 *
 * Security:
 * - The caller's identity is taken from its session TOKEN, re-validated here on
 *   every call (rules.md §3 "verify the caller's authorization at the trusted
 *   boundary"). The renderer cannot assert its own role.
 * - Reading the policy needs a valid session; changing it needs an admin.
 * - All responses are typed ServiceResult — never raw rows.
 */

import { ipcMain } from 'electron';
import type { PolicyDecision, ServiceResult, User, WritePolicy } from '../../../src/types';
import { IPC_CHANNELS } from '../../../src/config/ipc-channels';
import { createError } from '../../../src/utils/errors';
import { getPolicyService, WritePolicyPatch } from '../../../src/services/policy/policy.service';
import { getAuthService } from './auth.ipc';

/** Resolves the authenticated user from a session token, or an auth error. */
async function resolveUser(token: unknown): Promise<ServiceResult<User>> {
  if (typeof token !== 'string' || token.length === 0) {
    return { success: false, error: createError('NOT_AUTHORIZED', 'A valid session is required.') };
  }
  const result = await getAuthService().validateSession(token);
  if (!result.success) {
    return { success: false, error: createError('NOT_AUTHORIZED', 'Your session is invalid or has expired.') };
  }
  return result;
}

export function registerPolicyHandlers(): void {
  const policy = getPolicyService();

  // ── Get the current policy (any authenticated user) ─────────
  ipcMain.handle(IPC_CHANNELS.POLICY_GET, async (_event, token: string): Promise<ServiceResult<WritePolicy>> => {
    const user = await resolveUser(token);
    if (!user.success) return user;
    return { success: true, data: policy.getPolicy() };
  });

  // ── Update the policy (admin only; enforced in the service) ─
  ipcMain.handle(
    IPC_CHANNELS.POLICY_UPDATE,
    async (_event, token: string, patch: WritePolicyPatch): Promise<ServiceResult<WritePolicy>> => {
      const user = await resolveUser(token);
      if (!user.success) return user;
      return policy.updatePolicy(user.data, patch ?? {});
    }
  );

  // ── Authorize a statement against identity + policy ─────────
  ipcMain.handle(
    IPC_CHANNELS.POLICY_AUTHORIZE,
    async (_event, token: string, sql: string): Promise<ServiceResult<PolicyDecision>> => {
      const user = await resolveUser(token);
      if (!user.success) return user;
      if (typeof sql !== 'string') {
        return { success: false, error: createError('SQL_VALIDATION_ERROR', 'No SQL was provided to authorize.') };
      }
      return { success: true, data: policy.authorize(user.data, sql) };
    }
  );
}
