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
import type { ServiceResult, AuthResult, User, DatabaseValidationResult, DatabaseSchema, ChatMessage, AIResponse, QueryResult, SQLOptimizationResult, QueryPlan, QueryPlanExplanation, Conversation, ConversationMessage } from '../../src/types/index';

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
    executeQuery: (sql: string) => Promise<ServiceResult<QueryResult>>;
    explainQuery: (sql: string) => Promise<ServiceResult<QueryPlan>>;
  };

  // Phase 4 — Schema
  schema: { 
    extract: () => Promise<ServiceResult<DatabaseSchema>>;
  };

  // Phase 6 — AI
  ai: {
    generateSQL: (messages: ChatMessage[]) => Promise<ServiceResult<AIResponse>>;
    setApiKey: (apiKey: string) => Promise<void>;
    optimizeSQL: (sql: string) => Promise<ServiceResult<SQLOptimizationResult>>;
    explainQueryPlan: (sql: string, plan: QueryPlan) => Promise<ServiceResult<QueryPlanExplanation>>;
  };

  // Phase 12 — Conversation
  history: {
    list: () => Promise<ServiceResult<Conversation[]>>;
    create: (title: string) => Promise<ServiceResult<Conversation>>;
    get: (id: string) => Promise<ServiceResult<{ conversation: Conversation, messages: ConversationMessage[] }>>;
    addMessage: (conversationId: string, msg: Partial<ConversationMessage>) => Promise<ServiceResult<ConversationMessage>>;
    delete: (id: string) => Promise<ServiceResult<void>>;
    update: (id: string, title: string) => Promise<ServiceResult<void>>;
  };

  // Phase 13 — Export
  export: {
    saveData: (data: string, defaultPath: string, format: 'csv' | 'json') => Promise<ServiceResult<string>>;
    saveImage: (base64Data: string, defaultPath: string) => Promise<ServiceResult<string>>;
  };
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
    executeQuery: (sql: string) =>
      ipcRenderer.invoke('database:executeQuery', sql),
    explainQuery: (sql: string) =>
      ipcRenderer.invoke('database:explainQuery', sql),
  },

  // Schema
  schema: {
    extract: () => ipcRenderer.invoke('schema:extract'),
  },

  // AI
  ai: {
    generateSQL: (messages: ChatMessage[]) => ipcRenderer.invoke('ai:generateSQL', messages),
    setApiKey: (apiKey: string) => ipcRenderer.invoke('ai:setApiKey', apiKey),
    optimizeSQL: (sql: string) => ipcRenderer.invoke('ai:optimizeSQL', sql),
    explainQueryPlan: (sql: string, plan: QueryPlan) => ipcRenderer.invoke('ai:explainQueryPlan', sql, plan),
  },

  // History
  history: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LIST),
    create: (title: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CREATE, title),
    get: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_GET, id),
    addMessage: (conversationId: string, msg: Partial<ConversationMessage>) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_ADD_MSG, conversationId, msg),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_DELETE, id),
    update: (id: string, title: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_UPDATE, id, title),
  },

  // Export
  export: {
    saveData: (data: string, defaultPath: string, format: 'csv' | 'json') => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_DATA, data, defaultPath, format),
    saveImage: (base64Data: string, defaultPath: string) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_IMAGE, base64Data, defaultPath),
  }
} satisfies ElectronAPI);
