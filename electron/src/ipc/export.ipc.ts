import { ipcMain, dialog, BrowserWindow } from 'electron';
import * as fs from 'node:fs/promises';
import { IPC_CHANNELS } from '../../../src/config/ipc-channels';
import { ServiceResult } from '../../../src/types';
import { createError } from '../../../src/utils/errors';

export function registerExportHandlers() {
  ipcMain.handle(IPC_CHANNELS.EXPORT_DATA, async (_, data: string, defaultPath: string, format: 'csv' | 'json'): Promise<ServiceResult<string>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) throw new Error('No active window');

      const filters = format === 'csv' 
        ? [{ name: 'CSV File', extensions: ['csv'] }] 
        : [{ name: 'JSON File', extensions: ['json'] }];

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: `Save ${format.toUpperCase()} Export`,
        defaultPath,
        filters
      });

      if (canceled || !filePath) {
        return { success: false, error: createError('UNKNOWN_ERROR', 'Export cancelled') };
      }

      await fs.writeFile(filePath, data, 'utf-8');
      return { success: true, data: filePath };
    } catch (err: any) {
      return { success: false, error: createError('EXPORT_ERROR', err.message || 'Export failed') };
    }
  });

  ipcMain.handle(IPC_CHANNELS.EXPORT_IMAGE, async (_, base64Data: string, defaultPath: string): Promise<ServiceResult<string>> => {
    try {
      const win = BrowserWindow.getFocusedWindow();
      if (!win) throw new Error('No active window');

      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Save Chart Image',
        defaultPath,
        filters: [{ name: 'PNG Image', extensions: ['png'] }]
      });

      if (canceled || !filePath) {
        return { success: false, error: createError('UNKNOWN_ERROR', 'Export cancelled') };
      }

      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64Image = base64Data.replace(/^data:image\/png;base64,/, '');
      await fs.writeFile(filePath, base64Image, 'base64');
      
      return { success: true, data: filePath };
    } catch (err: any) {
      return { success: false, error: createError('EXPORT_ERROR', err.message || 'Export failed') };
    }
  });
}
