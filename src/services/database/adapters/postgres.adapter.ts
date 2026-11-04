import { Client, types as pgTypes } from 'pg';
import type { ClientConfig, QueryConfig, QueryResult as PgQueryResult } from 'pg';
import { AppConfig } from '@/src/config';
import type {
  ColumnSchema,
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseSchema,
  DatabaseValidationResult,
  ForeignKeySchema,
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

export const POSTGRES_CAPABILITIES: DatabaseCapabilities = {
  transactions: true,
  explainPlan: true,
  affectedRowCounts: true,
  queryTimeout: true,
  // The driver can cancel, but no caller uses it yet.
  cancellation: false,
  placeholderStyle: 'dollar-numbered',
};

/** SQLSTATE codes → user-facing text */
const PG_ERRORS: ErrorTable = {
  '28P01': ['DATABASE_ERROR', 'The server rejected the username or password.'],
  '28000': ['DATABASE_ERROR', 'This user is not allowed to connect to the database.'],
  '3D000': ['DATABASE_ERROR', 'The database does not exist on this server.'],
  '42501': ['SQL_EXECUTION_ERROR', 'Permission denied. The database account is not allowed to do this.'],
  '25006': ['SQL_EXECUTION_ERROR', 'Only read-only queries are allowed (attempted write in a read-only transaction).'],
  '57014': ['SQL_EXECUTION_ERROR', 'The query took too long and was cancelled.'],
  '42601': ['SQL_EXECUTION_ERROR', 'SQL syntax error.'],
  '42P01': ['SQL_EXECUTION_ERROR', 'A table in the query does not exist.'],
  '42703': ['SQL_EXECUTION_ERROR', 'A column in the query does not exist.'],
};

/** Date/time types returned as the server's text instead of JS Dates (avoids timezone shifts). */
const TEXT_TYPE_OIDS = new Set<number>([
  1082, // date
  1083, // time
  1114, // timestamp
  1184, // timestamptz
  1266, // timetz
]);

const PG_TYPES = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    TEXT_TYPE_OIDS.has(oid)
      ? (value: string) => value
      : pgTypes.getTypeParser(oid, format as 'text')) as typeof pgTypes.getTypeParser,
};

const SYSTEM_SCHEMAS = `('pg_catalog', 'information_schema', 'pg_toast')`;

/** `table` in public, `schema.table` elsewhere */
function qualifiedName(schema: unknown, table: unknown): string {
  return schema === 'public' ? String(table) : `${String(schema)}.${String(table)}`;
}

/**
 * PostgreSQL adapter using `pg` (pure JS, single connection).
 * Every read and EXPLAIN runs inside BEGIN READ ONLY … ROLLBACK, using the
 * extended query protocol so the server rejects multi-statement input.
 */
export class PostgresAdapter implements DatabaseAdapter {
  readonly engine = 'postgresql' as const;
  readonly capabilities = POSTGRES_CAPABILITIES;

  private client: Client | null = null;
  private config: ServerConnectionConfig | null = null;
  private readonly queue = new SerialQueue();

  public async connect(config: ConnectionConfig): Promise<ServiceResult<DatabaseValidationResult>> {
    if (config.engine !== 'postgresql') {
      return fail(createError('DATABASE_ERROR', `PostgreSQL adapter cannot open a ${config.engine} connection.`));
    }
    const invalid = validateServerConfig(config);
    if (invalid) {
      return fail(createError('DATABASE_ERROR', invalid));
    }

    await this.disconnect();

    const clientConfig: ClientConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.tls.enabled ? { rejectUnauthorized: true, ca: config.tls.ca } : false,
      connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
      statement_timeout: AppConfig.query.timeoutMs,
      application_name: 'SQL Sensi',
      types: PG_TYPES,
    };

    const client = new Client(clientConfig);
    // Without a listener, a dropped connection would crash the main process.
    client.on('error', (err) => {
      console.warn('[PostgresAdapter] Connection lost:', this.normalize(err, 'Connection').message);
      if (this.client === client) {
        this.client = null;
        this.config = null;
      }
    });

    try {
      await client.connect();
    } catch (error: unknown) {
      const secrets = [config.password];
      await client.end().catch(() => undefined);
      return fail(normalizeServerError(error, 'Failed to connect', PG_ERRORS, secrets));
    }

    this.client = client;
    this.config = config;
    return { success: true, data: { valid: true } };
  }

  public async disconnect(): Promise<void> {
    const client = this.client;
    this.client = null;
    this.config = null;
    if (client) {
      try {
        await client.end();
      } catch (e) {
        console.warn('[PostgresAdapter] Error closing connection:', this.normalize(e, 'Disconnect').message);
      }
    }
  }

  public isConnected(): boolean {
    return this.client !== null;
  }

  public getLabel(): string | null {
    return this.config ? serverLabel(this.config) : null;
  }

  public async executeRead(sql: string, params: unknown[] = []): Promise<ServiceResult<QueryResult>> {
    return this.queue.run(async () => {
      try {
        const startTime = performance.now();
        const res = await this.readOnly(sql, params);
        const executionTimeMs = performance.now() - startTime;
        const rows = res.rows as Row[];
        return {
          success: true,
          data: {
            columns: res.fields.map(f => f.name),
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
   * Runs one write inside a read-write transaction (extended protocol rejects
   * multi-statement input), committed on success and rolled back on error.
   * Policy is checked by the caller.
   */
  public async executeWrite(sql: string, params: unknown[] = []): Promise<ServiceResult<WriteResult>> {
    return this.queue.run(async () => {
      try {
        const start = performance.now();
        const client = this.getClient();
        await client.query('BEGIN');
        try {
          const query = { text: sql, values: params, queryMode: 'extended' } as QueryConfig;
          const res = await client.query(query);
          const affectedRows = typeof res.rowCount === 'number' ? res.rowCount : null;
          await client.query('COMMIT');
          return {
            success: true as const,
            data: { affectedRows, executionTimeMs: performance.now() - start, committed: true },
          };
        } catch (inner) {
          await client.query('ROLLBACK').catch(() => undefined);
          throw inner;
        }
      } catch (error: unknown) {
        return fail(this.normalize(error, 'Write failed'));
      }
    });
  }

  public async explain(sql: string): Promise<ServiceResult<QueryPlan>> {
    return this.queue.run(async () => {
      try {
        // Plain EXPLAIN only estimates; EXPLAIN ANALYZE would execute the statement.
        const res = await this.readOnly(`EXPLAIN (FORMAT JSON) ${sql}`, []);
        const json = res.rows[0]?.['QUERY PLAN'];
        const parsed = (typeof json === 'string' ? JSON.parse(json) : json) as { Plan: PgPlan }[];
        return { success: true, data: flattenPlan(parsed.map(p => toPlanNode(p.Plan))) };
      } catch (error: unknown) {
        return fail(this.normalize(error, 'Explain Query failed'));
      }
    });
  }

  public async getSchema(): Promise<ServiceResult<DatabaseSchema>> {
    return this.queue.run(async () => {
      try {
        const tableRows = await this.metadata(`
          SELECT n.nspname AS table_schema, c.relname AS table_name, c.reltuples::bigint AS row_estimate
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relkind IN ('r', 'p') AND n.nspname NOT IN ${SYSTEM_SCHEMAS}
            AND has_table_privilege(c.oid, 'SELECT')
          ORDER BY 1, 2`);
        const columnRows = await this.metadata(`
          SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema NOT IN ${SYSTEM_SCHEMAS}
          ORDER BY table_schema, table_name, ordinal_position`);
        const keyRows = await this.metadata(`
          SELECT con.contype, ns.nspname AS table_schema, cl.relname AS table_name, att.attname AS column_name,
                 fns.nspname AS ref_schema, fcl.relname AS ref_table, fatt.attname AS ref_column
          FROM pg_constraint con
          JOIN pg_class cl ON cl.oid = con.conrelid
          JOIN pg_namespace ns ON ns.oid = cl.relnamespace
          CROSS JOIN LATERAL unnest(con.conkey, COALESCE(con.confkey, con.conkey)) WITH ORDINALITY AS k(attnum, fattnum, ord)
          JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
          LEFT JOIN pg_class fcl ON fcl.oid = con.confrelid
          LEFT JOIN pg_namespace fns ON fns.oid = fcl.relnamespace
          LEFT JOIN pg_attribute fatt ON fatt.attrelid = con.confrelid AND fatt.attnum = k.fattnum
          WHERE con.contype IN ('p', 'f') AND ns.nspname NOT IN ${SYSTEM_SCHEMAS}
          ORDER BY con.conname, k.ord`);
        const indexRows = await this.optionalMetadata(`
          SELECT n.nspname AS table_schema, t.relname AS table_name, i.relname AS index_name,
                 ix.indisunique AS is_unique, a.attname AS column_name
          FROM pg_index ix
          JOIN pg_class t ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          CROSS JOIN LATERAL unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
          WHERE n.nspname NOT IN ${SYSTEM_SCHEMAS}
          ORDER BY 1, 2, 3, k.ord`);
        const viewRows = await this.optionalMetadata(`
          SELECT table_schema, table_name, view_definition
          FROM information_schema.views
          WHERE table_schema NOT IN ${SYSTEM_SCHEMAS}
          ORDER BY 1, 2`);

        return { success: true, data: buildSchema(this.config?.database ?? 'Unknown', tableRows, columnRows, keyRows, indexRows, viewRows) };
      } catch (error: unknown) {
        const normalized = this.normalize(error, 'Failed to extract schema');
        return fail(createError('SCHEMA_ERROR', normalized.message, normalized.details));
      }
    });
  }

  // ─── Internals ──────────────────────────────────────────────

  private getClient(): Client {
    if (!this.client) {
      throw new Error('No database connected.');
    }
    return this.client;
  }

  /** Runs one statement inside a read-only transaction that is always rolled back. */
  private async readOnly(sql: string, params: unknown[]): Promise<PgQueryResult> {
    const client = this.getClient();
    await client.query('BEGIN READ ONLY');
    try {
      // `queryMode` exists in pg 8.x but not in @types/pg; it forces the extended
      // protocol, which rejects more than one statement per query.
      const query = { text: sql, values: params, queryMode: 'extended' } as QueryConfig;
      return await client.query(query);
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
    }
  }

  private async metadata(sql: string): Promise<Row[]> {
    return (await this.readOnly(sql, [])).rows as Row[];
  }

  /** Metadata that may be hidden by permissions; missing sections degrade to empty. */
  private async optionalMetadata(sql: string): Promise<Row[]> {
    try {
      return await this.metadata(sql);
    } catch (e) {
      console.warn('[PostgresAdapter] Optional metadata unavailable:', this.normalize(e, 'Metadata').message);
      return [];
    }
  }

  private normalize(error: unknown, prefix: string) {
    if ((error as Error)?.message === 'No database connected.') {
      return createError('SQL_EXECUTION_ERROR', `${prefix}: No database connected.`);
    }
    return normalizeServerError(error, prefix, PG_ERRORS, this.config ? [this.config.password] : []);
  }
}

// ─── Plan & schema mapping (pure, exported for tests) ─────────

export interface PgPlan {
  'Node Type': string;
  'Relation Name'?: string;
  'Index Name'?: string;
  'Join Type'?: string;
  'Total Cost'?: number;
  'Plan Rows'?: number;
  Plans?: PgPlan[];
}

export function toPlanNode(plan: PgPlan): PlanTreeNode {
  const parts = [plan['Join Type'] ? `${plan['Join Type']} ${plan['Node Type']}` : plan['Node Type']];
  if (plan['Relation Name']) parts.push(`on ${plan['Relation Name']}`);
  if (plan['Index Name']) parts.push(`using ${plan['Index Name']}`);
  const estimates: string[] = [];
  if (plan['Plan Rows'] !== undefined) estimates.push(`est. rows ${plan['Plan Rows']}`);
  if (plan['Total Cost'] !== undefined) estimates.push(`cost ${plan['Total Cost']}`);
  const detail = estimates.length ? `${parts.join(' ')} (${estimates.join(', ')})` : parts.join(' ');
  return { detail, operation: plan['Node Type'], children: (plan.Plans ?? []).map(toPlanNode) };
}

export function buildSchema(
  databaseName: string,
  tableRows: Row[],
  columnRows: Row[],
  keyRows: Row[],
  indexRows: Row[],
  viewRows: Row[]
): DatabaseSchema {
  const tables = new Map<string, TableSchema>();
  for (const row of tableRows) {
    const name = qualifiedName(row.table_schema, row.table_name);
    const estimate = Number(row.row_estimate);
    tables.set(name, {
      name,
      columns: [],
      primaryKeys: [],
      foreignKeys: [],
      // reltuples is an estimate; -1 means the table has never been analysed
      rowCount: Number.isFinite(estimate) && estimate >= 0 ? estimate : undefined,
    });
  }

  for (const row of columnRows) {
    const table = tables.get(qualifiedName(row.table_schema, row.table_name));
    if (!table) continue; // view columns, or tables the user cannot read
    const column: ColumnSchema = {
      name: String(row.column_name),
      type: String(row.data_type).toUpperCase(),
      nullable: row.is_nullable === 'YES',
      defaultValue: row.column_default === null || row.column_default === undefined ? null : String(row.column_default),
      isPrimaryKey: false,
      isForeignKey: false,
    };
    table.columns.push(column);
  }

  const relationships: RelationshipSchema[] = [];
  for (const row of keyRows) {
    const tableName = qualifiedName(row.table_schema, row.table_name);
    const table = tables.get(tableName);
    if (!table) continue;
    const columnName = String(row.column_name);
    const column = table.columns.find(c => c.name === columnName);

    if (row.contype === 'p') {
      table.primaryKeys.push(columnName);
      if (column) column.isPrimaryKey = true;
    } else if (row.contype === 'f' && row.ref_table) {
      const fk: ForeignKeySchema = {
        columnName,
        referencedTable: qualifiedName(row.ref_schema, row.ref_table),
        referencedColumn: String(row.ref_column),
      };
      table.foreignKeys.push(fk);
      if (column) column.isForeignKey = true;
      relationships.push({ fromTable: tableName, fromColumn: columnName, toTable: fk.referencedTable, toColumn: fk.referencedColumn });
    }
  }

  const indexes = new Map<string, IndexSchema>();
  for (const row of indexRows) {
    const tableName = qualifiedName(row.table_schema, row.table_name);
    if (!tables.has(tableName)) continue;
    const key = `${tableName}.${String(row.index_name)}`;
    const index = indexes.get(key) ?? { name: String(row.index_name), tableName, columns: [], unique: row.is_unique === true };
    index.columns.push(String(row.column_name));
    indexes.set(key, index);
  }

  return {
    databaseName,
    tables: [...tables.values()],
    relationships,
    indexes: [...indexes.values()],
    views: viewRows.map(row => ({
      name: qualifiedName(row.table_schema, row.table_name),
      sql: row.view_definition ? String(row.view_definition) : undefined,
    })),
  };
}
