import { ipcMain } from 'electron';
import { aiService } from '../../../src/services/ai/ai.service';
import { ChatMessage, AIResponse, ServiceResult } from '../../../src/types';

export function registerAIHandlers() {
  ipcMain.handle('ai:generateSQL', async (_, messages: ChatMessage[]): Promise<ServiceResult<AIResponse>> => {
    return await aiService.generateSQL(messages);
  });
  
  ipcMain.handle('ai:setApiKey', async (_, apiKey: string): Promise<void> => {
    aiService.setGroqApiKey(apiKey);
  });
}
