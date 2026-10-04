import { ipcMain } from 'electron';
import { validateDatabaseFile } from '../../../src/services/database/database.validator';
import { databaseService } from '../../../src/services/database/database.service';
import { DatabaseValidationResult, ServiceResult } from '../../../src/types';

export function registerDatabaseHandlers() {
  ipcMain.handle('database:validate', async (_, filePath: string): Promise<ServiceResult<DatabaseValidationResult>> => {
    return await validateDatabaseFile(filePath);
  });

  ipcMain.handle('database:connect', async (_, filePath: string): Promise<ServiceResult<DatabaseValidationResult>> => {
    return await databaseService.connect(filePath);
  });
}
