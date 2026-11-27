/**
 * Shared Domain Types — SQL Sensi
 *
 * These types are the single source of truth for data structures
 * across all layers: services, UI components, and IPC.
 *
 * Architecture rule: All services must use these types.
 * Never define ad-hoc types inline in components.
 */

// ─── Database Schema Types ────────────────────────────────────

export interface DatabaseSchema {
  databaseName: string;
  tables: TableSchema[];
  relationships: RelationshipSchema[];
  indexes: IndexSchema[];
  views: ViewSchema[];
}

export interface DatabaseValidationResult {
  valid: boolean;
  fileSizeInBytes?: number;
  error?: string;
}

// ─── AI Types ──────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  queryResult?: QueryResult;
  optimizationResult?: SQLOptimizationResult;
  queryPlan?: QueryPlan;
  isOptimizing?: boolean;
  isExplaining?: boolean;
}

/**
 * What kind of answer the assistant gave:
 *  - sql:     a read-only query grounded in the connected database's schema
 *  - general: an answer from general database knowledge (no SQL is run)
 *  - clarify: the question can't be answered from the schema yet; a question back to the user
 */
export type AiAnswerMode = 'sql' | 'general' | 'clarify';

/** Structured, validated metadata about an assistant answer (stored with the message) */
export interface AiAnswerMeta {
  mode: AiAnswerMode;
  /** True when the answer is based on the connected database's schema */
  grounded: boolean;
  engine: DatabaseEngine;
  connectionId: ConnectionId;
  sql?: string;
  explanation: string;
  assumptions: string[];
  tablesUsed: string[];
  /** Checks that failed but did not block (e.g. possible wrong-dialect syntax) */
  warnings: string[];
}

export interface AIResponse {
  /** Text shown in chat (explanation, general answer or clarifying question) */
  message: string;
  /** Present only when the SQL passed validation and may be run */
  sql?: string;
  isAmbiguous: boolean;
  meta: AiAnswerMeta;
}

export interface SQLOptimizationResult {
  issues: string[];
  suggestions: string[];
  optimizedSql: string;
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  primaryKeys: string[];
  foreignKeys: ForeignKeySchema[];
  rowCount?: number;
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
}

export interface ForeignKeySchema {
  columnName: string;
  referencedTable: string;
  referencedColumn: string;
}

export interface RelationshipSchema {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

export interface IndexSchema {
  name: string;
  tableName: string;
  columns: string[];
  unique: boolean;
}

export interface ViewSchema {
  name: string;
  sql?: string;
}

// ─── Query Types ──────────────────────────────────────────────

export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
}

// ─── Database Engine Types (Version 2) ────────────────────────
// Shared contract for the SQLite / MySQL / PostgreSQL adapters (architect.md §3).
// DatabaseSchema and QueryResult above remain the common schema/result shapes.

export type DatabaseEngine = 'sqlite' | 'mysql' | 'postgresql';

/** Stable, secret-free identifier of a saved connection profile */
export type ConnectionId = string;

/** Identifies which database a request, conversation or result belongs to */
export interface ConnectionRef {
  connectionId: ConnectionId;
  engine: DatabaseEngine;
  /** Display label only — never contains credentials */
  label: string;
}

/** What an engine adapter supports; the UI and policy layer read this instead of assuming */
export interface DatabaseCapabilities {
  transactions: boolean;
  explainPlan: boolean;
  /** Driver reports affected-row counts for INSERT/UPDATE/DELETE */
  affectedRowCounts: boolean;
  queryTimeout: boolean;
  cancellation: boolean;
  /** `?` for SQLite/MySQL, `$1` for PostgreSQL */
  placeholderStyle: 'question' | 'dollar-numbered';
}

/** Settings for opening a local SQLite file */
export interface SqliteConnectionConfig {
  engine: 'sqlite';
  filePath: string;
}

/** Settings for a MySQL or PostgreSQL server */
export interface ServerConnectionConfig {
  engine: 'mysql' | 'postgresql';
  host: string;
  port: number;
  database: string;
  user: string;
  /** Held in main-process memory only; never log it or send it to the renderer or AI */
  password: string;
  /** TLS with certificate verification; `ca` (PEM) for private or self-signed servers */
  tls: { enabled: boolean; ca?: string };
}

export type ConnectionConfig = SqliteConnectionConfig | ServerConnectionConfig;

/** Secret-free summary of the active connection, safe to show in the UI */
export interface ConnectionStatus {
  connected: boolean;
  engine: DatabaseEngine | null;
  /** Display label, e.g. the SQLite file name */
  label: string | null;
}

/** A saved connection as the UI sees it — never contains a password */
export interface ConnectionProfile {
  id: ConnectionId;
  engine: DatabaseEngine;
  label: string;
  /** SQLite only */
  filePath?: string;
  /** Server engines only */
  host?: string;
  port?: number;
  database?: string;
  user?: string;
  tls?: { enabled: boolean };
  /** A password is stored (encrypted) in the OS-backed secret store */
  hasSavedPassword: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
}

/** What the renderer sends to create or update a saved connection */
export type ConnectionProfileInput =
  | { id?: ConnectionId; engine: 'sqlite'; label: string; filePath: string }
  | {
      id?: ConnectionId;
      engine: 'mysql' | 'postgresql';
      label: string;
      host: string;
      port: number;
      database: string;
      user: string;
      tls: { enabled: boolean };
      /** Omit to keep an already-saved password */
      password?: string;
      /** Store the password encrypted; false never writes it anywhere */
      savePassword: boolean;
    };

export interface ConnectionTestResult {
  label: string;
  /** Tables the account can see */
  tableCount: number;
}

/** A read request bound to the connection it was generated or reviewed for */
export interface SqlRequest {
  sql: string;
  params?: unknown[];
  connectionId: ConnectionId;
  engine: DatabaseEngine;
}

export interface SQLValidationResult {
  valid: boolean;
  statementType?: string;
  errors: string[];
  warnings: string[];
}

export interface QueryPlanNode {
  id: number;
  parentId: number;
  detail: string;
  operation?: string;
}

export interface QueryPlan {
  nodes: QueryPlanNode[];
  rawOutput: string;
  humanExplanation?: string;
  performanceIssues?: string[];
  suggestions?: string[];
}

// ─── AI Types ─────────────────────────────────────────────────

export interface SQLGenerationInput {
  question: string;
  schema: DatabaseSchema;
  conversationContext: ConversationMessage[];
}

export interface SQLGenerationResult {
  sql: string;
  confidence: number;
  explanation?: string;
}

export interface ClarificationInput {
  question: string;
  schema: DatabaseSchema;
  conversationContext: ConversationMessage[];
}

export interface ClarificationResult {
  needsClarification: boolean;
  clarificationPrompt?: string;
  options?: string[];
}

export interface SQLExplanationInput {
  sql: string;
  result?: QueryResult;
  question?: string;
}

export interface SQLExplanationResult {
  explanation: string;
}

export interface OptimizationInput {
  sql: string;
  schema: DatabaseSchema;
  queryPlan?: QueryPlan;
}

export interface OptimizationResult {
  issues: OptimizationIssue[];
  optimizedSql?: string;
  indexSuggestions: IndexSuggestion[];
}

export interface OptimizationIssue {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
}

export interface IndexSuggestion {
  tableName: string;
  columns: string[];
  reason: string;
  createStatement: string; // For display only — never auto-executed in MVP
}

export interface QueryPlanInput {
  sql: string;
  schema: DatabaseSchema;
  planNodes: QueryPlanNode[];
}

export interface QueryPlanExplanation {
  humanReadable: string;
  performanceIssues: string[];
  suggestions: string[];
}

// ─── Conversation Types ───────────────────────────────────────

export interface Conversation {
  id: string;
  userId: string;
  /** Display name of the database the conversation is about ('Unknown database' for pre-V2 history) */
  databaseName: string;
  /** Connection the conversation belongs to; null for conversations created before Version 2 */
  connectionId: ConnectionId | null;
  engine: DatabaseEngine | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ConversationMessage[];
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  executedSql?: string;
  queryResult?: QueryResult;
  optimizationResult?: SQLOptimizationResult;
  queryPlan?: QueryPlan;
  isOptimizing?: boolean;
  isExplaining?: boolean;
  /** Connection the SQL was generated for */
  connectionId?: ConnectionId;
  /** Structured assistant metadata (mode, grounding, assumptions, warnings) */
  aiMeta?: AiAnswerMeta;
  createdAt: string;
}

// ─── Auth Types ───────────────────────────────────────────────

/** Safe User representation exposed to UI and external layers (never contains password/hash) */
/**
 * Account role (V2 Phase 6). Exactly one `admin` is designated (the first
 * registered account); everyone else is `standard`. Writes are an admin-only,
 * policy-gated capability — a standard user can never run a write, whatever the
 * UI shows. Enforced in the main process, never in the renderer.
 */
export type UserRole = 'admin' | 'standard';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
}

/** Internal User record stored in the authentication SQLite database */
export interface UserRecord {
  id: string;
  email: string;
  role?: UserRole;
  passwordHash?: string;
  password_hash?: string;
  salt: string;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
  lastLoginAt?: string | null;
  last_login_at?: string | null;
}

/** Active session entity representing an authenticated client */
export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: string;
  createdAt: string;
  isActive: boolean;
}

/** Internal Session record stored in the authentication SQLite database */
export interface SessionRecord {
  id: string;
  userId?: string;
  user_id?: string;
  token: string;
  expiresAt?: string;
  expires_at?: string;
  createdAt?: string;
  created_at?: string;
  isActive?: number | boolean;
  is_active?: number;
  lastActiveAt?: string;
  last_active_at?: string;
}

/** Input DTO for user registration */
export interface RegisterInput {
  email: string;
  password: string;
}

/** Input DTO for user authentication */
export interface LoginInput {
  email: string;
  password: string;
}

/** Composite result returned upon successful registration or login */
export interface AuthResult {
  user: User;
  session: Session;
}

/** Client-side state managed by Auth context or hook */
export interface AuthState {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

// ─── Error Types ──────────────────────────────────────────────

export type AppErrorCode =
  | 'AUTH_ERROR'
  | 'DATABASE_ERROR'
  | 'INVALID_DATABASE'
  | 'SCHEMA_ERROR'
  | 'AI_ERROR'
  | 'SQL_VALIDATION_ERROR'
  | 'SQL_EXECUTION_ERROR'
  | 'EXPORT_ERROR'
  | 'NETWORK_ERROR'
  /** The active connection changed since the request was prepared */
  | 'CONNECTION_CHANGED'
  /** A saved server connection has no stored password; ask the user for it */
  | 'PASSWORD_REQUIRED'
  /** The caller is authenticated but lacks the role for this action (V2 Phase 6) */
  | 'NOT_AUTHORIZED'
  /** The action is blocked by the administrator's write policy (V2 Phase 6) */
  | 'POLICY_DENIED'
  | 'UNKNOWN_ERROR';

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: string;
}

// ─── Service Result ───────────────────────────────────────────

/** Wraps any service return in a discriminated union. Never throw across service boundaries. */
export type ServiceResult<T> =
  | { success: true; data: T }
  | { success: false; error: AppError };


// ─── Roles & write policy (V2 Phase 6) ────────────────────────

/**
 * The classification of a single SQL statement for policy decisions.
 * `read` is always allowed (subject to the engine's read-only guarantees);
 * `insert`/`update`/`delete` are the data writes; `create` is an additive
 * schema write (CREATE TABLE / INDEX / VIEW only) used to design a schema from
 * scratch, and is opt-in like any other write; `ddl` covers
 * CREATE/ALTER/DROP and other schema or destructive statements, which are out
 * of normal V2 scope; `other` is anything that could not be classified and is
 * refused rather than guessed. Produced by a heuristic, not a real parser.
 */
export type SqlOperation = 'read' | 'insert' | 'update' | 'delete' | 'create' | 'ddl' | 'other';

/** The write operations an administrator may individually permit. */
export type WriteOperation = 'insert' | 'update' | 'delete' | 'create';

/** How to treat an UPDATE/DELETE with no detectable WHERE clause. */
export type BroadMutationHandling = 'block' | 'confirm' | 'allow';

/**
 * Administrator-configurable safety policy (V2 Phase 6). Stored as
 * `policy.json` in `APP_DATA_DIR` — it holds no secrets. Application policy can
 * only ever be more restrictive than the database account; it can never grant a
 * privilege the server account does not already have.
 */
export interface WritePolicy {
  /** Bumped on every saved change; an approval token binds to this (architect.md). */
  version: number;
  /** Master switch. Writes are denied until an administrator turns this on. */
  enableWrites: boolean;
  /** Which write operations are permitted when writes are enabled. */
  allowedOperations: WriteOperation[];
  /** Show the generated SQL and wait for the user before any write runs. */
  requireSqlPreview: boolean;
  /** Require an explicit confirmation step for every write. */
  requireWriteConfirmation: boolean;
  /** What to do with an UPDATE/DELETE that has no WHERE clause. */
  broadMutationHandling: BroadMutationHandling;
  /** Prefer wrapping a write in a transaction where the engine supports it. */
  useTransaction: boolean;
  /** Hard cap on rows returned by a read (not yet enforced in the engine). */
  maxRows: number;
  /** Per-statement timeout in milliseconds. */
  statementTimeoutMs: number;
  /** Audit-log settings. */
  audit: {
    enabled: boolean;
    retentionDays: number;
  };
  /** ISO timestamp of the last change, and who made it (for display only). */
  updatedAt: string;
  updatedByUserId: string | null;
}

/**
 * The result of checking one SQL statement against the current identity and
 * policy. A denial is a normal decision (`allowed: false` with a `reason`), not
 * a thrown error. Computed in trusted main-process code and re-checked
 * immediately before execution in Phase 7.
 */
export interface PolicyDecision {
  allowed: boolean;
  operation: SqlOperation;
  /** The policy version this decision was made against. */
  policyVersion: number;
  requiresPreview: boolean;
  requiresConfirmation: boolean;
  /** A broad UPDATE/DELETE that the policy allows only with stronger confirmation. */
  requiresStrongConfirmation: boolean;
  /** Present when `allowed` is false. */
  reason?: string;
}


// ─── Controlled writes (V2 Phase 7) ───────────────────────────

/** The low-level result of a write statement from an adapter. */
export interface WriteResult {
  /** Rows affected, or null when the driver cannot report it. */
  affectedRows: number | null;
  executionTimeMs: number;
  /** True when the write was committed (false means it was rolled back). */
  committed: boolean;
}

/**
 * The outcome of a write request through the WriteService. A write that the
 * policy allows only after confirmation returns `confirmation_required` with the
 * decision (so the UI can preview and confirm) and runs nothing; a second call
 * with `confirmed: true` executes it.
 */
export type WriteExecution =
  | { status: 'confirmation_required'; decision: PolicyDecision }
  | {
      status: 'executed';
      operation: SqlOperation;
      affectedRows: number | null;
      executionTimeMs: number;
      committed: boolean;
    };

/** Outcome recorded in the audit log. */
export type AuditOutcome = 'success' | 'failure' | 'denied';

/**
 * One safe audit event. It carries NO row values and NO raw SQL — only metadata
 * and a SHA-256 of the statement text for correlation (rules.md §4: never store
 * full sensitive row data in audit records).
 */
export interface AuditEvent {
  userId: string | null;
  connectionId: string | null;
  engine: DatabaseEngine | null;
  /** The SQL operation of a write attempt, or `policy_change` for a safety-policy save. */
  operation: AuditOperation;
  /** Best-effort target table, for display; not a security control. */
  tableName: string | null;
  outcome: AuditOutcome;
  affectedRows: number | null;
  errorCode: string | null;
  /** SHA-256 hex of the normalized statement text. Never the statement itself. Empty for a policy change. */
  sqlSha256: string;
  policyVersion: number;
  /**
   * Human-readable summary of what changed, for a `policy_change` event
   * (e.g. "Write operations: off → on; Permitted operations: +CREATE").
   * Settings only — never SQL or row data. Null for SQL writes.
   */
  details?: string | null;
}

/** What an audit event records: a SQL write attempt, or a change to the safety policy. */
export type AuditOperation = SqlOperation | 'policy_change';

/** A persisted audit event. */
export interface AuditRecord extends AuditEvent {
  id: string;
  createdAt: string;
  /**
   * Who ran the statement, resolved from `userId` when the log is read (not
   * stored in audit.db). `null` when there was no signed-in user, or the
   * account has since been deleted.
   */
  userEmail?: string | null;
  userRole?: UserRole | null;
}


