/**
 * Adapter Registry — SQL Sensi V2
 *
 * Maps each database engine to a factory for its adapter.
 */

import type { DatabaseEngine, ServiceResult } from '@/src/types';
import { createError } from '@/src/utils/errors';
import type { DatabaseAdapter } from './database-adapter';
import { MysqlAdapter } from './mysql.adapter';
import { PostgresAdapter } from './postgres.adapter';
import { SqliteAdapter } from './sqlite.adapter';

const ADAPTER_FACTORIES: Partial<Record<DatabaseEngine, () => DatabaseAdapter>> = {
  sqlite: () => new SqliteAdapter(),
  mysql: () => new MysqlAdapter(),
  postgresql: () => new PostgresAdapter(),
};

export function isEngineSupported(engine: DatabaseEngine): boolean {
  return engine in ADAPTER_FACTORIES;
}

/** Creates a new, disconnected adapter for the engine. */
export function createAdapter(engine: DatabaseEngine): ServiceResult<DatabaseAdapter> {
  const factory = ADAPTER_FACTORIES[engine];
  if (!factory) {
    return {
      success: false,
      error: createError('DATABASE_ERROR', `The ${engine} engine is not supported yet.`),
    };
  }
  return { success: true, data: factory() };
}
