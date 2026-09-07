import type Database from 'better-sqlite3';
import Decimal from 'decimal.js';
import { CustomerRepository } from '../../database/repositories/customerRepository';
import { CurrencyRepository } from '../../database/repositories/currencyRepository';
import {
  TransactionRepository,
  type ReportTransactionQuery,
  type ReportTransactionRecord,
  type TransactionAmountRow,
  type TransactionRecord,
} from '../../database/repositories/transactionRepository';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import type { Currency } from '@shared/types/currency';
import { randomUUID } from 'node:crypto';
import type {
  CreateTransactionInput,
  CustomerCurrencyExchange,
  CustomerTransactionSummary,
  CurrencySummary,
  GlobalCurrencyTotal,
  Transaction,
  TransactionListQuery,
  TransactionListResult,
  UpdateTransactionInput,
} from '@shared/types/transaction';
import type { CreateTransferInput, TransferResult } from '@shared/types/transfer';
import type { CreateCustomerExchangeInput, CustomerExchangeResult } from '@shared/types/exchange';
import { calculateFromAmount, calculateToAmount } from '@shared/exchange';
import { formatBalance, ZERO_BALANCE } from './money';
import {
  buildAccountingMapFromAggregates,
  buildCurrencySummariesFromAggregates,
  buildGlobalTotalsFromAggregates,
} from './transactionAggregates';
import {
  parseAmount,
  parseCurrencyCode,
  parseOptionalNote,
  parsePositiveIntegerId,
  parseTransactionDate,
  parseTransactionType,
} from './transactionValidation';
import { resolvePagination as resolveSharedPagination } from '@shared/pagination';

const DEFAULT_PAGE_SIZE = 10;

export class TransactionService {
  private readonly transactions: TransactionRepository;
  private readonly customers: CustomerRepository;
  private readonly currencies: CurrencyRepository;

  constructor(
    db: Database.Database,
    private readonly logger: Logger,
  ) {
    this.transactions = new TransactionRepository(db);
    this.customers = new CustomerRepository(db);
    this.currencies = new CurrencyRepository(db);
  }

  create(input: CreateTransactionInput): Transaction {
    const customerId = this.requireCustomer(input.customerId);
    const type = parseTransactionType(input.type);
    const amount = parseAmount(input.amount);
    const currencyCode = this.requireActiveCurrency(input.currencyCode);
    const note = parseOptionalNote(input.note);
    const transactionDate = parseTransactionDate(input.transactionDate);

    const id = this.transactions.createTransaction({
      customerId,
      type,
      currencyCode,
      amount,
      note,
      transactionDate,
    });

    this.logger.info('Transaction created', { transactionId: id, customerId, type, currencyCode });
    return this.getById(id);
  }

  update(input: UpdateTransactionInput): Transaction {
    const id = parsePositiveIntegerId(input.id, 'INVALID_TRANSACTION_ID');
    const existing = this.transactions.getTransactionById(id);
    if (!existing) {
      throw new AppError('TRANSACTION_NOT_FOUND', 'TRANSACTION_NOT_FOUND');
    }
    if (existing.transfer_id) {
      throw new AppError('VALIDATION_ERROR', 'TRANSFER_IMMUTABLE');
    }
    if (existing.exchange_id) {
      throw new AppError('VALIDATION_ERROR', 'EXCHANGE_IMMUTABLE');
    }

    const type = parseTransactionType(input.type);
    const amount = parseAmount(input.amount);
    const currencyCode = this.requireActiveCurrency(input.currencyCode);
    const note = parseOptionalNote(input.note);
    const transactionDate =
      input.transactionDate === undefined
        ? existing.transaction_date
        : parseTransactionDate(input.transactionDate);

    const updated = this.transactions.updateTransaction(id, {
      type,
      currencyCode,
      amount,
      note,
      transactionDate,
    });

    if (!updated) {
      throw new AppError('TRANSACTION_NOT_FOUND', 'TRANSACTION_NOT_FOUND');
    }

    this.logger.info('Transaction updated', { transactionId: id, customerId: existing.customer_id });
    return this.getById(id);
  }

  delete(id: unknown): { success: true } {
    const transactionId = parsePositiveIntegerId(id, 'INVALID_TRANSACTION_ID');
    const existing = this.transactions.getTransactionById(transactionId);
    if (!existing) {
      throw new AppError('TRANSACTION_NOT_FOUND', 'TRANSACTION_NOT_FOUND');
    }

    if (existing.transfer_id) {
      const removed = this.transactions.deleteByTransferId(existing.transfer_id);
      if (removed === 0) {
        throw new AppError('TRANSACTION_NOT_FOUND', 'TRANSACTION_NOT_FOUND');
      }
      this.logger.info('Transfer deleted', {
        transferId: existing.transfer_id,
        customerId: existing.customer_id,
      });
      return { success: true };
    }
    if (existing.exchange_id) {
      const removed = this.transactions.deleteByExchangeId(existing.exchange_id);
      if (removed !== 2) throw new AppError('DATABASE_ERROR', 'EXCHANGE_GROUP_INVALID');
      this.logger.info('Customer currency exchange deleted', { exchangeId: existing.exchange_id });
      return { success: true };
    }

    const deleted = this.transactions.deleteTransaction(transactionId);
    if (!deleted) {
      throw new AppError('TRANSACTION_NOT_FOUND', 'TRANSACTION_NOT_FOUND');
    }

    this.logger.info('Transaction deleted', {
      transactionId,
      customerId: existing.customer_id,
    });
    return { success: true };
  }

  transfer(input: CreateTransferInput): TransferResult {
    const fromCustomerId = this.requireCustomer(input.fromCustomerId);
    const toCustomerId = this.requireCustomer(input.toCustomerId);
    if (fromCustomerId === toCustomerId) {
      throw new AppError('TRANSFER_SAME_CUSTOMER', 'TRANSFER_SAME_CUSTOMER');
    }

    const amount = parseAmount(input.amount);
    const currencyCode = this.requireActiveCurrency(input.currencyCode);
    const note = parseOptionalNote(input.note);
    const transactionDate = parseTransactionDate(input.transactionDate);

    const transferId = randomUUID();
    const pair = this.transactions.createTransferPair(
      {
        customerId: fromCustomerId,
        type: 'CASH_OUT',
        currencyCode,
        amount,
        note,
        transactionDate,
        transferId,
        transferRole: 'OUT',
        counterpartyCustomerId: toCustomerId,
      },
      {
        customerId: toCustomerId,
        type: 'CASH_IN',
        currencyCode,
        amount,
        note,
        transactionDate,
        transferId,
        transferRole: 'IN',
        counterpartyCustomerId: fromCustomerId,
      },
    );

    this.logger.info('Transfer created', {
      transferId,
      fromCustomerId,
      toCustomerId,
      currencyCode,
    });

    return {
      transferId,
      outTransactionId: pair.outId,
      inTransactionId: pair.inId,
    };
  }

  exchange(input: CreateCustomerExchangeInput): CustomerExchangeResult {
    const customerId = this.requireCustomer(input.customerId);
    const fromCurrency = this.requireActiveCurrency(input.fromCurrency);
    const toCurrency = this.requireActiveCurrency(input.toCurrency);
    if (fromCurrency === toCurrency) throw new AppError('VALIDATION_ERROR', 'EXCHANGE_SAME_CURRENCY');
    const fromAmount = parseAmount(input.fromAmount);
    const toAmount = parseAmount(input.toAmount);
    const rate = parseAmount(input.rate);
    if (calculateToAmount(fromAmount, rate) !== new Decimal(toAmount).toFixed(4)
      && calculateFromAmount(toAmount, rate) !== new Decimal(fromAmount).toFixed(4)) {
      throw new AppError('VALIDATION_ERROR', 'EXCHANGE_AMOUNTS_MISMATCH');
    }
    const note = parseOptionalNote(input.note);
    const transactionDate = parseTransactionDate(input.transactionDate);
    if (typeof input.requestId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.requestId)) {
      throw new AppError('VALIDATION_ERROR', 'EXCHANGE_REQUEST_INVALID');
    }

    const rawCommission = input.commissionAmount?.trim() ?? '';
    let commissionAmount: string | null = null;
    if (rawCommission !== '') {
      if (!/^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/.test(rawCommission)) {
        throw new AppError('VALIDATION_ERROR', 'EXCHANGE_COMMISSION_INVALID');
      }
      if (!new Decimal(rawCommission).isZero()) commissionAmount = parseAmount(rawCommission);
    }
    let commissionCurrency: string | null = null;
    if (commissionAmount) {
      commissionCurrency = this.requireActiveCurrency(input.commissionCurrency);
      if (commissionCurrency !== fromCurrency && commissionCurrency !== toCurrency) {
        throw new AppError('VALIDATION_ERROR', 'EXCHANGE_COMMISSION_CURRENCY_INVALID');
      }
    }
    const sourceDebit = commissionCurrency === fromCurrency
      ? new Decimal(fromAmount).plus(commissionAmount!).toFixed(4)
      : new Decimal(fromAmount).toFixed(4);
    const destinationCredit = commissionCurrency === toCurrency
      ? new Decimal(toAmount).minus(commissionAmount!).toFixed(4)
      : new Decimal(toAmount).toFixed(4);
    if (new Decimal(destinationCredit).lte(0)) {
      throw new AppError('VALIDATION_ERROR', 'EXCHANGE_COMMISSION_TOO_LARGE');
    }
    const exchangeId = randomUUID();
    const metadata = {
      customerId, note, transactionDate, exchangeId,
      exchangeFromCurrency: fromCurrency, exchangeFromAmount: new Decimal(fromAmount).toFixed(4),
      exchangeToCurrency: toCurrency, exchangeToAmount: new Decimal(toAmount).toFixed(4),
      exchangeRate: new Decimal(rate).toFixed(), exchangeCommissionCurrency: commissionCurrency,
      exchangeCommissionAmount: commissionAmount ? new Decimal(commissionAmount).toFixed(4) : null,
      exchangeRequestId: input.requestId,
    };
    const pair = this.transactions.createExchangePair(
      { ...metadata, type: 'CASH_OUT', currencyCode: fromCurrency, amount: sourceDebit, exchangeRole: 'SOLD' },
      { ...metadata, type: 'CASH_IN', currencyCode: toCurrency, amount: destinationCredit, exchangeRole: 'BOUGHT' },
    );
    this.logger.info('Customer currency exchange created', { exchangeId, customerId, fromCurrency, toCurrency });
    return { exchangeId: pair.duplicate ? this.getById(pair.soldId).exchangeId! : exchangeId,
      soldTransactionId: pair.soldId, boughtTransactionId: pair.boughtId, duplicate: pair.duplicate };
  }

  getById(id: unknown): Transaction {
    const transactionId = parsePositiveIntegerId(id, 'INVALID_TRANSACTION_ID');
    const record = this.transactions.getTransactionById(transactionId);
    if (!record) {
      throw new AppError('TRANSACTION_NOT_FOUND', 'TRANSACTION_NOT_FOUND');
    }
    return toTransaction(record);
  }

  list(query: TransactionListQuery): TransactionListResult {
    const customerId = this.requireCustomer(query.customerId);
    const totalCount = this.transactions.countByCustomer(customerId);
    const pagination = this.resolvePagination(query.page, query.pageSize, totalCount);

    const rows = this.transactions.listByCustomer(
      customerId,
      pagination.pageSize,
      (pagination.page - 1) * pagination.pageSize,
    );

    return {
      transactions: rows.map(toTransaction),
      exchanges: groupCustomerExchangeRows(this.transactions.listExchangeRowsByCustomer(customerId)),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,
    };
  }

  getCustomerSummary(customerId: unknown): CustomerTransactionSummary {
    const id = this.requireCustomer(customerId);
    const currencies = this.currencies.listActive();
    const groups = this.transactions.aggregateForCustomer(id);
    return {
      customerId: id,
      currencies: buildCurrencySummariesFromAggregates(currencies, groups),
      cashInCount: groups.filter((group) => group.type === 'CASH_IN').reduce((sum, group) => sum + group.ordinary_tx_count, 0),
      cashOutCount: groups.filter((group) => group.type === 'CASH_OUT').reduce((sum, group) => sum + group.ordinary_tx_count, 0),
    };
  }

  getGlobalTotals(): GlobalCurrencyTotal[] {
    const currencies = this.currencies.listActive();
    const groups = this.transactions.aggregateGlobal();
    return buildGlobalTotalsFromAggregates(currencies, groups);
  }

  getListAccounting(customerIds: number[]): Map<
    number,
    { balances: Record<string, string>; cashInCount: number; cashOutCount: number }
  > {
    if (customerIds.length === 0) {
      return new Map();
    }

    const currencies = this.currencies.listActive();
    const groups = this.transactions.aggregateForCustomers(customerIds);
    return buildAccountingMapFromAggregates(currencies, groups, customerIds);
  }

  getAllCustomersAccounting(): Map<
    number,
    { balances: Record<string, string>; cashInCount: number; cashOutCount: number }
  > {
    const currencies = this.currencies.listActive();
    const groups = this.transactions.aggregateAllCustomers();
    const customerIds = [...new Set(groups.map((group) => group.customer_id))];
    return buildAccountingMapFromAggregates(currencies, groups, customerIds);
  }

  listActiveCurrencies(): Currency[] {
    return this.currencies.listActive();
  }

  listAllCurrencies(): Currency[] {
    return this.currencies.listAll();
  }

  listAmountRows(customerId?: number, dateRange?: { startDate?: string; endDate?: string }): TransactionAmountRow[] {
    return this.transactions.listAmountRows(customerId, dateRange);
  }

  listForReport(query: ReportTransactionQuery): ReportTransactionRecord[] {
    if (query.customerId !== undefined) {
      this.requireCustomer(query.customerId);
    }
    return this.transactions.listForReport(query);
  }

  summarizeRows(currencies: Currency[], rows: TransactionAmountRow[]): CurrencySummary[] {
    return buildCurrencySummaries(currencies, rows);
  }

  summarizeAggregates(currencies: Currency[], groups: ReturnType<TransactionRepository['aggregateForReportScope']>): CurrencySummary[] {
    return buildCurrencySummariesFromAggregates(currencies, groups);
  }

  aggregateForReportScope(query: ReportTransactionQuery): ReturnType<TransactionRepository['aggregateForReportScope']> {
    return this.transactions.aggregateForReportScope(query);
  }

  countDistinctCustomersByCurrency(): Array<{ currency_code: string; customer_count: number }> {
    return this.transactions.countDistinctCustomersByCurrency();
  }

  aggregateGlobal(): ReturnType<TransactionRepository['aggregateGlobal']> {
    return this.transactions.aggregateGlobal();
  }

  private requireCustomer(id: unknown): number {
    const customerId = parsePositiveIntegerId(id, 'INVALID_CUSTOMER_ID');
    if (!this.customers.getCustomerById(customerId)) {
      throw new AppError('CUSTOMER_NOT_FOUND', 'CUSTOMER_NOT_FOUND');
    }
    return customerId;
  }

  private balanceFor(customerId: number, currencyCode: string): string {
    const rows = this.transactions.listAmountRows(customerId).filter((row) => row.currency_code === currencyCode);
    let cashIn = new Decimal(0);
    let cashOut = new Decimal(0);
    for (const row of rows) {
      const value = new Decimal(row.amount);
      if (row.type === 'CASH_IN') {
        cashIn = cashIn.plus(value);
      } else {
        cashOut = cashOut.plus(value);
      }
    }
    return formatBalance(cashIn.minus(cashOut));
  }

  private requireActiveCurrency(value: unknown): string {
    const code = parseCurrencyCode(value);
    const currency = this.currencies.getByCode(code);
    if (!currency || !currency.isActive) {
      throw new AppError('INVALID_CURRENCY', 'CURRENCY_INVALID');
    }
    return currency.code;
  }

  private resolvePagination(
    pageInput: number | undefined,
    pageSizeInput: number | undefined,
    totalCount: number,
  ): { page: number; pageSize: number; totalPages: number } {
    const paginationEnabled = this.transactions.getSetting('pagination_enabled') !== 'false';
    const configuredSize = Number.parseInt(
      this.transactions.getSetting('pagination_page_size') ?? String(DEFAULT_PAGE_SIZE),
      10,
    );
    const defaultSize =
      Number.isInteger(configuredSize) && configuredSize > 0 ? configuredSize : DEFAULT_PAGE_SIZE;

    if (!paginationEnabled) {
      const pageSize = Math.max(totalCount, 1);
      return { page: 1, pageSize, totalPages: 1 };
    }

    const resolved = resolveSharedPagination(pageInput, pageSizeInput, totalCount, defaultSize);
    return resolved;
  }
}

function toTransaction(record: TransactionRecord): Transaction {
  return {
    id: record.id,
    customerId: record.customer_id,
    type: record.type,
    currencyCode: record.currency_code,
    amount: record.amount,
    note: record.note,
    transactionDate: record.transaction_date,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    isEdited: record.updated_at !== record.created_at,
    transferId: record.transfer_id ?? null,
    transferRole: record.transfer_role ?? null,
    counterpartyCustomerId: record.counterparty_customer_id ?? null,
    counterpartyName: record.counterparty_name ?? null,
    exchangeId: record.exchange_id ?? null,
    exchangeRole: record.exchange_role ?? null,
    exchangeFromCurrency: record.exchange_from_currency ?? null,
    exchangeFromAmount: record.exchange_from_amount ?? null,
    exchangeToCurrency: record.exchange_to_currency ?? null,
    exchangeToAmount: record.exchange_to_amount ?? null,
    exchangeRate: record.exchange_rate ?? null,
    exchangeCommissionCurrency: record.exchange_commission_currency ?? null,
    exchangeCommissionAmount: record.exchange_commission_amount ?? null,
  };
}

function buildCurrencySummaries(
  currencies: Currency[],
  rows: TransactionAmountRow[],
): CurrencySummary[] {
  return currencies.map((currency) => {
    let cashIn = new Decimal(0);
    let cashOut = new Decimal(0);
    let cashInCount = 0;
    let cashOutCount = 0;

    for (const row of rows) {
      if (row.currency_code !== currency.code) {
        continue;
      }
      const amount = new Decimal(row.amount);
      if (row.type === 'CASH_IN') {
        cashIn = cashIn.plus(amount);
        cashInCount += 1;
      } else {
        cashOut = cashOut.plus(amount);
        cashOutCount += 1;
      }
    }

    return {
      currencyCode: currency.code,
      nameKey: currency.nameKey,
      symbol: currency.symbol,
      cashInTotal: formatBalance(cashIn),
      cashOutTotal: formatBalance(cashOut),
      balance: formatBalance(cashIn.minus(cashOut)),
      cashInCount,
      cashOutCount,
    };
  });
}

export { ZERO_BALANCE, buildCurrencySummaries };

export function groupCustomerExchangeRows(records: TransactionRecord[]): CustomerCurrencyExchange[] {
  const groups = new Map<string, TransactionRecord[]>();
  for (const record of records) {
    if (!record.exchange_id) continue;
    const rows = groups.get(record.exchange_id) ?? [];
    rows.push(record);
    groups.set(record.exchange_id, rows);
  }

  return [...groups.entries()].flatMap(([exchangeId, rows]) => {
    const sold = rows.find((row) => row.exchange_role === 'SOLD');
    const bought = rows.find((row) => row.exchange_role === 'BOUGHT');
    if (!sold || !bought) return [];
    return [{
      exchangeId,
      transactionId: sold.id,
      transactionDate: sold.transaction_date,
      fromCurrency: sold.exchange_from_currency ?? sold.currency_code,
      fromAmount: sold.exchange_from_amount ?? sold.amount,
      toCurrency: sold.exchange_to_currency ?? bought.currency_code,
      toAmount: sold.exchange_to_amount ?? bought.amount,
      rate: sold.exchange_rate ?? '',
      commissionCurrency: sold.exchange_commission_currency ?? null,
      commissionAmount: sold.exchange_commission_amount ?? null,
      note: sold.note ?? null,
    }];
  });
}
