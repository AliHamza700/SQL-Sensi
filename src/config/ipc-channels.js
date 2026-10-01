"use strict";
/**
 * IPC Channel Registry — SQL Sensi
 *
 * Defines ALL valid IPC channel names used between
 * the Electron main process and the renderer process.
 *
 * Architecture rule: Only channels defined here may be
 * used in ipcMain.handle() and ipcRenderer.invoke().
 * This prevents typo-based bugs and makes the API surface explicit.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.IPC_CHANNELS = void 0;
exports.IPC_CHANNELS = {
    // ─── App ──────────────────────────────────────────────────
    APP_GET_VERSION: 'app:get-version',
    APP_GET_PLATFORM: 'app:get-platform',
    // ─── Auth (Phase 2) ───────────────────────────────────────
    AUTH_REGISTER: 'auth:register',
    AUTH_LOGIN: 'auth:login',
    AUTH_LOGOUT: 'auth:logout',
    AUTH_VALIDATE: 'auth:validate-session',
    // ─── Database (Phase 3) ───────────────────────────────────
    DB_OPEN: 'db:open',
    DB_CLOSE: 'db:close',
    DB_IS_OPEN: 'db:is-open',
    // ─── Schema (Phase 4) ─────────────────────────────────────
    SCHEMA_EXTRACT: 'schema:extract',
    // ─── Query (Phase 8) ──────────────────────────────────────
    QUERY_PREPARE: 'query:prepare',
    QUERY_EXECUTE: 'query:execute',
    QUERY_EXPLAIN: 'query:explain',
    // ─── Conversation (Phase 12) ──────────────────────────────
    CONV_LIST: 'conversation:list',
    CONV_GET: 'conversation:get',
    CONV_CREATE: 'conversation:create',
    CONV_ADD_MESSAGE: 'conversation:add-message',
    CONV_DELETE: 'conversation:delete',
    // ─── Export (Phase 13) ────────────────────────────────────
    EXPORT_DATA: 'export:data',
};
