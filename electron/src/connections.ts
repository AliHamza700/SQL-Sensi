/**
 * Connection Manager instance for the Electron main process — SQL Sensi
 *
 * Created lazily (on first IPC use, after app ready) so Electron's safeStorage
 * reports its real availability.
 */

import { BrowserWindow, safeStorage } from 'electron';
import * as path from 'path';
import { AppConfig } from '../../src/config';
import { ConnectionManager } from '../../src/services/connections/connection-manager';
import { ConnectionStore } from '../../src/services/connections/connection-store';
import { Encryptor, SecretStore } from '../../src/services/connections/secret-store';
import { IPC_CHANNELS } from '../../src/config/ipc-channels';
import { aiService } from '../../src/services/ai/ai.service';

/** safeStorage, except that Linux's plaintext-equivalent "basic_text" backend counts as unavailable. */
const osEncryptor: Encryptor = {
  isEncryptionAvailable: () => {
    if (!safeStorage.isEncryptionAvailable()) return false;
    if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
    return true;
  },
  encryptString: (plainText) => safeStorage.encryptString(plainText),
  decryptString: (encrypted) => safeStorage.decryptString(encrypted),
};

let manager: ConnectionManager | null = null;

export function getConnectionManager(): ConnectionManager {
  if (!manager) {
    const dir = path.resolve(AppConfig.database.appDataDir);
    manager = new ConnectionManager(
      new ConnectionStore(path.join(dir, 'connections.json')),
      new SecretStore(path.join(dir, 'connection-secrets.json'), osEncryptor)
    );
    // Tell every window when the active connection changes, so stale views reset,
    // and drop cached schemas so the AI never answers from the previous database.
    manager.onActiveChange((active) => {
      aiService.invalidateSchemaCache();
      for (const win of BrowserWindow.getAllWindows()) {
        win.webContents.send(IPC_CHANNELS.CONNECTIONS_CHANGED, active);
      }
    });
  }
  return manager;
}

/** Disconnects without creating the manager if it was never used. */
export async function shutdownConnections(): Promise<void> {
  await manager?.disconnect();
}
