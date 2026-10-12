export const IPC_CHANNELS = {
  // App context
  APP_GET_VERSION: 'app:getVersion',
  APP_GET_PLATFORM: 'app:getPlatform',

  // Auth context
  AUTH_REGISTER: 'auth:register',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_VALIDATE: 'auth:validate',

  // Database context
  DB_VALIDATE: 'database:validate',
  DB_CONNECT: 'database:connect',
  DB_QUERY: 'database:query',
  DB_DISCONNECT: 'database:disconnect',

  // Schema context
  SCHEMA_GET: 'schema:get',

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
