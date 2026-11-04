import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../../src/config/ipc-channels';
import {
  validateFilePath,
  validateId,
  validatePassword,
  validateProfileInput,
} from '../../../src/services/connections/profile-validation';
import type { ConnectOutcome } from '../../../src/services/connections/connection-manager';
import type {
  ConnectionProfile,
  ConnectionRef,
  ConnectionTestResult,
  ServiceResult,
} from '../../../src/types';
import { getConnectionManager } from '../connections';

/** Connection management. Every payload is validated here before reaching the manager. */
export function registerConnectionHandlers() {
  ipcMain.handle(IPC_CHANNELS.CONNECTIONS_LIST, async (): Promise<ServiceResult<ConnectionProfile[]>> => {
    return { success: true, data: getConnectionManager().listProfiles() };
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTIONS_SECRET_STORAGE, async (): Promise<boolean> => {
    return getConnectionManager().isSecretStorageAvailable();
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTIONS_GET_ACTIVE, async (): Promise<ConnectionRef | null> => {
    return getConnectionManager().getActive();
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTIONS_SAVE, async (_, input: unknown): Promise<ServiceResult<ConnectionProfile>> => {
    const checked = validateProfileInput(input);
    if (!checked.success) return checked;
    return getConnectionManager().saveProfile(checked.data);
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTIONS_DELETE, async (_, id: unknown): Promise<ServiceResult<void>> => {
    const checked = validateId(id);
    if (!checked.success) return checked;
    return getConnectionManager().deleteProfile(checked.data);
  });

  ipcMain.handle(
    IPC_CHANNELS.CONNECTIONS_TEST,
    async (_, target: unknown): Promise<ServiceResult<ConnectionTestResult>> => {
      const raw = (target ?? {}) as { input?: unknown; profileId?: unknown; password?: unknown };
      if (raw.input !== undefined) {
        const checked = validateProfileInput(raw.input);
        if (!checked.success) return checked;
        return getConnectionManager().testConnection({ input: checked.data });
      }
      const id = validateId(raw.profileId);
      if (!id.success) return id;
      const password = validatePassword(raw.password);
      if (!password.success) return password;
      return getConnectionManager().testConnection({ profileId: id.data, password: password.data });
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CONNECTIONS_CONNECT,
    async (_, profileId: unknown, password: unknown): Promise<ServiceResult<ConnectOutcome>> => {
      const id = validateId(profileId);
      if (!id.success) return id;
      const pw = validatePassword(password);
      if (!pw.success) return pw;
      return getConnectionManager().connect(id.data, pw.data);
    }
  );

  ipcMain.handle(IPC_CHANNELS.CONNECTIONS_CONNECT_FILE, async (_, filePath: unknown): Promise<ServiceResult<ConnectOutcome>> => {
    const checked = validateFilePath(filePath);
    if (!checked.success) return checked;
    return getConnectionManager().connectFile(checked.data);
  });

  ipcMain.handle(IPC_CHANNELS.CONNECTIONS_DISCONNECT, async (): Promise<void> => {
    await getConnectionManager().disconnect();
  });
}
