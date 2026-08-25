export const BACKUP_FORMAT_VERSION = '1.0';
export const BACKUP_FILE_EXTENSION = 'cab';
export const BACKUP_MANIFEST_NAME = 'manifest.json';
export const BACKUP_SIGNATURE_NAME = 'signature.sha256';
export const BACKUP_DATABASE_ENTRY = 'database/accounting.db';
export const BACKUP_IMAGES_PREFIX = 'images/customers/';
export const BACKUP_COMPANY_IMAGES_PREFIX = 'images/company/';

export const MAX_BACKUP_ARCHIVE_BYTES = 500 * 1024 * 1024;
export const MAX_BACKUP_UNCOMPRESSED_BYTES = 500 * 1024 * 1024;
export const MAX_BACKUP_ENTRIES = 20_000;

export interface BackupManifestFile {
  path: string;
  sha256: string;
  size_bytes: number;
}

export interface BackupManifestStatistics {
  customer_count: number;
  transaction_count: number;
  currency_codes: string[];
}

export interface BackupManifest {
  format_version: string;
  app_version: string;
  schema_version: number;
  created_at: string;
  created_by: string;
  platform: string;
  statistics: BackupManifestStatistics;
  files: BackupManifestFile[];
  settings_snapshot: {
    language: string;
  };
}

export interface BackupManifestSummary {
  createdAt: string;
  appVersion: string;
  schemaVersion: number;
  customerCount: number;
  transactionCount: number;
  language: string;
  currencyCodes: string[];
  platform: string;
}

export interface BackupProgress {
  percent: number;
  stage: string;
}

export interface BackupCreateData {
  success: true;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  manifest: BackupManifestSummary;
  canceled?: false;
}

export interface BackupCreateCanceled {
  success: false;
  canceled: true;
}

export type BackupCreateResultData = BackupCreateData | BackupCreateCanceled;

export interface BackupValidateData {
  valid: boolean;
  canceled?: boolean;
  fileName?: string;
  filePath?: string;
  manifest?: BackupManifestSummary;
  errors: string[];
  warnings: string[];
  hasExistingData: boolean;
}

export interface RestoreExecuteData {
  success: true;
  safetyBackupPath?: string;
  sessionInvalidated: boolean;
}

export function isSupportedBackupFormatVersion(version: string): boolean {
  return /^1\.\d+$/.test(version);
}

export function defaultBackupFileName(date = new Date()): string {
  return `FMT_Backup_${formatLocalDate(date)}.cab`;
}

export function defaultSafetyBackupFileName(date = new Date()): string {
  return `FMT_SafetyBackup_${formatLocalDate(date)}_${formatLocalTime(date)}.cab`;
}

/** Close-time backups stored under backups/scheduled/ */
export const AUTO_CLOSE_BACKUP_FILE_PREFIX = 'FMT_AutoClose_';
export const AUTO_CLOSE_BACKUP_RETENTION = 10;

/** Safety backups before restore under backups/auto/ */
export const SAFETY_BACKUP_FILE_PREFIX = 'FMT_SafetyBackup_';
export const SAFETY_BACKUP_RETENTION = 5;

/** Pre-update safety backups under backups/pre-update/ */
export const PRE_UPDATE_BACKUP_FILE_PREFIX = 'FMT_PreUpdate_';
export const PRE_UPDATE_BACKUP_RETENTION = 5;

export function defaultAutoCloseBackupFileName(date = new Date()): string {
  return `${AUTO_CLOSE_BACKUP_FILE_PREFIX}${formatLocalDate(date)}_${formatLocalTime(date)}.cab`;
}

export function defaultPreUpdateBackupFileName(date = new Date()): string {
  return `${PRE_UPDATE_BACKUP_FILE_PREFIX}${formatLocalDate(date)}_${formatLocalTime(date)}.cab`;
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${hours}-${minutes}-${seconds}`;
}
