/**
 * MysqlAdapter against a real server — SQL Sensi V2 Phase 4
 * Skipped unless SQLSENSI_TEST_MYSQL_* is set (see server-fixture.ts).
 */

import { createConnection } from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import { MysqlAdapter } from '../../src/services/database/adapters/mysql.adapter';
import type { ServerConnectionConfig } from '../../src/types';
import { serverTestConfig, tablePrefix } from './server-fixture';

const maybeConfig = serverTestConfig('mysql');
const describeIfServer = maybeConfig ? describe : describe.skip;
// Only read inside describeIfServer, where the config is known to exist.
const config = maybeConfig as ServerConnectionConfig;

describeIfServer('MysqlAdapter (real server)', () => {
  const p = tablePrefix();
  const customers = `${p}_customers`;
  const orders = `${p}_orders`;
  let setup: Connection;
  let adapter: MysqlAdapter;

  const count = async (table: string) => {
    const [rows] = await setup.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${table}`);
    return Number(rows[0].n);
  };

  beforeAll(async () => {
    setup = await createConnection({
      host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
      ssl: config.tls.enabled ? { rejectUnauthorized: true } : undefined,
      multipleStatements: true,
    });
    await setup.query(`
      CREATE TABLE ${customers} (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, city VARCHAR(100) NULL) ENGINE=InnoDB;
      CREATE TABLE ${orders} (
        id BIGINT PRIMARY KEY,
        customer_id INT,
        order_date DATE NOT NULL,
        total DECIMAL(12, 2) NOT NULL,
        INDEX ${p}_idx_orders_customer (customer_id),
        FOREIGN KEY (customer_id) REFERENCES ${customers}(id)
      ) ENGINE=InnoDB;
      INSERT INTO ${customers} VALUES (1, 'Ada Test', 'Lahore'), (2, 'Bo Sample', NULL);
      INSERT INTO ${orders} VALUES (9007199254740993, 1, '2026-01-05', 12.50), (2, 2, '2026-02-10', 0.10);
    `);
  });

  afterAll(async () => {
    await setup?.query(`DROP TABLE IF EXISTS ${orders}; DROP TABLE IF EXISTS ${customers};`).catch(() => undefined);
    await setup?.end();
  });

  beforeEach(async () => {
    adapter = new MysqlAdapter();
    const result = await adapter.connect(config);
    expect(result.success).toBe(true);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('reads with ? parameters and keeps exact values', async () => {
    const result = await adapter.executeRead(`SELECT id, order_date, total FROM ${orders} WHERE customer_id = ?`, [1]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.rows).toEqual([{ id: '9007199254740993', order_date: '2026-01-05', total: '12.50' }]);
  });

  it('preserves NULL', async () => {
    const result = await adapter.executeRead(`SELECT city FROM ${customers} WHERE id = 2`);
    expect(result.success && result.data.rows).toEqual([{ city: null }]);
  });

  it('blocks a write sent as a read and changes nothing', async () => {
    const result = await adapter.executeRead(`INSERT INTO ${customers} (id, name) VALUES (3, 'Eve')`);
    expect(!result.success && result.error.message).toMatch(/read-only/i);
    expect(await count(customers)).toBe(2);
  });

  it('rejects multiple statements in one request', async () => {
    const result = await adapter.executeRead(`SELECT 1; DELETE FROM ${orders}`);
    expect(result.success).toBe(false);
    expect(await count(orders)).toBe(2);
  });

  it('returns an estimated plan', async () => {
    const result = await adapter.explain(`SELECT * FROM ${orders} WHERE customer_id = 1`);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.nodes.length).toBeGreaterThan(0);
  });

  it('extracts tables, keys and indexes', async () => {
    const result = await adapter.getSchema();
    expect(result.success).toBe(true);
    if (!result.success) return;
    const ordersTable = result.data.tables.find(t => t.name === orders);
    expect(ordersTable?.primaryKeys).toEqual(['id']);
    expect(result.data.relationships).toContainEqual({ fromTable: orders, fromColumn: 'customer_id', toTable: customers, toColumn: 'id' });
    expect(result.data.indexes.some(i => i.name === `${p}_idx_orders_customer`)).toBe(true);
  });

  it('reports a wrong password without echoing it', async () => {
    const wrong = new MysqlAdapter();
    const secret = 'definitely-wrong-pw-123';
    const result = await wrong.connect({ ...config, password: secret });
    expect(result.success).toBe(false);
    if (!result.success) expect(JSON.stringify(result.error)).not.toContain(secret);
  });
});
