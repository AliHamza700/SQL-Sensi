/**
 * AI Answer Parser & Validator — SQL Sensi V2
 *
 * The model's reply is untrusted. This module turns it into a typed answer and
 * checks the SQL before anything can run it:
 *   - exactly one statement, and it must be read-only (SELECT / WITH … SELECT)
 *   - every table it reads must exist in the schema (no invented names)
 *   - syntax from another engine is flagged
 * These are text checks, not a full parser: they reduce mistakes, they do not
 * replace the read-only connection / transaction that actually enforces safety.
 */

import type { AiAnswerMode, DatabaseEngine, DatabaseSchema, ServiceResult } from '@/src/types';
import { createError } from '@/src/utils/errors';
import { findDialectProblems, stripLiteralsAndComments } from './dialect';

export interface ParsedAnswer {
  mode: AiAnswerMode;
  sql?: string;
  explanation: string;
  assumptions: string[];
  tablesUsed: string[];
  question?: string;
  /** Blocking: the SQL must not run */
  problems: string[];
  /** Non-blocking, shown to the user */
  warnings: string[];
}

const MODES: AiAnswerMode[] = ['sql', 'general', 'clarify'];
/** Data-changing keywords. REPLACE( is the string function, so only REPLACE not followed by "(" counts. */
const WRITE_WORDS = /\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|ATTACH|DETACH|PRAGMA|COPY|CALL|SET|LOCK)\b|\b(REPLACE)\b(?!\s*\()/i;

function stringList(value: unknown, maxItems = 10): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '').slice(0, maxItems).map(v => v.trim().slice(0, 300));
}

function text(value: unknown, max = 2000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/** Removes ``` fences and a single trailing semicolon. */
export function cleanSql(sql: string): string {
  return sql
    .trim()
    .replace(/^```(?:sql)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim()
    .replace(/;\s*$/, '')
    .trim();
}

/** Extracts the JSON object from a reply that may be wrapped in fences or prose. */
function extractJson(raw: string): unknown {
  const unfenced = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object');
  return JSON.parse(unfenced.slice(start, end + 1));
}

/** Names of CTEs defined in the statement (they are not real tables). */
function cteNames(code: string): Set<string> {
  const names = new Set<string>();
  const re = /(?:\bWITH\s+(?:RECURSIVE\s+)?|,\s*)([`"]?[\w$]+[`"]?)\s*(?:\([^)]*\)\s*)?AS\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) names.add(normalizeIdent(m[1]));
  return names;
}

function normalizeIdent(id: string): string {
  return id.replace(/[`"]/g, '').toLowerCase();
}

/** Tables read via FROM / JOIN (approximate; function calls and subqueries are skipped). */
export function referencedTables(sql: string): string[] {
  const code = stripLiteralsAndComments(sql)
    // FROM inside these functions is not a table reference
    .replace(/\b(EXTRACT|SUBSTRING|TRIM|POSITION|OVERLAY)\s*\([^)]*\)/gi, ' ');
  const ctes = cteNames(code);
  const found = new Set<string>();
  const re = /\b(?:FROM|JOIN)\s+([`"]?[\w$]+[`"]?(?:\.[`"]?[\w$]+[`"]?)?)(?![\w$`".])(?!\s*\()/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    const name = normalizeIdent(m[1]);
    if (!ctes.has(name)) found.add(name);
  }
  return [...found];
}

/** Table names the query may use: tables and views, with and without a schema prefix. */
function knownNames(schema: DatabaseSchema): Set<string> {
  const names = new Set<string>();
  for (const n of [...schema.tables.map(t => t.name), ...schema.views.map(v => v.name)]) {
    const lower = n.toLowerCase();
    names.add(lower);
    names.add(lower.includes('.') ? lower.slice(lower.lastIndexOf('.') + 1) : `public.${lower}`);
  }
  return names;
}

/** Problems that must stop the SQL from running. */
export function checkSql(sql: string, schema: DatabaseSchema): string[] {
  const problems: string[] = [];
  const code = stripLiteralsAndComments(sql).trim();

  if (code.includes(';')) {
    problems.push('The SQL contains more than one statement.');
  }

  const firstWord = code.replace(/^\(+/, '').split(/\s+/)[0]?.toUpperCase();
  if (firstWord !== 'SELECT' && firstWord !== 'WITH') {
    problems.push(`The SQL starts with ${firstWord || 'nothing'}; only SELECT queries can run.`);
  } else {
    const write = code.match(WRITE_WORDS);
    if (write) problems.push(`The SQL contains a data-changing keyword (${(write[1] ?? write[2]).toUpperCase()}).`);
  }

  const known = knownNames(schema);
  for (const table of referencedTables(sql)) {
    if (!known.has(table)) problems.push(`The SQL uses a table that is not in the schema: ${table}.`);
  }

  return problems;
}

/** Parses and validates a reply to the SQL system prompt. */
export function parseSqlAnswer(raw: string, engine: DatabaseEngine, schema: DatabaseSchema): ServiceResult<ParsedAnswer> {
  let data: Record<string, unknown>;
  try {
    const parsed = extractJson(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    data = parsed as Record<string, unknown>;
  } catch {
    return { success: false, error: createError('AI_ERROR', 'The AI reply could not be read. Please try again.') };
  }

  const mode = MODES.includes(data.mode as AiAnswerMode) ? (data.mode as AiAnswerMode) : null;
  if (!mode) {
    return { success: false, error: createError('AI_ERROR', 'The AI reply had an unknown answer type. Please try again.') };
  }

  const answer: ParsedAnswer = {
    mode,
    explanation: text(data.explanation),
    assumptions: stringList(data.assumptions),
    tablesUsed: stringList(data.tables_used ?? data.tablesUsed, 20),
    problems: [],
    warnings: [],
  };

  if (mode === 'clarify') {
    answer.question = text(data.question) || answer.explanation || 'Could you say a bit more about what you need?';
    return { success: true, data: answer };
  }

  if (mode === 'general') {
    if (!answer.explanation) answer.explanation = text(data.answer) || text(data.question);
    if (!answer.explanation) {
      return { success: false, error: createError('AI_ERROR', 'The AI reply was empty. Please try again.') };
    }
    return { success: true, data: answer };
  }

  const sql = cleanSql(text(data.sql, 20_000));
  if (!sql) {
    answer.problems.push('The reply has no SQL.');
    return { success: true, data: answer };
  }
  answer.sql = sql;
  answer.problems = checkSql(sql, schema);
  answer.warnings = findDialectProblems(sql, engine);
  return { success: true, data: answer };
}

/** Parses a JSON reply and keeps only the expected string / string-list fields. */
export function parseJsonFields<T extends Record<string, string | string[]>>(raw: string, shape: T): ServiceResult<T> {
  let data: Record<string, unknown>;
  try {
    data = extractJson(raw) as Record<string, unknown>;
  } catch {
    return { success: false, error: createError('AI_ERROR', 'The AI reply could not be read. Please try again.') };
  }
  const out = { ...shape } as Record<string, string | string[]>;
  for (const [key, fallback] of Object.entries(shape)) {
    out[key] = Array.isArray(fallback) ? stringList(data[key], 15) : text(data[key], 20_000) || (fallback as string);
  }
  return { success: true, data: out as T };
}
