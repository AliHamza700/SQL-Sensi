import { QueryResult } from '../types';

export function convertToCSV(result: QueryResult): string {
  if (!result || !result.columns || !result.rows) return '';
  
  const header = result.columns.join(',');
  const rows = result.rows.map(row => 
    result.columns.map(col => {
      const val = row[col];
      if (val === null || val === undefined) return '';
      // Escape strings containing quotes, commas, or newlines
      const strVal = String(val);
      if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return strVal;
    }).join(',')
  ).join('\n');
  
  return `${header}\n${rows}`;
}
