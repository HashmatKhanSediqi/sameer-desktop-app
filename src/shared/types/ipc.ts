import type {
  CompanyLogoData,
  CompanyProfile,
  CompanyUpdateInput,
} from './company';
import type {
  CreateCustomerInput,
  Customer,
  CustomerListItem,
  CustomerListQuery,
  CustomerPhotoData,
  SearchCustomerInput,
  UpdateCustomerInput,
} from './customer';
import type {
  CreateCurrencyInput,
  CreateDenominationInput,
  Currency,
  CurrencyDenomination,
} from './currency';
import type { AppSettings, SettingsUpdateInput } from './settings';
import type { GeneratedReport, ReportGenerateInput, ReportProgress } from './report';
import type { ImportCommitData, ImportParseData, ParsedCustomer, ParsedTransaction } from './import';
import type {
  BackupCreateResultData,
  BackupProgress,
  BackupValidateData,
  RestoreExecuteData,
} from './backup';
import type {
  CreateTransactionInput,
  CustomerTransactionSummary,
  GlobalCurrencyTotal,
  Transaction,
  TransactionListResult,
  TransactionType,
  UpdateTransactionInput,
} from './transaction';
import type { CreateTransferInput, TransferResult } from './transfer';
import type { UpdateStatusSnapshot } from './update';
import type {
  CreateTellerTransactionInput,
  OpenTellerSessionInput,
  TellerDashboard,
  TellerDenomination,
  TellerLongBook,
  TellerReconciliation,
  TellerSession,
  TellerTally,
  TellerTransaction,
  TellerTransactionListQuery,
  TellerTransactionListResult,
} from './teller';

export type { TransactionType };

export type IpcErrorCode =
  | 'INTERNAL_ERROR'
  | 'INVALID_REQUEST'
  | 'DATABASE_ERROR'
  | 'DATABASE_CORRUPTED'
  | 'NOT_AUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'VALIDATION_ERROR'
  | 'CUSTOMER_NOT_FOUND'
  | 'INVALID_PHOTO'
  | 'TRANSACTION_NOT_FOUND'
  | 'INVALID_TRANSACTION_TYPE'
  | 'INVALID_CURRENCY'
  | 'REPORT_NO_DATA'
  | 'REPORT_WRITE_FAILED'
  | 'FONT_MISSING'
  | 'INVALID_DATE_RANGE'
  | 'IMPORT_FAILED'
  | 'INVALID_BACKUP'
  | 'BACKUP_CORRUPTED'
  | 'BACKUP_VERSION_MISMATCH'
  | 'RESTORE_CONFIRM_REQUIRED'
  | 'BACKUP_WRITE_FAILED'
  | 'RESTORE_FAILED'
  | 'RECOVERY_FAILED'
  | 'RECOVERY_NOT_CONFIGURED'
  | 'INSUFFICIENT_BALANCE'
  | 'TRANSFER_SAME_CUSTOMER'
  | 'INVALID_COLOR'
  | 'COMPANY_NAME_REQUIRED'
  | 'UPDATE_UNSUPPORTED'
  | 'UPDATE_CHECK_FAILED'
  | 'UPDATE_DOWNLOAD_FAILED'
  | 'UPDATE_NOT_AVAILABLE'
  | 'UPDATE_NOT_READY'
  | 'UPDATE_BACKUP_FAILED'
  | 'UPDATE_INVALID_VERSION'
  | 'CURRENCY_IN_USE'
  | 'CURRENCY_NAME_INVALID'
  | 'DENOMINATION_EXISTS'
  | 'DENOMINATION_VALUE_INVALID'
  | 'DENOMINATION_IN_USE'
  | 'TELLER_SESSION_REQUIRED'
  | 'TELLER_SESSION_ALREADY_OPEN'
  | 'TELLER_SESSION_NOT_FOUND'
  | 'TELLER_SESSION_CLOSED'
  | 'TELLER_AMOUNT_MISMATCH'
  | 'TELLER_INSUFFICIENT_CASH'
  | 'TELLER_DENOMINATION_INVALID'
  | 'TELLER_OPENING_MISMATCH'
  | 'TELLER_TRANSACTION_NOT_FOUND';

export interface AppPaths {
  userData: string;
  database: string;
  images: string;
  companyImages: string;
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

export interface AuthLoginRequest {
  username: string;
  password: string;
}

export interface AuthLoginSuccessData {
  sessionId: string;
  username: string;
}

export interface AuthLoginSuccessResponse {
  ok: true;
  data: AuthLoginSuccessData;
}

export type AuthLoginResult = AuthLoginSuccessResponse | IpcErrorResponse;

export interface AuthLogoutRequest {
  sessionId: string;
}

export interface AuthLogoutSuccessData {
  success: true;
}

export interface AuthLogoutSuccessResponse {
  ok: true;
  data: AuthLogoutSuccessData;
}

export type AuthLogoutResult = AuthLogoutSuccessResponse | IpcErrorResponse;

export interface AuthCheckSessionRequest {
  sessionId?: string;
}

export interface AuthCheckSessionData {
  valid: boolean;
  username?: string;
}

export interface AuthCheckSessionSuccessResponse {
  ok: true;
  data: AuthCheckSessionData;
}

export type AuthCheckSessionResult = AuthCheckSessionSuccessResponse | IpcErrorResponse;

export interface AuthenticatedRequest {
  sessionId: string;
}

export type CustomersListRequest = AuthenticatedRequest & CustomerListQuery;

export interface CustomersListData {
  customers: CustomerListItem[];
  totals: GlobalCurrencyTotal[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CustomersListSuccessResponse {
  ok: true;
  data: CustomersListData;
}

export type CustomersListResult = CustomersListSuccessResponse | IpcErrorResponse;

export type CustomersSearchRequest = AuthenticatedRequest & SearchCustomerInput & CustomerListQuery;

export type CustomersSearchResult = CustomersListResult;

export type CustomersGetRequest = AuthenticatedRequest & { id: number };

export interface CustomersGetSuccessResponse {
  ok: true;
  data: Customer;
}

export type CustomersGetResult = CustomersGetSuccessResponse | IpcErrorResponse;

export type CustomersCreateRequest = AuthenticatedRequest & CreateCustomerInput;

export interface CustomersCreateSuccessResponse {
  ok: true;
  data: Customer;
}

export type CustomersCreateResult = CustomersCreateSuccessResponse | IpcErrorResponse;

export type CustomersUpdateRequest = AuthenticatedRequest & UpdateCustomerInput;

export type CustomersUpdateResult = CustomersCreateResult;

export type CustomersDeleteRequest = AuthenticatedRequest & { id: number };

export interface CustomersDeleteSuccessResponse {
  ok: true;
  data: { success: true };
}

export type CustomersDeleteResult = CustomersDeleteSuccessResponse | IpcErrorResponse;

export type CustomersGetPhotoRequest = AuthenticatedRequest & { id: number };

export interface CustomersGetPhotoSuccessResponse {
  ok: true;
  data: CustomerPhotoData | null;
}

export type CustomersGetPhotoResult = CustomersGetPhotoSuccessResponse | IpcErrorResponse;

export type CurrenciesListRequest = AuthenticatedRequest & { includeInactive?: boolean };

export interface CurrenciesListSuccessResponse {
  ok: true;
  data: { currencies: Currency[] };
}

export type CurrenciesListResult = CurrenciesListSuccessResponse | IpcErrorResponse;

export type CurrenciesCreateRequest = AuthenticatedRequest & CreateCurrencyInput;

export interface CurrenciesCreateSuccessResponse {
  ok: true;
  data: { currency: Currency };
}

export type CurrenciesCreateResult = CurrenciesCreateSuccessResponse | IpcErrorResponse;

export type CurrenciesDeactivateRequest = AuthenticatedRequest & { code: string };

export interface CurrenciesDeactivateSuccessResponse {
  ok: true;
  data: { currency: Currency };
}

export type CurrenciesDeactivateResult = CurrenciesDeactivateSuccessResponse | IpcErrorResponse;

export type CurrenciesReactivateRequest = AuthenticatedRequest & { code: string };

export interface CurrenciesReactivateSuccessResponse {
  ok: true;
  data: { currency: Currency };
}

export type CurrenciesReactivateResult = CurrenciesReactivateSuccessResponse | IpcErrorResponse;

export type CurrenciesDeleteRequest = AuthenticatedRequest & { code: string };

export interface CurrenciesDeleteSuccessResponse {
  ok: true;
  data: { code: string; deleted: true };
}

export type CurrenciesDeleteResult = CurrenciesDeleteSuccessResponse | IpcErrorResponse;

export type CurrenciesDenominationsListRequest = AuthenticatedRequest & {
  currencyCode: string;
  includeInactive?: boolean;
};
export interface CurrenciesDenominationsListSuccessResponse {
  ok: true;
  data: { denominations: CurrencyDenomination[] };
}
export type CurrenciesDenominationsListResult =
  | CurrenciesDenominationsListSuccessResponse
  | IpcErrorResponse;

export type CurrenciesDenominationsCreateRequest = AuthenticatedRequest & CreateDenominationInput;
export interface CurrenciesDenominationsCreateSuccessResponse {
  ok: true;
  data: { denomination: CurrencyDenomination };
}
export type CurrenciesDenominationsCreateResult =
  | CurrenciesDenominationsCreateSuccessResponse
  | IpcErrorResponse;

export type CurrenciesDenominationsDeactivateRequest = AuthenticatedRequest & { id: number };
export type CurrenciesDenominationsReactivateRequest = AuthenticatedRequest & { id: number };
export type CurrenciesDenominationsDeleteRequest = AuthenticatedRequest & { id: number };
export type CurrenciesDenominationsMutateResult =
  | CurrenciesDenominationsCreateSuccessResponse
  | IpcErrorResponse;
export interface CurrenciesDenominationsDeleteSuccessResponse {
  ok: true;
  data: { id: number; deleted: true };
}
export type CurrenciesDenominationsDeleteResult =
  | CurrenciesDenominationsDeleteSuccessResponse
  | IpcErrorResponse;

export type TransactionsListRequest = AuthenticatedRequest & {
  customerId: number;
  page?: number;
  pageSize?: number;
};

export interface TransactionsListSuccessResponse {
  ok: true;
  data: TransactionListResult;
}

export type TransactionsListResult = TransactionsListSuccessResponse | IpcErrorResponse;

export type TransactionsCreateRequest = AuthenticatedRequest & CreateTransactionInput;

export interface TransactionsCreateSuccessResponse {
  ok: true;
  data: { success: true; transactionId: number; transaction: Transaction };
}

export type TransactionsCreateResult = TransactionsCreateSuccessResponse | IpcErrorResponse;

export type TransactionsUpdateRequest = AuthenticatedRequest & Omit<UpdateTransactionInput, 'id'> & {
  transactionId: number;
};

export interface TransactionsUpdateSuccessResponse {
  ok: true;
  data: { success: true; transaction: Transaction };
}

export type TransactionsUpdateResult = TransactionsUpdateSuccessResponse | IpcErrorResponse;

export type TransactionsDeleteRequest = AuthenticatedRequest & { transactionId: number };

export interface TransactionsDeleteSuccessResponse {
  ok: true;
  data: { success: true };
}

export type TransactionsDeleteResult = TransactionsDeleteSuccessResponse | IpcErrorResponse;

export type TransactionsSummaryRequest = AuthenticatedRequest & { customerId: number };

export interface TransactionsSummarySuccessResponse {
  ok: true;
  data: CustomerTransactionSummary;
}

export type TransactionsSummaryResult = TransactionsSummarySuccessResponse | IpcErrorResponse;

export type SettingsGetRequest = Record<string, never>;

export interface SettingsGetSuccessResponse {
  ok: true;
  data: AppSettings;
}

export type SettingsGetResult = SettingsGetSuccessResponse | IpcErrorResponse;

export type SettingsUpdateRequest = SettingsUpdateInput & { sessionId?: string };

export interface SettingsUpdateSuccessResponse {
  ok: true;
  data: AppSettings;
}

export type SettingsUpdateResult = SettingsUpdateSuccessResponse | IpcErrorResponse;

export type ReportsGenerateRequest = AuthenticatedRequest & ReportGenerateInput;

export interface ReportsGenerateSuccessResponse {
  ok: true;
  data: GeneratedReport;
}

export type ReportsGenerateResult = ReportsGenerateSuccessResponse | IpcErrorResponse;

export type { ReportProgress };

export type ImportParseRequest = AuthenticatedRequest & {
  filePath?: string;
};

export interface ImportParseSuccessResponse {
  ok: true;
  data: ImportParseData;
}

export type ImportParseResult = ImportParseSuccessResponse | IpcErrorResponse;

export type ImportCommitRequest = AuthenticatedRequest & {
  validCustomers: ParsedCustomer[];
  validTransactions: ParsedTransaction[];
};

export interface ImportCommitSuccessResponse {
  ok: true;
  data: ImportCommitData;
}

export type ImportCommitResult = ImportCommitSuccessResponse | IpcErrorResponse;

export type ImportDownloadTemplateRequest = AuthenticatedRequest;

export interface ImportDownloadTemplateSuccessResponse {
  ok: true;
  data: { filePath: string; fileName: string };
}

export type ImportDownloadTemplateResult =
  | ImportDownloadTemplateSuccessResponse
  | IpcErrorResponse;

export type BackupCreateRequest = AuthenticatedRequest & {
  destinationPath?: string;
};

export interface BackupCreateSuccessResponse {
  ok: true;
  data: BackupCreateResultData;
}

export type BackupCreateResult = BackupCreateSuccessResponse | IpcErrorResponse;

export type BackupValidateRequest = {
  filePath?: string;
};

export interface BackupValidateSuccessResponse {
  ok: true;
  data: BackupValidateData;
}

export type BackupValidateResult = BackupValidateSuccessResponse | IpcErrorResponse;

export type RestoreExecuteRequest = {
  filePath?: string;
  confirmed: boolean;
};

export interface RestoreExecuteSuccessResponse {
  ok: true;
  data: RestoreExecuteData;
}

export type RestoreExecuteResult = RestoreExecuteSuccessResponse | IpcErrorResponse;

export type { BackupProgress };

export type AuthChangePasswordRequest = AuthenticatedRequest & {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

export interface AuthChangePasswordSuccessResponse {
  ok: true;
  data: { success: true; sessionInvalidated: true };
}

export type AuthChangePasswordResult = AuthChangePasswordSuccessResponse | IpcErrorResponse;

export type AuthSetRecoveryRequest = AuthenticatedRequest & {
  question: string;
  answer: string;
};

export interface AuthRecoveryStatusData {
  configured: boolean;
  question: string | null;
}

export interface AuthSetRecoverySuccessResponse {
  ok: true;
  data: AuthRecoveryStatusData;
}

export type AuthSetRecoveryResult = AuthSetRecoverySuccessResponse | IpcErrorResponse;

export type AuthRecoveryStatusRequest = AuthenticatedRequest;

export interface AuthRecoveryStatusSuccessResponse {
  ok: true;
  data: AuthRecoveryStatusData;
}

export type AuthRecoveryStatusResult = AuthRecoveryStatusSuccessResponse | IpcErrorResponse;

export interface AuthRecoveryPromptRequest {
  username: string;
}

export interface AuthRecoveryPromptSuccessResponse {
  ok: true;
  data: { question: string };
}

export type AuthRecoveryPromptResult = AuthRecoveryPromptSuccessResponse | IpcErrorResponse;

export interface AuthRecoverPasswordRequest {
  username: string;
  answer: string;
  newPassword: string;
  confirmPassword: string;
}

export interface AuthRecoverPasswordSuccessResponse {
  ok: true;
  data: { success: true };
}

export type AuthRecoverPasswordResult = AuthRecoverPasswordSuccessResponse | IpcErrorResponse;

export type CompanyGetRequest = AuthenticatedRequest;

export interface CompanyGetSuccessResponse {
  ok: true;
  data: CompanyProfile;
}

export type CompanyGetResult = CompanyGetSuccessResponse | IpcErrorResponse;

export type CompanyUpdateRequest = AuthenticatedRequest & CompanyUpdateInput;

export type CompanyUpdateResult = CompanyGetResult;

export type CompanyGetLogoRequest = AuthenticatedRequest;

export interface CompanyGetLogoSuccessResponse {
  ok: true;
  data: CompanyLogoData | null;
}

export type CompanyGetLogoResult = CompanyGetLogoSuccessResponse | IpcErrorResponse;

export type TransfersCreateRequest = AuthenticatedRequest & CreateTransferInput;

export interface TransfersCreateSuccessResponse {
  ok: true;
  data: TransferResult;
}

export type TransfersCreateResult = TransfersCreateSuccessResponse | IpcErrorResponse;

export type UpdateGetStatusRequest = AuthenticatedRequest;
export type UpdateCheckRequest = AuthenticatedRequest;
export type UpdateDownloadRequest = AuthenticatedRequest;
export type UpdateInstallRequest = AuthenticatedRequest;

export interface UpdateStatusSuccessResponse {
  ok: true;
  data: UpdateStatusSnapshot;
}

export type UpdateGetStatusResult = UpdateStatusSuccessResponse | IpcErrorResponse;
export type UpdateCheckResult = UpdateStatusSuccessResponse | IpcErrorResponse;
export type UpdateDownloadResult = UpdateStatusSuccessResponse | IpcErrorResponse;
export type UpdateInstallResult = UpdateStatusSuccessResponse | IpcErrorResponse;

export type TellerDenominationsListRequest = AuthenticatedRequest & { currencyCode?: string };
export interface TellerDenominationsListSuccessResponse {
  ok: true;
  data: { denominations: TellerDenomination[] };
}
export type TellerDenominationsListResult = TellerDenominationsListSuccessResponse | IpcErrorResponse;

export type TellerSessionCurrentRequest = AuthenticatedRequest;
export interface TellerSessionCurrentSuccessResponse {
  ok: true;
  data: { session: TellerSession | null };
}
export type TellerSessionCurrentResult = TellerSessionCurrentSuccessResponse | IpcErrorResponse;

export type TellerSessionOpenRequest = AuthenticatedRequest & OpenTellerSessionInput;
export interface TellerSessionOpenSuccessResponse {
  ok: true;
  data: { session: TellerSession };
}
export type TellerSessionOpenResult = TellerSessionOpenSuccessResponse | IpcErrorResponse;

export type TellerSessionCloseRequest = AuthenticatedRequest & { tellerSessionId: number };
export type TellerSessionCloseResult = TellerSessionOpenResult;

export type TellerTransactionsCreateRequest = AuthenticatedRequest & CreateTellerTransactionInput;
export interface TellerTransactionsCreateSuccessResponse {
  ok: true;
  data: { transaction: TellerTransaction };
}
export type TellerTransactionsCreateResult = TellerTransactionsCreateSuccessResponse | IpcErrorResponse;

export type TellerTransactionsListRequest = AuthenticatedRequest &
  Omit<TellerTransactionListQuery, 'sessionId'> & {
    tellerSessionId?: number;
  };
export interface TellerTransactionsListSuccessResponse {
  ok: true;
  data: TellerTransactionListResult;
}
export type TellerTransactionsListResultIpc = TellerTransactionsListSuccessResponse | IpcErrorResponse;

export type TellerTransactionsGetRequest = AuthenticatedRequest & { transactionId: number };
export type TellerTransactionsGetResult = TellerTransactionsCreateResult;

export type TellerDashboardGetRequest = AuthenticatedRequest;
export interface TellerDashboardGetSuccessResponse {
  ok: true;
  data: TellerDashboard;
}
export type TellerDashboardGetResult = TellerDashboardGetSuccessResponse | IpcErrorResponse;

export type TellerTallyGetRequest = AuthenticatedRequest & { tellerSessionId?: number; currencyCode: string };
export interface TellerTallyGetSuccessResponse {
  ok: true;
  data: TellerTally;
}
export type TellerTallyGetResult = TellerTallyGetSuccessResponse | IpcErrorResponse;

export type TellerLongBookGetRequest = AuthenticatedRequest & {
  tellerSessionId?: number;
  currencyCode: string;
  page?: number;
  pageSize?: number;
};
export interface TellerLongBookGetSuccessResponse {
  ok: true;
  data: TellerLongBook;
}
export type TellerLongBookGetResult = TellerLongBookGetSuccessResponse | IpcErrorResponse;

export type TellerReconciliationGetRequest = AuthenticatedRequest & { tellerSessionId?: number };
export interface TellerReconciliationGetSuccessResponse {
  ok: true;
  data: TellerReconciliation;
}
export type TellerReconciliationGetResult = TellerReconciliationGetSuccessResponse | IpcErrorResponse;

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
  CUSTOMERS_SEARCH: 'customers:search',
  CUSTOMERS_GET_PHOTO: 'customers:getPhoto',
  CURRENCIES_LIST: 'currencies:list',
  CURRENCIES_CREATE: 'currencies:create',
  CURRENCIES_DEACTIVATE: 'currencies:deactivate',
  CURRENCIES_REACTIVATE: 'currencies:reactivate',
  CURRENCIES_DELETE: 'currencies:delete',
  CURRENCIES_DENOMINATIONS_LIST: 'currencies:denominations.list',
  CURRENCIES_DENOMINATIONS_CREATE: 'currencies:denominations.create',
  CURRENCIES_DENOMINATIONS_DEACTIVATE: 'currencies:denominations.deactivate',
  CURRENCIES_DENOMINATIONS_REACTIVATE: 'currencies:denominations.reactivate',
  CURRENCIES_DENOMINATIONS_DELETE: 'currencies:denominations.delete',
  TRANSACTIONS_CREATE: 'transactions:create',
  TRANSACTIONS_UPDATE: 'transactions:update',
  TRANSACTIONS_DELETE: 'transactions:delete',
  TRANSACTIONS_LIST: 'transactions:list',
  TRANSACTIONS_SUMMARY: 'transactions:summary',
  REPORTS_GENERATE: 'reports:generate',
  IMPORT_PARSE: 'import:parse',
  IMPORT_COMMIT: 'import:commit',
  IMPORT_DOWNLOAD_TEMPLATE: 'import:downloadTemplate',
  BACKUP_CREATE: 'backup:create',
  BACKUP_VALIDATE: 'backup:validate',
  RESTORE_EXECUTE: 'restore:execute',
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  AUTH_CHANGE_PASSWORD: 'auth:changePassword',
  AUTH_SET_RECOVERY: 'auth:setRecovery',
  AUTH_RECOVERY_STATUS: 'auth:recoveryStatus',
  AUTH_RECOVERY_PROMPT: 'auth:recoveryPrompt',
  AUTH_RECOVER_PASSWORD: 'auth:recoverPassword',
  COMPANY_GET: 'company:get',
  COMPANY_UPDATE: 'company:update',
  COMPANY_GET_LOGO: 'company:getLogo',
  TRANSFERS_CREATE: 'transfers:create',
  UPDATE_GET_STATUS: 'update:getStatus',
  UPDATE_CHECK: 'update:check',
  UPDATE_DOWNLOAD: 'update:download',
  UPDATE_INSTALL: 'update:install',
  TELLER_DENOMINATIONS_LIST: 'teller:denominations.list',
  TELLER_SESSION_CURRENT: 'teller:sessions.current',
  TELLER_SESSION_OPEN: 'teller:sessions.open',
  TELLER_SESSION_CLOSE: 'teller:sessions.close',
  TELLER_TRANSACTIONS_CREATE: 'teller:transactions.create',
  TELLER_TRANSACTIONS_LIST: 'teller:transactions.list',
  TELLER_TRANSACTIONS_GET: 'teller:transactions.get',
  TELLER_DASHBOARD_GET: 'teller:dashboard.get',
  TELLER_TALLY_GET: 'teller:tally.get',
  TELLER_LONG_BOOK_GET: 'teller:longBook.get',
  TELLER_RECONCILIATION_GET: 'teller:reconciliation.get',
} as const;

/** Renderer push channel for update status snapshots (not an invoke channel). */
export const UPDATE_STATUS_EVENT = 'update:status';

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS];

export const ALLOWED_IPC_CHANNELS: readonly IpcChannel[] = Object.values(IPC_CHANNELS);
