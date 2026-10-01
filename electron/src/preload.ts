/**
 * Electron Preload Script
 *
 * This script runs in the renderer process with access to both
 * the renderer and Node.js APIs via contextBridge.
 *
 * Security: Only expose explicitly-defined APIs to the renderer.
 * Never expose the entire ipcRenderer — only specific channels.
 */

import { contextBridge, ipcRenderer } from 'electron';

// ─── Type Definitions ─────────────────────────────────────────
// These mirror what the renderer will see on `window.electronAPI`
export interface ElectronAPI {
  getVersion: () => Promise<string>;
  getPlatform: () => Promise<string>;
  // Additional APIs will be added here as features are built:
  // database: DatabaseAPI
  // auth: AuthAPI
}

// ─── Expose API to Renderer ───────────────────────────────────
contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPlatform: () => ipcRenderer.invoke('app:get-platform'),
} satisfies ElectronAPI);
