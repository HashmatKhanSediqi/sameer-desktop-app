export type IpcErrorCode =
  | 'INTERNAL_ERROR'
  | 'INVALID_REQUEST'
  | 'DATABASE_ERROR'
  | 'NOT_AUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'INVALID_CREDENTIALS';

export type TransactionType = 'CASH_IN' | 'CASH_OUT';

export interface AppPaths {
  userData: string;
  database: string;
  images: string;
  logs: string;
  backups: string;
  cache: string;
  config: string;
}

export interface AppStatus {
  version: string;
  databaseConnected: boolean;
  databasePath: string;
  databaseExists: boolean;
}

export interface AppGetPathsResponse {
  ok: true;
  data: AppPaths;
}

export interface AppGetStatusResponse {
  ok: true;
  data: AppStatus;
}

export interface IpcErrorResponse {
  ok: false;
  errorCode: IpcErrorCode;
  message?: string;
}

export type AppGetPathsResult = AppGetPathsResponse | IpcErrorResponse;
export type AppGetStatusResult = AppGetStatusResponse | IpcErrorResponse;

/** Placeholder types for future phases — defined now for IPC contract stability */

export interface AuthLoginRequest {
  username: string;
  password: string;
}

export interface AuthLoginResponse {
  ok: true;
  data: { sessionId: string; username: string };
}

export interface TransactionsUpdateRequest {
  sessionId: string;
  transactionId: number;
  type: TransactionType;
  amount: string;
  currencyCode: string;
  transactionDate?: string;
  note?: string;
}

export interface TransactionsUpdateResponse {
  ok: true;
  data: { success: true };
}

export const IPC_CHANNELS = {
  APP_GET_PATHS: 'app:getPaths',
  APP_GET_STATUS: 'app:getStatus',
  AUTH_LOGIN: 'auth:login',
  AUTH_LOGOUT: 'auth:logout',
  AUTH_CHECK_SESSION: 'auth:checkSession',
  CUSTOMERS_LIST: 'customers:list',
  CUSTOMERS_GET: 'customers:get',
  CUSTOMERS_CREATE: 'customers:create',
  CUSTOMERS_UPDATE: 'customers:update',
  CUSTOMERS_DELETE: 'customers:delete',
  TRANSACTIONS_CREATE: 'transactions:create',
  TRANSACTIONS_UPDATE: 'transactions:update',
  TRANSACTIONS_DELETE: 'transactions:delete',
  TRANSACTIONS_LIST: 'transactions:list',
  REPORTS_GENERATE: 'reports:generate',
  IMPORT_PARSE: 'import:parse',
  IMPORT_COMMIT: 'import:commit',
  BACKUP_CREATE: 'backup:create',
  BACKUP_VALIDATE: 'backup:validate',
  RESTORE_EXECUTE: 'restore:execute',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
} as const;

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const ALLOWED_IPC_CHANNELS: readonly IpcChannel[] = Object.values(IPC_CHANNELS);
