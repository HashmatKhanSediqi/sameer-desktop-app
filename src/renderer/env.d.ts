import type {
  AppGetPathsResult,
  AppGetStatusResult,
  AuthChangePasswordRequest,
  AuthChangePasswordResult,
  AuthCheckSessionRequest,
  AuthCheckSessionResult,
  AuthLoginRequest,
  AuthLoginResult,
  AuthLogoutRequest,
  AuthLogoutResult,
  AuthRecoverPasswordRequest,
  AuthRecoverPasswordResult,
  AuthRecoveryPromptRequest,
  AuthRecoveryPromptResult,
  AuthRecoveryStatusRequest,
  AuthRecoveryStatusResult,
  AuthSetRecoveryRequest,
  AuthSetRecoveryResult,
  CompanyGetLogoRequest,
  CompanyGetLogoResult,
  CompanyGetRequest,
  CompanyGetResult,
  CompanyUpdateRequest,
  CompanyUpdateResult,
  CurrenciesCreateRequest,
  CurrenciesCreateResult,
  CurrenciesDeactivateRequest,
  CurrenciesDeactivateResult,
  CurrenciesDeleteRequest,
  CurrenciesDeleteResult,
  CurrenciesDenominationsCreateRequest,
  CurrenciesDenominationsCreateResult,
  CurrenciesDenominationsDeactivateRequest,
  CurrenciesDenominationsDeleteRequest,
  CurrenciesDenominationsDeleteResult,
  CurrenciesDenominationsListRequest,
  CurrenciesDenominationsListResult,
  CurrenciesDenominationsMutateResult,
  CurrenciesDenominationsReactivateRequest,
  CurrenciesListRequest,
  CurrenciesListResult,
  CurrenciesReactivateRequest,
  CurrenciesReactivateResult,
  CustomersCreateRequest,
  CustomersCreateResult,
  CustomersDeleteRequest,
  CustomersDeleteResult,
  CustomersGetPhotoRequest,
  CustomersGetPhotoResult,
  CustomersGetRequest,
  CustomersGetResult,
  CustomersListRequest,
  CustomersListResult,
  CustomersSearchRequest,
  CustomersSearchResult,
  CustomersUpdateRequest,
  CustomersUpdateResult,
  TransactionsCreateRequest,
  TransactionsCreateResult,
  TransactionsDeleteRequest,
  TransactionsDeleteResult,
  TransactionsListRequest,
  TransactionsListResult,
  TransactionsSummaryRequest,
  TransactionsSummaryResult,
  SettingsGetResult,
  SettingsUpdateRequest,
  SettingsUpdateResult,
  ReportsGenerateRequest,
  ReportsGenerateResult,
  ImportParseRequest,
  ImportParseResult,
  ImportCommitRequest,
  ImportCommitResult,
  ImportDownloadTemplateRequest,
  ImportDownloadTemplateResult,
  BackupCreateRequest,
  BackupCreateResult,
  BackupValidateRequest,
  BackupValidateResult,
  RestoreExecuteRequest,
  RestoreExecuteResult,
  TransactionsUpdateRequest,
  TransactionsUpdateResult,
  TransfersCreateRequest,
  TransfersCreateResult,
  UpdateCheckRequest,
  UpdateCheckResult,
  UpdateDownloadRequest,
  UpdateDownloadResult,
  UpdateGetStatusRequest,
  UpdateGetStatusResult,
  UpdateInstallRequest,
  UpdateInstallResult,
  TellerDenominationsListRequest,
  TellerDenominationsListResult,
  TellerSessionCurrentRequest,
  TellerSessionCurrentResult,
  TellerSessionOpenRequest,
  TellerSessionOpenResult,
  TellerSessionCloseRequest,
  TellerSessionCloseResult,
  TellerTransactionsCreateRequest,
  TellerTransactionsCreateResult,
  TellerTransactionsListRequest,
  TellerTransactionsListResultIpc,
  TellerTransactionsGetRequest,
  TellerTransactionsGetResult,
  TellerDashboardGetRequest,
  TellerDashboardGetResult,
  TellerTallyGetRequest,
  TellerTallyGetResult,
  TellerLongBookGetRequest,
  TellerLongBookGetResult,
  TellerReconciliationGetRequest,
  TellerReconciliationGetResult,
} from '@shared/types/ipc';
import type { ReportProgress } from '@shared/types/report';
import type { BackupProgress } from '@shared/types/backup';
import type { UpdateStatusSnapshot } from '@shared/types/update';

export interface PreloadApi {
  app: {
    getPaths: (sessionId: string) => Promise<AppGetPathsResult>;
    getStatus: (sessionId: string) => Promise<AppGetStatusResult>;
  };
  auth: {
    login: (request: AuthLoginRequest) => Promise<AuthLoginResult>;
    logout: (request: AuthLogoutRequest) => Promise<AuthLogoutResult>;
    checkSession: (request: AuthCheckSessionRequest) => Promise<AuthCheckSessionResult>;
    changePassword: (request: AuthChangePasswordRequest) => Promise<AuthChangePasswordResult>;
    setRecovery: (request: AuthSetRecoveryRequest) => Promise<AuthSetRecoveryResult>;
    recoveryStatus: (request: AuthRecoveryStatusRequest) => Promise<AuthRecoveryStatusResult>;
    recoveryPrompt: (request: AuthRecoveryPromptRequest) => Promise<AuthRecoveryPromptResult>;
    recoverPassword: (request: AuthRecoverPasswordRequest) => Promise<AuthRecoverPasswordResult>;
  };
  company: {
    get: (request: CompanyGetRequest) => Promise<CompanyGetResult>;
    update: (request: CompanyUpdateRequest) => Promise<CompanyUpdateResult>;
    getLogo: (request: CompanyGetLogoRequest) => Promise<CompanyGetLogoResult>;
  };
  customers: {
    list: (request: CustomersListRequest) => Promise<CustomersListResult>;
    search: (request: CustomersSearchRequest) => Promise<CustomersSearchResult>;
    get: (request: CustomersGetRequest) => Promise<CustomersGetResult>;
    create: (request: CustomersCreateRequest) => Promise<CustomersCreateResult>;
    update: (request: CustomersUpdateRequest) => Promise<CustomersUpdateResult>;
    delete: (request: CustomersDeleteRequest) => Promise<CustomersDeleteResult>;
    getPhoto: (request: CustomersGetPhotoRequest) => Promise<CustomersGetPhotoResult>;
  };
  currencies: {
    list: (request: CurrenciesListRequest) => Promise<CurrenciesListResult>;
    create: (request: CurrenciesCreateRequest) => Promise<CurrenciesCreateResult>;
    deactivate: (request: CurrenciesDeactivateRequest) => Promise<CurrenciesDeactivateResult>;
    reactivate: (request: CurrenciesReactivateRequest) => Promise<CurrenciesReactivateResult>;
    delete: (request: CurrenciesDeleteRequest) => Promise<CurrenciesDeleteResult>;
    listDenominations: (request: CurrenciesDenominationsListRequest) => Promise<CurrenciesDenominationsListResult>;
    createDenomination: (request: CurrenciesDenominationsCreateRequest) => Promise<CurrenciesDenominationsCreateResult>;
    deactivateDenomination: (
      request: CurrenciesDenominationsDeactivateRequest,
    ) => Promise<CurrenciesDenominationsMutateResult>;
    reactivateDenomination: (
      request: CurrenciesDenominationsReactivateRequest,
    ) => Promise<CurrenciesDenominationsMutateResult>;
    deleteDenomination: (
      request: CurrenciesDenominationsDeleteRequest,
    ) => Promise<CurrenciesDenominationsDeleteResult>;
  };
  transactions: {
    list: (request: TransactionsListRequest) => Promise<TransactionsListResult>;
    summary: (request: TransactionsSummaryRequest) => Promise<TransactionsSummaryResult>;
    create: (request: TransactionsCreateRequest) => Promise<TransactionsCreateResult>;
    update: (request: TransactionsUpdateRequest) => Promise<TransactionsUpdateResult>;
    delete: (request: TransactionsDeleteRequest) => Promise<TransactionsDeleteResult>;
    transfer: (request: TransfersCreateRequest) => Promise<TransfersCreateResult>;
  };
  settings: {
    get: () => Promise<SettingsGetResult>;
    update: (request: SettingsUpdateRequest) => Promise<SettingsUpdateResult>;
  };
  reports: {
    generate: (request: ReportsGenerateRequest) => Promise<ReportsGenerateResult>;
    onProgress: (callback: (progress: ReportProgress) => void) => () => void;
  };
  import: {
    parse: (request: ImportParseRequest) => Promise<ImportParseResult>;
    commit: (request: ImportCommitRequest) => Promise<ImportCommitResult>;
    downloadTemplate: (request: ImportDownloadTemplateRequest) => Promise<ImportDownloadTemplateResult>;
  };
  backup: {
    create: (request: BackupCreateRequest) => Promise<BackupCreateResult>;
    validate: (request?: BackupValidateRequest) => Promise<BackupValidateResult>;
    restore: (request: RestoreExecuteRequest) => Promise<RestoreExecuteResult>;
    onProgress: (callback: (progress: BackupProgress) => void) => () => void;
  };
  update: {
    getStatus: (request: UpdateGetStatusRequest) => Promise<UpdateGetStatusResult>;
    check: (request: UpdateCheckRequest) => Promise<UpdateCheckResult>;
    download: (request: UpdateDownloadRequest) => Promise<UpdateDownloadResult>;
    install: (request: UpdateInstallRequest) => Promise<UpdateInstallResult>;
    onStatus: (callback: (status: UpdateStatusSnapshot) => void) => () => void;
  };
  teller: {
    listDenominations: (request: TellerDenominationsListRequest) => Promise<TellerDenominationsListResult>;
    currentSession: (request: TellerSessionCurrentRequest) => Promise<TellerSessionCurrentResult>;
    openSession: (request: TellerSessionOpenRequest) => Promise<TellerSessionOpenResult>;
    closeSession: (request: TellerSessionCloseRequest) => Promise<TellerSessionCloseResult>;
    createTransaction: (request: TellerTransactionsCreateRequest) => Promise<TellerTransactionsCreateResult>;
    listTransactions: (request: TellerTransactionsListRequest) => Promise<TellerTransactionsListResultIpc>;
    getTransaction: (request: TellerTransactionsGetRequest) => Promise<TellerTransactionsGetResult>;
    getDashboard: (request: TellerDashboardGetRequest) => Promise<TellerDashboardGetResult>;
    getTally: (request: TellerTallyGetRequest) => Promise<TellerTallyGetResult>;
    getLongBook: (request: TellerLongBookGetRequest) => Promise<TellerLongBookGetResult>;
    getReconciliation: (request: TellerReconciliationGetRequest) => Promise<TellerReconciliationGetResult>;
  };
}

declare global {
  interface Window {
    api: PreloadApi;
  }
}

export {};
