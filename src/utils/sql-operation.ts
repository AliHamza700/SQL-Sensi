/**
 * SQL operation classification — SQL Sensi V2 Phase 6
 *
 * Classifies a single SQL statement as read / insert / update / delete / ddl /
 * other so the policy layer can decide what is allowed. This is a **heuristic**
 * on the statement text, not a real parser: it is one defence-in-depth layer,
 * never the only control (rules.md §3). It errs toward `other` (which the policy
 * refuses) whenever the statement is ambiguous or carries more than one
 * statement. The engine's read-only transaction remains the real guarantee for
 * reads, and Phase 7 re-checks writes immediately before execution.
 */

import type { SqlOperation } from '@/src/types';

/**
 * Removes comments and the contents of string / quoted-identifier literals,
 * replacing each with a single space so keyword and WHERE detection cannot be
 * fooled by text inside them (e.g. a column literally named "where"). Dollar-
 * quoted PostgreSQL strings ($tag$...$tag$) are handled too.
 */
export function stripSqlNoise(sql: string): string {
  let out = '';
  let i = 0;
  const n = sql.length;

  while (i < n) {
    const c = sql[i];
    const next = sql[i + 1];

    // Line comment: -- … EOL
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++;
      out += ' ';
      continue;
    }
    // Block comment: /* … */
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      out += ' ';
      continue;
    }
    // Single-quoted string literal
    if (c === "'") {
      i++;
      while (i < n) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; } // escaped ''
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      out += ' ';
      continue;
    }
    // Double-quoted or backtick identifier (may contain spaces/keywords)
    if (c === '"' || c === '`') {
      const quote = c;
      i++;
      while (i < n && sql[i] !== quote) i++;
      i++;
      out += ' ';
      continue;
    }
    // Dollar-quoted string: $tag$ … $tag$  (PostgreSQL)
    if (c === '$') {
      const tagMatch = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
      if (tagMatch) {
        const tag = tagMatch[0];
        const end = sql.indexOf(tag, i + tag.length);
        i = end < 0 ? n : end + tag.length;
        out += ' ';
        continue;
      }
    }

    out += c;
    i++;
  }

  return out;
}

/** The non-empty, semicolon-separated statements in cleaned SQL. */
function splitStatements(cleaned: string): string[] {
  return cleaned.split(';').map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Classifies a single SQL statement. Returns `other` when the text is empty,
 * carries more than one statement, or cannot be classified confidently.
 */
export function classifySqlOperation(sql: string): SqlOperation {
  const cleaned = stripSqlNoise(sql).trim();
  if (!cleaned) return 'other';

  const statements = splitStatements(cleaned);
  // More than one statement is ambiguous for a write decision — refuse.
  if (statements.length > 1) return 'other';

  const body = statements[0] ?? cleaned;
  const first = (/^[A-Za-z]+/.exec(body)?.[0] ?? '').toLowerCase();

  switch (first) {
    case 'select':
    case 'explain':
    case 'pragma':
    case 'show':
    case 'describe':
    case 'desc':
    case 'values':
    case 'table':
      return 'read';
    case 'insert':
      return 'insert';
    case 'update':
      return 'update';
    case 'delete':
      return 'delete';
    case 'create':
    case 'alter':
    case 'drop':
    case 'truncate':
    case 'rename':
    case 'grant':
    case 'revoke':
    case 'comment':
    case 'reindex':
    case 'vacuum':
    case 'attach':
    case 'detach':
      return 'ddl';
    case 'with': {
      // A read-only CTE is a read; a data-modifying CTE (PG: WITH … DELETE …)
      // is too risky to classify precisely, so refuse it.
      return /\b(insert|update|delete)\b/i.test(body) ? 'other' : 'read';
    }
    default:
      // REPLACE, MERGE, UPSERT, CALL, DO, SET, COPY, LOAD, and anything else:
      // not a CRUD write we support — refuse rather than guess.
      return 'other';
  }
}

/** True when the statement text contains a WHERE clause (outside strings/comments). */
export function hasWhereClause(sql: string): boolean {
  return /\bwhere\b/i.test(stripSqlNoise(sql));
}

/**
 * A "broad" mutation is an UPDATE or DELETE with no detectable WHERE clause,
 * i.e. one that would affect every row. Only meaningful for update/delete.
 */
export function isBroadMutation(sql: string, operation: SqlOperation): boolean {
  if (operation !== 'update' && operation !== 'delete') return false;
  return !hasWhereClause(sql);
}

/** Convenience: is this statement one of the V2-scope write operations? */
export function isWriteOperation(operation: SqlOperation): operation is 'insert' | 'update' | 'delete' {
  return operation === 'insert' || operation === 'update' || operation === 'delete';
}

/**
 * Best-effort target table of a write, for audit display only (never a security
 * control). Returns the raw identifier (quotes stripped) or null. Heuristic.
 */
export function extractTargetTable(sql: string, operation: SqlOperation): string | null {
  const cleaned = stripSqlNoise(sql);
  let match: RegExpExecArray | null = null;
  if (operation === 'insert') {
    match = /\binsert\s+into\s+([`"\w.]+)/i.exec(cleaned);
  } else if (operation === 'update') {
    match = /\bupdate\s+([`"\w.]+)/i.exec(cleaned);
  } else if (operation === 'delete') {
    match = /\bdelete\s+from\s+([`"\w.]+)/i.exec(cleaned);
  }
  if (!match) return null;
  const name = match[1].replace(/[`"]/g, '').trim();
  return name.length > 0 ? name : null;
}
