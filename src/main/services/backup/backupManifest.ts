import { DEFAULT_LOCALE, isSupportedLocale } from '@shared/types/locale';
import {
  BACKUP_FORMAT_VERSION,
  type BackupManifest,
  type BackupManifestFile,
  type BackupManifestSummary,
  isSupportedBackupFormatVersion,
} from '@shared/types/backup';
import { AppError } from '../../utils/errors';
import { sha256 } from './zipArchive';

export function parseBackupManifest(raw: unknown): BackupManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }

  const record = raw as Record<string, unknown>;
  if (typeof record.format_version !== 'string' || !isSupportedBackupFormatVersion(record.format_version)) {
    throw new AppError('BACKUP_VERSION_MISMATCH', 'unsupportedFormat');
  }
  if (typeof record.app_version !== 'string' || record.app_version.trim().length === 0) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }
  if (typeof record.schema_version !== 'number' || !Number.isInteger(record.schema_version) || record.schema_version < 1) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }
  if (typeof record.created_at !== 'string' || Number.isNaN(Date.parse(record.created_at))) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }
  if (typeof record.created_by !== 'string' || typeof record.platform !== 'string') {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }
  if (!record.statistics || typeof record.statistics !== 'object' || Array.isArray(record.statistics)) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }

  const statistics = record.statistics as Record<string, unknown>;
  if (
    typeof statistics.customer_count !== 'number' ||
    !Number.isInteger(statistics.customer_count) ||
    statistics.customer_count < 0 ||
    typeof statistics.transaction_count !== 'number' ||
    !Number.isInteger(statistics.transaction_count) ||
    statistics.transaction_count < 0 ||
    !Array.isArray(statistics.currency_codes) ||
    statistics.currency_codes.some((code) => typeof code !== 'string')
  ) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }

  if (!Array.isArray(record.files) || record.files.length === 0) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }

  const files = record.files.map(parseManifestFile);
  const snapshot = record.settings_snapshot;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }
  const languageValue = (snapshot as Record<string, unknown>).language;
  if (typeof languageValue !== 'string' || languageValue.trim().length === 0) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }

  return {
    format_version: record.format_version,
    app_version: record.app_version.trim(),
    schema_version: record.schema_version,
    created_at: record.created_at,
    created_by: record.created_by,
    platform: record.platform,
    statistics: {
      customer_count: statistics.customer_count,
      transaction_count: statistics.transaction_count,
      currency_codes: statistics.currency_codes as string[],
    },
    files,
    settings_snapshot: {
      language: languageValue,
    },
  };
}

export function buildBackupSignature(manifestBytes: Buffer, files: BackupManifestFile[]): string {
  const lines = files
    .slice()
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `${file.path}:${file.sha256}:${file.size_bytes}`)
    .join('\n');
  return sha256(Buffer.concat([manifestBytes, Buffer.from('\n', 'utf8'), Buffer.from(lines, 'utf8')]));
}

export function summarizeManifest(manifest: BackupManifest): BackupManifestSummary {
  const language = isSupportedLocale(manifest.settings_snapshot.language)
    ? manifest.settings_snapshot.language
    : DEFAULT_LOCALE;

  return {
    createdAt: manifest.created_at,
    appVersion: manifest.app_version,
    schemaVersion: manifest.schema_version,
    customerCount: manifest.statistics.customer_count,
    transactionCount: manifest.statistics.transaction_count,
    language,
    currencyCodes: [...manifest.statistics.currency_codes],
    platform: manifest.platform,
  };
}

export function assertCurrentFormatVersion(version: string): void {
  if (version !== BACKUP_FORMAT_VERSION && !isSupportedBackupFormatVersion(version)) {
    throw new AppError('BACKUP_VERSION_MISMATCH', 'unsupportedFormat');
  }
}

function parseManifestFile(value: unknown): BackupManifestFile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.path !== 'string' ||
    typeof record.sha256 !== 'string' ||
    typeof record.size_bytes !== 'number' ||
    !Number.isInteger(record.size_bytes) ||
    record.size_bytes < 0 ||
    !/^[a-f0-9]{64}$/i.test(record.sha256)
  ) {
    throw new AppError('INVALID_BACKUP', 'invalidManifest');
  }
  return {
    path: record.path,
    sha256: record.sha256.toLowerCase(),
    size_bytes: record.size_bytes,
  };
}
