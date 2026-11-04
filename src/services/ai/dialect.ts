/**
 * SQL Dialect Guidance — SQL Sensi V2
 *
 * Engine-specific instructions for the model, and cheap checks that catch the
 * most common wrong-dialect mistakes in generated SQL. The checks are
 * heuristics (no SQL parser yet); a hit produces a warning and one repair
 * attempt, never silent acceptance.
 */

import type { DatabaseEngine } from '@/src/types';

export const ENGINE_NAMES: Record<DatabaseEngine, string> = {
  sqlite: 'SQLite 3',
  mysql: 'MySQL 8',
  postgresql: 'PostgreSQL',
};

/** Rules the model must follow when writing SQL for an engine */
export const DIALECT_RULES: Record<DatabaseEngine, string[]> = {
  sqlite: [
    'Quote identifiers with double quotes only when needed ("order").',
    'Concatenate strings with ||.',
    "Dates are usually TEXT: use date(), strftime('%Y-%m', col) and julianday() for date maths.",
    'Use LIMIT n (never TOP n). There is no ILIKE; LIKE is case-insensitive for ASCII.',
    'There is no RIGHT JOIN before SQLite 3.39 and no FULL JOIN; prefer LEFT JOIN.',
  ],
  mysql: [
    'Quote identifiers with backticks only when needed (`order`). Never use double quotes for identifiers.',
    'Concatenate strings with CONCAT(a, b). The || operator is NOT concatenation in MySQL.',
    "Dates: use DATE_FORMAT(col, '%Y-%m'), YEAR(), MONTH(), DATE_SUB(NOW(), INTERVAL 30 DAY).",
    'Use LIMIT n (never TOP n). There is no ILIKE; LIKE follows the column collation.',
    'Do not use :: casts; use CAST(x AS type).',
  ],
  postgresql: [
    'Quote identifiers with double quotes only when needed ("order"). Never use backticks.',
    'Use the schema-qualified table name exactly as listed when it is not in public (e.g. sales.orders).',
    'Concatenate strings with || or CONCAT(). Use ILIKE for case-insensitive matching.',
    "Dates: use date_trunc('month', col), EXTRACT(YEAR FROM col), now() - interval '30 days'.",
    'Use LIMIT n (never TOP n). Casts may use CAST(x AS type) or x::type.',
  ],
};

/** How to read a query plan from each engine (used when explaining plans) */
export const PLAN_GUIDE: Record<DatabaseEngine, string> = {
  sqlite: 'The plan is SQLite EXPLAIN QUERY PLAN output. "SCAN" means a full table scan; "SEARCH … USING INDEX" means an index lookup.',
  mysql: 'The plan is MySQL EXPLAIN FORMAT=TREE (or tabular EXPLAIN) output. "Table scan" means reading every row; "Index lookup"/"ref" means an index is used. Costs and row counts are estimates.',
  postgresql: 'The plan is a PostgreSQL EXPLAIN (estimates only, never executed). "Seq Scan" reads every row; "Index Scan"/"Index Only Scan" use an index. Costs and row counts are planner estimates, not measurements.',
};

interface DialectCheck {
  pattern: RegExp;
  message: string;
}

/** Syntax that belongs to another engine */
const WRONG_DIALECT: Record<DatabaseEngine, DialectCheck[]> = {
  sqlite: [
    { pattern: /`[^`]+`/, message: 'Backtick identifiers are MySQL syntax.' },
    { pattern: /\bILIKE\b/i, message: 'ILIKE does not exist in SQLite.' },
    { pattern: /::\s*[a-z]/i, message: ':: casts are PostgreSQL syntax.' },
    { pattern: /\b(DATE_FORMAT|DATE_TRUNC|NOW)\s*\(/i, message: 'This date function does not exist in SQLite.' },
    { pattern: /\bSELECT\s+TOP\s+\d+/i, message: 'TOP n is SQL Server syntax; use LIMIT.' },
  ],
  mysql: [
    { pattern: /\bILIKE\b/i, message: 'ILIKE does not exist in MySQL.' },
    { pattern: /::\s*[a-z]/i, message: ':: casts are PostgreSQL syntax.' },
    { pattern: /\b(strftime|julianday|date_trunc)\s*\(/i, message: 'This date function does not exist in MySQL.' },
    { pattern: /\|\|/, message: '|| is not string concatenation in MySQL; use CONCAT().' },
    { pattern: /\bSELECT\s+TOP\s+\d+/i, message: 'TOP n is SQL Server syntax; use LIMIT.' },
  ],
  postgresql: [
    { pattern: /`[^`]+`/, message: 'Backtick identifiers are MySQL syntax; use double quotes.' },
    { pattern: /\b(strftime|julianday|DATE_FORMAT|IFNULL)\s*\(/i, message: 'This function does not exist in PostgreSQL.' },
    { pattern: /\bSELECT\s+TOP\s+\d+/i, message: 'TOP n is SQL Server syntax; use LIMIT.' },
  ],
};

/** Removes string literals and comments so checks don't fire on quoted text. */
export function stripLiteralsAndComments(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''");
}

/** Warnings for syntax that belongs to a different engine. */
export function findDialectProblems(sql: string, engine: DatabaseEngine): string[] {
  const code = stripLiteralsAndComments(sql);
  return WRONG_DIALECT[engine].filter(check => check.pattern.test(code)).map(check => check.message);
}
