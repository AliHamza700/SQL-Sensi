import { ipcMain } from 'electron';
import { aiService } from '../../../src/services/ai/ai.service';
import { createError } from '../../../src/utils/errors';
import { ChatMessage, AIResponse, ServiceResult, SQLOptimizationResult, QueryPlan, QueryPlanExplanation } from '../../../src/types';
import { getConnectionManager } from '../connections';

/** Validates chat messages from the renderer (roles and bounded text only) */
function checkMessages(value: unknown): ServiceResult<ChatMessage[]> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200) {
    return { success: false, error: createError('AI_ERROR', 'Invalid conversation.') };
  }
  const messages: ChatMessage[] = [];
  for (const m of value) {
    const role = (m as ChatMessage)?.role;
    const content = (m as ChatMessage)?.content;
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') {
      return { success: false, error: createError('AI_ERROR', 'Invalid conversation message.') };
    }
    messages.push({ role, content: content.slice(0, 20_000) });
  }
  return { success: true, data: messages };
}

function checkSqlText(sql: unknown): ServiceResult<string> {
  return typeof sql === 'string' && sql.length > 0 && sql.length <= 100_000
    ? { success: true, data: sql }
    : { success: false, error: createError('SQL_VALIDATION_ERROR', 'Invalid SQL text.') };
}

/**
 * AI handlers. Every call names the connection it was prepared for; the AI only
 * sees that connection's schema, and only if it is still the active one.
 * (The old ai:setApiKey channel was removed: API keys never come from the renderer.)
 */
export function registerAIHandlers() {
  ipcMain.handle(
    'ai:generateSQL',
    async (_, messages: unknown, connectionId: unknown): Promise<ServiceResult<AIResponse>> => {
      const checked = checkMessages(messages);
      if (!checked.success) return checked;
      const active = getConnectionManager().assertActive(connectionId);
      if (!active.success) return active;
      return await aiService.generateSQL(checked.data, active.data);
    }
  );

  ipcMain.handle(
    'ai:optimizeSQL',
    async (_, sql: unknown, connectionId: unknown): Promise<ServiceResult<SQLOptimizationResult>> => {
      const text = checkSqlText(sql);
      if (!text.success) return text;
      const active = getConnectionManager().assertActive(connectionId);
      if (!active.success) return active;
      return await aiService.optimizeSQL(text.data, active.data);
    }
  );

  ipcMain.handle(
    'ai:explainQueryPlan',
    async (_, sql: unknown, plan: unknown, connectionId: unknown): Promise<ServiceResult<QueryPlanExplanation>> => {
      const text = checkSqlText(sql);
      if (!text.success) return text;
      const raw = (plan as QueryPlan | null)?.rawOutput;
      if (typeof raw !== 'string') {
        return { success: false, error: createError('AI_ERROR', 'Invalid query plan.') };
      }
      const active = getConnectionManager().assertActive(connectionId);
      if (!active.success) return active;
      return await aiService.explainQueryPlan(text.data, { nodes: [], rawOutput: raw }, active.data);
    }
  );
}
