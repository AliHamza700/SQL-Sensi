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
  databaseName: string;
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
  queryResult?: Pick<QueryResult, 'rowCount' | 'executionTimeMs'>;
  optimizationResult?: OptimizationResult;
  queryPlan?: QueryPlan;
  createdAt: string;
}

// ─── Auth Types ───────────────────────────────────────────────

/** Safe User representation exposed to UI and external layers (never contains password/hash) */
export interface User {
  id: string;
  email: string;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
}

/** Internal User record stored in the authentication SQLite database */
export interface UserRecord {
  id: string;
  email: string;
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
