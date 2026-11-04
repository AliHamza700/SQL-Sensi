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
import type { ServiceResult, AuthResult, User, DatabaseValidationResult, DatabaseSchema, ChatMessage, AIResponse, QueryResult, SQLOptimizationResult, QueryPlan, QueryPlanExplanation, Conversation, ConversationMessage, ConnectionProfile, ConnectionProfileInput, ConnectionRef, ConnectionTestResult, WritePolicy, PolicyDecision, WriteExecution, AuditRecord } from '../../src/types/index';

/** Result of opening a connection */
export interface ConnectResult {
  active: ConnectionRef;
  validation: DatabaseValidationResult;
}

/** What to test: unsaved form values, or a saved profile (optionally with a typed password) */
export type ConnectionTestTarget = { input: ConnectionProfileInput } | { profileId: string; password?: string };

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

  // User role management (V2) — admin only; main re-checks the caller's role from the token
  users: {
    list: (token: string) => Promise<ServiceResult<User[]>>;
    setRole: (token: string, targetUserId: string, role: 'admin' | 'standard') => Promise<ServiceResult<User>>;
  };

  // Phase 3 — Database. `connectionId` is the connection the SQL was prepared for;
  // main rejects the call if a different connection is active now.
  database: {
    validateFile: (filePath: string) => Promise<ServiceResult<DatabaseValidationResult>>;
    connect: (filePath: string) => Promise<ServiceResult<DatabaseValidationResult>>;
    executeQuery: (sql: string, connectionId: string) => Promise<ServiceResult<QueryResult>>;
    explainQuery: (sql: string, connectionId: string) => Promise<ServiceResult<QueryPlan>>;
    /**
     * Runs a controlled INSERT/UPDATE/DELETE (V2 Phase 7). `token` is the
     * caller's session token (identity is re-checked in main). A write that
     * needs confirmation returns `confirmation_required`; call again with
     * `confirmed: true` to run it.
     */
    executeWrite: (
      sql: string,
      connectionId: string,
      token: string,
      params?: unknown[],
      confirmed?: boolean
    ) => Promise<ServiceResult<WriteExecution>>;
  };

  // V2 Phase 3 — Connection manager (passwords go in, never come back out)
  connections: {
    list: () => Promise<ServiceResult<ConnectionProfile[]>>;
    save: (input: ConnectionProfileInput) => Promise<ServiceResult<ConnectionProfile>>;
    delete: (id: string) => Promise<ServiceResult<void>>;
    test: (target: ConnectionTestTarget) => Promise<ServiceResult<ConnectionTestResult>>;
    connect: (profileId: string, password?: string) => Promise<ServiceResult<ConnectResult>>;
    connectFile: (filePath: string) => Promise<ServiceResult<ConnectResult>>;
    disconnect: () => Promise<void>;
    getActive: () => Promise<ConnectionRef | null>;
    isSecretStorageAvailable: () => Promise<boolean>;
    /** Called whenever the active connection changes; returns an unsubscribe function */
    onChanged: (callback: (active: ConnectionRef | null) => void) => () => void;
  };

  // Phase 4 — Schema
  schema: {
    extract: (connectionId: string) => Promise<ServiceResult<DatabaseSchema>>;
  };

  // Phase 6 — Administrator safety policy
  policy: {
    /** The current write/safety policy (any authenticated user may read it). */
    get: (token: string) => Promise<ServiceResult<WritePolicy>>;
    /** Change the policy — admin only; the main process re-checks the role. */
    update: (token: string, patch: Partial<WritePolicy>) => Promise<ServiceResult<WritePolicy>>;
    /** Check one statement against the caller's identity and the policy. */
    authorize: (token: string, sql: string) => Promise<ServiceResult<PolicyDecision>>;
  };

  // Phase 7/9 — Audit log (admin only; main re-checks the role from the token)
  audit: {
    /** Most recent write audit events first. Metadata only — no raw SQL or row values. */
    list: (token: string, limit?: number) => Promise<ServiceResult<AuditRecord[]>>;
    /** Delete events older than `retentionDays`; returns how many were removed. */
    prune: (token: string, retentionDays: number) => Promise<ServiceResult<number>>;
  };

  // Phase 6 — AI
  ai: {
    // Each call names the connection it was prepared for; API keys never come from the renderer.
    generateSQL: (messages: ChatMessage[], connectionId: string) => Promise<ServiceResult<AIResponse>>;
    optimizeSQL: (sql: string, connectionId: string) => Promise<ServiceResult<SQLOptimizationResult>>;
    explainQueryPlan: (sql: string, plan: QueryPlan, connectionId: string) => Promise<ServiceResult<QueryPlanExplanation>>;
  };

  // Phase 12 — Conversation (per user; `token` identifies the caller, re-validated in main)
  history: {
    list: (token: string) => Promise<ServiceResult<Conversation[]>>;
    /** Starts a conversation about the given (active) connection */
    create: (token: string, title: string, connectionId: string) => Promise<ServiceResult<Conversation>>;
    get: (token: string, id: string) => Promise<ServiceResult<{ conversation: Conversation, messages: ConversationMessage[] }>>;
    addMessage: (token: string, conversationId: string, msg: Partial<ConversationMessage>) => Promise<ServiceResult<ConversationMessage>>;
    delete: (token: string, id: string) => Promise<ServiceResult<void>>;
    update: (token: string, id: string, title: string) => Promise<ServiceResult<void>>;
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

  // User role management (admin only)
  users: {
    list: (token: string) => ipcRenderer.invoke(IPC_CHANNELS.USERS_LIST, token),
    setRole: (token: string, targetUserId: string, role: 'admin' | 'standard') =>
      ipcRenderer.invoke(IPC_CHANNELS.USERS_SET_ROLE, token, targetUserId, role),
  },

  // Database
  database: {
    validateFile: (filePath: string) =>
      ipcRenderer.invoke('database:validate', filePath),
    connect: (filePath: string) =>
      ipcRenderer.invoke('database:connect', filePath),
    executeQuery: (sql: string, connectionId: string) =>
      ipcRenderer.invoke('database:executeQuery', sql, connectionId),
    explainQuery: (sql: string, connectionId: string) =>
      ipcRenderer.invoke('database:explainQuery', sql, connectionId),
    executeWrite: (sql: string, connectionId: string, token: string, params?: unknown[], confirmed?: boolean) =>
      ipcRenderer.invoke('database:executeWrite', sql, connectionId, token, params, confirmed),
  },

  // Connections
  connections: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_LIST),
    save: (input: ConnectionProfileInput) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_SAVE, input),
    delete: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_DELETE, id),
    test: (target: ConnectionTestTarget) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_TEST, target),
    connect: (profileId: string, password?: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_CONNECT, profileId, password),
    connectFile: (filePath: string) => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_CONNECT_FILE, filePath),
    disconnect: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_DISCONNECT),
    getActive: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_GET_ACTIVE),
    isSecretStorageAvailable: () => ipcRenderer.invoke(IPC_CHANNELS.CONNECTIONS_SECRET_STORAGE),
    onChanged: (callback: (active: ConnectionRef | null) => void) => {
      // Pass only the payload on; never hand the IPC event object to the renderer
      const listener = (_event: Electron.IpcRendererEvent, active: ConnectionRef | null) => callback(active);
      ipcRenderer.on(IPC_CHANNELS.CONNECTIONS_CHANGED, listener);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.CONNECTIONS_CHANGED, listener);
      };
    },
  },

  // Schema
  schema: {
    extract: (connectionId: string) => ipcRenderer.invoke('schema:extract', connectionId),
  },

  // Policy (V2 Phase 6)
  policy: {
    get: (token: string) => ipcRenderer.invoke(IPC_CHANNELS.POLICY_GET, token),
    update: (token: string, patch: Partial<WritePolicy>) =>
      ipcRenderer.invoke(IPC_CHANNELS.POLICY_UPDATE, token, patch),
    authorize: (token: string, sql: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.POLICY_AUTHORIZE, token, sql),
  },

  // Audit log (V2 Phase 7/9)
  audit: {
    list: (token: string, limit?: number) => ipcRenderer.invoke(IPC_CHANNELS.AUDIT_LIST, token, limit),
    prune: (token: string, retentionDays: number) => ipcRenderer.invoke(IPC_CHANNELS.AUDIT_PRUNE, token, retentionDays),
  },

  // AI
  ai: {
    generateSQL: (messages: ChatMessage[], connectionId: string) => ipcRenderer.invoke('ai:generateSQL', messages, connectionId),
    optimizeSQL: (sql: string, connectionId: string) => ipcRenderer.invoke('ai:optimizeSQL', sql, connectionId),
    explainQueryPlan: (sql: string, plan: QueryPlan, connectionId: string) => ipcRenderer.invoke('ai:explainQueryPlan', sql, plan, connectionId),
  },

  // History (per user; token is re-validated in main)
  history: {
    list: (token: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_LIST, token),
    create: (token: string, title: string, connectionId: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_CREATE, token, title, connectionId),
    get: (token: string, id: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_GET, token, id),
    addMessage: (token: string, conversationId: string, msg: Partial<ConversationMessage>) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_ADD_MSG, token, conversationId, msg),
    delete: (token: string, id: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_DELETE, token, id),
    update: (token: string, id: string, title: string) => ipcRenderer.invoke(IPC_CHANNELS.HISTORY_UPDATE, token, id, title),
  },

  // Export
  export: {
    saveData: (data: string, defaultPath: string, format: 'csv' | 'json') => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_DATA, data, defaultPath, format),
    saveImage: (base64Data: string, defaultPath: string) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_IMAGE, base64Data, defaultPath),
  }
} satisfies ElectronAPI);
