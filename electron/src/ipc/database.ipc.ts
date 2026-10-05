import { ipcMain } from 'electron';
import { validateDatabaseFile } from '../../../src/services/database/database.validator';
import { databaseService } from '../../../src/services/database/database.service';
import { DatabaseValidationResult, ServiceResult, QueryResult } from '../../../src/types';
import { sqlSecurityService } from '../../../src/services/security/sql-security.service';

export function registerDatabaseHandlers() {
  ipcMain.handle('database:validate', async (_, filePath: string): Promise<ServiceResult<DatabaseValidationResult>> => {
    return await validateDatabaseFile(filePath);
  });

  ipcMain.handle('database:connect', async (_, filePath: string): Promise<ServiceResult<DatabaseValidationResult>> => {
    return await databaseService.connect(filePath);
  });

  ipcMain.handle('database:executeQuery', async (_, sql: string): Promise<ServiceResult<QueryResult>> => {
    // 1. Validate SQL security
    const securityCheck = sqlSecurityService.validateQuery(sql);
    if (!securityCheck.success) {
      return { success: false, error: securityCheck.error };
    }
    
    // 2. Execute query if safe
    return await databaseService.executeQuery(securityCheck.data!);
  });
}
