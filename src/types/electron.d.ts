/**
 * Electron API Type Declaration — SQL Sensi
 *
 * Extends the browser `Window` interface so TypeScript knows
 * about `window.electronAPI` that is injected by the preload script.
 *
 * This file is for the Next.js (renderer) side only.
 * The actual implementation is in electron/src/preload.ts.
 */

import type { ElectronAPI } from '../../electron/src/preload';

declare global {
  interface Window {
    /**
     * Injected by Electron preload script via contextBridge.
     * Undefined when running in a regular browser (non-Electron).
     * Always check `isElectron()` before using this API.
     */
    electronAPI?: ElectronAPI;
  }
}

export {};
