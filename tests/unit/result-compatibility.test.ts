/**
 * Result Compatibility Tests — SQL Sensi V2 Phase 8
 *
 * Phase 8 task 4: results must survive NULLs, integers, reals/decimals,
 * booleans, text, date/time text, JSON and binary (BLOB) values without
 * corruption, and the CSV/JSON exporters must render each one losslessly.
 *
 * SQLite is exercised live through the adapter (the one engine available in
 * Jest on the system Node). MySQL/PostgreSQL value fidelity — BIGINT/DECIMAL and
 * PG dates returned as strings — is covered by the mocked `server-adapters`
 * suite and documented in docs/v2-result-compatibility.md; the export layer is
 * tested here against every value shape those engines can produce.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SqliteAdapter } from '../../src/services/database/adapters/sqlite.adapter';
import { convertToCSV, convertToJSON, normalizeCell } from '../../src/utils/export';
import type { QueryResult } from '../../src/types';

describe('SQLite result value fidelity (live adapter)', () => {
  let dir: string;
  let dbPath: string;
  let adapter: SqliteAdapter;

  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-compat-'));
    dbPath = path.join(dir, 'types.db');
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE samples (
        id INTEGER PRIMARY KEY,
        label TEXT,
        price REAL,
        is_active INTEGER,
        made_on TEXT,
        payload BLOB,
        note TEXT
      );
    `);
    const insert = db.prepare(
      'INSERT INTO samples (id, label, price, is_active, made_on, payload, note) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    insert.run(1, 'widget', 9.99, 1, '2026-03-01T10:30:00Z', new Uint8Array([0xde, 0xad, 0xbe, 0xef]), null);
    insert.run(2, null, 0.1, 0, '2026-03-02', null, 'has, comma and "quote"');
    db.close();

    adapter = new SqliteAdapter();
    const res = await adapter.connect({ engine: 'sqlite', filePath: dbPath });
    expect(res.success).toBe(true);
  });

  afterAll(async () => {
    await adapter.disconnect();
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* temp dir is disposable */
    }
  });

  it('preserves NULL, integer, real, boolean-as-int and date text without coercion', async () => {
    const res = await adapter.executeRead('SELECT * FROM samples ORDER BY id');
    expect(res.success).toBe(true);
    if (!res.success) return;

    expect(res.data.columns).toEqual(['id', 'label', 'price', 'is_active', 'made_on', 'payload', 'note']);
    expect(res.data.rowCount).toBe(2);

    const [a, b] = res.data.rows;
    expect(a.price).toBe(9.99); // real precision kept
    expect(a.is_active).toBe(1); // SQLite has no boolean; 0/1 stays numeric
    expect(a.made_on).toBe('2026-03-01T10:30:00Z'); // date text, not shifted into a Date
    expect(b.label).toBeNull();
    expect(b.payload).toBeNull();
  });

  it('returns a BLOB as binary bytes (Uint8Array), not a lossy string', async () => {
    const res = await adapter.executeRead("SELECT payload FROM samples WHERE id = 1");
    expect(res.success).toBe(true);
    if (!res.success) return;
    const value = res.data.rows[0].payload;
    expect(value).toBeInstanceOf(Uint8Array);
    expect(Array.from(value as Uint8Array)).toEqual([0xde, 0xad, 0xbe, 0xef]);
  });

  it('exports live rows to CSV with binary as 0x-hex and NULL as an empty cell', async () => {
    const res = await adapter.executeRead('SELECT id, label, payload FROM samples ORDER BY id');
    expect(res.success).toBe(true);
    if (!res.success) return;
    const csv = convertToCSV(res.data);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('id,label,payload');
    expect(lines[1]).toBe('1,widget,0xdeadbeef');
    expect(lines[2]).toBe('2,,'); // NULL label and NULL payload → empty cells
  });

  it('exports live rows to JSON with binary as a 0x-hex string', async () => {
    const res = await adapter.executeRead('SELECT id, payload FROM samples ORDER BY id');
    expect(res.success).toBe(true);
    if (!res.success) return;
    const parsed = JSON.parse(convertToJSON(res.data));
    expect(parsed[0]).toEqual({ id: 1, payload: '0xdeadbeef' });
    expect(parsed[1]).toEqual({ id: 2, payload: null });
  });
});

describe('export value normalization (all engines)', () => {
  it('normalizes bigint to its full decimal digits (no precision loss)', () => {
    expect(normalizeCell(9007199254740993n)).toBe('9007199254740993');
  });

  it('keeps server string values (BIGINT/DECIMAL/PG dates arrive as strings)', () => {
    expect(normalizeCell('123456789012345678')).toBe('123456789012345678');
    expect(normalizeCell('2026-03-01 10:30:00+00')).toBe('2026-03-01 10:30:00+00');
  });

  it('serializes a parsed JSON column value to JSON text in CSV', () => {
    const result: QueryResult = {
      columns: ['doc'],
      rows: [{ doc: { a: 1, b: [2, 3] } }],
      rowCount: 1,
      executionTimeMs: 0,
    };
    const csv = convertToCSV(result);
    expect(csv).toBe('doc\n"{""a"":1,""b"":[2,3]}"');
  });

  it('keeps a parsed JSON column nested in JSON export', () => {
    const result: QueryResult = {
      columns: ['doc'],
      rows: [{ doc: { a: 1 } }],
      rowCount: 1,
      executionTimeMs: 0,
    };
    expect(JSON.parse(convertToJSON(result))).toEqual([{ doc: { a: 1 } }]);
  });

  it('renders binary as 0x-hex in both exporters', () => {
    const result: QueryResult = {
      columns: ['b'],
      rows: [{ b: new Uint8Array([0x00, 0x0f, 0xff]) }],
      rowCount: 1,
      executionTimeMs: 0,
    };
    expect(convertToCSV(result)).toBe('b\n0x000fff');
    expect(JSON.parse(convertToJSON(result))).toEqual([{ b: '0x000fff' }]);
  });
});
