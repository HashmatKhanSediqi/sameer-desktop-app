import type { TransactionType } from './transaction';

export const IMPORT_ERROR_CODES = [
  'INVALID_FORMAT',
  'MISSING_SHEET',
  'MISSING_HEADER',
  'NO_DATA',
  'INVALID_TYPE',
  'INVALID_CURRENCY',
  'INVALID_AMOUNT',
  'MISSING_CUSTOMER',
  'INVALID_DATE',
  'DUPLICATE_CUSTOMER',
  'FILE_TOO_LARGE',
  'TOO_MANY_ROWS',
  'INVALID_PHOTO',
  'PATH_TRAVERSAL',
  'NAME_TOO_LONG',
  'CUSTOMER_NUMBER_TOO_LONG',
  'INVALID_CUSTOMER_NUMBER',
  'INVALID_CHARACTERS',
  'PARSE_TIMEOUT',
] as const;

export type ImportErrorCode = (typeof IMPORT_ERROR_CODES)[number];

export const IMPORT_WARNING_CODES = ['UNKNOWN_COLUMN', 'POSSIBLE_DUPLICATE'] as const;

export type ImportWarningCode = (typeof IMPORT_WARNING_CODES)[number];

export interface ParsedCustomer {
  row: number;
  name: string | null;
  customerNumber: string | null;
  hasPhoto: boolean;
}

export interface ParsedTransaction {
  row: number;
  customerNumber: string | null;
  customerName: string | null;
  type: TransactionType;
  currencyCode: string;
  amount: string;
  transactionDate: string;
  note: string | null;
}

export interface ImportIssue {
  sheet: string;
  row: number;
  column?: string;
  code: string;
  message: string;
  value?: string;
}

export interface ImportParseSummary {
  totalRows: number;
  validCount: number;
  errorCount: number;
  warningCount: number;
}

export interface ImportParseData {
  success: boolean;
  canceled?: boolean;
  fileName?: string;
  validCustomers: ParsedCustomer[];
  validTransactions: ParsedTransaction[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  summary: ImportParseSummary;
}

export interface ImportCommitData {
  customersCreated: number;
  customersMatched: number;
  transactionsImported: number;
  rowsSkipped: number;
}

export const CUSTOMERS_SHEET_NAME = 'Customers';
export const TRANSACTIONS_SHEET_NAME = 'Transactions';

export const CUSTOMER_HEADERS = ['customer_number', 'name', 'photo_path'] as const;
export const TRANSACTION_HEADERS = [
  'customer_number',
  'customer_name',
  'type',
  'currency',
  'amount',
  'date',
  'note',
] as const;

export const REQUIRED_TRANSACTION_HEADERS = ['type', 'currency', 'amount'] as const;

export const VALID_PREVIEW_LIMIT = 50;
