import { DatabaseSchema, TableSchema } from '@/src/types';

/** Longest text taken from the database into a prompt (view bodies, defaults) */
const MAX_DB_TEXT = 300;

/**
 * Makes database-provided text safe to place in a prompt: removes control
 * characters, collapses whitespace, closes no fences and truncates.
 * Schema names, defaults and view SQL come from the database and are untrusted.
 */
export function sanitizeForPrompt(text: string, max = MAX_DB_TEXT): string {
  const cleaned = text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/`{3,}/g, "'''")
    // Database text must not be able to close (or open) the schema fence
    .replace(/<{3,}|>{3,}/g, '··')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

/**
 * Compresses a DatabaseSchema into a concise DDL-like listing for the model.
 * Engine-neutral; dialect rules are given separately.
 */
export function formatSchemaToDDL(schema: DatabaseSchema): string {
  const lines: string[] = [];

  lines.push(`-- Database: ${sanitizeForPrompt(schema.databaseName, 120)}`);
  lines.push('');

  for (const table of schema.tables) {
    lines.push(formatTableToDDL(table));
  }

  for (const view of schema.views) {
    lines.push(`-- View ${sanitizeForPrompt(view.name, 120)}${view.sql ? `: ${sanitizeForPrompt(view.sql)}` : ''}`);
  }

  for (const index of schema.indexes) {
    const uniqueStr = index.unique ? 'UNIQUE ' : '';
    lines.push(`-- ${uniqueStr}INDEX ${sanitizeForPrompt(index.name, 120)} ON ${sanitizeForPrompt(index.tableName, 120)}(${index.columns.map(c => sanitizeForPrompt(c, 120)).join(', ')})`);
  }

  return lines.join('\n').trim();
}

function formatTableToDDL(table: TableSchema): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE ${sanitizeForPrompt(table.name, 120)} (`);

  const colDefs: string[] = [];

  for (const col of table.columns) {
    let def = `  ${sanitizeForPrompt(col.name, 120)} ${sanitizeForPrompt(col.type, 60)}`;
    if (col.isPrimaryKey) def += ' PRIMARY KEY';
    if (!col.nullable && !col.isPrimaryKey) def += ' NOT NULL';
    if (col.defaultValue !== null && col.defaultValue !== undefined) def += ` DEFAULT ${sanitizeForPrompt(col.defaultValue, 80)}`;
    colDefs.push(def);
  }

  for (const fk of table.foreignKeys) {
    colDefs.push(`  FOREIGN KEY (${sanitizeForPrompt(fk.columnName, 120)}) REFERENCES ${sanitizeForPrompt(fk.referencedTable, 120)}(${sanitizeForPrompt(fk.referencedColumn, 120)})`);
  }

  lines.push(colDefs.join(',\n'));
  lines.push(`);`);
  lines.push(`-- Approx. rows: ${table.rowCount ?? 'unknown'}`);
  lines.push('');

  return lines.join('\n');
}
