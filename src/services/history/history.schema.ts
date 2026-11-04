/**
 * history.db schema — SQL Sensi
 *
 * Version 0 is the Version 1 schema. Later versions are additive migrations,
 * applied in order and tracked with PRAGMA user_version. Before migrating an
 * existing database, HistoryService writes a backup copy next to it.
 */

export const HISTORY_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  query_result_json TEXT,
  optimization_result_json TEXT,
  plan_explanation_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
`;

export interface HistoryMigration {
  version: number;
  description: string;
  sql: string;
}

/** Ordered migrations; the database ends at the last version */
export const HISTORY_MIGRATIONS: HistoryMigration[] = [
  {
    version: 1,
    description: 'Link conversations and messages to the database connection (V2 Phase 5)',
    sql: `
      ALTER TABLE conversations ADD COLUMN connection_id TEXT;
      ALTER TABLE conversations ADD COLUMN engine TEXT;
      ALTER TABLE conversations ADD COLUMN connection_label TEXT;
      ALTER TABLE messages ADD COLUMN connection_id TEXT;
      ALTER TABLE messages ADD COLUMN ai_meta_json TEXT;
      CREATE INDEX IF NOT EXISTS idx_conversations_connection ON conversations(connection_id);
    `,
  },
  {
    version: 2,
    description:
      'Scope conversations to the owning user (bugfix: history was global and leaked across accounts). ' +
      'Pre-existing rows get user_id = NULL and are no longer shown to any specific account.',
    sql: `
      ALTER TABLE conversations ADD COLUMN user_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
    `,
  },
];

export const HISTORY_SCHEMA_VERSION = HISTORY_MIGRATIONS[HISTORY_MIGRATIONS.length - 1].version;
