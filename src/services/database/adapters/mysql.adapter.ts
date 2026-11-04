import { createConnection } from 'mysql2/promise';
import type { Connection, FieldPacket, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { AppConfig } from '@/src/config';
import type {
  ColumnSchema,
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseSchema,
  DatabaseValidationResult,
  IndexSchema,
  QueryPlan,
  QueryResult,
  RelationshipSchema,
  ServerConnectionConfig,
  ServiceResult,
  TableSchema,
  WriteResult,
} from '@/src/types';
import { createError } from '@/src/utils/errors';
import type { DatabaseAdapter } from './database-adapter';
import {
  CONNECT_TIMEOUT_MS,
  ErrorTable,
  PlanTreeNode,
  SerialQueue,
  fail,
  flattenPlan,
  normalizeServerError,
  serverLabel,
  validateServerConfig,
} from './server-common';

type Row = Record<string, unknown>;

export const MYSQL_CAPABILITIES: DatabaseCapabilities = {
  transactions: true,
  explainPlan: true,
  affectedRowCounts: true,
  // max_execution_time applies to SELECT statements only
  queryTimeout: true,
  cancellation: false,
  placeholderStyle: 'question',
};

const MYSQL_ERRORS: ErrorTable = {
  ER_ACCESS_DENIED_ERROR: ['DATABASE_ERROR', 'The server rejected the username or password.'],
  ER_DBACCESS_DENIED_ERROR: ['DATABASE_ERROR', 'This user is not allowed to use the database.'],
  ER_BAD_DB_ERROR: ['DATABASE_ERROR', 'The database does not exist on this server.'],
  ER_TABLEACCESS_DENIED_ERROR: ['SQL_EXECUTION_ERROR', 'Permission denied. The database account is not allowed to read this table.'],
  ER_COLUMNACCESS_DENIED_ERROR: ['SQL_EXECUTION_ERROR', 'Permission denied. The database account is not allowed to read this column.'],
  ER_SPECIFIC_ACCESS_DENIED_ERROR: ['SQL_EXECUTION_ERROR', 'Permission denied. The database account is not allowed to do this.'],
  ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION: ['SQL_EXECUTION_ERROR', 'Only read-only queries are allowed (attempted write in a read-only transaction).'],
  ER_QUERY_TIMEOUT: ['SQL_EXECUTION_ERROR', 'The query took too long and was cancelled.'],
  ER_PARSE_ERROR: ['SQL_EXECUTION_ERROR', 'SQL syntax error.'],
  ER_NO_SUCH_TABLE: ['SQL_EXECUTION_ERROR', 'A table in the query does not exist.'],
  ER_BAD_FIELD_ERROR: ['SQL_EXECUTION_ERROR', 'A column in the query does not exist.'],
  PROTOCOL_CONNECTION_LOST: ['DATABASE_ERROR', 'The connection to the server was lost.'],
};

/**
 * Server-side file access that a read-only transaction does not stop.
 * Defence in depth: the database account should also lack the FILE privilege.
 */
const FILE_ACCESS_PATTERN = /\bINTO\s+(OUTFILE|DUMPFILE)\b|\bLOAD_FILE\s*\(/i;

/**
 * MySQL adapter using `mysql2` (pure JS, single connection).
 * Every read and EXPLAIN runs inside START TRANSACTION READ ONLY … ROLLBACK.
 * Multiple statements per query are disabled.
 */
export class MysqlAdapter implements DatabaseAdapter {
  readonly engine = 'mysql' as const;
  readonly capabilities = MYSQL_CAPABILITIES;

  private conn: Connection | null = null;
  private config: ServerConnectionConfig | null = null;
  private readonly queue = new SerialQueue();

  public async connect(config: ConnectionConfig): Promise<ServiceResult<DatabaseValidationResult>> {
    if (config.engine !== 'mysql') {
      return fail(createError('DATABASE_ERROR', `MySQL adapter cannot open a ${config.engine} connection.`));
    }
    const invalid = validateServerConfig(config);
    if (invalid) {
      return fail(createError('DATABASE_ERROR', invalid));
    }

    await this.disconnect();

    let conn: Connection;
    try {
      conn = await createConnection({
        host: config.host,
        port: config.port,
        database: config.database,
        user: config.user,
        password: config.password,
        ssl: config.tls.enabled ? { rejectUnauthorized: true, ca: config.tls.ca } : undefined,
        connectTimeout: CONNECT_TIMEOUT_MS,
        multipleStatements: false,
        // Keep exact values: dates as server text, BIGINT/DECIMAL as strings
        dateStrings: true,
        supportBigNumbers: true,
        bigNumberStrings: true,
      });
    } catch (error: unknown) {
      return fail(normalizeServerError(error, 'Failed to connect', MYSQL_ERRORS, [config.password]));
    }

    // Without a listener, a dropped connection would crash the main process.
    conn.on('error', (err: unknown) => {
      console.warn('[MysqlAdapter] Connection lost:', this.normalize(err, 'Connection').message);
      if (this.conn === conn) {
        this.conn = null;
        this.config = null;
      }
    });

    try {
      await conn.query('SET SESSION max_execution_time = ?', [AppConfig.query.timeoutMs]);
    } catch (error: unknown) {
      await conn.end().catch(() => undefined);
      return fail(normalizeServerError(error, 'Failed to configure the session', MYSQL_ERRORS, [config.password]));
    }

    this.conn = conn;
    this.config = config;
    return { success: true, data: { valid: true } };
  }

  public async disconnect(): Promise<void> {
    const conn = this.conn;
    this.conn = null;
    this.config = null;
    if (conn) {
      try {
        await conn.end();
      } catch (e) {
        console.warn('[MysqlAdapter] Error closing connection:', this.normalize(e, 'Disconnect').message);
      }
    }
  }

  public isConnected(): boolean {
    return this.conn !== null;
  }

  public getLabel(): string | null {
    return this.config ? serverLabel(this.config) : null;
  }

  public async executeRead(sql: string, params: unknown[] = []): Promise<ServiceResult<QueryResult>> {
    if (FILE_ACCESS_PATTERN.test(sql)) {
      return fail(createError('SQL_VALIDATION_ERROR', 'Reading or writing server files is not allowed.'));
    }
    return this.queue.run(async () => {
      try {
        const startTime = performance.now();
        const [rows, fields] = await this.readOnly(sql, params);
        const executionTimeMs = performance.now() - startTime;
        return {
          success: true,
          data: {
            columns: fields.map(f => f.name),
            rows,
            rowCount: rows.length,
            executionTimeMs,
          },
        };
      } catch (error: unknown) {
        return fail(this.normalize(error, 'Query failed'));
      }
    });
  }

  /**
   * Runs one write inside a read-write transaction, committed on success and
   * rolled back on error. Policy is checked by the caller. Server-file access is
   * still refused here as defence in depth.
   */
  public async executeWrite(sql: string, params: unknown[] = []): Promise<ServiceResult<WriteResult>> {
    if (FILE_ACCESS_PATTERN.test(sql)) {
      return fail(createError('SQL_VALIDATION_ERROR', 'Reading or writing server files is not allowed.'));
    }
    return this.queue.run(async () => {
      try {
        const start = performance.now();
        const conn = this.getConn();
        await conn.query('START TRANSACTION');
        try {
          const [result] = await conn.query<ResultSetHeader>({ sql, values: params });
          const affectedRows = typeof result?.affectedRows === 'number' ? result.affectedRows : null;
          await conn.query('COMMIT');
          return {
            success: true as const,
            data: { affectedRows, executionTimeMs: performance.now() - start, committed: true },
          };
        } catch (inner) {
          await conn.query('ROLLBACK').catch(() => undefined);
          throw inner;
        }
      } catch (error: unknown) {
        return fail(this.normalize(error, 'Write failed'));
      }
    });
  }

  public async explain(sql: string): Promise<ServiceResult<QueryPlan>> {
    if (FILE_ACCESS_PATTERN.test(sql)) {
      return fail(createError('SQL_VALIDATION_ERROR', 'Reading or writing server files is not allowed.'));
    }
    return this.queue.run(async () => {
      try {
        // Plain EXPLAIN only estimates; EXPLAIN ANALYZE would execute the statement.
        try {
          const [rows] = await this.readOnly(`EXPLAIN FORMAT=TREE ${sql}`, []);
          const text = String(rows[0]?.EXPLAIN ?? '');
          if (text) return { success: true, data: flattenPlan(parseTreePlan(text)) };
        } catch (treeError: unknown) {
          // FORMAT=TREE needs MySQL 8.0.16+; only a syntax error means "unsupported".
          if ((treeError as { code?: string })?.code !== 'ER_PARSE_ERROR') throw treeError;
        }
        const [rows] = await this.readOnly(`EXPLAIN ${sql}`, []);
        return { success: true, data: flattenPlan(rows.map(tabularPlanNode)) };
      } catch (error: unknown) {
        return fail(this.normalize(error, 'Explain Query failed'));
      }
    });
  }

  public async getSchema(): Promise<ServiceResult<DatabaseSchema>> {
    return this.queue.run(async () => {
      try {
        const [tableRows] = await this.readOnly(`
          SELECT TABLE_NAME AS table_name, TABLE_ROWS AS row_estimate
          FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'
          ORDER BY TABLE_NAME`, []);
        const [columnRows] = await this.readOnly(`
          SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name, COLUMN_TYPE AS column_type,
                 IS_NULLABLE AS is_nullable, COLUMN_DEFAULT AS column_default, COLUMN_KEY AS column_key
          FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
          ORDER BY TABLE_NAME, ORDINAL_POSITION`, []);
        const [fkRows] = await this.readOnly(`
          SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name,
                 REFERENCED_TABLE_NAME AS ref_table, REFERENCED_COLUMN_NAME AS ref_column
          FROM information_schema.KEY_COLUMN_USAGE
          WHERE TABLE_SCHEMA = DATABASE() AND REFERENCED_TABLE_NAME IS NOT NULL
          ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION`, []);
        const indexRows = await this.optionalMetadata(`
          SELECT TABLE_NAME AS table_name, INDEX_NAME AS index_name, NON_UNIQUE AS non_unique, COLUMN_NAME AS column_name
          FROM information_schema.STATISTICS
          WHERE TABLE_SCHEMA = DATABASE()
          ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`);
        const viewRows = await this.optionalMetadata(`
          SELECT TABLE_NAME AS table_name, VIEW_DEFINITION AS view_definition
          FROM information_schema.VIEWS
          WHERE TABLE_SCHEMA = DATABASE()
          ORDER BY TABLE_NAME`);

        return { success: true, data: buildSchema(this.config?.database ?? 'Unknown', tableRows, columnRows, fkRows, indexRows, viewRows) };
      } catch (error: unknown) {
        const normalized = this.normalize(error, 'Failed to extract schema');
        return fail(createError('SCHEMA_ERROR', normalized.message, normalized.details));
      }
    });
  }

  // ─── Internals ──────────────────────────────────────────────

  private getConn(): Connection {
    if (!this.conn) {
      throw new Error('No database connected.');
    }
    return this.conn;
  }

  /** Runs one statement inside a read-only transaction that is always rolled back. */
  private async readOnly(sql: string, params: unknown[]): Promise<[Row[], FieldPacket[]]> {
    const conn = this.getConn();
    await conn.query('START TRANSACTION READ ONLY');
    try {
      const [rows, fields] = await conn.query<RowDataPacket[]>(sql, params);
      return [rows as Row[], fields ?? []];
    } finally {
      await conn.query('ROLLBACK').catch(() => undefined);
    }
  }

  /** Metadata that may be hidden by permissions; missing sections degrade to empty. */
  private async optionalMetadata(sql: string): Promise<Row[]> {
    try {
      return (await this.readOnly(sql, []))[0];
    } catch (e) {
      console.warn('[MysqlAdapter] Optional metadata unavailable:', this.normalize(e, 'Metadata').message);
      return [];
    }
  }

  private normalize(error: unknown, prefix: string) {
    if ((error as Error)?.message === 'No database connected.') {
      return createError('SQL_EXECUTION_ERROR', `${prefix}: No database connected.`);
    }
    return normalizeServerError(error, prefix, MYSQL_ERRORS, this.config ? [this.config.password] : []);
  }
}

// ─── Plan & schema mapping (pure, exported for tests) ─────────

/** Parses `EXPLAIN FORMAT=TREE` text ("-> step" lines, indented 4 spaces per level). */
export function parseTreePlan(text: string): PlanTreeNode[] {
  const roots: PlanTreeNode[] = [];
  const stack: { indent: number; node: PlanTreeNode }[] = [];

  for (const line of text.split('\n')) {
    const arrow = line.indexOf('->');
    if (arrow < 0) continue;
    const detail = line.slice(arrow + 2).trim();
    const node: PlanTreeNode = { detail, operation: detail.split(/[:(]/)[0].trim(), children: [] };

    while (stack.length && stack[stack.length - 1].indent >= arrow) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
    stack.push({ indent: arrow, node });
  }
  return roots;
}

/** One row of traditional tabular EXPLAIN output as a flat plan step. */
export function tabularPlanNode(row: Row): PlanTreeNode {
  const parts = [`${String(row.select_type ?? 'SIMPLE')} ${String(row.table ?? '')}`.trim()];
  if (row.type) parts.push(`access ${String(row.type)}`);
  if (row.key) parts.push(`using ${String(row.key)}`);
  if (row.rows !== undefined && row.rows !== null) parts.push(`(est. rows ${String(row.rows)})`);
  return { detail: parts.join(' '), operation: row.type ? String(row.type) : undefined, children: [] };
}

export function buildSchema(
  databaseName: string,
  tableRows: Row[],
  columnRows: Row[],
  fkRows: Row[],
  indexRows: Row[],
  viewRows: Row[]
): DatabaseSchema {
  const tables = new Map<string, TableSchema>();
  for (const row of tableRows) {
    const name = String(row.table_name);
    const estimate = Number(row.row_estimate);
    tables.set(name, {
      name,
      columns: [],
      primaryKeys: [],
      foreignKeys: [],
      // information_schema.TABLES.TABLE_ROWS is an estimate for InnoDB
      rowCount: row.row_estimate === null || !Number.isFinite(estimate) ? undefined : estimate,
    });
  }

  for (const row of columnRows) {
    const table = tables.get(String(row.table_name));
    if (!table) continue; // view columns
    const isPrimaryKey = row.column_key === 'PRI';
    const column: ColumnSchema = {
      name: String(row.column_name),
      type: String(row.column_type).toUpperCase(),
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default === null || row.column_default === undefined ? null : String(row.column_default),
      isPrimaryKey,
      isForeignKey: false,
    };
    table.columns.push(column);
    if (isPrimaryKey) table.primaryKeys.push(column.name);
  }

  const relationships: RelationshipSchema[] = [];
  for (const row of fkRows) {
    const tableName = String(row.table_name);
    const table = tables.get(tableName);
    if (!table) continue;
    const fk = {
      columnName: String(row.column_name),
      referencedTable: String(row.ref_table),
      referencedColumn: String(row.ref_column),
    };
    table.foreignKeys.push(fk);
    const column = table.columns.find(c => c.name === fk.columnName);
    if (column) column.isForeignKey = true;
    relationships.push({ fromTable: tableName, fromColumn: fk.columnName, toTable: fk.referencedTable, toColumn: fk.referencedColumn });
  }

  const indexes = new Map<string, IndexSchema>();
  for (const row of indexRows) {
    const tableName = String(row.table_name);
    if (!tables.has(tableName)) continue;
    const key = `${tableName}.${String(row.index_name)}`;
    const index = indexes.get(key) ?? { name: String(row.index_name), tableName, columns: [], unique: Number(row.non_unique) === 0 };
    if (row.column_name !== null && row.column_name !== undefined) index.columns.push(String(row.column_name));
    indexes.set(key, index);
  }

  return {
    databaseName,
    tables: [...tables.values()],
    relationships,
    indexes: [...indexes.values()],
    views: viewRows.map(row => ({
      name: String(row.table_name),
      sql: row.view_definition ? String(row.view_definition) : undefined,
    })),
  };
}
