/**
 * AppError — Structured Error Utility
 *
 * Architecture rule (rules.md §21):
 * Never silently swallow errors.
 * Never expose secrets in error messages.
 * Return structured errors across service boundaries.
 */

import type { AppError, AppErrorCode, ServiceResult } from '@/src/types';

// ─── Error Factory ────────────────────────────────────────────

/** Create a typed AppError — use this instead of `new Error()` across services */
export function createError(
  code: AppErrorCode,
  message: string,
  details?: string
): AppError {
  return { code, message, details };
}

// ─── Common Errors ────────────────────────────────────────────

export const Errors = {
  auth: {
    invalidCredentials: () => createError('AUTH_ERROR', 'Invalid email or password.'),
    sessionExpired: () => createError('AUTH_ERROR', 'Your session has expired. Please log in again.'),
    unauthorized: () => createError('AUTH_ERROR', 'You are not authorized to access this resource.'),
  },
  database: {
    notOpen: () => createError('DATABASE_ERROR', 'No database is currently open.'),
    invalidFile: (detail?: string) => createError('INVALID_DATABASE', 'The uploaded file is not a valid SQLite database.', detail),
    connectionFailed: (detail?: string) => createError('DATABASE_ERROR', 'Failed to connect to the database.', detail),
    queryFailed: (detail?: string) => createError('SQL_EXECUTION_ERROR', 'Query execution failed.', detail),
  },
  schema: {
    extractionFailed: (detail?: string) => createError('SCHEMA_ERROR', 'Failed to extract database schema.', detail),
  },
  sql: {
    validationFailed: (detail?: string) => createError('SQL_VALIDATION_ERROR', 'SQL validation failed.', detail),
    destructiveOperation: (statementType: string) =>
      createError('SQL_VALIDATION_ERROR', `The operation "${statementType}" is not allowed. Only SELECT queries are permitted.`),
    executionFailed: (detail?: string) => createError('SQL_EXECUTION_ERROR', 'SQL execution failed.', detail),
  },
  ai: {
    unavailable: () => createError('AI_ERROR', 'The AI service is currently unavailable. You can still inspect the database and run validated local queries.'),
    generationFailed: (detail?: string) => createError('AI_ERROR', 'AI failed to generate a response.', detail),
  },
  export: {
    failed: (detail?: string) => createError('EXPORT_ERROR', 'Export failed.', detail),
  },
  network: {
    offline: () => createError('NETWORK_ERROR', 'No internet connection. AI features require internet access.'),
  },
} as const;

// ─── ServiceResult Helpers ────────────────────────────────────

/** Wrap a successful value in a ServiceResult */
export function ok<T>(data: T): ServiceResult<T> {
  return { success: true, data };
}

/** Wrap an AppError in a ServiceResult */
export function fail<T>(error: AppError): ServiceResult<T> {
  return { success: false, error };
}

/** Safely execute a function and return a ServiceResult — never throws */
export async function tryCatch<T>(
  fn: () => Promise<T>,
  errorCode: AppErrorCode = 'UNKNOWN_ERROR',
  errorMessage = 'An unexpected error occurred.'
): Promise<ServiceResult<T>> {
  try {
    const data = await fn();
    return ok(data);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return fail<T>(createError(errorCode, errorMessage, detail));
  }
}
