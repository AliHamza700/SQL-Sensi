import { QueryResult } from '../types';

/**
 * Export helpers for the Results page (V2 Phase 8).
 *
 * Result rows can hold values from three engines, so a cell may be a string,
 * number, boolean, bigint, null, a binary BLOB (Uint8Array/Buffer), or a parsed
 * JSON object/array. `formatCell` turns any of these into a stable, lossless
 * text form:
 *   - null / undefined           → empty cell (CSV) / null (JSON)
 *   - bigint                     → its decimal digits (never a lossy Number)
 *   - Uint8Array / Buffer        → `0x<hex>` so binary is never mojibake
 *   - object / array (e.g. JSON) → compact JSON text
 *   - everything else            → String(value)
 *
 * Server adapters already return BIGINT/DECIMAL and PG dates/timestamps as
 * strings (see CLAUDE.md "Server value fidelity"), so those pass through
 * unchanged and keep full precision.
 */

/** True for a binary blob value from any engine. */
function isBinary(value: unknown): value is Uint8Array {
  return value instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(value));
}

/** Lowercase hex with a `0x` prefix, so a binary cell is recognizable and reversible. */
function toHex(bytes: Uint8Array): string {
  let out = '0x';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * Normalizes one cell to a scalar that is safe for both CSV and JSON output.
 * Returns `null` for empty values; a string otherwise.
 */
export function normalizeCell(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (isBinary(value)) return toHex(value);
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function convertToCSV(result: QueryResult): string {
  if (!result || !result.columns || !result.rows) return '';

  const header = result.columns.map(escapeCSV).join(',');
  const rows = result.rows
    .map((row) =>
      result.columns
        .map((col) => {
          const normalized = normalizeCell(row[col]);
          return normalized === null ? '' : escapeCSV(normalized);
        })
        .join(',')
    )
    .join('\n');

  return `${header}\n${rows}`;
}

/** Escapes a single CSV field: quote it when it contains a comma, quote or newline. */
function escapeCSV(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * One cell as a JSON-native value: numbers, booleans, strings and null pass
 * through unchanged (full fidelity), while the values JSON cannot represent are
 * converted — bigint → decimal string, binary → `0x…` hex string — and a parsed
 * JSON column is kept nested.
 */
function jsonCell(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (isBinary(value)) return toHex(value);
  // number, boolean, string and nested JSON objects/arrays are already JSON-safe.
  return value;
}

/**
 * Rows as a pretty-printed array of plain objects. Native JSON types are kept
 * as-is; binary becomes `0x…` hex and bigint becomes its decimal string so no
 * value is lost or corrupted.
 */
export function convertToJSON(result: QueryResult): string {
  if (!result || !result.columns || !result.rows) return '[]';

  const rows = result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    for (const col of result.columns) obj[col] = jsonCell(row[col]);
    return obj;
  });

  return JSON.stringify(rows, null, 2);
}
