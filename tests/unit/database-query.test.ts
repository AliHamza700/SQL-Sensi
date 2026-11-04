/**
 * DatabaseService Read & Query Plan Regression Tests — SQL Sensi V2 Phase 1
 *
 * Locks in Version 1 SQLite behaviour before the adapter migration:
 *   1. Read queries — columns, rows, params, NULLs, joins, views
 *   2. Read-only connection — writes that slip past the prefix check still fail
 *   3. EXPLAIN QUERY PLAN — node shape, index usage, mutation and disconnect handling
 */

import { DatabaseService } from '../../src/services/database/database.service';
import { createSqliteFixture, SqliteFixture } from '../fixtures/sqlite-fixture';

describe('DatabaseService — read queries (regression)', () => {
  let fixture: SqliteFixture;
  let dbService: DatabaseService;

  beforeAll(() => {
    fixture = createSqliteFixture();
  });

  afterAll(() => {
    dbService?.disconnect();
    fixture.cleanup();
  });

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DatabaseService as any).instance = undefined;
    dbService = DatabaseService.getInstance();
    const result = await dbService.connect(fixture.dbPath);
    expect(result.success).toBe(true);
  });

  afterEach(() => {
    dbService.disconnect();
  });

  it('returns columns in SELECT order with matching rows', async () => {
    const result = await dbService.executeQuery('SELECT id, name, city FROM customers ORDER BY id');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.columns).toEqual(['id', 'name', 'city']);
    expect(result.data.rowCount).toBe(3);
    expect(result.data.rows[0]).toEqual({ id: 1, name: 'Ada Test', city: 'Lahore' });
  });

  it('preserves NULL values', async () => {
    const result = await dbService.executeQuery('SELECT city FROM customers WHERE id = 2');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rows).toEqual([{ city: null }]);
    }
  });

  it('binds positional parameters', async () => {
    const result = await dbService.executeQuery('SELECT name FROM customers WHERE id = ?', [3]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rows).toEqual([{ name: 'Cy Fixture' }]);
    }
  });

  it('runs joins with aggregation', async () => {
    const result = await dbService.executeQuery(`
      SELECT c.name, SUM(o.total_amount) AS total_spend
      FROM orders o JOIN customers c ON c.id = o.customer_id
      GROUP BY c.id ORDER BY total_spend DESC
    `);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toEqual(['name', 'total_spend']);
      expect(result.data.rows[0]).toEqual({ name: 'Ada Test', total_spend: 150 });
      expect(result.data.rowCount).toBe(3);
    }
  });

  it('reads from views', async () => {
    const result = await dbService.executeQuery('SELECT * FROM customer_totals ORDER BY name');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rowCount).toBe(3);
    }
  });

  it('keeps REAL precision for simple decimals', async () => {
    const result = await dbService.executeQuery('SELECT total_amount FROM orders WHERE id = 3');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rows[0].total_amount).toBe(75.5);
    }
  });

  it('reports execution time as a non-negative number', async () => {
    const result = await dbService.executeQuery('SELECT 1 AS one');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.executionTimeMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('rejects a write hidden behind WITH because the connection is read-only', async () => {
    // The service prefix check only looks at the first keyword; the read-only
    // connection is the layer that must stop this.
    const result = await dbService.executeQuery(
      "WITH x AS (SELECT 1) INSERT INTO customers (name, email) SELECT 'Eve', 'eve@example.test' FROM x"
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SQL_EXECUTION_ERROR');
      expect(result.error.message).toMatch(/readonly|read-only/i);
    }

    const check = await dbService.executeQuery("SELECT COUNT(*) AS n FROM customers WHERE name = 'Eve'");
    expect(check.success && check.data.rows[0].n).toBe(0);
  });
});

describe('DatabaseService — EXPLAIN QUERY PLAN (regression)', () => {
  let fixture: SqliteFixture;
  let dbService: DatabaseService;

  beforeAll(async () => {
    fixture = createSqliteFixture('sqlsensi-plan-');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (DatabaseService as any).instance = undefined;
    dbService = DatabaseService.getInstance();
    await dbService.connect(fixture.dbPath);
  });

  afterAll(() => {
    dbService.disconnect();
    fixture.cleanup();
  });

  it('returns plan nodes with id, parentId and detail', async () => {
    const result = await dbService.explainQuery('SELECT * FROM customers');
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.nodes.length).toBeGreaterThan(0);
    const node = result.data.nodes[0];
    expect(typeof node.id).toBe('number');
    expect(typeof node.parentId).toBe('number');
    expect(node.detail).toMatch(/SCAN customers/i);
    expect(result.data.rawOutput).toContain(node.detail);
  });

  it('shows index usage for an indexed lookup', async () => {
    const result = await dbService.explainQuery('SELECT * FROM orders WHERE customer_id = 1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rawOutput).toMatch(/idx_orders_customer/);
    }
  });

  it('refuses to explain mutating statements', async () => {
    const result = await dbService.explainQuery('DELETE FROM orders');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SQL_VALIDATION_ERROR');
    }
  });

  it('returns SQL_EXECUTION_ERROR for invalid SQL', async () => {
    const result = await dbService.explainQuery('SELECT * FROM no_such_table');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('SQL_EXECUTION_ERROR');
    }
  });

  it('fails cleanly when no database is connected', async () => {
    dbService.disconnect();
    const result = await dbService.explainQuery('SELECT 1');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toMatch(/No database connected/i);
    }
  });
});
