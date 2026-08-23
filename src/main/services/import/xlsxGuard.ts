import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import type { ImportErrorCode } from '@shared/types/import';
import { MAX_IMPORT_FILE_BYTES, XLSX_EXTENSION } from './importConstants';

export type XlsxGuardResult =
  | { ok: true; filePath: string; size: number }
  | { ok: false; code: ImportErrorCode };

const ZIP_LOCAL_FILE_HEADER_0 = 0x50; // P
const ZIP_LOCAL_FILE_HEADER_1 = 0x4b; // K

export function assertSafeXlsxFile(filePath: unknown): XlsxGuardResult {
  if (typeof filePath !== 'string' || filePath.trim().length === 0) {
    return { ok: false, code: 'INVALID_FORMAT' };
  }

  if (filePath.includes('\u0000')) {
    return { ok: false, code: 'PATH_TRAVERSAL' };
  }

  const resolved = resolve(filePath.trim());
  if (extname(resolved).toLowerCase() !== XLSX_EXTENSION) {
    return { ok: false, code: 'INVALID_FORMAT' };
  }

  if (!existsSync(resolved)) {
    return { ok: false, code: 'INVALID_FORMAT' };
  }

  const stats = statSync(resolved);
  if (!stats.isFile()) {
    return { ok: false, code: 'INVALID_FORMAT' };
  }

  if (stats.size === 0) {
    return { ok: false, code: 'INVALID_FORMAT' };
  }

  if (stats.size > MAX_IMPORT_FILE_BYTES) {
    return { ok: false, code: 'FILE_TOO_LARGE' };
  }

  if (!hasZipMagicBytes(resolved)) {
    return { ok: false, code: 'INVALID_FORMAT' };
  }

  return { ok: true, filePath: resolved, size: stats.size };
}

function hasZipMagicBytes(filePath: string): boolean {
  const fd = openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(4);
    const bytesRead = readSync(fd, buffer, 0, 4, 0);
    if (bytesRead < 2) {
      return false;
    }
    return buffer[0] === ZIP_LOCAL_FILE_HEADER_0 && buffer[1] === ZIP_LOCAL_FILE_HEADER_1;
  } finally {
    closeSync(fd);
  }
}
