/**
 * history.db Migration Tests — SQL Sensi V2 Phase 5
 *
 * Starts from a real Version 1 history.db (schema v0 with data), opens it with
 * the current HistoryService, and checks the migration, the backup and the new
 * connection link.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { HistoryService } from '../../src/services/history/history.service';
import { HISTORY_SCHEMA_VERSION, HISTORY_TABLES_SQL } from '../../src/services/history/history.schema';
import type { AiAnswerMeta, ConnectionRef } from '../../src/types';

/** Loads a fresh HistoryService instance bound to `dir` (AppConfig reads env at import). */
function loadHistory(dir: string): HistoryService {
  process.env.APP_DATA_DIR = dir;
  let service!: HistoryService;
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    service = require('../../src/services/history/history.service').HistoryService.getInstance();
  });
  return service;
}

const conn: ConnectionRef = { connectionId: 'conn-a', engine: 'postgresql', label: 'analytics @ db' };
const USER = 'user-1';

describe('history.db migration (v0 → current)', () => {
  const original = process.env.APP_DATA_DIR;
  let dir: string;
  let dbPath: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-history-mig-'));
    dbPath = path.join(dir, 'history.db');

    // A Version 1 database with existing data
    const v0 = new DatabaseSync(dbPath);
    v0.exec(HISTORY_TABLES_SQL);
    v0.prepare('INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)').run('old-1', 'Old chat', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
    v0.prepare('INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)').run('m-1', 'old-1', 'user', 'Top customers?', '2026-01-01T00:00:01Z');
    v0.close();
  });

  afterAll(() => {
    if (original === undefined) delete process.env.APP_DATA_DIR;
    else process.env.APP_DATA_DIR = original;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // history.db stays open in the singleton; temp dir is disposable
    }
  });

  let history: HistoryService;

  it('backs up the old database before migrating', () => {
    const info = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    history = loadHistory(dir);
    info.mockRestore();

    const backups = fs.readdirSync(dir).filter(f => f.startsWith('history.db.backup-v0-'));
    expect(backups).toHaveLength(1);
    const copy = new DatabaseSync(path.join(dir, backups[0]), { readOnly: true } as never);
    expect((copy.prepare('SELECT COUNT(*) AS n FROM messages').get() as { n: number }).n).toBe(1);
    copy.close();
  });

  it('sets the schema version and adds the connection + user columns', () => {
    const db = new DatabaseSync(dbPath, { readOnly: true } as never);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(HISTORY_SCHEMA_VERSION);
    const convCols = (db.prepare('PRAGMA table_info(conversations)').all() as { name: string }[]).map(c => c.name);
    const msgCols = (db.prepare('PRAGMA table_info(messages)').all() as { name: string }[]).map(c => c.name);
    db.close();
    expect(convCols).toEqual(expect.arrayContaining(['connection_id', 'engine', 'connection_label', 'user_id']));
    expect(msgCols).toEqual(expect.arrayContaining(['connection_id', 'ai_meta_json']));
  });

  it('keeps legacy (ownerless) conversations on disk but hides them from every account', async () => {
    // The row survives the migration (data is not destroyed)…
    const db = new DatabaseSync(dbPath, { readOnly: true } as never);
    const row = db.prepare('SELECT title, user_id FROM conversations WHERE id = ?').get('old-1') as { title: string; user_id: unknown };
    db.close();
    expect(row.title).toBe('Old chat');
    expect(row.user_id).toBeNull();

    // …but because it has no owner it is no longer shown to any user, nor readable by one.
    const list = await history.listConversations(USER);
    expect(list.success && list.data.some(c => c.id === 'old-1')).toBe(false);
    const got = await history.getConversation('old-1', USER);
    expect(got.success).toBe(false);
  });

  it('records the connection on new conversations and their messages', async () => {
    const created = await history.createConversation('Revenue', USER, conn);
    if (!created.success) throw new Error('create failed');
    expect(created.data).toMatchObject({ databaseName: 'analytics @ db', connectionId: 'conn-a', engine: 'postgresql', userId: USER });

    const meta: AiAnswerMeta = {
      mode: 'sql', grounded: true, engine: 'postgresql', connectionId: 'conn-a',
      sql: 'SELECT 1', explanation: 'x', assumptions: ['a'], tablesUsed: ['orders'], warnings: [],
    };
    // The caller claims another connection; the conversation's own connection wins
    const added = await history.addMessage(created.data.id, USER, { role: 'assistant', content: 'ok', connectionId: 'someone-else', aiMeta: meta });
    expect(added.success && added.data.connectionId).toBe('conn-a');

    const got = await history.getConversation(created.data.id, USER);
    if (!got.success) throw new Error('get failed');
    expect(got.data.messages[0].connectionId).toBe('conn-a');
    expect(got.data.messages[0].aiMeta).toEqual(meta);
  });

  it('refuses messages for a conversation that does not exist', async () => {
    const res = await history.addMessage('missing', USER, { role: 'user', content: 'x' });
    expect(res.success).toBe(false);
  });

  it('does not migrate or back up again when reopened', () => {
    loadHistory(dir);
    expect(fs.readdirSync(dir).filter(f => f.startsWith('history.db.backup-'))).toHaveLength(1);
  });

  it('creates a fresh database at the current version without a backup', () => {
    const fresh = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-history-new-'));
    loadHistory(fresh);
    const db = new DatabaseSync(path.join(fresh, 'history.db'), { readOnly: true } as never);
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(HISTORY_SCHEMA_VERSION);
    db.close();
    expect(fs.readdirSync(fresh).some(f => f.includes('backup'))).toBe(false);
  });
});
