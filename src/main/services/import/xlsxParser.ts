import ExcelJS from 'exceljs';
import { basename } from 'node:path';
import {
  CUSTOMER_HEADERS,
  CUSTOMERS_SHEET_NAME,
  REQUIRED_TRANSACTION_HEADERS,
  TRANSACTION_HEADERS,
  TRANSACTIONS_SHEET_NAME,
  type ImportErrorCode,
} from '@shared/types/import';
import type { DecodedPhoto } from '../customer/customerPhotoService';
import type { TransactionType } from '@shared/types/transaction';
import { stringifyCell } from './cellValue';
import { DEFAULT_PARSE_TIMEOUT_MS, MAX_IMPORT_ROWS } from './importConstants';
import {
  parseImportAmount,
  parseImportCurrency,
  parseImportCustomerNumber,
  parseImportDate,
  parseImportName,
  parseImportNote,
  parseImportType,
  parsePhotoPath,
  todaySqliteDate,
} from './importValidation';

export interface ParsedWorkbookCustomer {
  row: number;
  name: string | null;
  customerNumber: string | null;
  photo: DecodedPhoto | null;
}

export interface ParsedWorkbookTransaction {
  row: number;
  customerNumber: string | null;
  customerName: string | null;
  type: TransactionType;
  currencyCode: string;
  amount: string;
  transactionDate: string;
  note: string | null;
}

export interface WorkbookParseResult {
  fileName: string;
  customers: ParsedWorkbookCustomer[];
  transactions: ParsedWorkbookTransaction[];
  errors: InternalIssue[];
  warnings: InternalIssue[];
  totalRows: number;
}

export interface InternalIssue {
  sheet: string;
  row: number;
  column?: string;
  code: ImportErrorCode | 'UNKNOWN_COLUMN' | 'POSSIBLE_DUPLICATE';
  value?: string;
}

export interface ParseWorkbookOptions {
  maxRows?: number;
  timeoutMs?: number;
  now?: string;
  activeCurrencyCodes: ReadonlySet<string>;
}

interface HeaderMap {
  byName: Map<string, number>;
  unknown: string[];
}

export async function parseImportWorkbook(
  filePath: string,
  options: ParseWorkbookOptions,
): Promise<WorkbookParseResult> {
  const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_PARSE_TIMEOUT_MS);
  const maxRows = options.maxRows ?? MAX_IMPORT_ROWS;
  const now = options.now ?? todaySqliteDate();
  const errors: InternalIssue[] = [];
  const warnings: InternalIssue[] = [];
  const customers: ParsedWorkbookCustomer[] = [];
  const transactions: ParsedWorkbookTransaction[] = [];
  let totalRows = 0;

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch {
    return emptyFailure(filePath, 'INVALID_FORMAT');
  }

  const date1904 = workbook.properties.date1904 === true;
  const customersSheet = findSheet(workbook, CUSTOMERS_SHEET_NAME);
  const transactionsSheet = findSheet(workbook, TRANSACTIONS_SHEET_NAME);

  if (!customersSheet && !transactionsSheet) {
    return emptyFailure(filePath, 'MISSING_SHEET');
  }

  if (customersSheet) {
    const parsed = parseCustomersSheet(customersSheet, filePath, deadline, maxRows);
    errors.push(...parsed.errors);
    warnings.push(...parsed.warnings);
    customers.push(...parsed.rows);
    totalRows += parsed.totalRows;
    if (parsed.tooManyRows) {
      return finalize(filePath, customers, transactions, errors, warnings, totalRows);
    }
    if (parsed.timedOut) {
      errors.push({ sheet: CUSTOMERS_SHEET_NAME, row: 0, code: 'PARSE_TIMEOUT' });
      return finalize(filePath, customers, transactions, errors, warnings, totalRows);
    }
  }

  if (transactionsSheet) {
    const parsed = parseTransactionsSheet(
      transactionsSheet,
      options.activeCurrencyCodes,
      now,
      date1904,
      deadline,
      maxRows - totalRows,
    );
    errors.push(...parsed.errors);
    warnings.push(...parsed.warnings);
    transactions.push(...parsed.rows);
    totalRows += parsed.totalRows;
    if (parsed.timedOut) {
      errors.push({ sheet: TRANSACTIONS_SHEET_NAME, row: 0, code: 'PARSE_TIMEOUT' });
    }
  }

  if (customers.length === 0 && transactions.length === 0 && errors.length === 0) {
    errors.push({ sheet: transactionsSheet ? TRANSACTIONS_SHEET_NAME : CUSTOMERS_SHEET_NAME, row: 0, code: 'NO_DATA' });
  }

  return finalize(filePath, customers, transactions, errors, warnings, totalRows);
}

function parseCustomersSheet(
  sheet: ExcelJS.Worksheet,
  xlsxPath: string,
  deadline: number,
  maxRows: number,
): {
  rows: ParsedWorkbookCustomer[];
  errors: InternalIssue[];
  warnings: InternalIssue[];
  totalRows: number;
  tooManyRows: boolean;
  timedOut: boolean;
} {
  const errors: InternalIssue[] = [];
  const warnings: InternalIssue[] = [];
  const rows: ParsedWorkbookCustomer[] = [];
  const headers = readHeaderMap(sheet, CUSTOMER_HEADERS);

  for (const column of headers.unknown) {
    warnings.push({
      sheet: CUSTOMERS_SHEET_NAME,
      row: 1,
      column,
      code: 'UNKNOWN_COLUMN',
      value: column,
    });
  }

  if (!headers.byName.has('name') && !headers.byName.has('customer_number')) {
    errors.push({ sheet: CUSTOMERS_SHEET_NAME, row: 1, code: 'MISSING_HEADER' });
    return { rows, errors, warnings, totalRows: 0, tooManyRows: false, timedOut: false };
  }

  const seenNumbers = new Map<string, number>();
  let totalRows = 0;
  let tooManyRows = false;
  let timedOut = false;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1 || tooManyRows || timedOut) {
      return;
    }
    if (Date.now() > deadline) {
      timedOut = true;
      return;
    }
    if (isRowEmpty(row, headers.byName)) {
      return;
    }

    totalRows += 1;
    if (totalRows > maxRows) {
      errors.push({ sheet: CUSTOMERS_SHEET_NAME, row: rowNumber, code: 'TOO_MANY_ROWS' });
      tooManyRows = true;
      return;
    }

    const nameResult = parseImportName(cellByHeader(row, headers.byName, 'name'));
    const numberResult = parseImportCustomerNumber(cellByHeader(row, headers.byName, 'customer_number'));
    const photoResult = headers.byName.has('photo_path')
      ? parsePhotoPath(xlsxPath, cellByHeader(row, headers.byName, 'photo_path'))
      : { ok: true as const, value: null };

    let invalid = false;
    if (!nameResult.ok) {
      errors.push(issue(CUSTOMERS_SHEET_NAME, rowNumber, 'name', nameResult.code, cellByHeader(row, headers.byName, 'name')));
      invalid = true;
    }
    if (!numberResult.ok) {
      errors.push(
        issue(
          CUSTOMERS_SHEET_NAME,
          rowNumber,
          'customer_number',
          numberResult.code,
          cellByHeader(row, headers.byName, 'customer_number'),
        ),
      );
      invalid = true;
    }
    if (!photoResult.ok) {
      errors.push(
        issue(
          CUSTOMERS_SHEET_NAME,
          rowNumber,
          'photo_path',
          photoResult.code,
          cellByHeader(row, headers.byName, 'photo_path'),
        ),
      );
      invalid = true;
    }
    if (invalid || !nameResult.ok || !numberResult.ok || !photoResult.ok) {
      return;
    }

    if (numberResult.value) {
      const duplicateRow = seenNumbers.get(numberResult.value.toLowerCase());
      if (duplicateRow !== undefined) {
        errors.push({
          sheet: CUSTOMERS_SHEET_NAME,
          row: rowNumber,
          column: 'customer_number',
          code: 'DUPLICATE_CUSTOMER',
          value: numberResult.value,
        });
        return;
      }
      seenNumbers.set(numberResult.value.toLowerCase(), rowNumber);
    }

    rows.push({
      row: rowNumber,
      name: nameResult.value,
      customerNumber: numberResult.value,
      photo: photoResult.value,
    });
  });

  return { rows, errors, warnings, totalRows, tooManyRows, timedOut };
}

function parseTransactionsSheet(
  sheet: ExcelJS.Worksheet,
  activeCodes: ReadonlySet<string>,
  now: string,
  date1904: boolean,
  deadline: number,
  remainingRows: number,
): {
  rows: ParsedWorkbookTransaction[];
  errors: InternalIssue[];
  warnings: InternalIssue[];
  totalRows: number;
  timedOut: boolean;
} {
  const errors: InternalIssue[] = [];
  const warnings: InternalIssue[] = [];
  const rows: ParsedWorkbookTransaction[] = [];
  const headers = readHeaderMap(sheet, TRANSACTION_HEADERS);

  for (const column of headers.unknown) {
    warnings.push({
      sheet: TRANSACTIONS_SHEET_NAME,
      row: 1,
      column,
      code: 'UNKNOWN_COLUMN',
      value: column,
    });
  }

  const missingRequired = REQUIRED_TRANSACTION_HEADERS.filter((header) => !headers.byName.has(header));
  const hasCustomerHeader = headers.byName.has('customer_number') || headers.byName.has('customer_name');
  if (missingRequired.length > 0 || !hasCustomerHeader) {
    errors.push({
      sheet: TRANSACTIONS_SHEET_NAME,
      row: 1,
      column: missingRequired[0] ?? 'customer_number',
      code: 'MISSING_HEADER',
    });
    return { rows, errors, warnings, totalRows: 0, timedOut: false };
  }

  let totalRows = 0;
  let timedOut = false;
  let tooManyRows = false;

  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1 || timedOut || tooManyRows) {
      return;
    }
    if (Date.now() > deadline) {
      timedOut = true;
      return;
    }
    if (isRowEmpty(row, headers.byName)) {
      return;
    }

    totalRows += 1;
    if (totalRows > remainingRows) {
      errors.push({ sheet: TRANSACTIONS_SHEET_NAME, row: rowNumber, code: 'TOO_MANY_ROWS' });
      tooManyRows = true;
      return;
    }

    const numberResult = parseImportCustomerNumber(cellByHeader(row, headers.byName, 'customer_number'));
    const nameResult = parseImportName(cellByHeader(row, headers.byName, 'customer_name'));
    const typeResult = parseImportType(cellByHeader(row, headers.byName, 'type'));
    const currencyResult = parseImportCurrency(cellByHeader(row, headers.byName, 'currency'), activeCodes);
    const amountResult = parseImportAmount(cellByHeader(row, headers.byName, 'amount'));
    const dateResult = parseImportDate(cellByHeader(row, headers.byName, 'date'), now, date1904);
    const noteResult = parseImportNote(cellByHeader(row, headers.byName, 'note'));

    let invalid = false;
    const pushFieldError = (
      column: string,
      result: { ok: false; code: ImportErrorCode } | { ok: true; value: unknown },
    ): void => {
      if (!result.ok) {
        errors.push(issue(TRANSACTIONS_SHEET_NAME, rowNumber, column, result.code, cellByHeader(row, headers.byName, column)));
        invalid = true;
      }
    };

    pushFieldError('customer_number', numberResult);
    pushFieldError('customer_name', nameResult);
    pushFieldError('type', typeResult);
    pushFieldError('currency', currencyResult);
    pushFieldError('amount', amountResult);
    pushFieldError('date', dateResult);
    pushFieldError('note', noteResult);

    if (invalid) {
      return;
    }

    if (!numberResult.ok || !nameResult.ok || !typeResult.ok || !currencyResult.ok || !amountResult.ok || !dateResult.ok || !noteResult.ok) {
      return;
    }

    if (!numberResult.value && !nameResult.value) {
      errors.push({
        sheet: TRANSACTIONS_SHEET_NAME,
        row: rowNumber,
        column: 'customer_number',
        code: 'MISSING_CUSTOMER',
      });
      return;
    }

    rows.push({
      row: rowNumber,
      customerNumber: numberResult.value,
      customerName: nameResult.value,
      type: typeResult.value,
      currencyCode: currencyResult.value,
      amount: amountResult.value,
      transactionDate: dateResult.value,
      note: noteResult.value,
    });
  });

  return { rows, errors, warnings, totalRows, timedOut };
}

function readHeaderMap(
  sheet: ExcelJS.Worksheet,
  expected: readonly string[],
): HeaderMap {
  const byName = new Map<string, number>();
  const unknown: string[] = [];
  const expectedSet = new Set(expected);
  const headerRow = sheet.getRow(1);

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = stringifyCell(cell.value).trim();
    if (header.length === 0) {
      return;
    }
    if (expectedSet.has(header)) {
      byName.set(header, colNumber);
      return;
    }
    unknown.push(header);
  });

  return { byName, unknown };
}

function cellByHeader(row: ExcelJS.Row, headers: Map<string, number>, header: string): unknown {
  const column = headers.get(header);
  if (column === undefined) {
    return '';
  }
  return row.getCell(column).value;
}

function isRowEmpty(row: ExcelJS.Row, headers: Map<string, number>): boolean {
  for (const column of headers.values()) {
    if (stringifyCell(row.getCell(column).value).trim().length > 0) {
      return false;
    }
  }
  return true;
}

function findSheet(workbook: ExcelJS.Workbook, name: string): ExcelJS.Worksheet | undefined {
  const expected = name.toLowerCase();
  return workbook.worksheets.find((sheet) => sheet.name.trim().toLowerCase() === expected);
}

function issue(
  sheet: string,
  row: number,
  column: string,
  code: ImportErrorCode,
  value: unknown,
): InternalIssue {
  const text = stringifyCell(value).trim();
  return {
    sheet,
    row,
    column,
    code,
    value: text.length > 80 ? `${text.slice(0, 77)}...` : text,
  };
}

function emptyFailure(filePath: string, code: ImportErrorCode): WorkbookParseResult {
  return {
    fileName: basename(filePath),
    customers: [],
    transactions: [],
    errors: [{ sheet: TRANSACTIONS_SHEET_NAME, row: 0, code }],
    warnings: [],
    totalRows: 0,
  };
}

function finalize(
  filePath: string,
  customers: ParsedWorkbookCustomer[],
  transactions: ParsedWorkbookTransaction[],
  errors: InternalIssue[],
  warnings: InternalIssue[],
  totalRows: number,
): WorkbookParseResult {
  return {
    fileName: basename(filePath),
    customers,
    transactions,
    errors,
    warnings,
    totalRows,
  };
}
