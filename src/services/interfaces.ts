/**
 * Service Layer Interfaces — SQL Sensi
 *
 * Defines the CONTRACT for every service.
 * UI components and feature hooks must depend on these interfaces,
 * not on concrete implementations.
 *
 * Architecture principle (architecture.md §3):
 *   UI → Feature/Hook → Service Interface → Service Impl → Infrastructure
 */

import type {
  DatabaseSchema,
  QueryResult,
  SQLValidationResult,
  QueryPlan,
  OptimizationResult,
  Conversation,
  ConversationMessage,
  User,
  Session,
  ServiceResult,
} from '@/src/types';

// ─── Auth Service Interface ───────────────────────────────────

export interface IAuthService {
  register(email: string, password: string): Promise<ServiceResult<User>>;
  login(email: string, password: string): Promise<ServiceResult<Session>>;
  logout(token: string): Promise<ServiceResult<void>>;
  validateSession(token: string): Promise<ServiceResult<User>>;
}

// ─── Database Service Interface ───────────────────────────────

export interface IDatabaseService {
  /** Open a SQLite .db file. Returns error if file is invalid or corrupted. */
  open(filePath: string): Promise<ServiceResult<void>>;
  /** Close the current database connection */
  close(): Promise<ServiceResult<void>>;
  /** Execute a read-only query. MUST be called after validation. */
  executeReadOnly(sql: string): Promise<ServiceResult<QueryResult>>;
  /** Run EXPLAIN QUERY PLAN for the given SQL */
  explainQueryPlan(sql: string): Promise<ServiceResult<QueryPlan>>;
  /** Whether a database is currently open */
  isOpen(): boolean;
}

// ─── Schema Service Interface ─────────────────────────────────

export interface ISchemaService {
  /** Extract full schema from an open database */
  extractSchema(): Promise<ServiceResult<DatabaseSchema>>;
  /** Get a minimal schema summary for AI context construction */
  getSchemaSummary(schema: DatabaseSchema): string;
}

// ─── SQL Validator Interface ──────────────────────────────────

export interface ISQLValidator {
  /**
   * Validate SQL before execution.
   * MUST be called on both AI-generated SQL and user-edited SQL.
   * Returns valid=false if any destructive operation is detected.
   */
  validate(sql: string): SQLValidationResult;
}

// ─── Query Service Interface ──────────────────────────────────

export interface IQueryService {
  /**
   * Full query pipeline:
   * validate → optimize → explain → (await user confirmation) → execute
   */
  prepare(sql: string): Promise<ServiceResult<{
    validation: SQLValidationResult;
    optimization: OptimizationResult;
    queryPlan: QueryPlan;
  }>>;
  execute(sql: string): Promise<ServiceResult<QueryResult>>;
}

// ─── Optimization Service Interface ──────────────────────────

export interface IOptimizationService {
  analyze(sql: string, schema: DatabaseSchema, queryPlan?: QueryPlan): Promise<ServiceResult<OptimizationResult>>;
}

// ─── Query Plan Service Interface ─────────────────────────────

export interface IQueryPlanService {
  parse(rawPlanOutput: string): QueryPlan;
  explain(plan: QueryPlan, schema: DatabaseSchema): Promise<ServiceResult<string>>;
}

// ─── Conversation Service Interface ──────────────────────────

export interface IConversationService {
  createConversation(userId: string, databaseName: string): Promise<ServiceResult<Conversation>>;
  getConversations(userId: string): Promise<ServiceResult<Conversation[]>>;
  getConversation(id: string): Promise<ServiceResult<Conversation>>;
  addMessage(conversationId: string, message: Omit<ConversationMessage, 'id' | 'createdAt'>): Promise<ServiceResult<ConversationMessage>>;
  deleteConversation(id: string): Promise<ServiceResult<void>>;
}

// ─── Export Service Interface ─────────────────────────────────

export type ExportFormat = 'csv' | 'excel' | 'pdf' | 'png';

export interface IExportService {
  export(format: ExportFormat, data: QueryResult, title?: string): Promise<ServiceResult<Blob>>;
}
