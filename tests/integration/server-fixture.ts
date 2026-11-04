/**
 * Real-server test setup — SQL Sensi integration tests
 *
 * Integration tests run only when a DISPOSABLE test database is configured:
 *   SQLSENSI_TEST_PG_HOST, _PORT, _DATABASE, _USER, _PASSWORD   (PostgreSQL)
 *   SQLSENSI_TEST_MYSQL_HOST, _PORT, _DATABASE, _USER, _PASSWORD (MySQL)
 *   SQLSENSI_TEST_*_TLS=1 to require TLS
 * The account needs CREATE/DROP on that database: tests create and drop their own tables.
 * Never point these at a database with real data.
 */

import type { ServerConnectionConfig } from '../../src/types';

export function serverTestConfig(engine: 'mysql' | 'postgresql'): ServerConnectionConfig | null {
  const prefix = engine === 'mysql' ? 'SQLSENSI_TEST_MYSQL_' : 'SQLSENSI_TEST_PG_';
  const env = (name: string) => process.env[prefix + name];
  const host = env('HOST');
  const database = env('DATABASE');
  const user = env('USER');
  if (!host || !database || !user) return null;

  return {
    engine,
    host,
    port: Number(env('PORT') ?? (engine === 'mysql' ? 3306 : 5432)),
    database,
    user,
    password: env('PASSWORD') ?? '',
    tls: { enabled: env('TLS') === '1' },
  };
}

/** Unique table-name prefix so parallel or leftover runs never collide */
export function tablePrefix(): string {
  return `sqlsensi_it_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}
