import { ipcMain } from 'electron';
import { schemaService } from '../../../src/services/schema/schema.service';
import { DatabaseSchema, ServiceResult } from '../../../src/types';
import { getConnectionManager } from '../connections';

export function registerSchemaHandlers() {
  ipcMain.handle('schema:extract', async (_, connectionId: unknown): Promise<ServiceResult<DatabaseSchema>> => {
    // The schema must belong to the connection the page is showing
    const active = getConnectionManager().assertActive(connectionId);
    if (!active.success) return active;
    return await schemaService.extractSchema();
  });
}
