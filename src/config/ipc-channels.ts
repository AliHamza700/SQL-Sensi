export const IPC_CHANNELS = {
  // App context
  APP_GET_VERSION: 'app:getVersion',
  APP_GET_PLATFORM: 'app:getPlatform',

  // Auth context
  AUTH_REGISTER: 'auth:register',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_VALIDATE: 'auth:validate',

  // User role management (V2) — admin only
  USERS_LIST: 'users:list',
  USERS_SET_ROLE: 'users:setRole',

  // Database context
  DB_VALIDATE: 'database:validate',
  DB_CONNECT: 'database:connect',
  DB_QUERY: 'database:query',
  DB_DISCONNECT: 'database:disconnect',

  // Connections context (V2)
  CONNECTIONS_LIST: 'connections:list',
  CONNECTIONS_SAVE: 'connections:save',
  CONNECTIONS_DELETE: 'connections:delete',
  CONNECTIONS_TEST: 'connections:test',
  CONNECTIONS_CONNECT: 'connections:connect',
  CONNECTIONS_CONNECT_FILE: 'connections:connectFile',
  CONNECTIONS_DISCONNECT: 'connections:disconnect',
  CONNECTIONS_GET_ACTIVE: 'connections:getActive',
  CONNECTIONS_SECRET_STORAGE: 'connections:secretStorageAvailable',
  /** main → renderer event */
  CONNECTIONS_CHANGED: 'connections:changed',

  // Schema context
  SCHEMA_GET: 'schema:get',

  // Policy context (V2 Phase 6)
  POLICY_GET: 'policy:get',
  POLICY_UPDATE: 'policy:update',
  POLICY_AUTHORIZE: 'policy:authorize',

  // Audit context (V2 Phase 7/9) — admin only
  AUDIT_LIST: 'audit:list',
  AUDIT_PRUNE: 'audit:prune',

  // History context
  HISTORY_LIST: 'history:list',
  HISTORY_CREATE: 'history:create',
  HISTORY_GET: 'history:get',
  HISTORY_ADD_MSG: 'history:addMessage',
  HISTORY_DELETE: 'history:delete',
  HISTORY_UPDATE: 'history:update',

  // Export context
  EXPORT_DATA: 'export:data',
  EXPORT_IMAGE: 'export:image'
} as const;
