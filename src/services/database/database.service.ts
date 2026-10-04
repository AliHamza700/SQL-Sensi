import { DatabaseSync } from 'node:sqlite';
import { DatabaseValidationResult, ServiceResult } from '@/src/types';
import { createError } from '@/src/utils/errors';
import { validateDatabaseFile } from './database.validator';

/**
 * Singleton service for managing the active SQLite database connection.
 * Runs in the Electron Main process.
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private db: DatabaseSync | null = null;
  private currentPath: string | null = null;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Connects to a SQLite database.
   * Validates the file first, then opens it in strictly read-only mode.
   * Closes any existing connection automatically.
   */
  public async connect(filePath: string): Promise<ServiceResult<DatabaseValidationResult>> {
    try {
      // 1. Validate file format
      const validation = await validateDatabaseFile(filePath);
      if (!validation.success) {
        return validation;
      }

      // 2. Close existing connection if any
      this.disconnect();

      // 3. Open connection in read-only mode
      this.db = new DatabaseSync(filePath, { readOnly: true });
      this.currentPath = filePath;

      return validation;
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Unknown error during connection';
      this.disconnect(); // Ensure clean state if open fails
      return {
        success: false,
        error: createError('DATABASE_ERROR', `Failed to open database: ${msg}`),
      };
    }
  }

  /**
   * Safely closes the active database connection.
   */
  public disconnect(): void {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {
        console.warn('[DatabaseService] Error closing database:', e);
      } finally {
        this.db = null;
        this.currentPath = null;
      }
    }
  }

  /**
   * Returns whether a database is currently connected.
   */
  public isConnected(): boolean {
    return this.db !== null;
  }

  /**
   * Gets the active connection. Throws if disconnected.
   * @internal Used by other main process services.
   */
  public getConnection(): DatabaseSync {
    if (!this.db) {
      throw new Error('No database connected.');
    }
    return this.db;
  }

  /**
   * Gets the absolute path of the currently active database.
   */
  public getActivePath(): string | null {
    return this.currentPath;
  }
}

export const databaseService = DatabaseService.getInstance();
