import { AppConfig } from '@/src/config';
import type {
  AIResponse,
  AiAnswerMeta,
  ChatMessage,
  ConnectionRef,
  DatabaseSchema,
  QueryPlan,
  QueryPlanExplanation,
  SQLOptimizationResult,
  ServiceResult,
} from '@/src/types';
import { createError, Errors } from '@/src/utils/errors';
import { redact } from '../database/adapters/server-common';
import { schemaService } from '../schema/schema.service';
import type { AIProvider, AiChatTurn } from './ai-provider.interface';
import { GroqProvider } from './ai.provider';
import {
  buildConversationTurns,
  buildOptimizeSystemPrompt,
  buildPlanSystemPrompt,
  buildSqlSystemPrompt,
  selectRelevantSchema,
} from './context-builder';
import { checkSql, cleanSql, ParsedAnswer, parseJsonFields, parseSqlAnswer } from './response-parser';
import { formatSchemaToDDL } from './schema.formatter';

/** Cached schemas older than this are re-read (the database may have changed) */
const SCHEMA_CACHE_TTL_MS = 5 * 60_000;
const MAX_PLAN_CHARS = 8000;

type SchemaLoader = () => Promise<ServiceResult<DatabaseSchema>>;

const notConfigured = () =>
  createError('AI_ERROR', 'AI is not configured. Set GROQ_API_KEY in the .env file and restart SQL Sensi.');

/**
 * Database-aware AI (Phase 5). Builds engine-specific context for the ACTIVE
 * connection, calls the provider, and validates every answer before the
 * renderer may run its SQL. Main process only.
 */
export class AIService {
  private static instance: AIService;
  private readonly schemaCache = new Map<string, { schema: DatabaseSchema; at: number }>();

  /**
   * @param provider  LLM provider, or null when no API key is configured
   * @param loadSchema reads the active database's schema (injectable for tests)
   * @param secrets   values that must never appear in error messages (API keys)
   */
  constructor(
    private readonly provider: AIProvider | null,
    private readonly loadSchema: SchemaLoader = () => schemaService.extractSchema(),
    private readonly secrets: string[] = []
  ) {}

  public static getInstance(): AIService {
    if (!AIService.instance) {
      const key = process.env.GROQ_API_KEY ?? '';
      const provider = key ? new GroqProvider(key, AppConfig.ai.groqModel || undefined) : null;
      AIService.instance = new AIService(provider, undefined, key ? [key] : []);
    }
    return AIService.instance;
  }

  public isConfigured(): boolean {
    return this.provider !== null;
  }

  /** Forget cached schemas (all, or one connection's). Called when the active connection changes. */
  public invalidateSchemaCache(connectionId?: string): void {
    if (connectionId) this.schemaCache.delete(connectionId);
    else this.schemaCache.clear();
  }

  // ─── Questions ──────────────────────────────────────────────

  /**
   * Answers the latest user message for `connection`. The caller must have
   * verified that `connection` is the active one (assertActive).
   */
  public async generateSQL(messages: ChatMessage[], connection: ConnectionRef): Promise<ServiceResult<AIResponse>> {
    if (!this.provider) return { success: false, error: notConfigured() };

    const schemaRes = await this.schemaFor(connection);
    if (!schemaRes.success) return schemaRes;
    const schema = schemaRes.data;

    const question = [...messages].reverse().find(m => m.role === 'user')?.content ?? '';
    const relevant = selectRelevantSchema(schema, question);
    const turns: AiChatTurn[] = [
      { role: 'system', content: buildSqlSystemPrompt(connection, relevant, schema.tables.length) },
      ...buildConversationTurns(messages),
    ];

    try {
      let raw = await this.ask(turns, 900);
      let parsed = parseSqlAnswer(raw, connection.engine, schema);

      // One repair attempt: unreadable reply, unsafe/invalid SQL, or wrong-dialect syntax
      const feedback = !parsed.success
        ? ['Your reply was not a single valid JSON object in the required format.']
        : [...parsed.data.problems, ...parsed.data.warnings];
      if (feedback.length > 0) {
        raw = await this.ask(
          [
            ...turns,
            { role: 'assistant', content: raw.slice(0, 4000) },
            { role: 'user', content: `Your previous reply had these problems:\n- ${feedback.join('\n- ')}\nReply again with one corrected JSON object.` },
          ],
          900
        );
        parsed = parseSqlAnswer(raw, connection.engine, schema);
      }

      if (!parsed.success) return parsed;
      return { success: true, data: this.toResponse(parsed.data, connection) };
    } catch (error: unknown) {
      return { success: false, error: this.providerError(error, 'Failed to generate a response') };
    }
  }

  public async optimizeSQL(sql: string, connection: ConnectionRef): Promise<ServiceResult<SQLOptimizationResult>> {
    if (!this.provider) return { success: false, error: notConfigured() };

    const schemaRes = await this.schemaFor(connection);
    if (!schemaRes.success) return schemaRes;
    const schemaText = formatSchemaToDDL(selectRelevantSchema(schemaRes.data, sql));

    try {
      const raw = await this.ask(
        [
          { role: 'system', content: buildOptimizeSystemPrompt(connection, schemaText) },
          { role: 'user', content: `Optimize this query:\n\n${sql.slice(0, 20_000)}` },
        ],
        1000
      );
      const parsed = parseJsonFields(raw, { issues: [] as string[], suggestions: [] as string[], optimizedSql: '' });
      if (!parsed.success) return parsed;

      const result = parsed.data;
      const rewritten = cleanSql(result.optimizedSql);
      // A rewrite is only offered if it passes the same checks as generated SQL
      if (!rewritten || checkSql(rewritten, schemaRes.data).length > 0) {
        return {
          success: true,
          data: {
            issues: result.issues,
            suggestions: [...result.suggestions, 'The suggested rewrite did not pass the read-only/schema checks and was discarded.'],
            optimizedSql: sql,
          },
        };
      }
      return { success: true, data: { issues: result.issues, suggestions: result.suggestions, optimizedSql: rewritten } };
    } catch (error: unknown) {
      return { success: false, error: this.providerError(error, 'Failed to optimize SQL') };
    }
  }

  public async explainQueryPlan(sql: string, plan: QueryPlan, connection: ConnectionRef): Promise<ServiceResult<QueryPlanExplanation>> {
    if (!this.provider) return { success: false, error: notConfigured() };

    const schemaRes = await this.schemaFor(connection);
    if (!schemaRes.success) return schemaRes;
    const schemaText = formatSchemaToDDL(selectRelevantSchema(schemaRes.data, sql));

    try {
      const raw = await this.ask(
        [
          { role: 'system', content: buildPlanSystemPrompt(connection, schemaText) },
          { role: 'user', content: `Query:\n${sql.slice(0, 20_000)}\n\nPlan:\n${plan.rawOutput.slice(0, MAX_PLAN_CHARS)}` },
        ],
        1000
      );
      const parsed = parseJsonFields(raw, { humanReadable: '', performanceIssues: [] as string[], suggestions: [] as string[] });
      if (!parsed.success) return parsed;
      return { success: true, data: parsed.data };
    } catch (error: unknown) {
      return { success: false, error: this.providerError(error, 'Failed to explain the query plan') };
    }
  }

  // ─── Internals ──────────────────────────────────────────────

  private async ask(messages: AiChatTurn[], maxTokens: number): Promise<string> {
    const provider = this.provider;
    if (!provider) throw new Error('AI is not configured');
    const reply = await provider.complete({ messages, json: true, maxTokens, temperature: 0 });
    return reply.text;
  }

  private async schemaFor(connection: ConnectionRef): Promise<ServiceResult<DatabaseSchema>> {
    const cached = this.schemaCache.get(connection.connectionId);
    if (cached && Date.now() - cached.at < SCHEMA_CACHE_TTL_MS) {
      return { success: true, data: cached.schema };
    }
    const res = await this.loadSchema();
    if (res.success) this.schemaCache.set(connection.connectionId, { schema: res.data, at: Date.now() });
    return res;
  }

  private toResponse(answer: ParsedAnswer, connection: ConnectionRef): AIResponse {
    const base: Omit<AiAnswerMeta, 'mode' | 'grounded'> = {
      engine: connection.engine,
      connectionId: connection.connectionId,
      explanation: answer.explanation,
      assumptions: answer.assumptions,
      tablesUsed: answer.tablesUsed,
      warnings: answer.warnings,
    };

    if (answer.mode === 'general') {
      return { message: answer.explanation, isAmbiguous: false, meta: { ...base, mode: 'general', grounded: false } };
    }

    if (answer.mode === 'clarify') {
      const message = answer.question ?? answer.explanation;
      return { message, isAmbiguous: true, meta: { ...base, mode: 'clarify', grounded: true, explanation: message } };
    }

    if (answer.problems.length > 0 || !answer.sql) {
      // Never hand unsafe or ungrounded SQL to the renderer
      const message = `I couldn't write a safe query for that (${answer.problems.join(' ')}) Could you rephrase, or name the tables you mean?`;
      return {
        message,
        isAmbiguous: true,
        meta: { ...base, mode: 'clarify', grounded: true, explanation: message, warnings: [...answer.problems, ...answer.warnings] },
      };
    }

    return {
      message: answer.explanation || 'Here is the query for your question.',
      sql: answer.sql,
      isAmbiguous: false,
      meta: { ...base, mode: 'sql', grounded: true, sql: answer.sql },
    };
  }

  private providerError(error: unknown, prefix: string) {
    const e = (error ?? {}) as { message?: unknown; code?: unknown; name?: unknown; cause?: { code?: unknown } };
    const code = String(e.code ?? e.cause?.code ?? '');
    if (['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN'].includes(code) || e.name === 'APIConnectionError') {
      return Errors.ai.unavailable();
    }
    const raw = typeof e.message === 'string' ? e.message : 'Unknown AI error';
    return createError('AI_ERROR', `${prefix}: ${redact(raw, this.secrets)}`);
  }
}

export const aiService = AIService.getInstance();
