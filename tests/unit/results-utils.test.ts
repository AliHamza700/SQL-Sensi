/**
 * Results Utilities Regression Tests — SQL Sensi V2 Phase 1
 *
 * Covers the pure helpers behind the Results page:
 *   1. Pagination
 *   2. CSV / JSON export
 *   3. Chart type inference and selection
 *   4. Duration parsing (session lifetime config)
 */

import { paginate } from '../../src/utils/pagination';
import { convertToCSV } from '../../src/utils/export';
import { parseDurationToSeconds } from '../../src/utils';
import { inferColumnTypes, autoSelectChartType, ColumnMetadata } from '../../src/utils/visualization';
import type { QueryResult } from '../../src/types';

describe('paginate', () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ id: i + 1 }));

  it('returns the first page with UI counters', () => {
    const page = paginate(rows, 1, 50);
    expect(page.rows).toHaveLength(50);
    expect(page.rows[0]).toEqual({ id: 1 });
    expect(page.totalPages).toBe(3);
    expect(page.firstRow).toBe(1);
    expect(page.lastRow).toBe(50);
  });

  it('returns a partial last page', () => {
    const page = paginate(rows, 3, 50);
    expect(page.rows).toHaveLength(20);
    expect(page.firstRow).toBe(101);
    expect(page.lastRow).toBe(120);
  });

  it('handles an empty result', () => {
    const page = paginate([], 1, 50);
    expect(page.rows).toEqual([]);
    expect(page.totalPages).toBe(0);
    expect(page.lastRow).toBe(0);
  });

  it('treats an exact multiple as full pages', () => {
    expect(paginate(rows.slice(0, 100), 2, 50).totalPages).toBe(2);
  });
});

describe('convertToCSV', () => {
  const result = (rows: Record<string, unknown>[], columns = ['name', 'note']): QueryResult => ({
    columns,
    rows,
    rowCount: rows.length,
    executionTimeMs: 0,
  });

  it('writes a header row followed by values in column order', () => {
    const csv = convertToCSV(result([{ note: 'b', name: 'a' }]));
    expect(csv).toBe('name,note\na,b');
  });

  it('writes NULL and undefined as empty cells', () => {
    expect(convertToCSV(result([{ name: null, note: undefined }]))).toBe('name,note\n,');
  });

  it('quotes values containing commas, quotes or newlines', () => {
    const csv = convertToCSV(result([{ name: 'a,b', note: 'say "hi"\nthere' }]));
    expect(csv).toBe('name,note\n"a,b","say ""hi""\nthere"');
  });

  it('writes numbers as plain text', () => {
    expect(convertToCSV(result([{ total: 75.5 }], ['total']))).toBe('total\n75.5');
  });

  it('returns only the header for an empty result', () => {
    expect(convertToCSV(result([]))).toBe('name,note\n');
  });
});

describe('JSON export', () => {
  it('round-trips a query result through JSON.stringify as the Results page does', () => {
    const data: QueryResult = {
      columns: ['id', 'city'],
      rows: [{ id: 1, city: null }],
      rowCount: 1,
      executionTimeMs: 2,
    };
    expect(JSON.parse(JSON.stringify(data, null, 2))).toEqual(data);
  });
});

describe('inferColumnTypes', () => {
  it('detects numeric and categorical columns', () => {
    const meta = inferColumnTypes(['name', 'total'], [
      { name: 'Ada', total: 10 },
      { name: 'Bo', total: 20 },
    ]);
    expect(meta).toEqual([
      { name: 'name', type: 'categorical' },
      { name: 'total', type: 'numeric' },
    ]);
  });

  it('ignores NULL values when inferring', () => {
    const meta = inferColumnTypes(['total'], [{ total: null }, { total: 5 }]);
    expect(meta[0].type).toBe('numeric');
  });

  it('detects ISO date and datetime strings as temporal', () => {
    const meta = inferColumnTypes(['day', 'at'], [
      { day: '2026-01-05', at: '2026-01-05T10:30:00Z' },
      { day: '2026-02-10', at: '2026-02-10 08:00:00' },
    ]);
    expect(meta.map((c) => c.type)).toEqual(['temporal', 'temporal']);
  });

  it('does not treat non-date strings or invalid dates as temporal', () => {
    const meta = inferColumnTypes(['code', 'bad'], [
      { code: 'A-2026', bad: '2026-13-45' },
      { code: 'B-2027', bad: '2026-99-99' },
    ]);
    expect(meta.map((c) => c.type)).toEqual(['categorical', 'categorical']);
  });

  it('auto-selects a line chart for a date + value result', () => {
    const rows = [
      { day: '2026-01-01', revenue: 10 },
      { day: '2026-01-02', revenue: 12 },
    ];
    const meta = inferColumnTypes(['day', 'revenue'], rows);
    expect(autoSelectChartType(meta, rows.length)).toBe('line');
  });
});

describe('autoSelectChartType', () => {
  const m = (...types: ColumnMetadata['type'][]): ColumnMetadata[] =>
    types.map((type, i) => ({ name: `c${i}`, type }));

  it('uses a table for empty or single-column results', () => {
    expect(autoSelectChartType(m('numeric', 'numeric'), 0)).toBe('table');
    expect(autoSelectChartType(m('numeric'), 10)).toBe('table');
  });

  it('uses a line chart for time series', () => {
    expect(autoSelectChartType(m('temporal', 'numeric'), 12)).toBe('line');
  });

  it('uses a pie chart for up to 7 categories and a bar chart beyond', () => {
    expect(autoSelectChartType(m('categorical', 'numeric'), 7)).toBe('pie');
    expect(autoSelectChartType(m('categorical', 'numeric'), 8)).toBe('bar');
  });

  it('uses a scatter plot for two numeric columns', () => {
    expect(autoSelectChartType(m('numeric', 'numeric'), 30)).toBe('scatter');
  });

  it('falls back to a table for unsupported shapes', () => {
    expect(autoSelectChartType(m('categorical', 'categorical'), 5)).toBe('table');
  });
});

describe('parseDurationToSeconds', () => {
  it.each([
    ['7d', 604800],
    ['12h', 43200],
    ['30m', 1800],
    ['45s', 45],
    ['900', 900],
    [' 2H ', 7200],
  ])('parses %p as %p seconds', (input, expected) => {
    expect(parseDurationToSeconds(input)).toBe(expected);
  });

  it.each(['', 'forever', '0', '-5m', '1.5h', '7w'])('returns null for %p', (input) => {
    expect(parseDurationToSeconds(input)).toBeNull();
  });
});
