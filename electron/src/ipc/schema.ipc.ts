import { ipcMain } from 'electron';
import { schemaService } from '../../../src/services/schema/schema.service';
import { DatabaseSchema, ServiceResult } from '../../../src/types';

export function registerSchemaHandlers() {
  ipcMain.handle('schema:extract', async (): Promise<ServiceResult<DatabaseSchema>> => {
    return await schemaService.extractSchema();
  });
}
