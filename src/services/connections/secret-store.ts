/**
 * Secret Store — SQL Sensi V2
 *
 * Stores connection passwords encrypted with an OS-backed key. In the app the
 * Encryptor is Electron `safeStorage` (DPAPI on Windows, Keychain on macOS,
 * libsecret/kwallet on Linux). Only ciphertext is written to disk.
 *
 * When OS encryption is unavailable nothing is saved: the user is asked for the
 * password each time instead (no plaintext fallback).
 */

import * as fs from 'node:fs';
import { writeJsonAtomic } from './connection-store';

/** The subset of Electron's `safeStorage` this store needs */
export interface Encryptor {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

interface SecretsFile {
  version: 1;
  /** profile id → base64 ciphertext */
  secrets: Record<string, string>;
}

export class SecretStore {
  constructor(
    private readonly filePath: string,
    private readonly encryptor: Encryptor
  ) {}

  /** Whether passwords can be saved on this machine */
  public isAvailable(): boolean {
    return this.encryptor.isEncryptionAvailable();
  }

  public has(id: string): boolean {
    return id in this.read().secrets;
  }

  /** Returns false (and writes nothing) when OS encryption is unavailable. */
  public set(id: string, secret: string): boolean {
    if (!this.isAvailable()) return false;
    const file = this.read();
    file.secrets[id] = this.encryptor.encryptString(secret).toString('base64');
    writeJsonAtomic(this.filePath, file);
    return true;
  }

  /** Decrypted secret, or undefined if none is stored or it can no longer be decrypted. */
  public get(id: string): string | undefined {
    const stored = this.read().secrets[id];
    if (stored === undefined || !this.isAvailable()) return undefined;
    try {
      return this.encryptor.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      // e.g. the OS key changed (new user profile); the user must re-enter it
      console.warn('[SecretStore] A saved password could not be decrypted and was ignored.');
      return undefined;
    }
  }

  public delete(id: string): void {
    const file = this.read();
    if (!(id in file.secrets)) return;
    delete file.secrets[id];
    writeJsonAtomic(this.filePath, file);
  }

  private read(): SecretsFile {
    if (!fs.existsSync(this.filePath)) return { version: 1, secrets: {} };
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<SecretsFile>;
      return { version: 1, secrets: parsed.secrets && typeof parsed.secrets === 'object' ? parsed.secrets : {} };
    } catch {
      console.warn('[SecretStore] Secrets file was unreadable; saved passwords must be re-entered.');
      return { version: 1, secrets: {} };
    }
  }
}
