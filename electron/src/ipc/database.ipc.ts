import { ipcMain } from 'electron';
import { validateDatabaseFile } from '../../../src/services/database/database.validator';
import { databaseService } from '../../../src/services/database/database.service';
import { validateFilePath } from '../../../src/services/connections/profile-validation';
import { DatabaseValidationResult, ServiceResult, QueryResult, QueryPlan, WriteExecution } from '../../../src/types';
import { createError } from '../../../src/utils/errors';
import { sqlSecurityService } from '../../../src/services/security/sql-security.service';
import { getConnectionManager } from '../connections';
import { getWriteService } from '../../../src/services/writes/write.service';
import { getAuthService } from './auth.ipc';

/** Rejects non-text SQL before any other check */
function checkSql(sql: unknown): ServiceResult<string> {
  if (typeof sql !== 'string' || sql.length > 100_000) {
    return { success: false, error: createError('SQL_VALIDATION_ERROR', 'Invalid SQL text.') };
  }
  return { success: true, data: sql };
}

export function registerDatabaseHandlers() {
  ipcMain.handle('database:validate', async (_, filePath: unknown): Promise<ServiceResult<DatabaseValidationResult>> => {
    const checked = validateFilePath(filePath);
    if (!checked.success) return checked;
    return await validateDatabaseFile(checked.data);
  });

  // Version 1 entry point: opens a SQLite file through the connection manager
  ipcMain.handle('database:connect', async (_, filePath: unknown): Promise<ServiceResult<DatabaseValidationResult>> => {
    const checked = validateFilePath(filePath);
    if (!checked.success) return checked;
    const result = await getConnectionManager().connectFile(checked.data);
    return result.success ? { success: true, data: result.data.validation } : result;
  });

  ipcMain.handle(
    'database:executeQuery',
    async (_, sql: unknown, connectionId: unknown): Promise<ServiceResult<QueryResult>> => {
      const text = checkSql(sql);
      if (!text.success) return text;

      // 1. The SQL must be for the database that is active right now
      const active = getConnectionManager().assertActive(connectionId);
      if (!active.success) return active;

      // 2. Validate SQL security
      const securityCheck = sqlSecurityService.validateQuery(text.data);
      if (!securityCheck.success) {
        return { success: false, error: securityCheck.error };
      }

      // 3. Execute query if safe
      return await databaseService.executeQuery(securityCheck.data);
    }
  );

  ipcMain.handle(
    'database:explainQuery',
    async (_, sql: unknown, connectionId: unknown): Promise<ServiceResult<QueryPlan>> => {
      const text = checkSql(sql);
      if (!text.success) return text;

      const active = getConnectionManager().assertActive(connectionId);
      if (!active.success) return active;

      const securityCheck = sqlSecurityService.validateQuery(text.data);
      if (!securityCheck.success) {
        return { success: false, error: securityCheck.error };
      }

      return await databaseService.explainQuery(securityCheck.data);
    }
  );

  // Controlled write (V2 Phase 7): INSERT/UPDATE/DELETE, policy- and role-gated.
  ipcMain.handle(
    'database:executeWrite',
    async (
      _,
      sql: unknown,
      connectionId: unknown,
      token: unknown,
      params: unknown,
      confirmed: unknown
    ): Promise<ServiceResult<WriteExecution>> => {
      const text = checkSql(sql);
      if (!text.success) return text;

      // 1. The write must be for the database that is active right now.
      const active = getConnectionManager().assertActive(connectionId);
      if (!active.success) return active;

      // 2. Resolve the caller's identity from its session token (not the renderer's claim).
      if (typeof token !== 'string' || token.length === 0) {
        return { success: false, error: createError('NOT_AUTHORIZED', 'A valid session is required to write.') };
      }
      const session = await getAuthService().validateSession(token);
      if (!session.success) {
        return { success: false, error: createError('NOT_AUTHORIZED', 'Your session is invalid or has expired.') };
      }

      const boundParams = Array.isArray(params) ? params : [];

      // 3. Orchestrate: policy → re-check active connection → execute → audit.
      return getWriteService().execute(
        {
          user: session.data,
          connectionId: active.data.connectionId,
          engine: active.data.engine,
          assertActive: () => getConnectionManager().assertActive(connectionId),
        },
        text.data,
        boundParams,
        confirmed === true
      );
    }
  );
}
