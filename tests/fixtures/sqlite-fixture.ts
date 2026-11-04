/**
 * Synthetic SQLite Fixture — SQL Sensi tests
 *
 * Builds a small, non-sensitive "sales" database in a temp directory.
 * Used by regression tests for query execution, query plans and results.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface SqliteFixture {
  dir: string;
  dbPath: string;
  cleanup: () => void;
}

export const FIXTURE_SQL = `
CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  city TEXT
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  order_date TEXT NOT NULL,
  total_amount REAL NOT NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

CREATE INDEX idx_orders_customer ON orders(customer_id);

CREATE VIEW customer_totals AS
SELECT c.name, SUM(o.total_amount) AS total_spend
FROM orders o JOIN customers c ON c.id = o.customer_id
GROUP BY c.id;

INSERT INTO customers (id, name, email, city) VALUES
  (1, 'Ada Test', 'ada@example.test', 'Lahore'),
  (2, 'Bo Sample', 'bo@example.test', NULL),
  (3, 'Cy Fixture', 'cy@example.test', 'Karachi');

INSERT INTO products (id, name, category, price) VALUES
  (1, 'Widget', 'tools', 9.5),
  (2, 'Gadget', 'tools', 20),
  (3, 'Notebook', 'stationery', 3.25);

INSERT INTO orders (id, customer_id, order_date, total_amount) VALUES
  (1, 1, '2026-01-05', 100),
  (2, 1, '2026-02-10', 50),
  (3, 2, '2026-02-11', 75.5),
  (4, 3, '2026-03-01', 10);
`;

/** Creates the fixture database. Call `cleanup()` after disconnecting from it. */
export function createSqliteFixture(prefix = 'sqlsensi-fixture-'): SqliteFixture {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const dbPath = path.join(dir, 'sales_fixture.db');

  const db = new DatabaseSync(dbPath);
  db.exec(FIXTURE_SQL);
  db.close();

  return {
    dir,
    dbPath,
    cleanup: () => {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Windows may hold the file briefly after close; temp dir is disposable.
      }
    },
  };
}
