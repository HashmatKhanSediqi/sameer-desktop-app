import Decimal from 'decimal.js';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import type { ImportErrorCode } from '@shared/types/import';
import type { TransactionType } from '@shared/types/transaction';
import { AppError } from '../../utils/errors';
import {
  MAX_PHOTO_BYTES,
  normalizeOptionalCustomerNumber,
  normalizeOptionalName,
} from '../customer/customerValidation';
import { detectImageType, type DecodedPhoto } from '../customer/customerPhotoService';
import { parseOptionalNote } from '../transaction/transactionValidation';
import { excelSerialToDate, formatDateOnly, stringifyCell, unwrapExcelValue } from './cellValue';

const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,15})(?:\.\d{1,4})?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MIN_IMPORT_YEAR = 1900;
const MAX_IMPORT_YEAR = 2100;

export type FieldResult<T> = { ok: true; value: T } | { ok: false; code: ImportErrorCode };

export function parseImportType(value: unknown): FieldResult<TransactionType> {
  const raw = stringifyCell(value).trim();
  if (raw.length === 0) {
    return { ok: false, code: 'INVALID_TYPE' };
  }

  const compact = raw.toUpperCase().replace(/[_-]+/g, ' ').replace(/\s+/g, '');
  if (compact === 'CASHIN') {
    return { ok: true, value: 'CASH_IN' };
  }
  if (compact === 'CASHOUT') {
    return { ok: true, value: 'CASH_OUT' };
  }
  return { ok: false, code: 'INVALID_TYPE' };
}

export function parseImportCurrency(value: unknown, activeCodes: ReadonlySet<string>): FieldResult<string> {
  const raw = stringifyCell(value).trim();
  if (raw.length === 0) {
    return { ok: false, code: 'INVALID_CURRENCY' };
  }

  const code = raw.toUpperCase();
  if (!activeCodes.has(code)) {
    return { ok: false, code: 'INVALID_CURRENCY' };
  }
  return { ok: true, value: code };
}

export function parseImportAmount(value: unknown): FieldResult<string> {
  const unwrapped = unwrapExcelValue(value);
  if (unwrapped === null || unwrapped === undefined || unwrapped === '') {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }

  if (typeof unwrapped === 'number') {
    if (!Number.isFinite(unwrapped) || unwrapped <= 0) {
      return { ok: false, code: 'INVALID_AMOUNT' };
    }
    return decimalAmount(new Decimal(unwrapped));
  }

  if (typeof unwrapped !== 'string' && !(unwrapped instanceof Date)) {
    if (typeof unwrapped === 'boolean') {
      return { ok: false, code: 'INVALID_AMOUNT' };
    }
  }

  if (unwrapped instanceof Date) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }

  const normalized = normalizeAmountText(stringifyCell(unwrapped));
  if (!normalized) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }

  if (!AMOUNT_PATTERN.test(normalized)) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }

  try {
    return decimalAmount(new Decimal(normalized));
  } catch {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
}

export function parseImportDate(
  value: unknown,
  fallback: string,
  date1904 = false,
): FieldResult<string> {
  const unwrapped = unwrapExcelValue(value);
  if (unwrapped === null || unwrapped === undefined || unwrapped === '') {
    return { ok: true, value: fallback };
  }

  if (unwrapped instanceof Date) {
    return dateToSqlite(unwrapped);
  }

  if (typeof unwrapped === 'number') {
    if (!Number.isFinite(unwrapped)) {
      return { ok: false, code: 'INVALID_DATE' };
    }
    return dateToSqlite(excelSerialToDate(unwrapped, date1904));
  }

  const text = stringifyCell(unwrapped).trim();
  if (text.length === 0) {
    return { ok: true, value: fallback };
  }

  if (!ISO_DATE_PATTERN.test(text)) {
    return { ok: false, code: 'INVALID_DATE' };
  }

  return dateToSqlite(parseIsoDate(text), text);
}

export function parseImportNote(value: unknown): FieldResult<string | null> {
  const unwrapped = unwrapExcelValue(value);
  if (unwrapped === null || unwrapped === undefined) {
    return { ok: true, value: null };
  }

  try {
    if (typeof unwrapped === 'number' && Number.isFinite(unwrapped)) {
      return { ok: true, value: parseOptionalNote(String(unwrapped)) };
    }
    if (typeof unwrapped !== 'string') {
      const asText = stringifyCell(unwrapped);
      return { ok: true, value: parseOptionalNote(asText.length === 0 ? null : asText) };
    }
    return { ok: true, value: parseOptionalNote(unwrapped) };
  } catch (error) {
    if (error instanceof AppError) {
      return { ok: false, code: 'INVALID_CHARACTERS' };
    }
    return { ok: false, code: 'INVALID_CHARACTERS' };
  }
}

export function parseImportName(value: unknown): FieldResult<string | null> {
  try {
    const text = emptyToUndefined(stringifyCell(value));
    return { ok: true, value: normalizeOptionalName(text) };
  } catch (error) {
    return mapCustomerFieldError(error, 'NAME_TOO_LONG');
  }
}

export function parseImportCustomerNumber(value: unknown): FieldResult<string | null> {
  try {
    const text = emptyToUndefined(stringifyCell(value));
    return { ok: true, value: normalizeOptionalCustomerNumber(text) };
  } catch (error) {
    return mapCustomerFieldError(error, 'INVALID_CUSTOMER_NUMBER');
  }
}

export function parsePhotoPath(
  xlsxPath: string,
  value: unknown,
): FieldResult<DecodedPhoto | null> {
  const relativePath = stringifyCell(value).trim();
  if (relativePath.length === 0) {
    return { ok: true, value: null };
  }

  const resolved = resolveRelativePhotoPath(xlsxPath, relativePath);
  if (!resolved.ok) {
    return resolved;
  }

  try {
    const buffer = readFileSync(resolved.value);
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_PHOTO_BYTES) {
      return { ok: false, code: 'INVALID_PHOTO' };
    }
    const type = detectImageType(buffer);
    if (!type) {
      return { ok: false, code: 'INVALID_PHOTO' };
    }
    return { ok: true, value: { type, buffer } };
  } catch {
    return { ok: false, code: 'INVALID_PHOTO' };
  }
}

export function resolveRelativePhotoPath(
  xlsxPath: string,
  relativePath: string,
): FieldResult<string> {
  const trimmed = relativePath.trim();
  if (trimmed.includes('\u0000')) {
    return { ok: false, code: 'INVALID_CHARACTERS' };
  }

  const normalized = trimmed.replace(/\\/g, '/');
  if (isAbsolute(normalized) || /^[a-zA-Z]:/.test(normalized) || normalized.startsWith('//')) {
    return { ok: false, code: 'PATH_TRAVERSAL' };
  }

  const segments = normalized.split('/').filter((segment) => segment.length > 0 && segment !== '.');
  if (segments.length === 0 || segments.some((segment) => segment === '..')) {
    return { ok: false, code: 'PATH_TRAVERSAL' };
  }

  const root = resolve(dirname(xlsxPath));
  const candidate = resolve(root, ...segments);
  const relativeToRoot = relative(root, candidate);
  if (
    relativeToRoot.length === 0 ||
    relativeToRoot.startsWith('..') ||
    isAbsolute(relativeToRoot) ||
    relativeToRoot.includes(`..${sep}`)
  ) {
    return { ok: false, code: 'PATH_TRAVERSAL' };
  }

  if (!existsSync(candidate) || !statSync(candidate).isFile()) {
    return { ok: false, code: 'INVALID_PHOTO' };
  }

  return { ok: true, value: candidate };
}

export function todaySqliteDate(): string {
  return `${formatDateOnly(new Date())} 00:00:00`;
}

export function dateKey(value: string): string {
  return value.slice(0, 10);
}

export function customerMatchKey(customerNumber: string | null, customerName: string | null): string {
  if (customerNumber) {
    return `number:${customerNumber.toLowerCase()}`;
  }
  if (customerName) {
    return `name:${customerName.toLowerCase()}`;
  }
  return 'unknown';
}

function decimalAmount(amount: Decimal): FieldResult<string> {
  if (!amount.isFinite() || amount.lte(0)) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }

  let normalized = amount;
  if (amount.decimalPlaces() > 4) {
    const rounded = amount.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    if (amount.minus(rounded).abs().gte('0.0000001')) {
      return { ok: false, code: 'INVALID_AMOUNT' };
    }
    normalized = rounded;
  }

  const text = formatDecimal(normalized);
  if (!AMOUNT_PATTERN.test(text)) {
    return { ok: false, code: 'INVALID_AMOUNT' };
  }
  return { ok: true, value: text };
}

function formatDecimal(amount: Decimal): string {
  const places = Math.min(amount.decimalPlaces(), 4);
  if (places === 0) {
    return amount.toFixed(0);
  }
  return amount.toFixed(places);
}

function normalizeAmountText(value: string): string | null {
  const trimmed = value.trim().replace(/\s+/g, '');
  if (trimmed.length === 0) {
    return null;
  }

  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(trimmed)) {
    return trimmed.replace(/,/g, '');
  }

  return trimmed;
}

function dateToSqlite(date: Date, originalIso?: string): FieldResult<string> {
  if (Number.isNaN(date.getTime())) {
    return { ok: false, code: 'INVALID_DATE' };
  }

  const iso = originalIso ?? formatDateOnly(date);
  const parsed = parseIsoDate(iso);
  if (Number.isNaN(parsed.getTime())) {
    return { ok: false, code: 'INVALID_DATE' };
  }

  if (parsed.getFullYear() < MIN_IMPORT_YEAR || parsed.getFullYear() > MAX_IMPORT_YEAR) {
    return { ok: false, code: 'INVALID_DATE' };
  }

  if (formatDateOnly(parsed) !== iso) {
    return { ok: false, code: 'INVALID_DATE' };
  }

  return { ok: true, value: `${iso} 00:00:00` };
}

function parseIsoDate(iso: string): Date {
  const [yearText, monthText, dayText] = iso.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  return new Date(year, month - 1, day);
}

function emptyToUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function mapCustomerFieldError(error: unknown, fallback: ImportErrorCode): FieldResult<never> {
  if (error instanceof AppError) {
    if (error.message === 'NAME_TOO_LONG') {
      return { ok: false, code: 'NAME_TOO_LONG' };
    }
    if (error.message === 'CUSTOMER_NUMBER_TOO_LONG') {
      return { ok: false, code: 'CUSTOMER_NUMBER_TOO_LONG' };
    }
    if (error.message === 'INVALID_CUSTOMER_NUMBER' || error.message === 'INVALID_CHARACTERS') {
      return { ok: false, code: error.message as ImportErrorCode };
    }
  }
  return { ok: false, code: fallback };
}
