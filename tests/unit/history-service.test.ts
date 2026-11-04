/**
 * HistoryService Regression Tests — SQL Sensi V2 Phase 1
 *
 * Locks in Version 1 conversation-history behaviour (history.db) before the
 * V2 migration adds connection ID / engine columns.
 *
 * AppConfig reads APP_DATA_DIR at import time, so the service is loaded with
 * jest.isolateModules after pointing APP_DATA_DIR at a temp directory.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { HistoryService } from '../../src/services/history/history.service';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('HistoryService (regression)', () => {
  let tempDir: string;
  let originalDataDir: string | undefined;
  let history: HistoryService;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlsensi-history-'));
    originalDataDir = process.env.APP_DATA_DIR;
    process.env.APP_DATA_DIR = tempDir;

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = require('../../src/services/history/history.service');
      history = mod.HistoryService.getInstance();
    });
  });

  afterAll(() => {
    if (originalDataDir === undefined) delete process.env.APP_DATA_DIR;
    else process.env.APP_DATA_DIR = originalDataDir;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // history.db stays open in the singleton; temp dir is disposable.
    }
  });

  const USER = 'user-1';

  it('creates history.db inside APP_DATA_DIR', () => {
    expect(fs.existsSync(path.join(tempDir, 'history.db'))).toBe(true);
  });

  it('creates a conversation and lists it', async () => {
    const created = await history.createConversation('First chat', USER);
    expect(created.success).toBe(true);
    if (!created.success) return;

    const list = await history.listConversations(USER);
    expect(list.success).toBe(true);
    if (list.success) {
      expect(list.data.some((c) => c.id === created.data.id && c.title === 'First chat')).toBe(true);
    }
  });

  it('stores messages and round-trips query results as JSON', async () => {
    const convo = await history.createConversation('With messages', USER);
    if (!convo.success) throw new Error('create failed');

    await history.addMessage(convo.data.id, USER, { role: 'user', content: 'Top customers?' });
    await sleep(5);
    const queryResult = {
      columns: ['name', 'total'],
      rows: [{ name: 'Ada Test', total: 150 }, { name: 'Bo Sample', total: null }],
      rowCount: 2,
      executionTimeMs: 1.5,
    };
    await history.addMessage(convo.data.id, USER, { role: 'assistant', content: 'Here you go', queryResult });

    const got = await history.getConversation(convo.data.id, USER);
    expect(got.success).toBe(true);
    if (!got.success) return;

    expect(got.data.messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(got.data.messages[1].queryResult).toEqual(queryResult);
    expect(got.data.messages[0].queryResult).toBeUndefined();
  });

  it('orders conversations by most recent activity', async () => {
    const older = await history.createConversation('Older', USER);
    await sleep(5);
    const newer = await history.createConversation('Newer', USER);
    await sleep(5);
    if (!older.success || !newer.success) throw new Error('create failed');

    // A new message bumps the older conversation to the top.
    await history.addMessage(older.data.id, USER, { role: 'user', content: 'bump' });

    const list = await history.listConversations(USER);
    if (!list.success) throw new Error('list failed');
    const ids = list.data.map((c) => c.id);
    expect(ids.indexOf(older.data.id)).toBeLessThan(ids.indexOf(newer.data.id));
  });

  it('renames a conversation', async () => {
    const convo = await history.createConversation('Old title', USER);
    if (!convo.success) throw new Error('create failed');

    const updated = await history.updateConversationTitle(convo.data.id, 'New title', USER);
    expect(updated.success).toBe(true);

    const got = await history.getConversation(convo.data.id, USER);
    expect(got.success && got.data.conversation.title).toBe('New title');
  });

  it('deletes a conversation together with its messages', async () => {
    const convo = await history.createConversation('To delete', USER);
    if (!convo.success) throw new Error('create failed');
    await history.addMessage(convo.data.id, USER, { role: 'user', content: 'gone soon' });

    const deleted = await history.deleteConversation(convo.data.id, USER);
    expect(deleted.success).toBe(true);

    const got = await history.getConversation(convo.data.id, USER);
    expect(got.success).toBe(false);
    if (!got.success) {
      expect(got.error.message).toMatch(/not found/i);
    }
  });

  it('returns an error for an unknown conversation id', async () => {
    const got = await history.getConversation('does-not-exist', USER);
    expect(got.success).toBe(false);
  });

  // ─── Per-user isolation (bugfix: history was global across accounts) ──────
  describe('per-user isolation', () => {
    const ALICE = 'user-alice';
    const BOB = 'user-bob';

    it('never lists, reads, renames or deletes another user\'s conversation', async () => {
      const aliceConvo = await history.createConversation("Alice's private chat", ALICE);
      if (!aliceConvo.success) throw new Error('create failed');
      await history.addMessage(aliceConvo.data.id, ALICE, { role: 'user', content: 'secret' });

      // Bob's list must not contain Alice's conversation.
      const bobList = await history.listConversations(BOB);
      expect(bobList.success).toBe(true);
      if (bobList.success) {
        expect(bobList.data.some((c) => c.id === aliceConvo.data.id)).toBe(false);
      }

      // Bob cannot read it, rename it, add to it, or delete it.
      expect((await history.getConversation(aliceConvo.data.id, BOB)).success).toBe(false);
      expect((await history.addMessage(aliceConvo.data.id, BOB, { role: 'user', content: 'intrude' })).success).toBe(false);
      await history.updateConversationTitle(aliceConvo.data.id, 'HACKED', BOB);
      await history.deleteConversation(aliceConvo.data.id, BOB);

      // Alice's conversation is untouched.
      const stillThere = await history.getConversation(aliceConvo.data.id, ALICE);
      expect(stillThere.success).toBe(true);
      if (stillThere.success) {
        expect(stillThere.data.conversation.title).toBe("Alice's private chat");
        expect(stillThere.data.messages).toHaveLength(1);
      }
    });
  });
});
