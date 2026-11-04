/**
 * End-to-end write tests — SQL Sensi V2 (Phase 7 feature, admin write path)
 *
 * Unlike write-service.test.ts (which uses a fake executor) these run the WHOLE
 * chain on a real SQLite fixture: WriteService → real PolicyService → real
 * SqliteAdapter, as an admin with writes enabled. They prove INSERT/UPDATE/DELETE
 * actually change the data, report the right affected-row counts, and record a
 * safe audit event — and that a denied write changes nothing.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { User } from '../../src/types';
import { PolicyService } from '../../src/services/policy/policy.service';
import { AuditService } from '../../src/services/audit/audit.service';
import { WriteService, WriteContext } from '../../src/services/writes/write.service';
import { SqliteAdapter } from '../../src/services/database/adapters/sqlite.adapter';
import { createSqliteFixture, SqliteFixture } from '../fixtures/sqlite-fixture';

const admin: User = { id: 'admin-1', email: 'admin@x.test', role: 'admin', createdAt: '' };
const standard: User = { id: 'user-2', email: 'user@x.test', role: 'standard', createdAt: '' };

describe('controlled writes end-to-end (real adapter + policy + audit)', () => {
  let dir: string;
  let fixture: SqliteFixture;
  let adapter: SqliteAdapter;
  let policy: PolicyService;
  let audit: AuditService;
  let service: WriteService;

  const ctx = (overrides: Partial<WriteContext> = {}): WriteContext => ({
    user: admin,
    connectionId: 'conn-1',
    engine: 'sqlite',
    assertActive: () => ({ success: true, data: { connectionId: 'conn-1' } }),
    ...overrides,
  });

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-e2e-'));
    fixture = createSqliteFixture();
    adapter = new SqliteAdapter();
    const connected = await adapter.connect({ engine: 'sqlite', filePath: fixture.dbPath });
    expect(connected.success).toBe(true);

    policy = new PolicyService(dir);
    audit = new AuditService(path.join(dir, 'audit.db'));
    service = new WriteService(policy, adapter, audit);

    // Admin turns writes on for all three operations, no confirmation gate so the
    // statement runs straight through (the gate itself is covered elsewhere).
    policy.updatePolicy(admin, {
      enableWrites: true,
      allowedOperations: ['insert', 'update', 'delete'],
      requireSqlPreview: false,
      requireWriteConfirmation: false,
      broadMutationHandling: 'allow',
    });
  });

  afterEach(async () => {
    await adapter.disconnect();
    audit.close();
    fixture.cleanup();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Reads a single scalar via the adapter (committed data on disk). */
  async function scalar(sql: string, params: unknown[] = []): Promise<unknown> {
    const res = await adapter.executeRead(sql, params);
    if (!res.success) throw new Error(res.error.message);
    const row = res.data.rows[0] ?? {};
    return Object.values(row)[0];
  }

  it('INSERT adds a row, commits, and audits success', async () => {
    const res = await service.execute(
      ctx(),
      "INSERT INTO products (id, name, category, price) VALUES (4, 'Pen', 'stationery', 1.5)"
    );
    expect(res.success).toBe(true);
    if (res.success && res.data.status === 'executed') {
      expect(res.data.operation).toBe('insert');
      expect(res.data.affectedRows).toBe(1);
      expect(res.data.committed).toBe(true);
    } else {
      throw new Error('expected an executed insert');
    }

    expect(await scalar('SELECT name FROM products WHERE id = 4')).toBe('Pen');
    expect(Number(await scalar('SELECT COUNT(*) FROM products'))).toBe(4);

    const log = audit.list();
    expect(log.success && log.data[0]).toMatchObject({ operation: 'insert', outcome: 'success', affectedRows: 1, engine: 'sqlite' });
  });

  it('UPDATE changes matching rows and reports the count', async () => {
    const res = await service.execute(ctx(), 'UPDATE products SET price = 99 WHERE category = ?', ['tools']);
    expect(res.success).toBe(true);
    if (res.success && res.data.status === 'executed') {
      expect(res.data.operation).toBe('update');
      expect(res.data.affectedRows).toBe(2); // Widget + Gadget are 'tools'
    } else {
      throw new Error('expected an executed update');
    }

    expect(Number(await scalar("SELECT COUNT(*) FROM products WHERE price = 99"))).toBe(2);
    expect(Number(await scalar("SELECT price FROM products WHERE name = 'Notebook'"))).toBe(3.25); // untouched

    const log = audit.list();
    expect(log.success && log.data[0]).toMatchObject({ operation: 'update', outcome: 'success', affectedRows: 2 });
  });

  it('DELETE removes matching rows and leaves the rest', async () => {
    const res = await service.execute(ctx(), 'DELETE FROM orders WHERE customer_id = 1');
    expect(res.success).toBe(true);
    if (res.success && res.data.status === 'executed') {
      expect(res.data.operation).toBe('delete');
      expect(res.data.affectedRows).toBe(2); // customer 1 has orders 1 and 2
    } else {
      throw new Error('expected an executed delete');
    }

    expect(Number(await scalar('SELECT COUNT(*) FROM orders'))).toBe(2); // 4 - 2 remain
    expect(Number(await scalar('SELECT COUNT(*) FROM orders WHERE customer_id = 1'))).toBe(0);

    const log = audit.list();
    expect(log.success && log.data[0]).toMatchObject({ operation: 'delete', outcome: 'success', affectedRows: 2 });
  });

  it('an INSERT with zero matches still succeeds; an UPDATE matching nothing affects 0 rows', async () => {
    const res = await service.execute(ctx(), "UPDATE products SET price = 1 WHERE category = 'does-not-exist'");
    expect(res.success).toBe(true);
    if (res.success && res.data.status === 'executed') {
      expect(res.data.affectedRows).toBe(0);
    }
    // Nothing changed.
    expect(Number(await scalar('SELECT COUNT(*) FROM products WHERE price = 1'))).toBe(0);
  });

  it('a standard user is denied and the data is unchanged', async () => {
    const before = Number(await scalar('SELECT COUNT(*) FROM products'));
    const res = await service.execute(ctx({ user: standard }), "INSERT INTO products (id, name, category, price) VALUES (9, 'X', 'y', 1)");
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('NOT_AUTHORIZED');

    expect(Number(await scalar('SELECT COUNT(*) FROM products'))).toBe(before);
    const log = audit.list();
    expect(log.success && log.data[0]).toMatchObject({ operation: 'insert', outcome: 'denied' });
  });

  it('a write is refused when the active connection changed just before execution', async () => {
    const before = Number(await scalar('SELECT COUNT(*) FROM orders'));
    const res = await service.execute(
      ctx({ assertActive: () => ({ success: false, error: { code: 'CONNECTION_CHANGED', message: 'switched' } }) }),
      'DELETE FROM orders WHERE customer_id = 3'
    );
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.code).toBe('CONNECTION_CHANGED');
    expect(Number(await scalar('SELECT COUNT(*) FROM orders'))).toBe(before); // nothing deleted
  });
});
