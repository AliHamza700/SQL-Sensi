"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const ipc_channels_1 = require("../../src/config/ipc-channels");
// ─── Expose to Renderer via contextBridge ────────────────────
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    // App info
    getVersion: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC_CHANNELS.APP_GET_VERSION),
    getPlatform: () => electron_1.ipcRenderer.invoke(ipc_channels_1.IPC_CHANNELS.APP_GET_PLATFORM),
    // File dialog
    openFileDialog: (filters) => electron_1.ipcRenderer.invoke('dialog:open-file', filters),
});
//# sourceMappingURL=preload.js.map