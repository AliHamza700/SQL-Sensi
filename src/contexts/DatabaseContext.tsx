'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

// ─── Storage Key ─────────────────────────────────────────────
const ACTIVE_DB_STORAGE_KEY = 'sql_sensi_active_db_path';

// ─── Context Type ─────────────────────────────────────────────
export interface DatabaseContextValue {
  /** Absolute path to the currently active SQLite database */
  activeDatabasePath: string | null;
  /** Function to set the active database, persisting it to localStorage */
  setActiveDatabasePath: (path: string | null) => void;
  /** True while initially loading the persisted path */
  isLoading: boolean;
}

// ─── Create Context ───────────────────────────────────────────
const DatabaseContext = createContext<DatabaseContextValue | null>(null);
DatabaseContext.displayName = 'DatabaseContext';

// ─── Provider ─────────────────────────────────────────────────
export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const [activeDatabasePath, setPathState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore active database path on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(ACTIVE_DB_STORAGE_KEY);
      if (stored) setPathState(stored);
    } catch {
      // Ignore localStorage errors
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setActiveDatabasePath = (path: string | null) => {
    setPathState(path);
    try {
      if (path) {
        localStorage.setItem(ACTIVE_DB_STORAGE_KEY, path);
      } else {
        localStorage.removeItem(ACTIVE_DB_STORAGE_KEY);
      }
    } catch {
      // Ignore
    }
  };

  return (
    <DatabaseContext.Provider value={{ activeDatabasePath, setActiveDatabasePath, isLoading }}>
      {children}
    </DatabaseContext.Provider>
  );
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
