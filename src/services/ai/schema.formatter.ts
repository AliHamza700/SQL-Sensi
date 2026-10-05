import { DatabaseSchema, TableSchema } from '@/src/types';

/**
 * Compresses the full DatabaseSchema object into a concise DDL string
 * optimized for LLM context windows.
 */
export function formatSchemaToDDL(schema: DatabaseSchema): string {
  const lines: string[] = [];
  
  lines.push(`-- Database: ${schema.databaseName}`);
  lines.push('');

  for (const table of schema.tables) {
    lines.push(formatTableToDDL(table));
  }

  // Add Views
  for (const view of schema.views) {
    if (view.sql) {
      lines.push(`${view.sql};`);
      lines.push('');
    }
  }

  // Add Indexes
  for (const index of schema.indexes) {
    const uniqueStr = index.unique ? 'UNIQUE ' : '';
    lines.push(`CREATE ${uniqueStr}INDEX ${index.name} ON ${index.tableName}(${index.columns.join(', ')});`);
  }

  return lines.join('\n').trim();
}

function formatTableToDDL(table: TableSchema): string {
  const lines: string[] = [];
  lines.push(`CREATE TABLE ${table.name} (`);
  
  const colDefs: string[] = [];
  
  // Columns
  for (const col of table.columns) {
    let def = `  ${col.name} ${col.type}`;
    if (col.isPrimaryKey) def += ' PRIMARY KEY';
    if (!col.nullable && !col.isPrimaryKey) def += ' NOT NULL';
    if (col.defaultValue !== null) def += ` DEFAULT ${col.defaultValue}`;
    colDefs.push(def);
  }

  // Foreign Keys
  for (const fk of table.foreignKeys) {
    colDefs.push(`  FOREIGN KEY (${fk.columnName}) REFERENCES ${fk.referencedTable}(${fk.referencedColumn})`);
  }

  lines.push(colDefs.join(',\n'));
  lines.push(`);`);
  lines.push(`-- Row count approx: ${table.rowCount}`);
  lines.push('');
  
  return lines.join('\n');
}
