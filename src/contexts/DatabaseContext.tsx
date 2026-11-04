'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type {
  ConnectionProfile,
  ConnectionProfileInput,
  ConnectionRef,
  ConnectionTestResult,
  ServiceResult,
} from '@/src/types';
import type { ConnectResult, ConnectionTestTarget } from '../../electron/src/preload';

// ─── Storage Keys ────────────────────────────────────────────
/** Version 1 stored the active SQLite path here; migrated once on startup */
const V1_ACTIVE_DB_STORAGE_KEY = 'sql_sensi_active_db_path';
/** Last-used connection id, so the last SQLite file reopens on start (as in V1) */
const LAST_CONNECTION_STORAGE_KEY = 'sql_sensi_last_connection_id';

// ─── Context Type ─────────────────────────────────────────────
export interface DatabaseContextValue {
  /** The connection the main process has open right now (main is the source of truth) */
  activeConnection: ConnectionRef | null;
  /** Saved connections, most recently used first */
  profiles: ConnectionProfile[];
  /** Whether passwords can be saved securely on this machine */
  canSavePasswords: boolean;
  /** True while the initial state is loading */
  isLoading: boolean;
  refreshProfiles: () => Promise<void>;
  connectProfile: (profileId: string, password?: string) => Promise<ServiceResult<ConnectResult>>;
  connectFile: (filePath: string) => Promise<ServiceResult<ConnectResult>>;
  disconnect: () => Promise<void>;
  saveProfile: (input: ConnectionProfileInput) => Promise<ServiceResult<ConnectionProfile>>;
  deleteProfile: (id: string) => Promise<ServiceResult<void>>;
  testConnection: (target: ConnectionTestTarget) => Promise<ServiceResult<ConnectionTestResult>>;
}

// ─── Create Context ───────────────────────────────────────────
const DatabaseContext = createContext<DatabaseContextValue | null>(null);
DatabaseContext.displayName = 'DatabaseContext';

const notInElectron = <T,>(): ServiceResult<T> => ({
  success: false,
  error: { code: 'UNKNOWN_ERROR', message: 'Database connections are only available in the desktop app.' },
});

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // Ignore
  }
}

// ─── Provider ─────────────────────────────────────────────────
export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [activeConnection, setActiveConnection] = useState<ConnectionRef | null>(null);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [canSavePasswords, setCanSavePasswords] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refreshProfiles = useCallback(async () => {
    const api = window.electronAPI;
    if (!api) return;
    const res = await api.connections.list();
    if (res.success) setProfiles(res.data);
  }, []);

  // Follow the main process: initial state, change events, and V1 / last-used restore
  useEffect(() => {
    const api = window.electronAPI;
    if (!api) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const unsubscribe = api.connections.onChanged((active) => {
      setActiveConnection(active);
      if (active) writeStorage(LAST_CONNECTION_STORAGE_KEY, active.connectionId);
      void refreshProfiles();
    });

    (async () => {
      try {
        const [active, list, secure] = await Promise.all([
          api.connections.getActive(),
          api.connections.list(),
          api.connections.isSecretStorageAvailable(),
        ]);
        if (cancelled) return;
        setActiveConnection(active);
        setCanSavePasswords(secure);
        if (list.success) setProfiles(list.data);

        if (!active) {
          const v1Path = readStorage(V1_ACTIVE_DB_STORAGE_KEY);
          const lastId = readStorage(LAST_CONNECTION_STORAGE_KEY);
          const last = list.success ? list.data.find(p => p.id === lastId) : undefined;
          if (v1Path) {
            // One-time migration of the Version 1 setting
            writeStorage(V1_ACTIVE_DB_STORAGE_KEY, null);
            await api.connections.connectFile(v1Path);
          } else if (last?.engine === 'sqlite') {
            // Only local files reopen automatically; servers wait for the user
            await api.connections.connect(last.id);
          }
        }
      } catch (err) {
        console.warn('[DatabaseContext] Could not load connections:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [refreshProfiles]);

  const value: DatabaseContextValue = {
    activeConnection,
    profiles,
    canSavePasswords,
    isLoading,
    refreshProfiles,
    connectProfile: async (profileId, password) =>
      window.electronAPI ? window.electronAPI.connections.connect(profileId, password) : notInElectron(),
    connectFile: async (filePath) =>
      window.electronAPI ? window.electronAPI.connections.connectFile(filePath) : notInElectron(),
    disconnect: async () => {
      await window.electronAPI?.connections.disconnect();
      writeStorage(LAST_CONNECTION_STORAGE_KEY, null);
    },
    saveProfile: async (input) => {
      if (!window.electronAPI) return notInElectron();
      const res = await window.electronAPI.connections.save(input);
      await refreshProfiles();
      return res;
    },
    deleteProfile: async (id) => {
      if (!window.electronAPI) return notInElectron();
      const res = await window.electronAPI.connections.delete(id);
      await refreshProfiles();
      return res;
    },
    testConnection: async (target) =>
      window.electronAPI ? window.electronAPI.connections.test(target) : notInElectron(),
  };

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

// ─── Consumer Hook ────────────────────────────────────────────
export function useDatabaseContext(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error(
      '[SQL Sensi] useDatabaseContext must be used inside <DatabaseProvider>.'
    );
  }
  return ctx;
}
