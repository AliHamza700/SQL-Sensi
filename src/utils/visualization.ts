export type ColumnType = 'numeric' | 'categorical' | 'temporal';

export interface ColumnMetadata {
  name: string;
  type: ColumnType;
}

export type ChartType = 'table' | 'bar' | 'line' | 'pie' | 'scatter';

/**
 * Inspects a small sample of the rows to infer the data type of each column.
 */
export function inferColumnTypes(columns: string[], rows: Record<string, unknown>[]): ColumnMetadata[] {
  const sampleSize = Math.min(rows.length, 5);
  const sampleRows = rows.slice(0, sampleSize);

  return columns.map(col => {
    let numericCount = 0;
    let temporalCount = 0;
    let categoricalCount = 0;

    for (const row of sampleRows) {
      const val = row[col];
      if (val === null || val === undefined) continue;

      if (typeof val === 'number') {
        numericCount++;
      } else if (typeof val === 'string') {
        // Basic check for temporal strings (e.g. YYYY-MM-DD or ISO strings)
        // matches '2023-01-01', '2023-01-01T12:00:00Z', etc.
        const dateRegex = /^\\d{4}-\\d{2}-\\d{2}/;
        if (dateRegex.test(val) && !isNaN(Date.parse(val))) {
          temporalCount++;
        } else {
          categoricalCount++;
        }
      } else {
        categoricalCount++;
      }
    }

    // Determine the most likely type
    let type: ColumnType = 'categorical';
    if (numericCount > categoricalCount && numericCount > temporalCount) {
      type = 'numeric';
    } else if (temporalCount > categoricalCount && temporalCount > numericCount) {
      type = 'temporal';
    }

    return { name: col, type };
  });
}

/**
 * Heuristic to select the most appropriate chart type based on column types.
 */
export function autoSelectChartType(metadata: ColumnMetadata[], rowCount: number): ChartType {
  if (rowCount === 0 || metadata.length < 2) return 'table';

  const numericCols = metadata.filter(m => m.type === 'numeric');
  const categoricalCols = metadata.filter(m => m.type === 'categorical');
  const temporalCols = metadata.filter(m => m.type === 'temporal');

  // Time-series -> Line chart
  if (temporalCols.length === 1 && numericCols.length >= 1) {
    return 'line';
  }

  // Categories + Values -> Bar or Pie
  if (categoricalCols.length === 1 && numericCols.length >= 1) {
    // If we have few rows, pie is okay, but bar is generally safer
    return rowCount <= 7 ? 'pie' : 'bar';
  }

  // Value vs Value -> Scatter
  if (numericCols.length >= 2) {
    return 'scatter';
  }

  return 'table';
}
