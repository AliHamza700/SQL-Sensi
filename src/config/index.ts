/**
 * Application Configuration — SQL Sensi
 *
 * Single source of truth for all runtime configuration.
 * All values read from environment variables with safe defaults.
 * Never hard-code secrets — use .env.local
 */

export const AppConfig = {
  app: {
    name: process.env.NEXT_PUBLIC_APP_NAME ?? 'SQL Sensi',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? '0.1.0',
    env: (process.env.NODE_ENV ?? 'development') as 'development' | 'production' | 'test',
  },

  ai: {
    /** Active provider. Groq is the only implementation (FR-14); the key is read from GROQ_API_KEY in the main process. */
    provider: 'groq' as const,
    /** Optional model override; empty uses the provider default */
    groqModel: process.env.GROQ_MODEL ?? '',
  },

  auth: {
    jwtSecret: process.env.AUTH_JWT_SECRET ?? '',
    jwtExpiresIn: process.env.AUTH_JWT_EXPIRES_IN ?? '7d',
  },

  database: {
    appDataDir: process.env.APP_DATA_DIR ?? './data',
  },

  query: {
    /** Hard ceiling on returned rows — prevents UI from crashing on large datasets */
    maxRows: parseInt(process.env.QUERY_MAX_ROWS ?? '10000', 10),
    /** Milliseconds before a query is force-cancelled */
    timeoutMs: parseInt(process.env.QUERY_TIMEOUT_MS ?? '30000', 10),
  },

  upload: {
    maxSizeBytes: parseInt(process.env.UPLOAD_MAX_SIZE_BYTES ?? '524288000', 10),
    uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  },
} as const;

/** Type of the config object — use for type-safe config access across the app */
export type AppConfigType = typeof AppConfig;
