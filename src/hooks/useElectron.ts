'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Electron Detection ───────────────────────────────────────

/** Returns true if running inside Electron, false in browser */
export function isElectron(): boolean {
  return typeof window !== 'undefined' && typeof window.electronAPI !== 'undefined';
}

// ─── useElectronInfo ──────────────────────────────────────────

interface ElectronInfo {
  isElectron: boolean;
  version: string | null;
  platform: string | null;
  loading: boolean;
  error: string | null;
}

/**
 * Hook: Provides basic Electron app info via IPC.
 *
 * Returns version and platform from the main process.
 * Works gracefully in browser (returns null values).
 *
 * IPC flow:
 *   useElectronInfo()
 *     → window.electronAPI.getVersion()    [renderer]
 *     → ipcRenderer.invoke('app:get-version')
 *     → ipcMain.handle('app:get-version')  [main]
 *     → returns app.getVersion()
 */
export function useElectronInfo(): ElectronInfo {
  const [version, setVersion] = useState<string | null>(null);
  const [platform, setPlatform] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isElectron()) {
      setLoading(false);
      return;
    }

    const fetchInfo = async () => {
      const api = window.electronAPI;
      if (!api) {
        setLoading(false);
        return;
      }
      try {
        const [v, p] = await Promise.all([
          api.getVersion(),
          api.getPlatform(),
        ]);
        setVersion(v);
        setPlatform(p as string);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to get Electron info');
      } finally {
        setLoading(false);
      }
    };

    fetchInfo();
  }, []);

  return { isElectron: isElectron(), version, platform, loading, error };
}

// ─── useFileDialog ────────────────────────────────────────────

interface UseFileDialogOptions {
  filters?: Electron.FileFilter[];
}

interface UseFileDialogReturn {
  selectedPath: string | null;
  openDialog: () => Promise<string | null>;
  reset: () => void;
  available: boolean;
}

/**
 * Hook: Opens a native OS file picker dialog via Electron IPC.
 *
 * Usage (Phase 3 — Database Upload):
 *   const { openDialog, selectedPath } = useFileDialog({
 *     filters: [{ name: 'SQLite Database', extensions: ['db'] }]
 *   });
 */
export function useFileDialog(options: UseFileDialogOptions = {}): UseFileDialogReturn {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const openDialog = useCallback(async (): Promise<string | null> => {
    const api = window.electronAPI;
    if (!isElectron() || !api) {
      console.warn('[useFileDialog] Not running in Electron — file dialog unavailable');
      return null;
    }
    const filePath = await api.openFileDialog(options.filters);
    setSelectedPath(filePath);
    return filePath;
  }, [options.filters]);

  const reset = useCallback(() => setSelectedPath(null), []);

  return {
    selectedPath,
    openDialog,
    reset,
    available: isElectron(),
  };
}
