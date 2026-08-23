import { isAbsolute, posix } from 'node:path';
import {
  BACKUP_COMPANY_IMAGES_PREFIX,
  BACKUP_DATABASE_ENTRY,
  BACKUP_IMAGES_PREFIX,
  BACKUP_MANIFEST_NAME,
  BACKUP_SIGNATURE_NAME,
} from '@shared/types/backup';
import { AppError } from '../../utils/errors';

const PHOTO_ENTRY_PATTERN = /^\d+\.(jpg|jpeg|png|webp)$/i;
const COMPANY_LOGO_PATTERN = /^logo\.(jpg|jpeg|png|webp)$/i;

export function normalizeArchivePath(entryName: string): string {
  if (entryName.includes('\u0000')) {
    throw new AppError('INVALID_BACKUP', 'pathTraversal');
  }

  const trimmed = entryName.trim();
  if (trimmed.length === 0 || trimmed.length > 1024) {
    throw new AppError('INVALID_BACKUP', 'pathTraversal');
  }

  const normalized = trimmed.replace(/\\/g, '/');
  if (isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith('//')) {
    throw new AppError('INVALID_BACKUP', 'pathTraversal');
  }

  const posixPath = posix.normalize(normalized);
  if (posixPath.startsWith('../') || posixPath === '..' || posixPath.startsWith('/')) {
    throw new AppError('INVALID_BACKUP', 'pathTraversal');
  }

  const segments = posixPath.split('/').filter((segment) => segment.length > 0);
  if (segments.length === 0 || segments.some((segment) => segment === '.' || segment === '..')) {
    throw new AppError('INVALID_BACKUP', 'pathTraversal');
  }

  return segments.join('/');
}

export function assertAllowedBackupEntry(entryName: string): string {
  const normalized = normalizeArchivePath(entryName);
  if (normalized === BACKUP_MANIFEST_NAME || normalized === BACKUP_SIGNATURE_NAME || normalized === BACKUP_DATABASE_ENTRY) {
    return normalized;
  }

  if (normalized.startsWith(BACKUP_IMAGES_PREFIX)) {
    const filename = normalized.slice(BACKUP_IMAGES_PREFIX.length);
    if (!filename.includes('/') && PHOTO_ENTRY_PATTERN.test(filename)) {
      return normalized;
    }
  }

  if (normalized.startsWith(BACKUP_COMPANY_IMAGES_PREFIX)) {
    const filename = normalized.slice(BACKUP_COMPANY_IMAGES_PREFIX.length);
    if (!filename.includes('/') && COMPANY_LOGO_PATTERN.test(filename)) {
      return normalized;
    }
  }

  throw new AppError('INVALID_BACKUP', 'invalidFile');
}

export function isBackupFilePath(filePath: string): boolean {
  return filePath.trim().toLowerCase().endsWith('.cab');
}

export function photoFilenameFromArchivePath(entryName: string): string | undefined {
  const normalized = normalizeArchivePath(entryName);
  if (!normalized.startsWith(BACKUP_IMAGES_PREFIX)) {
    return undefined;
  }
  return normalized.slice(BACKUP_IMAGES_PREFIX.length);
}
