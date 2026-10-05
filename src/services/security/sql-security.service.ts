import { ServiceResult } from '../../types';
import { createError } from '../../utils/errors';

export class SqlSecurityService {
  private static instance: SqlSecurityService;

  private constructor() {}

  public static getInstance(): SqlSecurityService {
    if (!SqlSecurityService.instance) {
      SqlSecurityService.instance = new SqlSecurityService();
    }
    return SqlSecurityService.instance;
  }

  /**
   * Validates if the provided SQL query is strictly a read-only operation.
   * Blocks all DDL (Data Definition Language) and DML (Data Manipulation Language) mutations.
   */
  public validateQuery(sql: string): ServiceResult<string> {
    const normalized = sql.trim().toUpperCase();

    // Must not be empty
    if (!normalized) {
      return {
        success: false,
        error: createError('SQL_VALIDATION_ERROR', 'Empty SQL query provided.'),
      };
    }

    // Must start with a safe keyword (SELECT, EXPLAIN, WITH)
    const startsWithSafeKeyword = /^(SELECT|WITH|EXPLAIN)\s/i.test(sql.trim());
    if (!startsWithSafeKeyword) {
      return {
        success: false,
        error: createError(
          'SQL_VALIDATION_ERROR',
          'Only SELECT, WITH, or EXPLAIN queries are permitted.'
        ),
      };
    }

    // Comprehensive blocklist of destructive or unauthorized commands
    const blockedKeywords = [
      'INSERT',
      'UPDATE',
      'DELETE',
      'DROP',
      'ALTER',
      'CREATE',
      'REPLACE',
      'TRUNCATE',
      'GRANT',
      'REVOKE',
      'ATTACH',
      'DETACH',
      'PRAGMA',
      'BEGIN',
      'COMMIT',
      'ROLLBACK',
      'EXEC',
    ];

    // Build a regex to match blocked words as isolated words
    // We use a regex that ignores case and ensures word boundaries.
    for (const keyword of blockedKeywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      if (regex.test(sql)) {
        return {
          success: false,
          error: createError(
            'SQL_VALIDATION_ERROR',
            `Destructive SQL command blocked: The query contains restricted keyword '${keyword}'.`
          ),
        };
      }
    }

    return {
      success: true,
      data: sql,
    };
  }
}

export const sqlSecurityService = SqlSecurityService.getInstance();
