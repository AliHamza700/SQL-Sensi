/**
 * Connection Profile Store — SQL Sensi V2
 *
 * Saved connection METADATA only (label, engine, host, file path…), kept in
 * `connections.json` in the app data directory. Passwords never go here — they
 * live in the encrypted SecretStore, keyed by profile id.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ConnectionProfile } from '@/src/types';

/** Profile as stored on disk (whether a password exists is the SecretStore's business) */
export type StoredProfile = Omit<ConnectionProfile, 'hasSavedPassword'>;

interface StoreFile {
  version: 1;
  profiles: StoredProfile[];
}

/** Writes via a temp file + rename so a crash never leaves a half-written file. */
export function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

export class ConnectionStore {
  constructor(private readonly filePath: string) {}

  public list(): StoredProfile[] {
    return this.read().profiles;
  }

  public get(id: string): StoredProfile | undefined {
    return this.read().profiles.find(p => p.id === id);
  }

  /** Inserts or replaces the profile with the same id. */
  public upsert(profile: StoredProfile): void {
    const file = this.read();
    const index = file.profiles.findIndex(p => p.id === profile.id);
    if (index >= 0) file.profiles[index] = profile;
    else file.profiles.push(profile);
    writeJsonAtomic(this.filePath, file);
  }

  public remove(id: string): boolean {
    const file = this.read();
    const before = file.profiles.length;
    file.profiles = file.profiles.filter(p => p.id !== id);
    if (file.profiles.length === before) return false;
    writeJsonAtomic(this.filePath, file);
    return true;
  }

  private read(): StoreFile {
    if (!fs.existsSync(this.filePath)) {
      return { version: 1, profiles: [] };
    }
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // Keep the unreadable file for inspection instead of silently overwriting it.
      fs.renameSync(this.filePath, `${this.filePath}.corrupt-${Date.now()}`);
      console.warn('[ConnectionStore] connections.json was unreadable; it was set aside and a new one started.');
      return { version: 1, profiles: [] };
    }
    const file = parsed as Partial<StoreFile>;
    return { version: 1, profiles: Array.isArray(file.profiles) ? file.profiles : [] };
  }
}
