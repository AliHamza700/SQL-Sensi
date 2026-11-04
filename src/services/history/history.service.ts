import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { AppConfig } from '@/src/config';
import { HISTORY_MIGRATIONS, HISTORY_SCHEMA_VERSION, HISTORY_TABLES_SQL } from './history.schema';
import { AiAnswerMeta, ConnectionRef, Conversation, ConversationMessage, DatabaseEngine, ServiceResult } from '@/src/types';
import { createError } from '@/src/utils/errors';

/** Shown for conversations created before Version 2 recorded the database */
const UNKNOWN_DATABASE = 'Unknown database';
/** Largest AI metadata blob stored per message */
const MAX_META_JSON = 20_000;

type Row = Record<string, unknown>;

function toConversation(r: Row): Conversation {
  return {
    id: String(r.id),
    title: String(r.title),
    userId: r.user_id ? String(r.user_id) : 'local',
    databaseName: r.connection_label ? String(r.connection_label) : UNKNOWN_DATABASE,
    connectionId: r.connection_id ? String(r.connection_id) : null,
    engine: r.engine ? (String(r.engine) as DatabaseEngine) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    messages: [],
  };
}

function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

export class HistoryService {
  private static instance: HistoryService;
  private db: DatabaseSync | null = null;
  private dbPath: string;

  private constructor() {
    const appDir = AppConfig.database.appDataDir;
    if (!fs.existsSync(appDir)) {
      fs.mkdirSync(appDir, { recursive: true });
    }
    this.dbPath = path.join(appDir, 'history.db');
    this.initDatabase();
  }

  public static getInstance(): HistoryService {
    if (!HistoryService.instance) {
      HistoryService.instance = new HistoryService();
    }
    return HistoryService.instance;
  }

  private initDatabase(): void {
    if (!this.db) {
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA foreign_keys = ON;');
      this.migrate(this.db);
    }
  }

  /**
   * Brings history.db to HISTORY_SCHEMA_VERSION. An existing database is backed up
   * (VACUUM INTO, a consistent copy) before the first migration touches it.
   */
  private migrate(db: DatabaseSync): void {
    const existed = (db.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'conversations'").get() as Row).n !== 0;
    db.exec(HISTORY_TABLES_SQL);

    const current = Number((db.prepare('PRAGMA user_version').get() as Row).user_version) || 0;
    if (current >= HISTORY_SCHEMA_VERSION) return;

    if (existed) {
      const backup = `${this.dbPath}.backup-v${current}-${Date.now()}`;
      db.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
      console.info(`[HistoryService] Backed up history.db to ${path.basename(backup)} before migrating to v${HISTORY_SCHEMA_VERSION}.`);
    }

    for (const migration of HISTORY_MIGRATIONS) {
      if (migration.version <= current) continue;
      db.exec('BEGIN');
      try {
        db.exec(migration.sql);
        db.exec(`PRAGMA user_version = ${migration.version}`);
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    }
  }

  private getDb(): DatabaseSync {
    this.initDatabase();
    if (!this.db) {
      throw new Error('Database initialization failed');
    }
    return this.db;
  }

  /** Lists only the conversations owned by `userId`. Legacy rows (user_id NULL) are never returned. */
  public async listConversations(userId: string): Promise<ServiceResult<Conversation[]>> {
    try {
      const db = this.getDb();
      const rows = db
        .prepare('SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC')
        .all(userId) as Row[];
      return { success: true, data: rows.map(toConversation) };
    } catch (e: unknown) {
      return { success: false, error: createError('DATABASE_ERROR', (e as Error)?.message ?? 'History error') };
    }
  }

  /** Creates a conversation owned by `userId` and bound to the connection it is about. */
  public async createConversation(title: string, userId: string, connection: ConnectionRef | null = null): Promise<ServiceResult<Conversation>> {
    try {
      const db = this.getDb();
      const id = randomUUID();
      const now = new Date().toISOString();
      db.prepare(
        'INSERT INTO conversations (id, title, created_at, updated_at, connection_id, engine, connection_label, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, title, now, now, connection?.connectionId ?? null, connection?.engine ?? null, connection?.label ?? null, userId);
      const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as Row;
      return { success: true, data: toConversation(row) };
    } catch (e: unknown) {
      return { success: false, error: createError('DATABASE_ERROR', (e as Error)?.message ?? 'History error') };
    }
  }

  /** Loads a conversation only if it belongs to `userId`. */
  public async getConversation(id: string, userId: string): Promise<ServiceResult<{ conversation: Conversation, messages: ConversationMessage[] }>> {
    try {
      const db = this.getDb();
      const cRow = db.prepare('SELECT * FROM conversations WHERE id = ? AND user_id = ?').get(id, userId) as Row | undefined;
      if (!cRow) return { success: false, error: createError('DATABASE_ERROR', 'Conversation not found') };

      const mRows = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id) as Row[];

      const messages: ConversationMessage[] = mRows.map(r => ({
        id: String(r.id),
        conversationId: String(r.conversation_id),
        role: r.role as ConversationMessage['role'],
        content: String(r.content),
        queryResult: parseJson(r.query_result_json),
        optimizationResult: parseJson(r.optimization_result_json),
        queryPlan: parseJson(r.plan_explanation_json),
        connectionId: r.connection_id ? String(r.connection_id) : undefined,
        aiMeta: parseJson<AiAnswerMeta>(r.ai_meta_json),
        createdAt: String(r.created_at),
      }));

      return { success: true, data: { conversation: toConversation(cRow), messages } };
    } catch (e: unknown) {
      return { success: false, error: createError('DATABASE_ERROR', (e as Error)?.message ?? 'History error') };
    }
  }

  /**
   * Adds a message. Its connection is always the conversation's own connection
   * (set here, not taken from the caller), so history can't be mislabelled.
   */
  public async addMessage(conversationId: string, userId: string, msg: Partial<ConversationMessage>): Promise<ServiceResult<ConversationMessage>> {
    try {
      const db = this.getDb();
      const conv = db.prepare('SELECT connection_id FROM conversations WHERE id = ? AND user_id = ?').get(conversationId, userId) as Row | undefined;
      if (!conv) return { success: false, error: createError('DATABASE_ERROR', 'Conversation not found') };
      const connectionId = conv.connection_id ? String(conv.connection_id) : null;

      const id = randomUUID();
      const now = new Date().toISOString();

      const qRes = msg.queryResult ? JSON.stringify(msg.queryResult) : null;
      const optRes = msg.optimizationResult ? JSON.stringify(msg.optimizationResult) : null;
      const plan = msg.queryPlan ? JSON.stringify(msg.queryPlan) : null;
      const metaJson = msg.aiMeta ? JSON.stringify(msg.aiMeta) : null;
      const meta = metaJson && metaJson.length <= MAX_META_JSON ? metaJson : null;

      db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, query_result_json, optimization_result_json, plan_explanation_json, created_at, connection_id, ai_meta_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, conversationId, msg.role ?? 'user', msg.content ?? '', qRes, optRes, plan, now, connectionId, meta);

      db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, conversationId);

      return {
        success: true,
        data: {
          ...msg,
          id,
          conversationId,
          connectionId: connectionId ?? undefined,
          aiMeta: meta ? msg.aiMeta : undefined,
          createdAt: now,
        } as ConversationMessage,
      };
    } catch (e: unknown) {
      return { success: false, error: createError('DATABASE_ERROR', (e as Error)?.message ?? 'History error') };
    }
  }

  public async deleteConversation(id: string, userId: string): Promise<ServiceResult<void>> {
    try {
      const db = this.getDb();
      // FK CASCADE will delete messages. Ownership scoped so one user cannot delete another's.
      db.prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?').run(id, userId);
      return { success: true, data: undefined };
    } catch (e: unknown) {
      return { success: false, error: createError('DATABASE_ERROR', (e as Error)?.message ?? 'History error') };
    }
  }

  public async updateConversationTitle(id: string, title: string, userId: string): Promise<ServiceResult<void>> {
    try {
      const db = this.getDb();
      db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?').run(title, new Date().toISOString(), id, userId);
      return { success: true, data: undefined };
    } catch (e: unknown) {
      return { success: false, error: createError('DATABASE_ERROR', (e as Error)?.message ?? 'History error') };
    }
  }
}

export const historyService = HistoryService.getInstance();
