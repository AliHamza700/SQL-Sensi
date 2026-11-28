import { SqliteAdapter } from '../../src/services/database/adapters/sqlite.adapter';
import { createSqliteFixture, SqliteFixture } from '../fixtures/sqlite-fixture';

describe('SqliteAdapter.executeWrite (V2 Phase 7)', () => {
  let fixture: SqliteFixture;
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    fixture = createSqliteFixture();
    adapter = new SqliteAdapter();
    const connected = await adapter.connect({ engine: 'sqlite', filePath: fixture.dbPath });
    expect(connected.success).toBe(true);
  });

  afterEach(async () => {
    await adapter.disconnect();
    fixture.cleanup();
  });

  it('commits an INSERT and reports affected rows', async () => {
    const res = await adapter.executeWrite(
      "INSERT INTO products (id, name, category, price) VALUES (4, 'Pen', 'stationery', 1.5)"
    );
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.affectedRows).toBe(1);
      expect(res.data.committed).toBe(true);
    }

    const read = await adapter.executeRead('SELECT name FROM products WHERE id = 4');
    expect(read.success).toBe(true);
    if (read.success) expect(read.data.rows[0].name).toBe('Pen');
  });

  it('commits UPDATE and DELETE and counts rows', async () => {
    const upd = await adapter.executeWrite('UPDATE products SET price = 99 WHERE category = ?', ['tools']);
    expect(upd.success && upd.data.affectedRows).toBe(2);

    const del = await adapter.executeWrite('DELETE FROM orders WHERE customer_id = 1');
    expect(del.success && del.data.affectedRows).toBe(2);
  });

  it('creates related tables and an index from scratch (CREATE)', async () => {
    const dept = await adapter.executeWrite(
      'CREATE TABLE Department (DepartmentId INTEGER PRIMARY KEY, Name TEXT NOT NULL UNIQUE)'
    );
    expect(dept.success).toBe(true);
    const doc = await adapter.executeWrite(
      'CREATE TABLE Doctor (DoctorId INTEGER PRIMARY KEY, Name TEXT NOT NULL, ' +
        'DepartmentId INTEGER NOT NULL REFERENCES Department (DepartmentId))'
    );
    expect(doc.success).toBe(true);
    const idx = await adapter.executeWrite('CREATE INDEX idx_doctor_department ON Doctor (DepartmentId)');
    expect(idx.success).toBe(true);

    const schema = await adapter.getSchema();
    expect(schema.success).toBe(true);
    if (schema.success) {
      expect(schema.data.tables.map((t) => t.name)).toEqual(expect.arrayContaining(['Department', 'Doctor']));
      expect(schema.data.relationships).toContainEqual(
        expect.objectContaining({ fromTable: 'Doctor', fromColumn: 'DepartmentId', toTable: 'Department', toColumn: 'DepartmentId' })
      );
      expect(schema.data.indexes.map((i) => i.name)).toContain('idx_doctor_department');
    }
  });

  it('reports zero affected rows without error when nothing matches', async () => {
    const res = await adapter.executeWrite('DELETE FROM products WHERE id = 9999');
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.affectedRows).toBe(0);
  });

  it('rolls back and errors on a bad statement, leaving data unchanged', async () => {
    const before = await adapter.executeRead('SELECT COUNT(*) AS n FROM products');
    const res = await adapter.executeWrite('UPDATE no_such_table SET x = 1');
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('SQL_EXECUTION_ERROR');

    const after = await adapter.executeRead('SELECT COUNT(*) AS n FROM products');
    if (before.success && after.success) {
      expect(after.data.rows[0].n).toEqual(before.data.rows[0].n);
    }
  });

  it('keeps the main read handle read-only', async () => {
    // executeRead runs through the read-only connection; a write there must fail.
    const res = await adapter.executeRead("INSERT INTO products (id, name, category, price) VALUES (5, 'X', 'y', 1)");
    expect(res.success).toBe(false);
  });
});
