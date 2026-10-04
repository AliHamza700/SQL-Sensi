import { DatabaseSync } from 'node:sqlite';
import { DatabaseValidationResult, ServiceResult, QueryResult } from '@/src/types';
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

  /**
   * Safely executes a read-only query on the active database.
   * Tracks execution time and handles SQLite errors securely.
   */
  public executeQuery(sql: string, params: unknown[] = []): ServiceResult<QueryResult> {
    try {
      const db = this.getConnection(); // Throws if disconnected
      
      // Basic text-based safety check (AST parsing comes in Phase 6)
      const upperSql = sql.trim().toUpperCase();
      const forbidden = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'REPLACE', 'TRUNCATE'];
      if (forbidden.some(word => upperSql.startsWith(word))) {
        return {
          success: false,
          error: createError('SQL_VALIDATION_ERROR', 'Only read-only queries are allowed.'),
        };
      }

      const startTime = performance.now();
      const stmt = db.prepare(sql);
      
      // Extract column metadata
      const columnsMetadata = stmt.columns();
      const columns = columnsMetadata.map((c: any) => c.name);

      // Execute query
      const rows = stmt.all(...params) as Record<string, unknown>[];
      const executionTimeMs = performance.now() - startTime;

      return {
        success: true,
        data: {
          columns,
          rows,
          rowCount: rows.length,
          executionTimeMs,
        },
      };

    } catch (error: any) {
      const msg = error?.message || 'Unknown query execution error';
      return {
        success: false,
        error: createError('SQL_EXECUTION_ERROR', `Query failed: ${msg}`),
      };
    }
  }
}

export const databaseService = DatabaseService.getInstance();
