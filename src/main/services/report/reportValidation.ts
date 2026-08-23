import { AppError } from '../../utils/errors';
import { isSupportedLocale, type SupportedLocale } from '@shared/types/locale';
import {
  isReportFormat,
  isReportType,
  type ReportFormat,
  type ReportGenerateInput,
  type ReportType,
} from '@shared/types/report';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportGenerateInput(input: unknown): ReportGenerateInput {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'Invalid request');
  }

  const record = input as Record<string, unknown>;
  if (!isReportType(record.type)) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REPORT_TYPE');
  }
  if (!isReportFormat(record.format)) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REPORT_FORMAT');
  }
  if (typeof record.language !== 'string' || !isSupportedLocale(record.language)) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_LANGUAGE');
  }

  const customerId = parseOptionalCustomerId(record.customerId);
  const startDate = parseOptionalDate(record.startDate);
  const endDate = parseOptionalDate(record.endDate);

  if (startDate && endDate && startDate > endDate) {
    throw new AppError('INVALID_DATE_RANGE', 'INVALID_DATE_RANGE');
  }

  const type = record.type as ReportType;
  if (type === 'customer' && customerId === undefined) {
    throw new AppError('VALIDATION_ERROR', 'CUSTOMER_REQUIRED');
  }
  if (type === 'date_range' && (!startDate || !endDate)) {
    throw new AppError('VALIDATION_ERROR', 'DATE_RANGE_REQUIRED');
  }

  return {
    type,
    format: record.format as ReportFormat,
    language: record.language as SupportedLocale,
    customerId,
    startDate,
    endDate,
  };
}

function parseOptionalCustomerId(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_CUSTOMER_ID');
  }
  return value;
}

function parseOptionalDate(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value !== 'string' || !DATE_ONLY.test(value.trim())) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_DATE');
  }
  const trimmed = value.trim();
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_DATE');
  }
  return trimmed;
}

export function sanitizeFilePart(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^\.+/, '')
    .slice(0, 80);
  return cleaned.length > 0 ? cleaned : 'All';
}

export function reportTypeFileLabel(type: ReportType): string {
  switch (type) {
    case 'customer':
      return 'Customer';
    case 'all_customers':
      return 'AllCustomers';
    case 'date_range':
      return 'DateRange';
    case 'transactions':
      return 'Transactions';
    case 'currency_summary':
      return 'CurrencySummary';
  }
}

export function buildReportFileName(
  type: ReportType,
  format: ReportFormat,
  customerLabel: string,
  generatedDate: Date,
): string {
  const yyyy = String(generatedDate.getFullYear());
  const mm = String(generatedDate.getMonth() + 1).padStart(2, '0');
  const dd = String(generatedDate.getDate()).padStart(2, '0');
  return `FMT_${reportTypeFileLabel(type)}_${sanitizeFilePart(customerLabel)}_${yyyy}-${mm}-${dd}.${format}`;
}
