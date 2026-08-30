import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type AppGetPathsResult,
  type AppGetStatusResult,
  type AuthChangePasswordRequest,
  type AuthChangePasswordResult,
  type AuthCheckSessionRequest,
  type AuthCheckSessionResult,
  type AuthLoginRequest,
  type AuthLoginResult,
  type AuthLogoutRequest,
  type AuthLogoutResult,
  type AuthRecoverPasswordRequest,
  type AuthRecoverPasswordResult,
  type AuthRecoveryPromptRequest,
  type AuthRecoveryPromptResult,
  type AuthRecoveryStatusRequest,
  type AuthRecoveryStatusResult,
  type AuthSetRecoveryRequest,
  type AuthSetRecoveryResult,
  type CompanyGetLogoRequest,
  type CompanyGetLogoResult,
  type CompanyGetRequest,
  type CompanyGetResult,
  type CompanyUpdateRequest,
  type CompanyUpdateResult,
  type CurrenciesCreateRequest,
  type CurrenciesCreateResult,
  type CurrenciesDeactivateRequest,
  type CurrenciesDeactivateResult,
  type CurrenciesDeleteRequest,
  type CurrenciesDeleteResult,
  type CurrenciesDenominationsCreateRequest,
  type CurrenciesDenominationsCreateResult,
  type CurrenciesDenominationsDeactivateRequest,
  type CurrenciesDenominationsDeleteRequest,
  type CurrenciesDenominationsDeleteResult,
  type CurrenciesDenominationsListRequest,
  type CurrenciesDenominationsListResult,
  type CurrenciesDenominationsMutateResult,
  type CurrenciesDenominationsReactivateRequest,
  type CurrenciesListRequest,
  type CurrenciesListResult,
  type CurrenciesReactivateRequest,
  type CurrenciesReactivateResult,
  type CustomersCreateRequest,
  type CustomersCreateResult,
  type CustomersDeleteRequest,
  type CustomersDeleteResult,
  type CustomersGetPhotoRequest,
  type CustomersGetPhotoResult,
  type CustomersGetRequest,
  type CustomersGetResult,
  type CustomersListRequest,
  type CustomersListResult,
  type CustomersSearchRequest,
  type CustomersSearchResult,
  type CustomersUpdateRequest,
  type CustomersUpdateResult,
  type TransactionsCreateRequest,
  type TransactionsCreateResult,
  type TransactionsDeleteRequest,
  type TransactionsDeleteResult,
  type TransactionsListRequest,
  type TransactionsListResult,
  type TransactionsSummaryRequest,
  type TransactionsSummaryResult,
  type TransactionsUpdateRequest,
  type TransactionsUpdateResult,
  type SettingsGetResult,
  type SettingsUpdateRequest,
  type SettingsUpdateResult,
  type ReportsGenerateRequest,
  type ReportsGenerateResult,
  type ImportParseRequest,
  type ImportParseResult,
  type ImportCommitRequest,
  type ImportCommitResult,
  type ImportDownloadTemplateRequest,
  type ImportDownloadTemplateResult,
  type BackupCreateRequest,
  type BackupCreateResult,
  type BackupValidateRequest,
  type BackupValidateResult,
  type RestoreExecuteRequest,
  type RestoreExecuteResult,
  type TransfersCreateRequest,
  type TransfersCreateResult,
  type UpdateCheckRequest,
  type UpdateCheckResult,
  type UpdateDownloadRequest,
  type UpdateDownloadResult,
  type UpdateGetStatusRequest,
  type UpdateGetStatusResult,
  type UpdateInstallRequest,
  type UpdateInstallResult,
  type TellerDenominationsListRequest,
  type TellerDenominationsListResult,
  type TellerSessionCurrentRequest,
  type TellerSessionCurrentResult,
  type TellerSessionOpenRequest,
  type TellerSessionOpenResult,
  type TellerSessionCloseRequest,
  type TellerSessionCloseResult,
  type TellerSessionUpdateRequest,
  type TellerSessionUpdateResult,
  type TellerSheetGetRequest,
  type TellerSheetGetResult,
  type TellerTransactionsUpsertRequest,
  type TellerTransactionsUpsertResult,
  type TellerTransactionsListRequest,
  type TellerTransactionsListResultIpc,
  type TellerTransactionsGetRequest,
  type TellerTransactionsGetResult,
  type TellerTransactionsDeleteRequest,
  type TellerTransactionsDeleteResult,
  type TellerLongBookGetRequest,
  type TellerLongBookGetResult,
  type TellerDayEndRequest,
  type TellerDayEndResult,
  type TellerDayStartRequest,
  type TellerDayStartResult,
  type TellerCashResetRequest,
  type TellerCashResetResult,
  UPDATE_STATUS_EVENT,
} from '@shared/types/ipc';
import type { ReportProgress } from '@shared/types/report';
import type { BackupProgress } from '@shared/types/backup';
import type { UpdateStatusSnapshot } from '@shared/types/update';

const ALLOWED_INVOKE_CHANNELS = new Set<string>(Object.values(IPC_CHANNELS));

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
  }
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api = {
  app: {
    getPaths: (sessionId: string): Promise<AppGetPathsResult> =>
      invoke(IPC_CHANNELS.APP_GET_PATHS, { sessionId }),
    getStatus: (sessionId: string): Promise<AppGetStatusResult> =>
      invoke(IPC_CHANNELS.APP_GET_STATUS, { sessionId }),
  },
  auth: {
    login: (request: AuthLoginRequest): Promise<AuthLoginResult> =>
      invoke(IPC_CHANNELS.AUTH_LOGIN, request),
    logout: (request: AuthLogoutRequest): Promise<AuthLogoutResult> =>
      invoke(IPC_CHANNELS.AUTH_LOGOUT, request),
    checkSession: (request: AuthCheckSessionRequest): Promise<AuthCheckSessionResult> =>
      invoke(IPC_CHANNELS.AUTH_CHECK_SESSION, request),
    changePassword: (request: AuthChangePasswordRequest): Promise<AuthChangePasswordResult> =>
      invoke(IPC_CHANNELS.AUTH_CHANGE_PASSWORD, request),
    setRecovery: (request: AuthSetRecoveryRequest): Promise<AuthSetRecoveryResult> =>
      invoke(IPC_CHANNELS.AUTH_SET_RECOVERY, request),
    recoveryStatus: (request: AuthRecoveryStatusRequest): Promise<AuthRecoveryStatusResult> =>
      invoke(IPC_CHANNELS.AUTH_RECOVERY_STATUS, request),
    recoveryPrompt: (request: AuthRecoveryPromptRequest): Promise<AuthRecoveryPromptResult> =>
      invoke(IPC_CHANNELS.AUTH_RECOVERY_PROMPT, request),
    recoverPassword: (request: AuthRecoverPasswordRequest): Promise<AuthRecoverPasswordResult> =>
      invoke(IPC_CHANNELS.AUTH_RECOVER_PASSWORD, request),
  },
  company: {
    get: (request: CompanyGetRequest): Promise<CompanyGetResult> =>
      invoke(IPC_CHANNELS.COMPANY_GET, request),
    update: (request: CompanyUpdateRequest): Promise<CompanyUpdateResult> =>
      invoke(IPC_CHANNELS.COMPANY_UPDATE, request),
    getLogo: (request: CompanyGetLogoRequest): Promise<CompanyGetLogoResult> =>
      invoke(IPC_CHANNELS.COMPANY_GET_LOGO, request),
  },
  customers: {
    list: (request: CustomersListRequest): Promise<CustomersListResult> =>
      invoke(IPC_CHANNELS.CUSTOMERS_LIST, request),
    search: (request: CustomersSearchRequest): Promise<CustomersSearchResult> =>
      invoke(IPC_CHANNELS.CUSTOMERS_SEARCH, request),
    get: (request: CustomersGetRequest): Promise<CustomersGetResult> =>
      invoke(IPC_CHANNELS.CUSTOMERS_GET, request),
    create: (request: CustomersCreateRequest): Promise<CustomersCreateResult> =>
      invoke(IPC_CHANNELS.CUSTOMERS_CREATE, request),
    update: (request: CustomersUpdateRequest): Promise<CustomersUpdateResult> =>
      invoke(IPC_CHANNELS.CUSTOMERS_UPDATE, request),
    delete: (request: CustomersDeleteRequest): Promise<CustomersDeleteResult> =>
      invoke(IPC_CHANNELS.CUSTOMERS_DELETE, request),
    getPhoto: (request: CustomersGetPhotoRequest): Promise<CustomersGetPhotoResult> =>
      invoke(IPC_CHANNELS.CUSTOMERS_GET_PHOTO, request),
  },
  currencies: {
    list: (request: CurrenciesListRequest): Promise<CurrenciesListResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_LIST, request),
    create: (request: CurrenciesCreateRequest): Promise<CurrenciesCreateResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_CREATE, request),
    deactivate: (request: CurrenciesDeactivateRequest): Promise<CurrenciesDeactivateResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_DEACTIVATE, request),
    reactivate: (request: CurrenciesReactivateRequest): Promise<CurrenciesReactivateResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_REACTIVATE, request),
    delete: (request: CurrenciesDeleteRequest): Promise<CurrenciesDeleteResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_DELETE, request),
    listDenominations: (request: CurrenciesDenominationsListRequest): Promise<CurrenciesDenominationsListResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_LIST, request),
    createDenomination: (
      request: CurrenciesDenominationsCreateRequest,
    ): Promise<CurrenciesDenominationsCreateResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_CREATE, request),
    deactivateDenomination: (
      request: CurrenciesDenominationsDeactivateRequest,
    ): Promise<CurrenciesDenominationsMutateResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_DEACTIVATE, request),
    reactivateDenomination: (
      request: CurrenciesDenominationsReactivateRequest,
    ): Promise<CurrenciesDenominationsMutateResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_REACTIVATE, request),
    deleteDenomination: (
      request: CurrenciesDenominationsDeleteRequest,
    ): Promise<CurrenciesDenominationsDeleteResult> =>
      invoke(IPC_CHANNELS.CURRENCIES_DENOMINATIONS_DELETE, request),
  },
  transactions: {
    list: (request: TransactionsListRequest): Promise<TransactionsListResult> =>
      invoke(IPC_CHANNELS.TRANSACTIONS_LIST, request),
    summary: (request: TransactionsSummaryRequest): Promise<TransactionsSummaryResult> =>
      invoke(IPC_CHANNELS.TRANSACTIONS_SUMMARY, request),
    create: (request: TransactionsCreateRequest): Promise<TransactionsCreateResult> =>
      invoke(IPC_CHANNELS.TRANSACTIONS_CREATE, request),
    update: (request: TransactionsUpdateRequest): Promise<TransactionsUpdateResult> =>
      invoke(IPC_CHANNELS.TRANSACTIONS_UPDATE, request),
    delete: (request: TransactionsDeleteRequest): Promise<TransactionsDeleteResult> =>
      invoke(IPC_CHANNELS.TRANSACTIONS_DELETE, request),
    transfer: (request: TransfersCreateRequest): Promise<TransfersCreateResult> =>
      invoke(IPC_CHANNELS.TRANSFERS_CREATE, request),
  },
  settings: {
    get: (): Promise<SettingsGetResult> => invoke(IPC_CHANNELS.SETTINGS_GET),
    update: (request: SettingsUpdateRequest): Promise<SettingsUpdateResult> =>
      invoke(IPC_CHANNELS.SETTINGS_UPDATE, request),
  },
  reports: {
    generate: (request: ReportsGenerateRequest): Promise<ReportsGenerateResult> =>
      invoke(IPC_CHANNELS.REPORTS_GENERATE, request),
    onProgress: (callback: (progress: ReportProgress) => void): (() => void) => {
      const listener = (_event: unknown, payload: ReportProgress): void => {
        callback(payload);
      };
      ipcRenderer.on('reports:progress', listener);
      return () => {
        ipcRenderer.removeListener('reports:progress', listener);
      };
    },
  },
  import: {
    parse: (request: ImportParseRequest): Promise<ImportParseResult> =>
      invoke(IPC_CHANNELS.IMPORT_PARSE, request),
    commit: (request: ImportCommitRequest): Promise<ImportCommitResult> =>
      invoke(IPC_CHANNELS.IMPORT_COMMIT, request),
    downloadTemplate: (request: ImportDownloadTemplateRequest): Promise<ImportDownloadTemplateResult> =>
      invoke(IPC_CHANNELS.IMPORT_DOWNLOAD_TEMPLATE, request),
  },
  backup: {
    create: (request: BackupCreateRequest): Promise<BackupCreateResult> =>
      invoke(IPC_CHANNELS.BACKUP_CREATE, request),
    validate: (request?: BackupValidateRequest): Promise<BackupValidateResult> =>
      invoke(IPC_CHANNELS.BACKUP_VALIDATE, request ?? {}),
    restore: (request: RestoreExecuteRequest): Promise<RestoreExecuteResult> =>
      invoke(IPC_CHANNELS.RESTORE_EXECUTE, request),
    onProgress: (callback: (progress: BackupProgress) => void): (() => void) => {
      const listener = (_event: unknown, payload: BackupProgress): void => {
        callback(payload);
      };
      ipcRenderer.on('backup:progress', listener);
      return () => {
        ipcRenderer.removeListener('backup:progress', listener);
      };
    },
  },
  update: {
    getStatus: (request: UpdateGetStatusRequest): Promise<UpdateGetStatusResult> =>
      invoke(IPC_CHANNELS.UPDATE_GET_STATUS, request),
    check: (request: UpdateCheckRequest): Promise<UpdateCheckResult> =>
      invoke(IPC_CHANNELS.UPDATE_CHECK, request),
    download: (request: UpdateDownloadRequest): Promise<UpdateDownloadResult> =>
      invoke(IPC_CHANNELS.UPDATE_DOWNLOAD, request),
    install: (request: UpdateInstallRequest): Promise<UpdateInstallResult> =>
      invoke(IPC_CHANNELS.UPDATE_INSTALL, request),
    onStatus: (callback: (status: UpdateStatusSnapshot) => void): (() => void) => {
      const listener = (_event: unknown, payload: UpdateStatusSnapshot): void => {
        callback(payload);
      };
      ipcRenderer.on(UPDATE_STATUS_EVENT, listener);
      return () => {
        ipcRenderer.removeListener(UPDATE_STATUS_EVENT, listener);
      };
    },
  },
  teller: {
    listDenominations: (request: TellerDenominationsListRequest): Promise<TellerDenominationsListResult> =>
      invoke(IPC_CHANNELS.TELLER_DENOMINATIONS_LIST, request),
    currentSession: (request: TellerSessionCurrentRequest): Promise<TellerSessionCurrentResult> =>
      invoke(IPC_CHANNELS.TELLER_SESSION_CURRENT, request),
    openSession: (request: TellerSessionOpenRequest): Promise<TellerSessionOpenResult> =>
      invoke(IPC_CHANNELS.TELLER_SESSION_OPEN, request),
    closeSession: (request: TellerSessionCloseRequest): Promise<TellerSessionCloseResult> =>
      invoke(IPC_CHANNELS.TELLER_SESSION_CLOSE, request),
    updateSession: (request: TellerSessionUpdateRequest): Promise<TellerSessionUpdateResult> =>
      invoke(IPC_CHANNELS.TELLER_SESSION_UPDATE, request),
    getSheet: (request: TellerSheetGetRequest): Promise<TellerSheetGetResult> =>
      invoke(IPC_CHANNELS.TELLER_SHEET_GET, request),
    upsertTransaction: (request: TellerTransactionsUpsertRequest): Promise<TellerTransactionsUpsertResult> =>
      invoke(IPC_CHANNELS.TELLER_TRANSACTIONS_UPSERT, request),
    listTransactions: (request: TellerTransactionsListRequest): Promise<TellerTransactionsListResultIpc> =>
      invoke(IPC_CHANNELS.TELLER_TRANSACTIONS_LIST, request),
    getTransaction: (request: TellerTransactionsGetRequest): Promise<TellerTransactionsGetResult> =>
      invoke(IPC_CHANNELS.TELLER_TRANSACTIONS_GET, request),
    deleteTransaction: (request: TellerTransactionsDeleteRequest): Promise<TellerTransactionsDeleteResult> =>
      invoke(IPC_CHANNELS.TELLER_TRANSACTIONS_DELETE, request),
    getLongBook: (request: TellerLongBookGetRequest): Promise<TellerLongBookGetResult> =>
      invoke(IPC_CHANNELS.TELLER_LONG_BOOK_GET, request),
    endDay: (request: TellerDayEndRequest): Promise<TellerDayEndResult> =>
      invoke(IPC_CHANNELS.TELLER_DAY_END, request),
    startDay: (request: TellerDayStartRequest): Promise<TellerDayStartResult> =>
      invoke(IPC_CHANNELS.TELLER_DAY_START, request),
    resetCash: (request: TellerCashResetRequest): Promise<TellerCashResetResult> =>
      invoke(IPC_CHANNELS.TELLER_CASH_RESET, request),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type PreloadApi = typeof api;
