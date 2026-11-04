import { DatabaseSync } from 'node:sqlite';
import * as path from 'node:path';
import type {
  ColumnSchema,
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseSchema,
  DatabaseValidationResult,
  ForeignKeySchema,
  IndexSchema,
  QueryPlan,
  QueryPlanNode,
  QueryResult,
  RelationshipSchema,
  ServiceResult,
  TableSchema,
  ViewSchema,
  WriteResult,
} from '@/src/types';
import { createError } from '@/src/utils/errors';
import { validateDatabaseFile } from '../database.validator';
import type { DatabaseAdapter } from './database-adapter';

type Row = Record<string, unknown>;

export const SQLITE_CAPABILITIES: DatabaseCapabilities = {
  transactions: true,
  explainPlan: true,
  affectedRowCounts: true,
  // node:sqlite runs synchronously; it has no per-query timeout or cancel.
  queryTimeout: false,
  cancellation: false,
  placeholderStyle: 'question',
};

/** Message of a thrown value, whether or not it is an `Error` instance from this realm. */
function errorMessage(error: unknown): string | null {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message ? message : null;
}

/** Quotes an identifier read from the database (table/index names are untrusted). */
function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/**
 * SQLite adapter using the native `node:sqlite` module.
 * Files are always opened read-only; this is the layer that stops writes
 * that slip past text-based SQL checks.
 */
export class SqliteAdapter implements DatabaseAdapter {
  readonly engine = 'sqlite' as const;
  readonly capabilities = SQLITE_CAPABILITIES;

  private db: DatabaseSync | null = null;
  private filePath: string | null = null;

  public async connect(config: ConnectionConfig): Promise<ServiceResult<DatabaseValidationResult>> {
    if (config.engine !== 'sqlite') {
      return {
        success: false,
        error: createError('DATABASE_ERROR', `SQLite adapter cannot open a ${config.engine} connection.`),
      };
    }

    try {
      // 1. Validate file format
      const validation = await validateDatabaseFile(config.filePath);
      if (!validation.success) {
        return validation;
      }

      // 2. Close existing connection if any
      await this.disconnect();

      // 3. Open connection in read-only mode
      // @ts-expect-error - readOnly is supported by node:sqlite (verified on Electron's Node 22.16) but missing in current @types/node
      this.db = new DatabaseSync(config.filePath, { readOnly: true });
      this.filePath = config.filePath;

      return validation;
    } catch (error: unknown) {
      const msg = errorMessage(error) ?? 'Unknown error during connection';
      await this.disconnect(); // Ensure clean state if open fails
      return {
        success: false,
        error: createError('DATABASE_ERROR', `Failed to open database: ${msg}`),
      };
    }
  }

  public async disconnect(): Promise<void> {
    if (this.db) {
      try {
        this.db.close();
      } catch (e) {
        console.warn('[SqliteAdapter] Error closing database:', e);
      } finally {
        this.db = null;
        this.filePath = null;
      }
    }
  }

  public isConnected(): boolean {
    return this.db !== null;
  }

  public getLabel(): string | null {
    return this.filePath ? path.basename(this.filePath) : null;
  }

  /** Absolute path of the open file. */
  public getFilePath(): string | null {
    return this.filePath;
  }

  /**
   * Raw driver handle.
   * @internal Main-process compatibility for DatabaseService.getConnection(); do not use in new code.
   */
  public getRawConnection(): DatabaseSync {
    return this.getDb();
  }

  public async executeRead(sql: string, params: unknown[] = []): Promise<ServiceResult<QueryResult>> {
    try {
      const db = this.getDb(); // Throws if disconnected

      const startTime = performance.now();
      const stmt = db.prepare(sql);

      // Extract column metadata
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const columnsMetadata = (stmt as any).columns();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const columns = columnsMetadata.map((c: any) => c.name);

      // Execute query
      const rows = stmt.all(...(params as never[])) as Row[];
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
    } catch (error: unknown) {
      // node:sqlite errors may not pass `instanceof Error` (other realm), so read .message directly
      const msg = errorMessage(error) ?? 'Unknown query execution error';
      return {
        success: false,
        error: createError('SQL_EXECUTION_ERROR', `Query failed: ${msg}`),
      };
    }
  }

  /**
   * Runs one write in a transaction on a SHORT-LIVED WRITABLE handle, so the
   * long-lived main handle stays read-only (the V1 safety guarantee). Committed
   * on success, rolled back on any error. Policy is checked by the caller.
   */
  public async executeWrite(sql: string, params: unknown[] = []): Promise<ServiceResult<WriteResult>> {
    if (!this.filePath) {
      return { success: false, error: createError('SQL_EXECUTION_ERROR', 'Write failed: No database connected.') };
    }

    const start = performance.now();
    let writable: DatabaseSync | null = null;
    try {
      writable = new DatabaseSync(this.filePath); // writable handle (default mode)
      writable.exec('BEGIN IMMEDIATE');
      let changes = 0;
      try {
        const stmt = writable.prepare(sql);
        const info = stmt.run(...(params as never[]));
        changes = Number(info.changes ?? 0);
        writable.exec('COMMIT');
      } catch (inner) {
        try { writable.exec('ROLLBACK'); } catch { /* no active txn */ }
        throw inner;
      }
      return {
        success: true,
        data: { affectedRows: changes, executionTimeMs: performance.now() - start, committed: true },
      };
    } catch (error: unknown) {
      const msg = errorMessage(error) ?? 'Unknown write error';
      return { success: false, error: createError('SQL_EXECUTION_ERROR', `Write failed: ${msg}`) };
    } finally {
      if (writable) {
        try { writable.close(); } catch { /* ignore */ }
      }
    }
  }

  public async explain(sql: string): Promise<ServiceResult<QueryPlan>> {
    try {
      const db = this.getDb(); // Throws if disconnected

      const stmt = db.prepare(`EXPLAIN QUERY PLAN ${sql}`);

      // Expected structure from SQLite EXPLAIN QUERY PLAN: id, parent, notused, detail
      const rows = stmt.all() as { id: number; parent: number; detail: string }[];

      const nodes: QueryPlanNode[] = rows.map(r => ({
        id: r.id,
        parentId: r.parent,
        detail: r.detail,
      }));

      // Generate a raw text representation for fallback/advanced view
      const rawOutput = nodes.map(n => {
        const indent = '  '.repeat(n.parentId > 0 ? 1 : 0); // Simplified indentation, for a real tree we'd need recursive building
        return `${indent}- ${n.detail}`;
      }).join('\n');

      return {
        success: true,
        data: {
          nodes,
          rawOutput,
        },
      };
    } catch (error: unknown) {
      const msg = errorMessage(error) ?? 'Unknown explain query error';
      return {
        success: false,
        error: createError('SQL_EXECUTION_ERROR', `Explain Query failed: ${msg}`),
      };
    }
  }

  public async getSchema(): Promise<ServiceResult<DatabaseSchema>> {
    try {
      const databaseName = this.getLabel() ?? 'Unknown';

      // 1. Extract Views
      const views = this.extractViews();

      // 2. Extract Tables
      const tableNames = this.getTableNames();

      const tables: TableSchema[] = [];
      const globalRelationships: RelationshipSchema[] = [];
      const globalIndexes: IndexSchema[] = [];

      for (const tableName of tableNames) {
        // Build basic table schema
        const columns = this.getColumns(tableName);
        const primaryKeys = columns.filter(c => c.isPrimaryKey).map(c => c.name);
        const foreignKeys = this.getForeignKeys(tableName);

        // Convert local foreign keys into global relationships
        for (const fk of foreignKeys) {
          globalRelationships.push({
            fromTable: tableName,
            fromColumn: fk.columnName,
            toTable: fk.referencedTable,
            toColumn: fk.referencedColumn,
          });
        }

        // Row count — COUNT(*) is fast enough for moderately sized SQLite tables
        let rowCount = 0;
        try {
          const countRows = this.all(`SELECT COUNT(*) as count FROM ${quoteIdent(tableName)}`);
          if (countRows.length > 0) {
            rowCount = Number(countRows[0].count) || 0;
          }
        } catch (e) {
          console.warn(`Failed to count rows for table ${tableName}`, e);
        }

        tables.push({
          name: tableName,
          columns,
          primaryKeys,
          foreignKeys,
          rowCount,
        });

        // Indexes
        globalIndexes.push(...this.getIndexes(tableName));
      }

      return {
        success: true,
        data: {
          databaseName,
          tables,
          relationships: globalRelationships,
          indexes: globalIndexes,
          views,
        },
      };
    } catch (error: unknown) {
      const msg = errorMessage(error) ?? 'Unknown schema extraction error';
      return {
        success: false,
        error: createError('SCHEMA_ERROR', `Failed to extract schema: ${msg}`),
      };
    }
  }

  // ─── Internals ──────────────────────────────────────────────

  private getDb(): DatabaseSync {
    if (!this.db) {
      throw new Error('No database connected.');
    }
    return this.db;
  }

  private all(sql: string): Row[] {
    return this.getDb().prepare(sql).all() as Row[];
  }

  private getTableNames(): string[] {
    return this.all(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `).map(row => String(row.name));
  }

  private extractViews(): ViewSchema[] {
    return this.all(`
      SELECT name, sql FROM sqlite_master
      WHERE type='view'
      ORDER BY name ASC
    `).map(row => ({
      name: String(row.name),
      sql: row.sql ? String(row.sql) : undefined,
    }));
  }

  private getColumns(tableName: string): ColumnSchema[] {
    // PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
    return this.all(`PRAGMA table_info(${quoteIdent(tableName)})`).map(row => ({
      name: String(row.name),
      type: String(row.type).toUpperCase(),
      nullable: row.notnull === 0,
      defaultValue: row.dflt_value !== null ? String(row.dflt_value) : null,
      isPrimaryKey: Number(row.pk) > 0,
      // Foreign keys are reported on TableSchema.foreignKeys
      isForeignKey: false,
    }));
  }

  private getForeignKeys(tableName: string): ForeignKeySchema[] {
    // PRAGMA foreign_key_list returns: id, seq, table, from, to, on_update, on_delete, match
    return this.all(`PRAGMA foreign_key_list(${quoteIdent(tableName)})`).map(row => ({
      columnName: String(row.from),
      referencedTable: String(row.table),
      referencedColumn: String(row.to),
    }));
  }

  private getIndexes(tableName: string): IndexSchema[] {
    const indexes: IndexSchema[] = [];

    for (const row of this.all(`PRAGMA index_list(${quoteIdent(tableName)})`)) {
      const indexName = String(row.name);
      const columns = this.all(`PRAGMA index_info(${quoteIdent(indexName)})`).map(colRow => String(colRow.name));
      indexes.push({
        name: indexName,
        tableName,
        columns,
        unique: Number(row.unique) === 1,
      });
    }

    return indexes;
  }
}
