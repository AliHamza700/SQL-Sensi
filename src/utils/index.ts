/**
 * Shared Utility Functions — SQL Sensi
 *
 * Pure, side-effect-free helper functions.
 * No dependencies on services, AI, or database.
 */

// ─── String Utilities ─────────────────────────────────────────

/** Truncate a string to maxLength with ellipsis */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/** Convert snake_case or camelCase to Title Case */
export function toTitleCase(str: string): string {
  return str
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check if a string looks like a SQL keyword */
export function isSQLKeyword(word: string): boolean {
  const keywords = new Set([
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'ON', 'GROUP', 'BY', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT',
    'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'AS', 'AND', 'OR', 'NOT', 'IN',
    'IS', 'NULL', 'LIKE', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'WITH', 'UNION', 'ALL', 'EXISTS', 'SUBQUERY',
  ]);
  return keywords.has(word.toUpperCase());
}

// ─── Number / Data Utilities ──────────────────────────────────

/** Format a number with thousands separators */
export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** Format bytes into a human-readable string */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Format milliseconds as a readable duration */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ─── ID Utilities ─────────────────────────────────────────────

/** Generate a simple UUID-v4-like string (client-safe, no crypto dependency) */
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Date Utilities ───────────────────────────────────────────

/** Return an ISO timestamp string for now */
export function nowISO(): string {
  return new Date().toISOString();
}

/** Format an ISO date string for display */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleString();
}

// ─── Array Utilities ──────────────────────────────────────────

/** Remove duplicate values from an array */
export function unique<T>(arr: T[]): T[] {
  return [...new Set(arr)];
}

/** Group an array of objects by a key */
export function groupBy<T>(arr: T[], key: keyof T): Record<string, T[]> {
  return arr.reduce<Record<string, T[]>>((acc, item) => {
    const group = String(item[key]);
    if (!acc[group]) acc[group] = [];
    acc[group].push(item);
    return acc;
  }, {});
}

// ─── SQLite Type Detection ────────────────────────────────────

/** Detect the semantic category of a SQLite column type */
export function detectColumnCategory(
  sqliteType: string
): 'numeric' | 'text' | 'date' | 'boolean' | 'blob' | 'unknown' {
  const t = sqliteType.toUpperCase();
  if (/INT|REAL|NUMERIC|FLOAT|DOUBLE|DECIMAL/.test(t)) return 'numeric';
  if (/CHAR|TEXT|CLOB|VARCHAR|STRING/.test(t)) return 'text';
  if (/DATE|TIME/.test(t)) return 'date';
  if (/BOOL/.test(t)) return 'boolean';
  if (/BLOB/.test(t)) return 'blob';
  return 'unknown';
}
