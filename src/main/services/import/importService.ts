import type Database from 'better-sqlite3';
import { basename } from 'node:path';
import type { SupportedLocale } from '@shared/types/locale';
import {
  type ImportCommitData,
  type ImportIssue,
  type ImportParseData,
  type ParsedCustomer,
  type ParsedTransaction,
} from '@shared/types/import';
import { CustomerRepository } from '../../database/repositories/customerRepository';
import { CurrencyRepository } from '../../database/repositories/currencyRepository';
import { TransactionRepository } from '../../database/repositories/transactionRepository';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import type { DecodedPhoto } from '../customer/customerPhotoService';
import { CustomerPhotoService } from '../customer/customerPhotoService';
import { customerMatchKey, dateKey, parseImportAmount, parseImportCurrency, parseImportCustomerNumber, parseImportDate, parseImportName, parseImportNote, parseImportType, todaySqliteDate } from './importValidation';
import { importErrorMessage } from './importI18n';
import { parseImportWorkbook, type ParsedWorkbookCustomer, type ParsedWorkbookTransaction } from './xlsxParser';
import { assertSafeXlsxFile } from './xlsxGuard';

export interface CachedImportParse {
  customers: ParsedWorkbookCustomer[];
  transactions: ParsedWorkbookTransaction[];
  skippedErrorCount: number;
}

export class ImportService {
  private readonly customers: CustomerRepository;
  private readonly transactions: TransactionRepository;
  private readonly currencies: CurrencyRepository;
  private readonly cache = new Map<string, CachedImportParse>();

  constructor(
    private readonly db: Database.Database,
    private readonly photoService: CustomerPhotoService,
    private readonly logger: Logger,
  ) {
    this.customers = new CustomerRepository(db);
    this.transactions = new TransactionRepository(db);
    this.currencies = new CurrencyRepository(db);
  }

  async parseFile(filePath: string, locale: SupportedLocale, sessionId: string): Promise<ImportParseData> {
    const guarded = assertSafeXlsxFile(filePath);
    if (!guarded.ok) {
      this.cache.delete(sessionId);
      return emptyParse(filePath, locale, guarded.code);
    }

    const activeCodes = new Set(this.currencies.listActive().map((currency) => currency.code));
    const parsed = await parseImportWorkbook(guarded.filePath, { activeCurrencyCodes: activeCodes });
    const warnings = [...parsed.warnings];

    const seenTxn = new Set<string>();
    for (const transaction of parsed.transactions) {
      const key = transactionDuplicateKey(transaction);
      if (seenTxn.has(key) || this.transactions.findPossibleDuplicate({
        customerNumber: transaction.customerNumber,
        customerName: transaction.customerName,
        type: transaction.type,
        currencyCode: transaction.currencyCode,
        amount: transaction.amount,
        date: transaction.transactionDate,
      })) {
        warnings.push({
          sheet: 'Transactions',
          row: transaction.row,
          code: 'POSSIBLE_DUPLICATE',
        });
      }
      seenTxn.add(key);
    }

    const errors = parsed.errors.map((item) => toIssue(item, locale));
    const mappedWarnings = warnings.map((item) => toIssue(item, locale));
    const validCustomers = parsed.customers.map(toParsedCustomer);
    const validTransactions = parsed.transactions.map(toParsedTransaction);
    const structureFailed = errors.some((error) =>
      error.code === 'INVALID_FORMAT' || error.code === 'MISSING_SHEET' || error.code === 'NO_DATA' || error.code === 'PARSE_TIMEOUT',
    );

    this.cache.set(sessionId, {
      customers: parsed.customers,
      transactions: parsed.transactions,
      skippedErrorCount: errors.length,
    });

    return {
      success: !structureFailed && (validCustomers.length > 0 || validTransactions.length > 0),
      fileName: parsed.fileName,
      validCustomers,
      validTransactions,
      errors,
      warnings: mappedWarnings,
      summary: {
        totalRows: parsed.totalRows,
        validCount: validCustomers.length + validTransactions.length,
        errorCount: errors.length,
        warningCount: mappedWarnings.length,
      },
    };
  }

  commit(
    sessionId: string,
    validCustomers: ParsedCustomer[],
    validTransactions: ParsedTransaction[],
    locale: SupportedLocale,
  ): ImportCommitData {
    const cached = this.cache.get(sessionId);
    const customers = this.resolveCustomersForCommit(cached, validCustomers);
    const transactions = this.resolveTransactionsForCommit(cached, validTransactions, locale);

    if (customers.length === 0 && transactions.length === 0) {
      throw new AppError('VALIDATION_ERROR', 'NO_DATA');
    }

    const activeCodes = new Set(this.currencies.listActive().map((currency) => currency.code));
    this.assertCommitPayload(customers, transactions, activeCodes);

    const photosToSave: Array<{ id: number; photo: DecodedPhoto }> = [];

    try {
      const summary = this.db.transaction(() => {
        const createdIdsByNumber = new Map<string, number>();
        const createdIdsByName = new Map<string, number>();
        const createdIds = new Set<number>();
        const matchedIds = new Set<number>();
        let customersCreated = 0;
        let customersMatched = 0;

        const recordMatch = (id: number): void => {
          if (!createdIds.has(id) && !matchedIds.has(id)) {
            matchedIds.add(id);
            customersMatched += 1;
          }
        };

        for (const customer of customers) {
          const existing = this.matchExistingCustomer(customer.customerNumber, customer.name, createdIdsByNumber, createdIdsByName);
          if (existing) {
            rememberCustomer(createdIdsByNumber, createdIdsByName, customer.customerNumber, customer.name, existing);
            recordMatch(existing);
            continue;
          }

          const id = this.customers.createCustomer({
            name: customer.name,
            customerNumber: customer.customerNumber,
          });
          customersCreated += 1;
          createdIds.add(id);
          rememberCustomer(createdIdsByNumber, createdIdsByName, customer.customerNumber, customer.name, id);
          if (customer.photo) {
            photosToSave.push({ id, photo: customer.photo });
          }
        }

        let transactionsImported = 0;
        for (const transaction of transactions) {
          let customerId = this.matchExistingCustomer(
            transaction.customerNumber,
            transaction.customerName,
            createdIdsByNumber,
            createdIdsByName,
          );

          if (customerId) {
            rememberCustomer(
              createdIdsByNumber,
              createdIdsByName,
              transaction.customerNumber,
              transaction.customerName,
              customerId,
            );
            recordMatch(customerId);
          } else {
            customerId = this.customers.createCustomer({
              name: transaction.customerName,
              customerNumber: transaction.customerNumber,
            });
            customersCreated += 1;
            createdIds.add(customerId);
            rememberCustomer(
              createdIdsByNumber,
              createdIdsByName,
              transaction.customerNumber,
              transaction.customerName,
              customerId,
            );
          }

          this.transactions.createTransaction({
            customerId,
            type: transaction.type,
            currencyCode: transaction.currencyCode,
            amount: transaction.amount,
            note: transaction.note,
            transactionDate: transaction.transactionDate,
          });
          transactionsImported += 1;
        }

        return {
          customersCreated,
          customersMatched,
          transactionsImported,
          rowsSkipped: cached?.skippedErrorCount ?? 0,
        };
      }).immediate();

      for (const item of photosToSave) {
        try {
          const filename = this.photoService.save(item.id, item.photo);
          this.customers.updatePhotoFilename(item.id, filename);
        } catch (error) {
          this.logger.warn('Imported customer photo could not be saved', {
            customerId: item.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      this.cache.delete(sessionId);
      this.logger.info('Import committed', summary);
      return summary;
    } catch (error) {
      this.logger.error('Import commit failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('IMPORT_FAILED', 'IMPORT_FAILED');
    }
  }

  clearCache(sessionId: string): void {
    this.cache.delete(sessionId);
  }

  private resolveCustomersForCommit(
    cached: CachedImportParse | undefined,
    submitted: ParsedCustomer[],
  ): ParsedWorkbookCustomer[] {
    if (cached && customerPayloadMatches(cached.customers, submitted)) {
      return cached.customers;
    }
    return submitted.map((customer) => {
      const nameResult = parseImportName(customer.name);
      const numberResult = parseImportCustomerNumber(customer.customerNumber);
      if (!nameResult.ok || !numberResult.ok) {
        throw new AppError('VALIDATION_ERROR', 'VALIDATION_ERROR');
      }
      return {
        row: customer.row,
        name: nameResult.value,
        customerNumber: numberResult.value,
        photo: null,
      };
    });
  }

  private resolveTransactionsForCommit(
    cached: CachedImportParse | undefined,
    submitted: ParsedTransaction[],
    locale: SupportedLocale,
  ): ParsedWorkbookTransaction[] {
    if (cached && transactionPayloadMatches(cached.transactions, submitted)) {
      return cached.transactions;
    }

    const activeCodes = new Set(this.currencies.listActive().map((currency) => currency.code));
    const now = todaySqliteDate();
    return submitted.map((transaction) => revalidateSubmittedTransaction(transaction, activeCodes, now, locale));
  }

  private assertCommitPayload(
    customers: ParsedWorkbookCustomer[],
    transactions: ParsedWorkbookTransaction[],
    activeCodes: ReadonlySet<string>,
  ): void {
    const seenNumbers = new Set<string>();
    for (const customer of customers) {
      if (customer.customerNumber) {
        const key = customer.customerNumber.toLowerCase();
        if (seenNumbers.has(key)) {
          throw new AppError('VALIDATION_ERROR', 'DUPLICATE_CUSTOMER');
        }
        seenNumbers.add(key);
      }
    }

    for (const transaction of transactions) {
      if (!transaction.customerNumber && !transaction.customerName) {
        throw new AppError('VALIDATION_ERROR', 'MISSING_CUSTOMER');
      }
      if (!activeCodes.has(transaction.currencyCode)) {
        throw new AppError('INVALID_CURRENCY', 'INVALID_CURRENCY');
      }
    }
  }

  private matchExistingCustomer(
    customerNumber: string | null,
    customerName: string | null,
    createdByNumber: Map<string, number>,
    createdByName: Map<string, number>,
  ): number | undefined {
    if (customerNumber) {
      const created = createdByNumber.get(customerNumber.toLowerCase());
      if (created) {
        return created;
      }
      const existing = this.customers.getCustomersByCustomerNumber(customerNumber)[0];
      if (existing) {
        return existing.id;
      }
    }

    if (customerName && !customerNumber) {
      const created = createdByName.get(customerName.toLowerCase());
      if (created) {
        return created;
      }
      const existing = this.customers.getCustomersByName(customerName)[0];
      if (existing) {
        return existing.id;
      }
    }

    return undefined;
  }
}

function rememberCustomer(
  byNumber: Map<string, number>,
  byName: Map<string, number>,
  customerNumber: string | null,
  name: string | null,
  id: number,
): void {
  if (customerNumber) {
    byNumber.set(customerNumber.toLowerCase(), id);
  }
  if (name) {
    byName.set(name.toLowerCase(), id);
  }
}

function customerPayloadMatches(cached: ParsedWorkbookCustomer[], submitted: ParsedCustomer[]): boolean {
  if (cached.length !== submitted.length) {
    return false;
  }
  return cached.every((customer, index) => {
    const row = submitted[index];
    return (
      row !== undefined &&
      row.row === customer.row &&
      row.name === customer.name &&
      row.customerNumber === customer.customerNumber
    );
  });
}

function transactionPayloadMatches(
  cached: ParsedWorkbookTransaction[],
  submitted: ParsedTransaction[],
): boolean {
  if (cached.length !== submitted.length) {
    return false;
  }
  return cached.every((transaction, index) => {
    const row = submitted[index];
    return (
      row !== undefined &&
      row.row === transaction.row &&
      row.customerNumber === transaction.customerNumber &&
      row.customerName === transaction.customerName &&
      row.type === transaction.type &&
      row.currencyCode === transaction.currencyCode &&
      row.amount === transaction.amount &&
      row.transactionDate === transaction.transactionDate &&
      row.note === transaction.note
    );
  });
}

function revalidateSubmittedTransaction(
  transaction: ParsedTransaction,
  activeCodes: ReadonlySet<string>,
  now: string,
  _locale: SupportedLocale,
): ParsedWorkbookTransaction {
  const numberResult = parseImportCustomerNumber(transaction.customerNumber);
  const nameResult = parseImportName(transaction.customerName);
  const typeResult = parseImportType(transaction.type);
  const currencyResult = parseImportCurrency(transaction.currencyCode, activeCodes);
  const amountResult = parseImportAmount(transaction.amount);
  const dateResult = parseImportDate(transaction.transactionDate, now);
  const noteResult = parseImportNote(transaction.note);

  if (
    !numberResult.ok ||
    !nameResult.ok ||
    !typeResult.ok ||
    !currencyResult.ok ||
    !amountResult.ok ||
    !dateResult.ok ||
    !noteResult.ok ||
    (!numberResult.value && !nameResult.value)
  ) {
    throw new AppError('VALIDATION_ERROR', 'VALIDATION_ERROR');
  }

  return {
    row: transaction.row,
    customerNumber: numberResult.value,
    customerName: nameResult.value,
    type: typeResult.value,
    currencyCode: currencyResult.value,
    amount: amountResult.value,
    transactionDate: dateResult.value,
    note: noteResult.value,
  };
}

function transactionDuplicateKey(transaction: ParsedWorkbookTransaction): string {
  return [
    customerMatchKey(transaction.customerNumber, transaction.customerName),
    dateKey(transaction.transactionDate),
    transaction.type,
    transaction.currencyCode,
    transaction.amount,
  ].join('|');
}

function toParsedCustomer(customer: ParsedWorkbookCustomer): ParsedCustomer {
  return {
    row: customer.row,
    name: customer.name,
    customerNumber: customer.customerNumber,
    hasPhoto: Boolean(customer.photo),
  };
}

function toParsedTransaction(transaction: ParsedWorkbookTransaction): ParsedTransaction {
  return {
    row: transaction.row,
    customerNumber: transaction.customerNumber,
    customerName: transaction.customerName,
    type: transaction.type,
    currencyCode: transaction.currencyCode,
    amount: transaction.amount,
    transactionDate: transaction.transactionDate,
    note: transaction.note,
  };
}

function toIssue(
  item: { sheet: string; row: number; column?: string; code: string; value?: string },
  locale: SupportedLocale,
): ImportIssue {
  return {
    sheet: item.sheet,
    row: item.row,
    column: item.column,
    code: item.code,
    value: item.value,
    message: importErrorMessage(locale, item.code, {
      column: item.column ?? '',
      row: item.row,
      value: item.value ?? '',
    }),
  };
}

function emptyParse(filePath: string | undefined, locale: SupportedLocale, code: string): ImportParseData {
  return {
    success: false,
    fileName: filePath ? basename(filePath) : undefined,
    validCustomers: [],
    validTransactions: [],
    errors: [
      {
        sheet: 'Transactions',
        row: 0,
        code,
        message: importErrorMessage(locale, code),
      },
    ],
    warnings: [],
    summary: { totalRows: 0, validCount: 0, errorCount: 1, warningCount: 0 },
  };
}

export { emptyParse };
