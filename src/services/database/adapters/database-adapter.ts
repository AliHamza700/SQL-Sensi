/**
 * DatabaseAdapter — SQL Sensi V2
 *
 * Contract every database engine implements (architect.md §3).
 * Engine-specific SQL, metadata queries, result mapping and EXPLAIN logic
 * live inside the adapter. DatabaseService owns the single active adapter.
 *
 * Runs in the Electron MAIN process only — never expose an adapter to the renderer.
 * Write and transaction methods are added with controlled writes (Phase 7).
 */

import type {
  ConnectionConfig,
  DatabaseCapabilities,
  DatabaseEngine,
  DatabaseSchema,
  DatabaseValidationResult,
  QueryPlan,
  QueryResult,
  ServiceResult,
  WriteResult,
} from '@/src/types';

export interface DatabaseAdapter {
  readonly engine: DatabaseEngine;
  readonly capabilities: DatabaseCapabilities;

  /** Validates and opens the connection. On failure the adapter stays disconnected. */
  connect(config: ConnectionConfig): Promise<ServiceResult<DatabaseValidationResult>>;

  /** Closes the connection. Safe to call when already closed. */
  disconnect(): Promise<void>;

  isConnected(): boolean;

  /** Display label for the UI. Never contains credentials. */
  getLabel(): string | null;

  /** Tables, columns, keys, relationships, indexes and views of the open database */
  getSchema(): Promise<ServiceResult<DatabaseSchema>>;

  /** Runs a read query. Callers must apply SQL policy checks first. */
  executeRead(sql: string, params?: unknown[]): Promise<ServiceResult<QueryResult>>;

  /**
   * Runs a single INSERT/UPDATE/DELETE inside a transaction (committed on
   * success, rolled back on error) and reports the affected-row count where the
   * driver supports it (V2 Phase 7). The caller (WriteService) MUST have
   * authorized the statement against identity and policy first; the adapter is
   * the execution layer, not a policy layer. One statement only.
   */
  executeWrite(sql: string, params?: unknown[]): Promise<ServiceResult<WriteResult>>;

  /** Returns the engine's query plan without executing the statement */
  explain(sql: string): Promise<ServiceResult<QueryPlan>>;
}
