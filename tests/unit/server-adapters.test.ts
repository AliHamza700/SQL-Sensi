/**
 * MySQL & PostgreSQL Adapter Unit Tests — SQL Sensi V2 Phase 4
 *
 * The drivers are mocked, so these tests check exactly what the adapters send:
 *   1. Connection options (TLS verification, timeouts, safe type handling)
 *   2. Read-only transaction wrapping, single-statement mode, ROLLBACK on error
 *   3. Error normalization and password redaction
 *   4. EXPLAIN without ANALYZE, plan parsing, schema mapping
 *   5. Serialized requests and dropped-connection handling
 * Real-server checks live in tests/integration/*-adapter.integration.test.ts.
 */

import type { ServerConnectionConfig } from '../../src/types';

// ─── Driver mocks ─────────────────────────────────────────────

type QueryHandler = (query: unknown, params?: unknown) => unknown;

interface MockState {
  queries: unknown[];
  handler: QueryHandler;
  connectError: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  instances: any[];
}

const mockPg: MockState = { queries: [], handler: () => ({ rows: [], fields: [] }), connectError: null, instances: [] };
const mockMysql: MockState = { queries: [], handler: () => [[], []], connectError: null, instances: [] };

jest.mock('pg', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EventEmitter } = require('node:events');
  class Client extends EventEmitter {
    cfg: unknown;
    ended = false;
    constructor(cfg: unknown) {
      super();
      this.cfg = cfg;
      mockPg.instances.push(this);
    }
    async connect() {
      if (mockPg.connectError) throw mockPg.connectError;
    }
    async query(q: unknown) {
      mockPg.queries.push(q);
      return mockPg.handler(q);
    }
    async end() {
      this.ended = true;
    }
  }
  return { Client, types: { getTypeParser: () => (v: string) => `parsed:${v}` } };
});

jest.mock('mysql2/promise', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { EventEmitter } = require('node:events');
  class Conn extends EventEmitter {
    ended = false;
    async query(sql: unknown, params?: unknown) {
      mockMysql.queries.push(params === undefined ? sql : [sql, params]);
      return mockMysql.handler(sql, params);
    }
    async end() {
      this.ended = true;
    }
  }
  return {
    createConnection: jest.fn(async (opts: unknown) => {
      if (mockMysql.connectError) throw mockMysql.connectError;
      const conn = new Conn();
      mockMysql.instances.push({ opts, conn });
      return conn;
    }),
  };
});

import { PostgresAdapter, buildSchema as buildPgSchema, toPlanNode } from '../../src/services/database/adapters/postgres.adapter';
import { MysqlAdapter, buildSchema as buildMysqlSchema, parseTreePlan } from '../../src/services/database/adapters/mysql.adapter';
import { normalizeServerError, redact, flattenPlan } from '../../src/services/database/adapters/server-common';

const PASSWORD = 'S3cret-pa55';

function serverConfig(engine: 'mysql' | 'postgresql', overrides: Partial<ServerConnectionConfig> = {}): ServerConnectionConfig {
  return {
    engine,
    host: 'db.example.test',
    port: engine === 'mysql' ? 3306 : 5432,
    database: 'analytics',
    user: 'readonly_analyst',
    password: PASSWORD,
    tls: { enabled: true },
    ...overrides,
  };
}

const sqlText = (q: unknown) => (typeof q === 'string' ? q : (q as { text: string }).text);

beforeEach(() => {
  for (const state of [mockPg, mockMysql]) {
    state.queries = [];
    state.connectError = null;
    state.instances = [];
  }
  mockPg.handler = () => ({ rows: [], fields: [] });
  mockMysql.handler = () => [[], []];
});

// ─── Shared helpers ───────────────────────────────────────────

describe('server-common', () => {
  it('redacts every occurrence of a secret', () => {
    expect(redact(`pw=${PASSWORD}; again ${PASSWORD}`, [PASSWORD])).toBe('pw=[redacted]; again [redacted]');
    expect(redact('nothing here', [''])).toBe('nothing here');
  });

  it('maps network failures to a plain-language DATABASE_ERROR', () => {
    const err = normalizeServerError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 10.0.0.1:5432' }, 'Failed', {}, []);
    expect(err.code).toBe('DATABASE_ERROR');
    expect(err.message).toMatch(/refused the connection/);
  });

  it('keeps unknown driver messages but removes secrets', () => {
    const err = normalizeServerError({ code: 'X1', message: `bad thing with ${PASSWORD}` }, 'Query failed', {}, [PASSWORD]);
    expect(err.message).toBe('Query failed: bad thing with [redacted]');
  });

  it('maps a self-signed TLS failure to an actionable message (by code)', () => {
    const err = normalizeServerError({ code: 'DEPTH_ZERO_SELF_SIGNED_CERT', message: 'self signed certificate' }, 'Failed to connect', {}, []);
    expect(err.code).toBe('DATABASE_ERROR');
    expect(err.message).toMatch(/turn off "Use TLS"/i);
  });

  it('detects a TLS failure by message when the code is unfamiliar', () => {
    const err = normalizeServerError({ code: '', message: 'Error: self-signed certificate in certificate chain' }, 'Failed to connect', {}, []);
    expect(err.message).toMatch(/secure \(TLS\) connection/i);
  });

  it('does not mistake a plain connection refusal for a TLS error', () => {
    const err = normalizeServerError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:3306' }, 'Failed', {}, []);
    expect(err.message).toMatch(/refused the connection/);
  });

  it('flattens a plan tree with parent ids and indentation', () => {
    const plan = flattenPlan([{ detail: 'root', children: [{ detail: 'child', children: [] }] }]);
    expect(plan.nodes).toEqual([
      { id: 1, parentId: 0, detail: 'root', operation: undefined },
      { id: 2, parentId: 1, detail: 'child', operation: undefined },
    ]);
    expect(plan.rawOutput).toBe('- root\n  - child');
  });
});

// ─── PostgreSQL ───────────────────────────────────────────────

describe('PostgresAdapter', () => {
  let adapter: PostgresAdapter;

  beforeEach(() => {
    adapter = new PostgresAdapter();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('connects with certificate verification, timeouts and a password-free label', async () => {
    const result = await adapter.connect(serverConfig('postgresql'));
    expect(result.success).toBe(true);

    const cfg = mockPg.instances[0].cfg;
    expect(cfg.ssl).toEqual({ rejectUnauthorized: true, ca: undefined });
    expect(cfg.statement_timeout).toBe(30000);
    expect(cfg.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(adapter.getLabel()).toBe('analytics @ db.example.test');
    expect(adapter.getLabel()).not.toContain('readonly_analyst');
  });

  it('turns TLS off only when asked', async () => {
    await adapter.connect(serverConfig('postgresql', { tls: { enabled: false } }));
    expect(mockPg.instances[0].cfg.ssl).toBe(false);
  });

  it('returns dates and timestamps as the server text, other types via pg parsers', async () => {
    await adapter.connect(serverConfig('postgresql'));
    const parsers = mockPg.instances[0].cfg.types;
    expect(parsers.getTypeParser(1082)('2026-01-05')).toBe('2026-01-05');
    expect(parsers.getTypeParser(1184)('2026-01-05 10:00:00+05')).toBe('2026-01-05 10:00:00+05');
    expect(parsers.getTypeParser(23)('42')).toBe('parsed:42');
  });

  it('rejects invalid configs before connecting', async () => {
    const result = await adapter.connect(serverConfig('postgresql', { port: 0 }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/Port/);
    expect(mockPg.instances).toHaveLength(0);
  });

  it('maps a rejected login and never exposes the password', async () => {
    mockPg.connectError = { code: '28P01', message: `password authentication failed (${PASSWORD})` };
    const result = await adapter.connect(serverConfig('postgresql'));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/rejected the username or password/);
      expect(JSON.stringify(result.error)).not.toContain(PASSWORD);
    }
    expect(adapter.isConnected()).toBe(false);
    expect(mockPg.instances[0].ended).toBe(true);
  });

  it('runs reads in a rolled-back READ ONLY transaction using the extended protocol', async () => {
    mockPg.handler = (q) =>
      typeof q === 'string' ? {} : { rows: [{ id: 1, total: '12.50' }], fields: [{ name: 'id' }, { name: 'total' }] };
    await adapter.connect(serverConfig('postgresql'));

    const result = await adapter.executeRead('SELECT id, total FROM orders WHERE id = $1', [1]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toEqual(['id', 'total']);
      expect(result.data.rows).toEqual([{ id: 1, total: '12.50' }]);
    }
    expect(mockPg.queries).toEqual([
      'BEGIN READ ONLY',
      { text: 'SELECT id, total FROM orders WHERE id = $1', values: [1], queryMode: 'extended' },
      'ROLLBACK',
    ]);
  });

  it('still rolls back when the query fails, and explains read-only violations', async () => {
    mockPg.handler = (q) => {
      if (typeof q !== 'string') throw { code: '25006', message: 'cannot execute INSERT in a read-only transaction' };
      return {};
    };
    await adapter.connect(serverConfig('postgresql'));

    const result = await adapter.executeRead("WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/Only read-only queries are allowed/);
    expect(mockPg.queries[mockPg.queries.length - 1]).toBe('ROLLBACK');
  });

  it('reports statement timeouts in plain language', async () => {
    mockPg.handler = (q) => {
      if (typeof q !== 'string') throw { code: '57014', message: 'canceling statement due to statement timeout' };
      return {};
    };
    await adapter.connect(serverConfig('postgresql'));
    const result = await adapter.executeRead('SELECT pg_sleep(60)');
    expect(!result.success && result.error.message).toMatch(/took too long/);
  });

  it('explains with FORMAT JSON and never uses ANALYZE', async () => {
    const plan = [{
      Plan: {
        'Node Type': 'Hash Join', 'Join Type': 'Inner', 'Total Cost': 42.5, 'Plan Rows': 10,
        Plans: [
          { 'Node Type': 'Seq Scan', 'Relation Name': 'orders' },
          { 'Node Type': 'Index Scan', 'Relation Name': 'customers', 'Index Name': 'customers_pkey' },
        ],
      },
    }];
    mockPg.handler = (q) => (typeof q === 'string' ? {} : { rows: [{ 'QUERY PLAN': plan }], fields: [] });
    await adapter.connect(serverConfig('postgresql'));

    const result = await adapter.explain('SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const sent = sqlText(mockPg.queries[1]);
    expect(sent.startsWith('EXPLAIN (FORMAT JSON) SELECT')).toBe(true);
    expect(sent).not.toMatch(/ANALYZE/i);
    expect(result.data.nodes.map(n => [n.id, n.parentId])).toEqual([[1, 0], [2, 1], [3, 1]]);
    expect(result.data.nodes[0].detail).toBe('Inner Hash Join (est. rows 10, cost 42.5)');
    expect(result.data.nodes[2].detail).toBe('Index Scan on customers using customers_pkey');
  });

  it('serializes concurrent requests on the single connection', async () => {
    mockPg.handler = async (q) => {
      if (typeof q !== 'string' && (q as { text: string }).text === 'SELECT 1') {
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      return { rows: [], fields: [] };
    };
    await adapter.connect(serverConfig('postgresql'));

    await Promise.all([adapter.executeRead('SELECT 1'), adapter.executeRead('SELECT 2')]);
    expect(mockPg.queries.map(sqlText)).toEqual(['BEGIN READ ONLY', 'SELECT 1', 'ROLLBACK', 'BEGIN READ ONLY', 'SELECT 2', 'ROLLBACK']);
  });

  it('marks itself disconnected when the server drops the connection', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await adapter.connect(serverConfig('postgresql'));
    mockPg.instances[0].emit('error', { code: 'ECONNRESET', message: 'Connection terminated unexpectedly' });

    expect(adapter.isConnected()).toBe(false);
    const result = await adapter.executeRead('SELECT 1');
    expect(!result.success && result.error.message).toMatch(/No database connected/);
    warn.mockRestore();
  });

  it('maps catalog rows to the common schema shape', () => {
    const schema = buildPgSchema(
      'analytics',
      [
        { table_schema: 'public', table_name: 'customers', row_estimate: '3' },
        { table_schema: 'public', table_name: 'orders', row_estimate: '-1' },
        { table_schema: 'sales', table_name: 'regions', row_estimate: '0' },
      ],
      [
        { table_schema: 'public', table_name: 'customers', column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null },
        { table_schema: 'public', table_name: 'orders', column_name: 'id', data_type: 'bigint', is_nullable: 'NO', column_default: null },
        { table_schema: 'public', table_name: 'orders', column_name: 'customer_id', data_type: 'integer', is_nullable: 'YES', column_default: null },
        { table_schema: 'public', table_name: 'order_view', column_name: 'id', data_type: 'bigint', is_nullable: 'YES', column_default: null },
      ],
      [
        { contype: 'p', table_schema: 'public', table_name: 'customers', column_name: 'id' },
        { contype: 'f', table_schema: 'public', table_name: 'orders', column_name: 'customer_id', ref_schema: 'public', ref_table: 'customers', ref_column: 'id' },
      ],
      [
        { table_schema: 'public', table_name: 'orders', index_name: 'idx_orders_customer', is_unique: false, column_name: 'customer_id' },
      ],
      [{ table_schema: 'public', table_name: 'order_view', view_definition: 'SELECT id FROM orders;' }]
    );

    expect(schema.tables.map(t => t.name)).toEqual(['customers', 'orders', 'sales.regions']);
    expect(schema.tables[0].primaryKeys).toEqual(['id']);
    expect(schema.tables[0].columns[0]).toMatchObject({ type: 'INTEGER', nullable: false, isPrimaryKey: true });
    expect(schema.tables[0].rowCount).toBe(3);
    expect(schema.tables[1].rowCount).toBeUndefined(); // never analysed
    expect(schema.tables[1].columns.map(c => c.name)).toEqual(['id', 'customer_id']); // view columns excluded
    expect(schema.relationships).toEqual([{ fromTable: 'orders', fromColumn: 'customer_id', toTable: 'customers', toColumn: 'id' }]);
    expect(schema.indexes).toEqual([{ name: 'idx_orders_customer', tableName: 'orders', columns: ['customer_id'], unique: false }]);
    expect(schema.views).toEqual([{ name: 'order_view', sql: 'SELECT id FROM orders;' }]);
  });

  it('builds plan details from JSON plan nodes', () => {
    expect(toPlanNode({ 'Node Type': 'Seq Scan', 'Relation Name': 't' }).detail).toBe('Seq Scan on t');
  });
});

// ─── MySQL ────────────────────────────────────────────────────

describe('MysqlAdapter', () => {
  let adapter: MysqlAdapter;

  beforeEach(() => {
    adapter = new MysqlAdapter();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('connects with safe options and sets the session time limit', async () => {
    const result = await adapter.connect(serverConfig('mysql'));
    expect(result.success).toBe(true);

    const opts = mockMysql.instances[0].opts;
    expect(opts).toMatchObject({
      multipleStatements: false,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: true,
      ssl: { rejectUnauthorized: true },
    });
    expect(mockMysql.queries).toEqual([['SET SESSION max_execution_time = ?', [30000]]]);
    expect(adapter.getLabel()).toBe('analytics @ db.example.test');
  });

  it('maps a rejected login and never exposes the password', async () => {
    mockMysql.connectError = { code: 'ER_ACCESS_DENIED_ERROR', message: `Access denied (${PASSWORD})` };
    const result = await adapter.connect(serverConfig('mysql'));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/rejected the username or password/);
      expect(JSON.stringify(result.error)).not.toContain(PASSWORD);
    }
    expect(adapter.isConnected()).toBe(false);
  });

  it('runs reads in a rolled-back READ ONLY transaction', async () => {
    mockMysql.handler = (sql) =>
      sql === 'SELECT id FROM orders WHERE id = ?' ? [[{ id: 1 }], [{ name: 'id' }]] : [[], []];
    await adapter.connect(serverConfig('mysql'));
    mockMysql.queries = [];

    const result = await adapter.executeRead('SELECT id FROM orders WHERE id = ?', [1]);
    expect(result.success && result.data).toMatchObject({ columns: ['id'], rows: [{ id: 1 }], rowCount: 1 });
    expect(mockMysql.queries).toEqual([
      'START TRANSACTION READ ONLY',
      ['SELECT id FROM orders WHERE id = ?', [1]],
      'ROLLBACK',
    ]);
  });

  it('rolls back and explains read-only violations', async () => {
    mockMysql.handler = (sql) => {
      if (String(sql).startsWith('WITH')) throw { code: 'ER_CANT_EXECUTE_IN_READ_ONLY_TRANSACTION', message: 'Cannot execute statement' };
      return [[], []];
    };
    await adapter.connect(serverConfig('mysql'));

    const result = await adapter.executeRead('WITH x AS (SELECT 1) SELECT * FROM x');
    expect(!result.success && result.error.message).toMatch(/Only read-only queries are allowed/);
    expect(mockMysql.queries[mockMysql.queries.length - 1]).toBe('ROLLBACK');
  });

  it.each([
    "SELECT * FROM t INTO OUTFILE '/tmp/x'",
    "SELECT * INTO DUMPFILE '/tmp/x' FROM t",
    "SELECT LOAD_FILE('/etc/passwd')",
  ])('refuses server file access: %s', async (sql) => {
    await adapter.connect(serverConfig('mysql'));
    mockMysql.queries = [];
    const result = await adapter.executeRead(sql);
    expect(!result.success && result.error.code).toBe('SQL_VALIDATION_ERROR');
    expect(mockMysql.queries).toEqual([]);
  });

  it('explains with FORMAT=TREE and never uses ANALYZE', async () => {
    const tree = [
      '-> Nested loop inner join  (cost=2.10 rows=4)',
      '    -> Table scan on o  (cost=0.65 rows=4)',
      '    -> Single-row index lookup on c using PRIMARY (id=o.customer_id)  (cost=0.26 rows=1)',
    ].join('\n');
    mockMysql.handler = (sql) => (String(sql).startsWith('EXPLAIN') ? [[{ EXPLAIN: tree }], []] : [[], []]);
    await adapter.connect(serverConfig('mysql'));
    mockMysql.queries = [];

    const result = await adapter.explain('SELECT * FROM orders o JOIN customers c ON c.id = o.customer_id');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const sent = (mockMysql.queries[1] as [string])[0];
    expect(sent.startsWith('EXPLAIN FORMAT=TREE SELECT')).toBe(true);
    expect(sent).not.toMatch(/ANALYZE/i);
    expect(result.data.nodes.map(n => [n.id, n.parentId])).toEqual([[1, 0], [2, 1], [3, 1]]);
    expect(result.data.nodes[1].detail).toBe('Table scan on o  (cost=0.65 rows=4)');
  });

  it('falls back to tabular EXPLAIN on servers without FORMAT=TREE', async () => {
    mockMysql.handler = (sql) => {
      if (String(sql).startsWith('EXPLAIN FORMAT=TREE')) throw { code: 'ER_PARSE_ERROR', message: 'syntax' };
      if (String(sql).startsWith('EXPLAIN')) return [[{ select_type: 'SIMPLE', table: 'orders', type: 'ref', key: 'idx_orders_customer', rows: 2 }], []];
      return [[], []];
    };
    await adapter.connect(serverConfig('mysql'));

    const result = await adapter.explain('SELECT * FROM orders WHERE customer_id = 1');
    expect(result.success && result.data.rawOutput).toBe('- SIMPLE orders access ref using idx_orders_customer (est. rows 2)');
  });

  it('marks itself disconnected when the server drops the connection', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await adapter.connect(serverConfig('mysql'));
    mockMysql.instances[0].conn.emit('error', { code: 'PROTOCOL_CONNECTION_LOST', message: 'lost' });
    expect(adapter.isConnected()).toBe(false);
    warn.mockRestore();
  });

  it('parses nested FORMAT=TREE output', () => {
    const roots = parseTreePlan('-> A\n    -> B\n        -> C\n    -> D');
    expect(roots).toHaveLength(1);
    expect(roots[0].children.map(c => c.detail)).toEqual(['B', 'D']);
    expect(roots[0].children[0].children[0].detail).toBe('C');
  });

  it('maps information_schema rows to the common schema shape', () => {
    const schema = buildMysqlSchema(
      'analytics',
      [{ table_name: 'customers', row_estimate: 3 }, { table_name: 'orders', row_estimate: null }],
      [
        { table_name: 'customers', column_name: 'id', column_type: 'int', is_nullable: 'NO', column_default: null, column_key: 'PRI' },
        { table_name: 'orders', column_name: 'id', column_type: 'bigint unsigned', is_nullable: 'NO', column_default: null, column_key: 'PRI' },
        { table_name: 'orders', column_name: 'customer_id', column_type: 'int', is_nullable: 'YES', column_default: null, column_key: 'MUL' },
      ],
      [{ table_name: 'orders', column_name: 'customer_id', ref_table: 'customers', ref_column: 'id' }],
      [
        { table_name: 'orders', index_name: 'PRIMARY', non_unique: 0, column_name: 'id' },
        { table_name: 'orders', index_name: 'idx_orders_customer', non_unique: 1, column_name: 'customer_id' },
      ],
      [{ table_name: 'customer_totals', view_definition: 'select ...' }]
    );

    expect(schema.tables[0]).toMatchObject({ name: 'customers', primaryKeys: ['id'], rowCount: 3 });
    expect(schema.tables[1].rowCount).toBeUndefined();
    expect(schema.tables[1].columns[0].type).toBe('BIGINT UNSIGNED');
    expect(schema.tables[1].columns[1].isForeignKey).toBe(true);
    expect(schema.relationships).toEqual([{ fromTable: 'orders', fromColumn: 'customer_id', toTable: 'customers', toColumn: 'id' }]);
    expect(schema.indexes.map(i => [i.name, i.unique])).toEqual([['PRIMARY', true], ['idx_orders_customer', false]]);
    expect(schema.views[0].name).toBe('customer_totals');
  });
});
