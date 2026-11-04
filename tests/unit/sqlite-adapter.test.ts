/**
 * SQLite Adapter, Registry & Active-Connection Tests — SQL Sensi V2 Phase 2
 *
 *   1. SqliteAdapter — contract behaviour on the synthetic fixture
 *   2. Adapter registry — supported vs. not-yet-supported engines
 *   3. DatabaseService — one active adapter, status, switching and failed connects
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteAdapter, SQLITE_CAPABILITIES } from '../../src/services/database/adapters/sqlite.adapter';
import { createAdapter, isEngineSupported } from '../../src/services/database/adapters/registry';
import { MysqlAdapter } from '../../src/services/database/adapters/mysql.adapter';
import { PostgresAdapter } from '../../src/services/database/adapters/postgres.adapter';
import { DatabaseService } from '../../src/services/database/database.service';
import { createSqliteFixture, SqliteFixture } from '../fixtures/sqlite-fixture';

describe('SqliteAdapter', () => {
  let fixture: SqliteFixture;
  let adapter: SqliteAdapter;

  beforeAll(() => {
    fixture = createSqliteFixture('sqlsensi-adapter-');
  });

  afterAll(() => {
    fixture.cleanup();
  });

  beforeEach(() => {
    adapter = new SqliteAdapter();
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('declares its engine and capabilities', () => {
    expect(adapter.engine).toBe('sqlite');
    expect(adapter.capabilities).toEqual(SQLITE_CAPABILITIES);
    expect(adapter.capabilities.placeholderStyle).toBe('question');
    expect(adapter.capabilities.queryTimeout).toBe(false);
  });

  it('starts disconnected with no label', () => {
    expect(adapter.isConnected()).toBe(false);
    expect(adapter.getLabel()).toBeNull();
  });

  it('connects and labels the connection with the file name only', async () => {
    const result = await adapter.connect({ engine: 'sqlite', filePath: fixture.dbPath });
    expect(result.success).toBe(true);
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getLabel()).toBe('sales_fixture.db');
    expect(adapter.getFilePath()).toBe(fixture.dbPath);
  });

  it('stays disconnected when the file is not a database', async () => {
    const notDb = path.join(fixture.dir, 'notes.txt');
    fs.writeFileSync(notDb, 'not a sqlite database '.repeat(20));

    const result = await adapter.connect({ engine: 'sqlite', filePath: notDb });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('INVALID_DATABASE');
    expect(adapter.isConnected()).toBe(false);
  });

  it('rejects a config for another engine', async () => {
    // Server configs do not exist yet; cast to simulate a mismatched request.
    const result = await adapter.connect({ engine: 'mysql', filePath: fixture.dbPath } as never);
    expect(result.success).toBe(false);
    expect(adapter.isConnected()).toBe(false);
  });

  it('runs reads and returns the common result shape', async () => {
    await adapter.connect({ engine: 'sqlite', filePath: fixture.dbPath });
    const result = await adapter.executeRead('SELECT id, name FROM products WHERE category = ? ORDER BY id', ['tools']);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toEqual(['id', 'name']);
      expect(result.data.rows).toEqual([{ id: 1, name: 'Widget' }, { id: 2, name: 'Gadget' }]);
      expect(result.data.rowCount).toBe(2);
    }
  });

  it('returns a query plan', async () => {
    await adapter.connect({ engine: 'sqlite', filePath: fixture.dbPath });
    const result = await adapter.explain('SELECT * FROM orders WHERE customer_id = 2');
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.rawOutput).toMatch(/idx_orders_customer/);
  });

  it('extracts the fixture schema', async () => {
    await adapter.connect({ engine: 'sqlite', filePath: fixture.dbPath });
    const result = await adapter.getSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;

    const schema = result.data;
    expect(schema.databaseName).toBe('sales_fixture.db');
    expect(schema.tables.map(t => t.name)).toEqual(['customers', 'orders', 'products']);
    expect(schema.tables.find(t => t.name === 'orders')?.rowCount).toBe(4);
    expect(schema.relationships).toEqual([
      { fromTable: 'orders', fromColumn: 'customer_id', toTable: 'customers', toColumn: 'id' },
    ]);
    expect(schema.indexes.some(i => i.name === 'idx_orders_customer' && i.columns[0] === 'customer_id')).toBe(true);
    expect(schema.views.map(v => v.name)).toEqual(['customer_totals']);
  });

  it('handles table names that contain double quotes', async () => {
    const oddPath = path.join(fixture.dir, 'odd_names.db');
    const db = new DatabaseSync(oddPath);
    db.exec('CREATE TABLE "we""ird" (id INTEGER PRIMARY KEY, label TEXT); INSERT INTO "we""ird" (label) VALUES (\'x\');');
    db.close();

    await adapter.connect({ engine: 'sqlite', filePath: oddPath });
    const result = await adapter.getSchema();
    expect(result.success).toBe(true);
    if (result.success) {
      const table = result.data.tables[0];
      expect(table.name).toBe('we"ird');
      expect(table.columns.map(c => c.name)).toEqual(['id', 'label']);
      expect(table.rowCount).toBe(1);
    }
  });

  it('reports errors after disconnect and allows disconnecting twice', async () => {
    await adapter.connect({ engine: 'sqlite', filePath: fixture.dbPath });
    await adapter.disconnect();
    await adapter.disconnect();

    const result = await adapter.executeRead('SELECT 1');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/No database connected/);
  });
});

describe('Adapter registry', () => {
  it('creates a fresh SQLite adapter each time', () => {
    const a = createAdapter('sqlite');
    const b = createAdapter('sqlite');
    expect(a.success && b.success).toBe(true);
    if (a.success && b.success) {
      expect(a.data).toBeInstanceOf(SqliteAdapter);
      expect(a.data).not.toBe(b.data);
    }
  });

  // Phase 4 registered the server engines (these were "not supported yet" in Phase 2).
  it.each([
    ['sqlite', SqliteAdapter],
    ['mysql', MysqlAdapter],
    ['postgresql', PostgresAdapter],
  ] as const)('creates the %s adapter', (engine, AdapterClass) => {
    expect(isEngineSupported(engine)).toBe(true);
    const result = createAdapter(engine);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeInstanceOf(AdapterClass);
      expect(result.data.engine).toBe(engine);
      expect(result.data.isConnected()).toBe(false);
    }
  });

  it('rejects an unknown engine', () => {
    const result = createAdapter('oracle' as never);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/not supported/);
  });
});

describe('DatabaseService — active adapter', () => {
  let first: SqliteFixture;
  let second: SqliteFixture;
  let service: DatabaseService;

  beforeAll(() => {
    first = createSqliteFixture('sqlsensi-active-a-');
    second = createSqliteFixture('sqlsensi-active-b-');
    const db = new DatabaseSync(second.dbPath);
    db.exec("INSERT INTO customers (id, name, email) VALUES (4, 'Only In Second', 'second@example.test')");
    db.close();
  });

  afterAll(async () => {
    await service?.disconnect();
    first.cleanup();
    second.cleanup();
  });

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DatabaseService as any).instance = undefined;
    service = DatabaseService.getInstance();
  });

  afterEach(async () => {
    await service.disconnect();
  });

  it('reports a disconnected status by default', () => {
    expect(service.getStatus()).toEqual({ connected: false, engine: null, label: null });
    expect(service.getCapabilities()).toBeNull();
  });

  it('reports engine, label and capabilities when connected', async () => {
    await service.connect(first.dbPath);
    expect(service.getStatus()).toEqual({ connected: true, engine: 'sqlite', label: 'sales_fixture.db' });
    expect(service.getCapabilities()).toEqual(SQLITE_CAPABILITIES);
  });

  it('switches to the new database and stops using the old one', async () => {
    await service.connect(first.dbPath);
    const oldConnection = service.getConnection();

    await service.connect(second.dbPath);
    expect(service.getActivePath()).toBe(second.dbPath);
    const result = await service.executeQuery('SELECT COUNT(*) AS n FROM customers');
    expect(result.success && result.data.rows[0].n).toBe(4);

    // The previous handle was closed, not left open in the background.
    expect(() => oldConnection.prepare('SELECT 1')).toThrow();
  });

  it('keeps the current connection when connecting to a bad file fails', async () => {
    await service.connect(first.dbPath);
    const result = await service.connect(path.join(first.dir, 'missing.db'));
    expect(result.success).toBe(false);

    expect(service.getActivePath()).toBe(first.dbPath);
    const check = await service.executeQuery('SELECT COUNT(*) AS n FROM customers');
    expect(check.success && check.data.rows[0].n).toBe(3);
  });

  it('rejects an invalid server config without touching the network', async () => {
    const result = await service.connectWith({
      engine: 'postgresql', host: '', port: 5432, database: 'x', user: 'u', password: 'p', tls: { enabled: false },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.message).toMatch(/Host is required/);
    expect(service.isConnected()).toBe(false);
  });

  it('clears status immediately on disconnect', async () => {
    await service.connect(first.dbPath);
    void service.disconnect();
    expect(service.isConnected()).toBe(false);
    expect(service.getActivePath()).toBeNull();
  });

  it.each(['SET x = 1', 'COPY t TO STDOUT', 'CALL proc()', 'GRANT ALL ON t TO u', 'merge into t using s on 1=1'])(
    'blocks server state-changing statement: %s',
    async (sql) => {
      await service.connect(first.dbPath);
      const result = await service.executeQuery(sql);
      expect(!result.success && result.error.code).toBe('SQL_VALIDATION_ERROR');
    }
  );

  it('does not block reads whose first word only starts like a blocked one', async () => {
    await service.connect(first.dbPath);
    const result = await service.executeQuery('SELECT 1 AS settings');
    expect(result.success).toBe(true);
  });

  it('returns DATABASE_ERROR for schema requests when disconnected', async () => {
    const result = await service.getSchema();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe('DATABASE_ERROR');
  });
});
