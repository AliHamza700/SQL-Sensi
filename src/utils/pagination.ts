/**
 * Result Pagination — SQL Sensi
 *
 * Pure client-side pagination used by the Results page.
 */

export interface PageSlice<T> {
  /** Rows on the requested page */
  rows: T[];
  totalPages: number;
  /** 1-based index of the first row on the page */
  firstRow: number;
  /** 1-based index of the last row on the page */
  lastRow: number;
}

/** Returns the rows for `page` (1-based) plus the page counters shown in the UI. */
export function paginate<T>(rows: T[], page: number, pageSize: number): PageSlice<T> {
  const start = (page - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    totalPages: Math.ceil(rows.length / pageSize),
    firstRow: start + 1,
    lastRow: Math.min(page * pageSize, rows.length),
  };
}
