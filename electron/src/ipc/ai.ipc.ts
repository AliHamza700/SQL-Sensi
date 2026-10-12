import { ipcMain } from 'electron';
import { aiService } from '../../../src/services/ai/ai.service';
import { ChatMessage, AIResponse, ServiceResult, SQLOptimizationResult, QueryPlan, QueryPlanExplanation } from '../../../src/types';

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

  ipcMain.handle('ai:explainQueryPlan', async (_, sql: string, plan: QueryPlan): Promise<ServiceResult<QueryPlanExplanation>> => {
    return await aiService.explainQueryPlan(sql, plan);
  });
}
