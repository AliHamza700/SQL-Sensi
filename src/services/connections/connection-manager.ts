/**
 * Connection Manager — SQL Sensi V2
 *
 * Main-process owner of saved connection profiles and of WHICH profile is
 * active. DatabaseService still holds the single open adapter; this class
 * decides what it connects to and stamps every request with a connection id.
 *
 *   - Profiles (metadata) → ConnectionStore; passwords → SecretStore (encrypted)
 *   - connect / switch / disconnect are serialized
 *   - assertActive() rejects requests prepared for a different connection
 */

import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  ConnectionConfig,
  ConnectionProfile,
  ConnectionProfileInput,
  ConnectionRef,
  ConnectionTestResult,
  DatabaseValidationResult,
  ServiceResult,
} from '@/src/types';
import { createError } from '@/src/utils/errors';
import { DatabaseService, databaseService } from '../database/database.service';
import { createAdapter } from '../database/adapters/registry';
import { SerialQueue } from '../database/adapters/server-common';
import { ConnectionStore, StoredProfile } from './connection-store';
import { SecretStore } from './secret-store';

export type ActiveListener = (active: ConnectionRef | null) => void;

export type TestTarget = { input: ConnectionProfileInput } | { profileId: string; password?: string };

export interface ConnectOutcome {
  active: ConnectionRef;
  validation: DatabaseValidationResult;
}

function fail<T>(code: 'DATABASE_ERROR' | 'PASSWORD_REQUIRED' | 'CONNECTION_CHANGED', message: string): ServiceResult<T> {
  return { success: false, error: createError(code, message) };
}

/** Same file on disk? (case-insensitive on Windows) */
function sameFile(a: string, b: string): boolean {
  const norm = (p: string) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
  return norm(a) === norm(b);
}

export class ConnectionManager {
  private active: ConnectionRef | null = null;
  private readonly queue = new SerialQueue();
  private readonly listeners = new Set<ActiveListener>();

  constructor(
    private readonly store: ConnectionStore,
    private readonly secrets: SecretStore,
    private readonly db: DatabaseService = databaseService
  ) {}

  // ─── Active connection ──────────────────────────────────────

  /** Subscribe to active-connection changes. Returns an unsubscribe function. */
  public onActiveChange(listener: ActiveListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** The active connection, or null. Detects a server that dropped the connection. */
  public getActive(): ConnectionRef | null {
    if (this.active && !this.db.isConnected()) {
      this.setActive(null);
    }
    return this.active;
  }

  /**
   * Confirms a request was prepared for the connection that is active now.
   * Every query, plan and schema request from the renderer must pass this.
   */
  public assertActive(expectedConnectionId: unknown): ServiceResult<ConnectionRef> {
    const active = this.getActive();
    if (!active) {
      return fail('DATABASE_ERROR', 'No database is connected. Connect one on the Database page.');
    }
    if (typeof expectedConnectionId !== 'string' || expectedConnectionId !== active.connectionId) {
      return fail(
        'CONNECTION_CHANGED',
        `The active database changed to "${active.label}" since this was prepared. Review it again before running it.`
      );
    }
    return { success: true, data: active };
  }

  public async connect(profileId: string, password?: string): Promise<ServiceResult<ConnectOutcome>> {
    return this.queue.run(async () => {
      const profile = this.store.get(profileId);
      if (!profile) return fail('DATABASE_ERROR', 'That saved connection no longer exists.');

      const config = this.buildConfig(profile, password);
      if (!config.success) return config;

      return this.open(profile, config.data);
    });
  }

  /**
   * Opens a SQLite file (the Version 1 "Browse" flow). Reuses the saved profile for
   * that file, or saves a new one only after the file has opened successfully.
   */
  public async connectFile(filePath: string): Promise<ServiceResult<ConnectOutcome>> {
    return this.queue.run(async () => {
      const existing = this.store.list().find(p => p.engine === 'sqlite' && p.filePath && sameFile(p.filePath, filePath));
      const now = new Date().toISOString();
      const profile: StoredProfile = existing ?? {
        id: randomUUID(),
        engine: 'sqlite',
        label: path.basename(filePath),
        filePath,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: null,
      };
      return this.open(profile, { engine: 'sqlite', filePath });
    });
  }

  public async disconnect(): Promise<void> {
    await this.queue.run(async () => {
      await this.db.disconnect();
      this.setActive(null);
    });
  }

  // ─── Profiles ───────────────────────────────────────────────

  public isSecretStorageAvailable(): boolean {
    return this.secrets.isAvailable();
  }

  /** Saved profiles, most recently used first. Never includes passwords. */
  public listProfiles(): ConnectionProfile[] {
    return this.store
      .list()
      .map(p => this.toPublic(p))
      .sort((a, b) => (b.lastUsedAt ?? '').localeCompare(a.lastUsedAt ?? '') || a.label.localeCompare(b.label));
  }

  public saveProfile(input: ConnectionProfileInput): ServiceResult<ConnectionProfile> {
    const existing = input.id ? this.store.get(input.id) : undefined;
    if (input.id && !existing) return fail('DATABASE_ERROR', 'That saved connection no longer exists.');

    const now = new Date().toISOString();
    const id = existing?.id ?? randomUUID();
    const base = { id, label: input.label, createdAt: existing?.createdAt ?? now, updatedAt: now, lastUsedAt: existing?.lastUsedAt ?? null };

    if (input.engine === 'sqlite') {
      this.store.upsert({ ...base, engine: 'sqlite', filePath: input.filePath });
      this.secrets.delete(id);
    } else {
      this.store.upsert({
        ...base,
        engine: input.engine,
        host: input.host,
        port: input.port,
        database: input.database,
        user: input.user,
        tls: { enabled: input.tls.enabled },
      });
      if (!input.savePassword) {
        this.secrets.delete(id);
      } else if (input.password !== undefined) {
        // set() refuses when OS encryption is unavailable; the profile then simply has no saved password
        this.secrets.set(id, input.password);
      }
    }

    const saved = this.store.get(id);
    return saved ? { success: true, data: this.toPublic(saved) } : fail('DATABASE_ERROR', 'The connection could not be saved.');
  }

  public async deleteProfile(id: string): Promise<ServiceResult<void>> {
    if (!this.store.get(id)) return fail('DATABASE_ERROR', 'That saved connection no longer exists.');
    if (this.active?.connectionId === id) {
      await this.disconnect();
    }
    this.store.remove(id);
    this.secrets.delete(id);
    return { success: true, data: undefined };
  }

  /**
   * Opens a throwaway connection to check settings and permissions.
   * Never changes the active connection.
   */
  public async testConnection(target: TestTarget): Promise<ServiceResult<ConnectionTestResult>> {
    let config: ServiceResult<ConnectionConfig>;
    if ('input' in target) {
      const input = target.input;
      if (input.engine === 'sqlite') {
        config = { success: true, data: { engine: 'sqlite', filePath: input.filePath } };
      } else {
        const saved = input.id ? this.secrets.get(input.id) : undefined;
        const password = input.password ?? saved;
        config = password === undefined
          ? fail('PASSWORD_REQUIRED', 'Enter the password to test this connection.')
          : { success: true, data: { engine: input.engine, host: input.host, port: input.port, database: input.database, user: input.user, password, tls: input.tls } };
      }
    } else {
      const profile = this.store.get(target.profileId);
      config = profile ? this.buildConfig(profile, target.password) : fail('DATABASE_ERROR', 'That saved connection no longer exists.');
    }
    if (!config.success) return config;

    const created = createAdapter(config.data.engine);
    if (!created.success) return created;
    const adapter = created.data;
    try {
      const opened = await adapter.connect(config.data);
      if (!opened.success) return opened;
      const schema = await adapter.getSchema();
      if (!schema.success) return schema;
      return { success: true, data: { label: adapter.getLabel() ?? '', tableCount: schema.data.tables.length } };
    } finally {
      await adapter.disconnect();
    }
  }

  // ─── Internals ──────────────────────────────────────────────

  private async open(profile: StoredProfile, config: ConnectionConfig): Promise<ServiceResult<ConnectOutcome>> {
    const result = await this.db.connectWith(config);
    if (!result.success) {
      // DatabaseService kept the previous connection; so does the manager.
      return result;
    }

    this.store.upsert({ ...profile, lastUsedAt: new Date().toISOString() });
    const active: ConnectionRef = { connectionId: profile.id, engine: profile.engine, label: profile.label };
    this.setActive(active);
    return { success: true, data: { active, validation: result.data } };
  }

  private buildConfig(profile: StoredProfile, password?: string): ServiceResult<ConnectionConfig> {
    if (profile.engine === 'sqlite') {
      if (!profile.filePath) return fail('DATABASE_ERROR', 'This saved connection has no file path.');
      return { success: true, data: { engine: 'sqlite', filePath: profile.filePath } };
    }
    if (!profile.host || !profile.port || !profile.database || !profile.user) {
      return fail('DATABASE_ERROR', 'This saved connection is missing server details. Edit it and save again.');
    }
    const secret = password ?? this.secrets.get(profile.id);
    if (secret === undefined) {
      return fail('PASSWORD_REQUIRED', `Enter the password for "${profile.label}".`);
    }
    return {
      success: true,
      data: {
        engine: profile.engine,
        host: profile.host,
        port: profile.port,
        database: profile.database,
        user: profile.user,
        password: secret,
        tls: { enabled: profile.tls?.enabled ?? false },
      },
    };
  }

  private toPublic(profile: StoredProfile): ConnectionProfile {
    return { ...profile, hasSavedPassword: profile.engine !== 'sqlite' && this.secrets.has(profile.id) };
  }

  private setActive(active: ConnectionRef | null): void {
    const changed = this.active?.connectionId !== active?.connectionId || this.active?.label !== active?.label;
    this.active = active;
    if (changed) {
      for (const listener of this.listeners) {
        try {
          listener(active);
        } catch (e) {
          console.warn('[ConnectionManager] Listener failed:', e);
        }
      }
    }
  }
}
