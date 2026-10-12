import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { AppConfig } from '@/src/config';
import { HISTORY_TABLES_SQL } from './history.schema';
import { Conversation, ConversationMessage, ServiceResult } from '@/src/types';
import { createError } from '@/src/utils/errors';

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
      this.db.exec(HISTORY_TABLES_SQL);
    }
  }

  private getDb(): DatabaseSync {
    this.initDatabase();
    if (!this.db) {
      throw new Error('Database initialization failed');
    }
    return this.db;
  }

  public async listConversations(): Promise<ServiceResult<Conversation[]>> {
    try {
      const db = this.getDb();
      const stmt = db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC');
      const rows = stmt.all() as any[];
      
      const convos: Conversation[] = rows.map(r => ({
        id: r.id,
        title: r.title,
        userId: 'local-user',
        databaseName: 'local-db',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        messages: []
      }));
      return { success: true, data: convos };
    } catch (e: any) {
      return { success: false, error: createError('DATABASE_ERROR', e.message) };
    }
  }

  public async createConversation(title: string): Promise<ServiceResult<Conversation>> {
    try {
      const db = this.getDb();
      const id = randomUUID();
      const now = new Date().toISOString();
      const stmt = db.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)');
      stmt.run(id, title, now, now);
      return { success: true, data: { id, title, userId: 'local', databaseName: 'local', createdAt: now, updatedAt: now, messages: [] } };
    } catch (e: any) {
      return { success: false, error: createError('DATABASE_ERROR', e.message) };
    }
  }

  public async getConversation(id: string): Promise<ServiceResult<{ conversation: Conversation, messages: ConversationMessage[] }>> {
    try {
      const db = this.getDb();
      const cStmt = db.prepare('SELECT * FROM conversations WHERE id = ?');
      const cRow = cStmt.get(id) as any;
      if (!cRow) return { success: false, error: createError('DATABASE_ERROR', 'Conversation not found') };

      const mStmt = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC');
      const mRows = mStmt.all(id) as any[];

      const messages: ConversationMessage[] = mRows.map(r => ({
        id: r.id,
        conversationId: r.conversation_id,
        role: r.role as any,
        content: r.content,
        queryResult: r.query_result_json ? JSON.parse(r.query_result_json) : undefined,
        optimizationResult: r.optimization_result_json ? JSON.parse(r.optimization_result_json) : undefined,
        queryPlan: r.plan_explanation_json ? JSON.parse(r.plan_explanation_json) : undefined,
        createdAt: r.created_at,
      }));

      return {
        success: true,
        data: {
          conversation: { id: cRow.id, title: cRow.title, userId: 'local', databaseName: 'local', createdAt: cRow.created_at, updatedAt: cRow.updated_at, messages: [] },
          messages
        }
      };
    } catch (e: any) {
      return { success: false, error: createError('DATABASE_ERROR', e.message) };
    }
  }

  public async addMessage(conversationId: string, msg: Partial<ConversationMessage>): Promise<ServiceResult<ConversationMessage>> {
    try {
      const db = this.getDb();
      const id = randomUUID();
      const now = new Date().toISOString();
      
      const qRes = msg.queryResult ? JSON.stringify(msg.queryResult) : null;
      const optRes = msg.optimizationResult ? JSON.stringify(msg.optimizationResult) : null;
      const plan = msg.queryPlan ? JSON.stringify(msg.queryPlan) : null;

      const stmt = db.prepare(`
        INSERT INTO messages (id, conversation_id, role, content, query_result_json, optimization_result_json, plan_explanation_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, conversationId, msg.role, msg.content, qRes, optRes, plan, now);

      // Update conversation updated_at
      const updStmt = db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?');
      updStmt.run(now, conversationId);

      return {
        success: true,
        data: {
          ...msg,
          id,
          conversationId,
          createdAt: now
        } as ConversationMessage
      };
    } catch (e: any) {
      return { success: false, error: createError('DATABASE_ERROR', e.message) };
    }
  }

  public async deleteConversation(id: string): Promise<ServiceResult<void>> {
    try {
      const db = this.getDb();
      // FK CASCADE will delete messages
      const stmt = db.prepare('DELETE FROM conversations WHERE id = ?');
      stmt.run(id);
      return { success: true, data: undefined };
    } catch (e: any) {
      return { success: false, error: createError('DATABASE_ERROR', e.message) };
    }
  }

  public async updateConversationTitle(id: string, title: string): Promise<ServiceResult<void>> {
    try {
      const db = this.getDb();
      const stmt = db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?');
      stmt.run(title, new Date().toISOString(), id);
      return { success: true, data: undefined };
    } catch (e: any) {
      return { success: false, error: createError('DATABASE_ERROR', e.message) };
    }
  }
}

export const historyService = HistoryService.getInstance();
