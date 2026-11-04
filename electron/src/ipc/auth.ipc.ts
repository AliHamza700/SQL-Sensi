/**
 * Auth IPC Handler — Electron Main Process
 *
 * Registers all auth:* IPC channels from IPC_CHANNELS.
 * Runs ONLY in the main process. Never import in renderer.
 *
 * Security rules (AUTH_DESIGN.md §3, rules.md §48):
 * - AuthService is instantiated once; shared across all handler calls.
 * - Plaintext passwords cross the IPC bridge but never persist — they
 *   are consumed inside AuthService.register/login and discarded.
 * - All responses are typed ServiceResult<T> — never raw DB rows.
 */

import { ipcMain } from 'electron';
import { AuthService } from '../../../src/services/auth/auth.service';
import { IPC_CHANNELS } from '../../../src/config/ipc-channels';
import type { ServiceResult, User, UserRole } from '../../../src/types';
import { createError } from '../../../src/utils/errors';

// Singleton auth service for the main process lifetime
let authService: AuthService | null = null;

/** Shared AuthService for the main process (one DB handle to sensi_app.db). */
export function getAuthService(): AuthService {
  if (!authService) authService = new AuthService();
  return authService;
}

export function registerAuthHandlers(): void {
  // ── Register ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AUTH_REGISTER,
    async (_event, email: string, password: string) => {
      return getAuthService().register(email, password);
    }
  );

  // ── Login ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGIN,
    async (_event, email: string, password: string) => {
      return getAuthService().login(email, password);
    }
  );

  // ── Logout ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGOUT,
    async (_event, token: string) => {
      return getAuthService().logout(token);
    }
  );

  // ── Validate Session ────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AUTH_VALIDATE,
    async (_event, token: string) => {
      return getAuthService().validateSession(token);
    }
  );

  // ── Users: list (admin only) ────────────────────────────────
  // Role management: the bootstrap admin grants admin to colleagues, so a
  // company is not stuck with "whoever registered first". Identity + role are
  // taken from the session token and re-checked here (rules.md §3).
  ipcMain.handle(IPC_CHANNELS.USERS_LIST, async (_event, token: unknown): Promise<ServiceResult<User[]>> => {
    const admin = await requireAdmin(token);
    if (!admin.success) return admin;
    return getAuthService().listUsers();
  });

  // ── Users: set role (admin only) ────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.USERS_SET_ROLE,
    async (_event, token: unknown, targetUserId: unknown, role: unknown): Promise<ServiceResult<User>> => {
      const admin = await requireAdmin(token);
      if (!admin.success) return admin;
      if (typeof targetUserId !== 'string' || !targetUserId) {
        return { success: false, error: createError('AUTH_ERROR', 'A target user is required.') };
      }
      if (role !== 'admin' && role !== 'standard') {
        return { success: false, error: createError('AUTH_ERROR', 'Role must be "admin" or "standard".') };
      }
      return getAuthService().setUserRole(targetUserId, role as UserRole);
    }
  );
}

/** Resolves the caller from its session token and requires the admin role. */
async function requireAdmin(token: unknown): Promise<ServiceResult<User>> {
  if (typeof token !== 'string' || token.length === 0) {
    return { success: false, error: createError('NOT_AUTHORIZED', 'A valid session is required.') };
  }
  const result = await getAuthService().validateSession(token);
  if (!result.success) {
    return { success: false, error: createError('NOT_AUTHORIZED', 'Your session is invalid or has expired.') };
  }
  if (result.data.role !== 'admin') {
    return { success: false, error: createError('NOT_AUTHORIZED', 'Only an administrator can manage user roles.') };
  }
  return result;
}
