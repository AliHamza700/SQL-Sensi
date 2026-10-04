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

// Singleton auth service for the main process lifetime
const authService = new AuthService();

export function registerAuthHandlers(): void {
  // ── Register ────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AUTH_REGISTER,
    async (_event, email: string, password: string) => {
      return authService.register(email, password);
    }
  );

  // ── Login ───────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGIN,
    async (_event, email: string, password: string) => {
      return authService.login(email, password);
    }
  );

  // ── Logout ──────────────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AUTH_LOGOUT,
    async (_event, token: string) => {
      return authService.logout(token);
    }
  );

  // ── Validate Session ────────────────────────────────────────
  ipcMain.handle(
    IPC_CHANNELS.AUTH_VALIDATE,
    async (_event, token: string) => {
      return authService.validateSession(token);
    }
  );
}
