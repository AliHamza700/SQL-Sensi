import type { DatabaseSync } from 'node:sqlite';
import type {
  ConnectionConfig,
  ConnectionStatus,
  DatabaseCapabilities,
  DatabaseSchema,
  DatabaseValidationResult,
  QueryPlan,
  QueryResult,
  ServiceResult,
  WriteResult,
} from '@/src/types';
import { createError } from '@/src/utils/errors';
import { classifySqlOperation } from '@/src/utils/sql-operation';
import type { DatabaseAdapter } from './adapters/database-adapter';
import { createAdapter } from './adapters/registry';
import { SqliteAdapter } from './adapters/sqlite.adapter';

// First-keyword guard kept from Version 1. Defence in depth only — the IPC layer
// runs sqlSecurityService first, SQLite files are opened read-only, and server
// adapters run every read inside a read-only transaction.
const FORBIDDEN_PREFIXES = [
  'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'REPLACE', 'TRUNCATE',
  // Server statements that change state or run code outside normal reads
  'COPY', 'CALL', 'DO', 'SET', 'GRANT', 'REVOKE', 'LOCK', 'LOAD', 'MERGE',
];

function startsWithForbidden(sql: string): boolean {
  const firstWord = sql.trim().toUpperCase().split(/[^A-Z_]/)[0];
  return FORBIDDEN_PREFIXES.includes(firstWord);
}

/**
 * Singleton owning the single active database connection (one adapter at a time).
 * Engine-specific work is delegated to the adapter. Runs in the Electron Main process.
 */
export class DatabaseService {
  private static instance: DatabaseService;
  private adapter: DatabaseAdapter | null = null;
  private currentPath: string | null = null;

  private constructor() {}

  public static getInstance(): DatabaseService {
    if (!DatabaseService.instance) {
      DatabaseService.instance = new DatabaseService();
    }
    return DatabaseService.instance;
  }

  /**
   * Connects to a SQLite database file (Version 1 entry point used by IPC).
   */
  public async connect(filePath: string): Promise<ServiceResult<DatabaseValidationResult>> {
    return this.connectWith({ engine: 'sqlite', filePath });
  }

  /**
   * Opens a connection with a new adapter, then makes it the active one.
   * If opening fails, the previous connection (if any) stays active.
   */
  public async connectWith(config: ConnectionConfig): Promise<ServiceResult<DatabaseValidationResult>> {
    const created = createAdapter(config.engine);
    if (!created.success) {
      return { success: false, error: created.error };
    }

    const next = created.data;
    const result = await next.connect(config);
    if (!result.success) {
      return result;
    }

    await this.disconnect();
    this.adapter = next;
    this.currentPath = config.engine === 'sqlite' ? config.filePath : null;
    return result;
  }

  /**
   * Closes the active connection. State is cleared immediately, before the driver finishes closing.
   */
  public async disconnect(): Promise<void> {
    const previous = this.adapter;
    this.adapter = null;
    this.currentPath = null;
    if (previous) {
      try {
        await previous.disconnect();
      } catch (e) {
        console.warn('[DatabaseService] Error closing database:', e);
      }
    }
  }

  /**
   * Returns whether a database is currently connected.
   */
  public isConnected(): boolean {
    return this.adapter?.isConnected() ?? false;
  }

  /** Secret-free summary of the active connection */
  public getStatus(): ConnectionStatus {
    const active = this.getActiveAdapter();
    return {
      connected: active !== null,
      engine: active?.engine ?? null,
      label: active?.getLabel() ?? null,
    };
  }

  /** Capabilities of the active engine, or null when disconnected */
  public getCapabilities(): DatabaseCapabilities | null {
    return this.getActiveAdapter()?.capabilities ?? null;
  }

  private getActiveAdapter(): DatabaseAdapter | null {
    return this.adapter?.isConnected() ? this.adapter : null;
  }

  /**
   * Gets the raw SQLite handle. Throws if disconnected.
   * @deprecated Kept for Version 1 compatibility; use the service methods instead.
   */
  public getConnection(): DatabaseSync {
    if (!(this.adapter instanceof SqliteAdapter) || !this.adapter.isConnected()) {
      throw new Error('No database connected.');
    }
    return this.adapter.getRawConnection();
  }

  /**
   * Gets the absolute path of the active SQLite file (null for server connections).
   */
  public getActivePath(): string | null {
    return this.currentPath;
  }

  /**
   * Executes a read-only query on the active database.
   */
  public async executeQuery(sql: string, params: unknown[] = []): Promise<ServiceResult<QueryResult>> {
    if (!this.adapter) {
      return {
        success: false,
        error: createError('SQL_EXECUTION_ERROR', 'Query failed: No database connected.'),
      };
    }

    if (startsWithForbidden(sql)) {
      return {
        success: false,
        error: createError('SQL_VALIDATION_ERROR', 'Only read-only queries are allowed.'),
      };
    }

    return this.adapter.executeRead(sql, params);
  }

  /**
   * Executes a single INSERT/UPDATE/DELETE on the active database (V2 Phase 7).
   * The caller (WriteService) MUST have authorized the statement against
   * identity and policy first; this is the execution layer, with a last-line
   * defence-in-depth classification check. The adapter runs it in a transaction.
   */
  public async executeWrite(sql: string, params: unknown[] = []): Promise<ServiceResult<WriteResult>> {
    if (!this.adapter) {
      return { success: false, error: createError('SQL_EXECUTION_ERROR', 'Write failed: No database connected.') };
    }

    const operation = classifySqlOperation(sql);
    if (operation !== 'insert' && operation !== 'update' && operation !== 'delete') {
      return {
        success: false,
        error: createError('SQL_VALIDATION_ERROR', 'Only INSERT, UPDATE or DELETE statements can be run as writes.'),
      };
    }

    return this.adapter.executeWrite(sql, params);
  }

  /**
   * Returns the query plan for the given SQL on the active database.
   */
  public async explainQuery(sql: string): Promise<ServiceResult<QueryPlan>> {
    if (!this.adapter) {
      return {
        success: false,
        error: createError('SQL_EXECUTION_ERROR', 'Explain Query failed: No database connected.'),
      };
    }

    if (startsWithForbidden(sql)) {
      return {
        success: false,
        error: createError('SQL_VALIDATION_ERROR', 'Only read-only queries can be explained.'),
      };
    }

    return this.adapter.explain(sql);
  }

  /**
   * Extracts the schema of the active database.
   */
  public async getSchema(): Promise<ServiceResult<DatabaseSchema>> {
    if (!this.adapter) {
      return {
        success: false,
        error: createError('DATABASE_ERROR', 'No database is currently connected.'),
      };
    }
    return this.adapter.getSchema();
  }
}

export const databaseService = DatabaseService.getInstance();
