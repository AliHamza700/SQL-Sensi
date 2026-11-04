import { ipcMain } from 'electron';
import { historyService } from '../../../src/services/history/history.service';
import { IPC_CHANNELS } from '../../../src/config/ipc-channels';
import { Conversation, ConversationMessage, ServiceResult, User } from '../../../src/types';
import { createError } from '../../../src/utils/errors';
import { getConnectionManager } from '../connections';
import { getAuthService } from './auth.ipc';

/**
 * Conversation history is PER USER. Every handler resolves the caller's identity
 * from its session TOKEN (re-validated in main — the renderer cannot assert who
 * it is) and the service scopes all reads/writes to that user id, so one account
 * can never see or change another account's conversations.
 */
async function resolveUser(token: unknown): Promise<ServiceResult<User>> {
  if (typeof token !== 'string' || token.length === 0) {
    return { success: false, error: createError('NOT_AUTHORIZED', 'A valid session is required.') };
  }
  const result = await getAuthService().validateSession(token);
  if (!result.success) {
    return { success: false, error: createError('NOT_AUTHORIZED', 'Your session is invalid or has expired.') };
  }
  return result;
}

export function registerHistoryHandlers() {
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, async (_, token: unknown): Promise<ServiceResult<Conversation[]>> => {
    const user = await resolveUser(token);
    if (!user.success) return user;
    return await historyService.listConversations(user.data.id);
  });

  // A conversation is always about the connection that is active when it starts.
  // Its label/engine come from main's record of that connection, not from the renderer.
  ipcMain.handle(IPC_CHANNELS.HISTORY_CREATE, async (_, token: unknown, title: unknown, connectionId: unknown): Promise<ServiceResult<Conversation>> => {
    const user = await resolveUser(token);
    if (!user.success) return user;
    if (typeof title !== 'string' || !title.trim() || title.length > 200) {
      return { success: false, error: createError('DATABASE_ERROR', 'Invalid conversation title.') };
    }
    const active = getConnectionManager().assertActive(connectionId);
    if (!active.success) return active;
    return await historyService.createConversation(title.trim(), user.data.id, active.data);
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_GET, async (_, token: unknown, id: string): Promise<ServiceResult<{ conversation: Conversation, messages: ConversationMessage[] }>> => {
    const user = await resolveUser(token);
    if (!user.success) return user;
    return await historyService.getConversation(id, user.data.id);
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_ADD_MSG, async (_, token: unknown, conversationId: string, msg: Partial<ConversationMessage>): Promise<ServiceResult<ConversationMessage>> => {
    const user = await resolveUser(token);
    if (!user.success) return user;
    return await historyService.addMessage(conversationId, user.data.id, msg);
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE, async (_, token: unknown, id: string): Promise<ServiceResult<void>> => {
    const user = await resolveUser(token);
    if (!user.success) return user;
    return await historyService.deleteConversation(id, user.data.id);
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_UPDATE, async (_, token: unknown, id: string, title: string): Promise<ServiceResult<void>> => {
    const user = await resolveUser(token);
    if (!user.success) return user;
    return await historyService.updateConversationTitle(id, title, user.data.id);
  });
}
