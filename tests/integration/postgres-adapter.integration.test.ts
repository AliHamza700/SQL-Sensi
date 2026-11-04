/**
 * PostgresAdapter against a real server — SQL Sensi V2 Phase 4
 * Skipped unless SQLSENSI_TEST_PG_* is set (see server-fixture.ts).
 */

import { Client } from 'pg';
import { PostgresAdapter } from '../../src/services/database/adapters/postgres.adapter';
import type { ServerConnectionConfig } from '../../src/types';
import { serverTestConfig, tablePrefix } from './server-fixture';

const maybeConfig = serverTestConfig('postgresql');
const describeIfServer = maybeConfig ? describe : describe.skip;
// Only read inside describeIfServer, where the config is known to exist.
const config = maybeConfig as ServerConnectionConfig;

describeIfServer('PostgresAdapter (real server)', () => {
  const p = tablePrefix();
  const customers = `${p}_customers`;
  const orders = `${p}_orders`;
  let setup: Client;
  let adapter: PostgresAdapter;

  beforeAll(async () => {
    setup = new Client({ ...config, ssl: config.tls.enabled ? { rejectUnauthorized: true } : false });
    await setup.connect();
    await setup.query(`
      CREATE TABLE ${customers} (id INTEGER PRIMARY KEY, name TEXT NOT NULL, city TEXT);
      CREATE TABLE ${orders} (
        id BIGINT PRIMARY KEY,
        customer_id INTEGER REFERENCES ${customers}(id),
        order_date DATE NOT NULL,
        total NUMERIC(12, 2) NOT NULL
      );
      CREATE INDEX ${p}_idx_orders_customer ON ${orders}(customer_id);
      INSERT INTO ${customers} VALUES (1, 'Ada Test', 'Lahore'), (2, 'Bo Sample', NULL);
      INSERT INTO ${orders} VALUES (9007199254740993, 1, '2026-01-05', 12.50), (2, 2, '2026-02-10', 0.10);
      ANALYZE ${customers}; ANALYZE ${orders};
    `);
  });

  afterAll(async () => {
    await setup?.query(`DROP TABLE IF EXISTS ${orders}; DROP TABLE IF EXISTS ${customers};`).catch(() => undefined);
    await setup?.end();
  });

  beforeEach(async () => {
    adapter = new PostgresAdapter();
    const result = await adapter.connect(config);
    expect(result.success).toBe(true);
  });

  afterEach(async () => {
    await adapter.disconnect();
  });

  it('reads with $n parameters and keeps exact values', async () => {
    const result = await adapter.executeRead(`SELECT id, order_date, total FROM ${orders} WHERE customer_id = $1`, [1]);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.rows).toEqual([{ id: '9007199254740993', order_date: '2026-01-05', total: '12.50' }]);
  });

  it('preserves NULL', async () => {
    const result = await adapter.executeRead(`SELECT city FROM ${customers} WHERE id = 2`);
    expect(result.success && result.data.rows).toEqual([{ city: null }]);
  });

  it('blocks a write hidden behind WITH and changes nothing', async () => {
    const result = await adapter.executeRead(`WITH x AS (SELECT 3) INSERT INTO ${customers} (id, name) SELECT 3, 'Eve' FROM x`);
    expect(!result.success && result.error.message).toMatch(/read-only/i);
    const check = await setup.query(`SELECT COUNT(*)::int AS n FROM ${customers}`);
    expect(check.rows[0].n).toBe(2);
  });

  it('rejects multiple statements in one request', async () => {
    const result = await adapter.executeRead(`SELECT 1; DELETE FROM ${orders}`);
    expect(result.success).toBe(false);
    const check = await setup.query(`SELECT COUNT(*)::int AS n FROM ${orders}`);
    expect(check.rows[0].n).toBe(2);
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
    const wrong = new PostgresAdapter();
    const secret = 'definitely-wrong-pw-123';
    const result = await wrong.connect({ ...config, password: secret });
    expect(result.success).toBe(false);
    if (!result.success) expect(JSON.stringify(result.error)).not.toContain(secret);
  });
});
