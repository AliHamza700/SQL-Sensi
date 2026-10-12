import { ipcMain } from 'electron';
import { historyService } from '../../../src/services/history/history.service';
import { IPC_CHANNELS } from '../../../src/config/ipc-channels';
import { Conversation, ConversationMessage, ServiceResult } from '../../../src/types';

export function registerHistoryHandlers() {
  ipcMain.handle(IPC_CHANNELS.HISTORY_LIST, async (): Promise<ServiceResult<Conversation[]>> => {
    return await historyService.listConversations();
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_CREATE, async (_, title: string): Promise<ServiceResult<Conversation>> => {
    return await historyService.createConversation(title);
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_GET, async (_, id: string): Promise<ServiceResult<{ conversation: Conversation, messages: ConversationMessage[] }>> => {
    return await historyService.getConversation(id);
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_ADD_MSG, async (_, conversationId: string, msg: Partial<ConversationMessage>): Promise<ServiceResult<ConversationMessage>> => {
    return await historyService.addMessage(conversationId, msg);
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_DELETE, async (_, id: string): Promise<ServiceResult<void>> => {
    return await historyService.deleteConversation(id);
  });

  ipcMain.handle(IPC_CHANNELS.HISTORY_UPDATE, async (_, id: string, title: string): Promise<ServiceResult<void>> => {
    return await historyService.updateConversationTitle(id, title);
  });
}
