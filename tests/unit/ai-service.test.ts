/**
 * AIService Tests — SQL Sensi V2 Phase 5
 *
 * Uses a scripted fake provider, so these tests check what SQL Sensi SENDS to
 * the model and how it VALIDATES replies — no network, no API key.
 */

import { AIService } from '../../src/services/ai/ai.service';
import type { AIProvider, AiCompletionRequest } from '../../src/services/ai/ai-provider.interface';
import type { ConnectionRef, DatabaseSchema, ServiceResult } from '../../src/types';

class FakeProvider implements AIProvider {
  readonly name = 'fake';
  requests: AiCompletionRequest[] = [];
  constructor(private replies: (string | Error)[]) {}
  async complete(request: AiCompletionRequest) {
    this.requests.push(request);
    const next = this.replies.shift();
    if (next === undefined) throw new Error('no scripted reply left');
    if (next instanceof Error) throw next;
    return { text: next };
  }
}

const schema: DatabaseSchema = {
  databaseName: 'sales_demo.db',
  tables: [
    { name: 'customers', columns: [{ name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false }], primaryKeys: ['id'], foreignKeys: [], rowCount: 3 },
    { name: 'orders', columns: [{ name: 'id', type: 'INTEGER', nullable: false, defaultValue: null, isPrimaryKey: true, isForeignKey: false }], primaryKeys: ['id'], foreignKeys: [], rowCount: 4 },
  ],
  relationships: [],
  indexes: [],
  views: [],
};

const sqlite: ConnectionRef = { connectionId: 'conn-a', engine: 'sqlite', label: 'sales_demo.db' };
const postgres: ConnectionRef = { connectionId: 'conn-b', engine: 'postgresql', label: 'analytics @ db' };
const ask = [{ role: 'user' as const, content: 'How many customers are there?' }];
const reply = (obj: object) => JSON.stringify(obj);

function make(replies: (string | Error)[], loader?: () => Promise<ServiceResult<DatabaseSchema>>, secrets: string[] = []) {
  const provider = new FakeProvider(replies);
  const load = jest.fn(loader ?? (async () => ({ success: true as const, data: schema })));
  return { provider, load, ai: new AIService(provider, load, secrets) };
}

describe('AIService.generateSQL', () => {
  it('explains how to configure AI when no provider is set', async () => {
    const res = await new AIService(null).generateSQL(ask, sqlite);
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.message).toMatch(/GROQ_API_KEY/);
  });

  it('returns a validated, grounded query bound to the connection', async () => {
    const { ai, provider } = make([reply({ mode: 'sql', sql: 'SELECT COUNT(*) FROM customers', explanation: 'Counts customers.', tables_used: ['customers'] })]);
    const res = await ai.generateSQL(ask, sqlite);

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.sql).toBe('SELECT COUNT(*) FROM customers');
    expect(res.data.message).toBe('Counts customers.');
    expect(res.data.meta).toMatchObject({ mode: 'sql', grounded: true, engine: 'sqlite', connectionId: 'conn-a', tablesUsed: ['customers'] });

    expect(provider.requests).toHaveLength(1);
    expect(provider.requests[0]).toMatchObject({ json: true, temperature: 0 });
    expect(provider.requests[0].messages[0].role).toBe('system');
    expect(provider.requests[0].messages[0].content).toContain('SQLite 3');
    expect(provider.requests[0].messages[1]).toEqual({ role: 'user', content: 'How many customers are there?' });
  });

  it('uses the active engine in the prompt', async () => {
    const { ai, provider } = make([reply({ mode: 'general', explanation: 'x' })]);
    await ai.generateSQL(ask, postgres);
    expect(provider.requests[0].messages[0].content).toContain('PostgreSQL database named "analytics @ db"');
  });

  it('asks the model once to repair invented tables, then accepts the fixed query', async () => {
    const { ai, provider } = make([
      reply({ mode: 'sql', sql: 'SELECT COUNT(*) FROM clients' }),
      reply({ mode: 'sql', sql: 'SELECT COUNT(*) FROM customers' }),
    ]);
    const res = await ai.generateSQL(ask, sqlite);
    expect(res.success && res.data.sql).toBe('SELECT COUNT(*) FROM customers');
    expect(provider.requests).toHaveLength(2);
    const feedback = provider.requests[1].messages[provider.requests[1].messages.length - 1].content;
    expect(feedback).toMatch(/not in the schema: clients/);
  });

  it('never returns SQL that is still unsafe after the repair attempt', async () => {
    const { ai } = make([
      reply({ mode: 'sql', sql: 'DELETE FROM customers' }),
      reply({ mode: 'sql', sql: 'DELETE FROM customers WHERE id = 1' }),
    ]);
    const res = await ai.generateSQL(ask, sqlite);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.sql).toBeUndefined();
    expect(res.data.isAmbiguous).toBe(true);
    expect(res.data.meta.mode).toBe('clarify');
    expect(res.data.meta.warnings.join(' ')).toMatch(/only SELECT/);
  });

  it('retries once when the reply is not JSON', async () => {
    const { ai, provider } = make(['SELECT COUNT(*) FROM customers', reply({ mode: 'sql', sql: 'SELECT COUNT(*) FROM customers' })]);
    const res = await ai.generateSQL(ask, sqlite);
    expect(res.success && res.data.sql).toBe('SELECT COUNT(*) FROM customers');
    expect(provider.requests).toHaveLength(2);
  });

  it('keeps SQL with a dialect warning that survives the repair, and shows the warning', async () => {
    const wrong = reply({ mode: 'sql', sql: "SELECT strftime('%Y', now()) FROM orders" });
    const { ai } = make([wrong, wrong]);
    const res = await ai.generateSQL(ask, postgres);
    expect(res.success && res.data.sql).toBeTruthy();
    expect(res.success && res.data.meta.warnings.join(' ')).toMatch(/PostgreSQL/);
  });

  it('marks general answers as not grounded and returns no SQL', async () => {
    const { ai } = make([reply({ mode: 'general', explanation: 'WHERE filters rows; HAVING filters groups.' })]);
    const res = await ai.generateSQL([{ role: 'user', content: 'WHERE vs HAVING?' }], sqlite);
    expect(res.success && res.data).toMatchObject({ isAmbiguous: false, message: 'WHERE filters rows; HAVING filters groups.' });
    expect(res.success && res.data.sql).toBeUndefined();
    expect(res.success && res.data.meta.grounded).toBe(false);
  });

  it('passes a clarifying question through', async () => {
    const { ai } = make([reply({ mode: 'clarify', question: 'Which date column means "joined"?' })]);
    const res = await ai.generateSQL(ask, sqlite);
    expect(res.success && res.data).toMatchObject({ isAmbiguous: true, message: 'Which date column means "joined"?' });
  });

  it('redacts the API key from provider errors', async () => {
    const key = 'gsk_SECRET_123';
    const { ai } = make([new Error(`401 Invalid API key ${key}`)], undefined, [key]);
    const res = await ai.generateSQL(ask, sqlite);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(JSON.stringify(res.error)).not.toContain(key);
      expect(res.error.code).toBe('AI_ERROR');
    }
  });

  it('reports network failures as "AI unavailable"', async () => {
    const offline = Object.assign(new Error('getaddrinfo ENOTFOUND api.groq.com'), { code: 'ENOTFOUND' });
    const { ai } = make([offline]);
    const res = await ai.generateSQL(ask, sqlite);
    expect(!res.success && res.error.message).toMatch(/currently unavailable/);
  });

  it('returns the schema error when no database is readable', async () => {
    const { ai, provider } = make([], async () => ({ success: false, error: { code: 'DATABASE_ERROR', message: 'No database is currently connected.' } }));
    const res = await ai.generateSQL(ask, sqlite);
    expect(!res.success && res.error.code).toBe('DATABASE_ERROR');
    expect(provider.requests).toHaveLength(0);
  });
});

describe('AIService schema cache', () => {
  it('reads the schema once per connection and again after invalidation', async () => {
    const good = reply({ mode: 'general', explanation: 'x' });
    const { ai, load } = make([good, good, good, good]);
    await ai.generateSQL(ask, sqlite);
    await ai.generateSQL(ask, sqlite);
    expect(load).toHaveBeenCalledTimes(1);

    await ai.generateSQL(ask, postgres);
    expect(load).toHaveBeenCalledTimes(2);

    ai.invalidateSchemaCache();
    await ai.generateSQL(ask, sqlite);
    expect(load).toHaveBeenCalledTimes(3);
  });
});

describe('AIService.optimizeSQL / explainQueryPlan', () => {
  it('accepts a safe rewrite', async () => {
    const { ai } = make([reply({ issues: ['SELECT *'], suggestions: ['List columns'], optimizedSql: 'SELECT id FROM orders;' })]);
    const res = await ai.optimizeSQL('SELECT * FROM orders', sqlite);
    expect(res.success && res.data).toEqual({ issues: ['SELECT *'], suggestions: ['List columns'], optimizedSql: 'SELECT id FROM orders' });
  });

  it('discards a rewrite that is not read-only and keeps the original query', async () => {
    const { ai } = make([reply({ issues: [], suggestions: [], optimizedSql: 'DELETE FROM orders' })]);
    const res = await ai.optimizeSQL('SELECT * FROM orders', sqlite);
    expect(res.success && res.data.optimizedSql).toBe('SELECT * FROM orders');
    expect(res.success && res.data.suggestions.join(' ')).toMatch(/discarded/);
  });

  it('explains plans with the engine\'s own plan guide', async () => {
    const { ai, provider } = make([reply({ humanReadable: 'Reads every row.', performanceIssues: ['Seq Scan'], suggestions: [] })]);
    const res = await ai.explainQueryPlan('SELECT * FROM orders', { nodes: [], rawOutput: '- Seq Scan on orders' }, postgres);
    expect(res.success && res.data.humanReadable).toBe('Reads every row.');
    expect(provider.requests[0].messages[0].content).toMatch(/PostgreSQL EXPLAIN \(estimates only/);
  });
});
