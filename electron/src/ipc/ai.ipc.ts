import { ipcMain } from 'electron';
import { aiService } from '../../../src/services/ai/ai.service';
import { ChatMessage, AIResponse, ServiceResult, SQLOptimizationResult } from '../../../src/types';

export function registerAIHandlers() {
  ipcMain.handle('ai:generateSQL', async (_, messages: ChatMessage[]): Promise<ServiceResult<AIResponse>> => {
    return await aiService.generateSQL(messages);
  });
  
  ipcMain.handle('ai:setApiKey', async (_, apiKey: string): Promise<void> => {
    aiService.setGroqApiKey(apiKey);
  });

  ipcMain.handle('ai:optimizeSQL', async (_, sql: string): Promise<ServiceResult<SQLOptimizationResult>> => {
    return await aiService.optimizeSQL(sql);
  });
}
