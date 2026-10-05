/**
 * Electron Preload Script — SQL Sensi
 *
 * Runs in the renderer process context but has access to Node/Electron APIs.
 * Uses contextBridge to expose a safe, typed API to the renderer.
 *
 * Security rules:
 *  - Only expose SPECIFIC methods — never expose ipcRenderer itself
 *  - Every channel must be in IPC_CHANNELS registry
 *  - No arbitrary channel invocation from renderer
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../src/config/ipc-channels';
import type { ServiceResult, AuthResult, User, DatabaseValidationResult, DatabaseSchema } from '../../src/types/index';

// ─── Renderer-Facing API Type ─────────────────────────────────
// This type is mirrored in src/types/electron.d.ts for Next.js
export interface ElectronAPI {
  // App
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<NodeJS.Platform>;

  // Dialog
  openFileDialog: (filters?: Electron.FileFilter[]) => Promise<string | null>;

  // Phase 2 — Auth
  auth: {
    register: (email: string, password: string) => Promise<ServiceResult<AuthResult>>;
    login: (email: string, password: string) => Promise<ServiceResult<AuthResult>>;
    logout: (token: string) => Promise<ServiceResult<void>>;
    validateSession: (token: string) => Promise<ServiceResult<User>>;
  };

  // Phase 3 — Database
  database: { 
    validateFile: (filePath: string) => Promise<ServiceResult<DatabaseValidationResult>>;
    connect: (filePath: string) => Promise<ServiceResult<DatabaseValidationResult>>;
  };

  // Phase 4 — Schema
  schema: { 
    extract: () => Promise<ServiceResult<DatabaseSchema>>;
  };

  // Phase 8 — Query
  // query: { prepare, execute, explain }

  // Phase 12 — Conversation
  // conversation: { list, get, create, addMessage, delete }

  // Phase 13 — Export
  // export: { export }
}

// ─── Expose to Renderer via contextBridge ────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_VERSION),
  getPlatform: () => ipcRenderer.invoke(IPC_CHANNELS.APP_GET_PLATFORM),

  // File dialog
  openFileDialog: (filters?: Electron.FileFilter[]) =>
    ipcRenderer.invoke('dialog:open-file', filters),

  // Auth
  auth: {
    register: (email: string, password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_REGISTER, email, password),
    login: (email: string, password: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGIN, email, password),
    logout: (token: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_LOGOUT, token),
    validateSession: (token: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.AUTH_VALIDATE, token),
  },

  // Database
  database: {
    validateFile: (filePath: string) =>
      ipcRenderer.invoke('database:validate', filePath),
    connect: (filePath: string) =>
      ipcRenderer.invoke('database:connect', filePath),
  },

  // Schema
  schema: {
    extract: () => ipcRenderer.invoke('schema:extract'),
  },
} satisfies ElectronAPI);
