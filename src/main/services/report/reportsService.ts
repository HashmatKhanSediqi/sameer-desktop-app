import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import {
  formatDateForLocale,
  formatDateTimeForLocale,
  formatMoneyForLocale,
  formatTimeForLocale,
} from '@shared/localeFormat';
import { getDocumentDirection, toIntlLocale, type SupportedLocale } from '@shared/types/locale';
import type { Currency } from '@shared/types/currency';
import type { Customer } from '@shared/types/customer';
import type {
  GeneratedReport,
  ReportCurrencySection,
  ReportCustomerInfo,
  ReportCustomerRow,
  ReportGenerateInput,
  ReportLabels,
  ReportModel,
  ReportProgress,
  ReportTransactionRow,
} from '@shared/types/report';
import type { CurrencySummary } from '@shared/types/transaction';
import type { CustomerService } from '../customer/customerService';
import type { CompanyService } from '../company/companyService';
import type { TransactionService } from '../transaction/transactionService';
import type { TransactionAmountRow } from '../../database/repositories/transactionRepository';
import { getFontsDirectory } from '../../config/fontsPath';
import { reportT } from './reportI18n';
import { buildReportFileName } from './reportValidation';
import { renderPdfReport } from './pdfReport';
import { renderExcelReport } from './excelReport';

export interface ReportsServiceDeps {
  customerService: CustomerService;
  transactionService: TransactionService;
  companyService?: CompanyService;
  reportsDir: string;
  logger: Logger;
  fontsDir?: string | null;
  now?: () => Date;
}

export class ReportsService {
  constructor(private readonly deps: ReportsServiceDeps) {}

  async generate(
    input: ReportGenerateInput,
    onProgress?: (progress: ReportProgress) => void,
  ): Promise<GeneratedReport> {
    const emit = (percent: number, stage: string): void => {
      onProgress?.({ percent, stage });
    };

    emit(5, 'query');
    const model = this.buildModel(input);
    emit(45, 'render');

    mkdirSync(this.deps.reportsDir, { recursive: true });
    const fileName = modelFileName(model, input.format, this.deps.now?.() ?? new Date());
    const diskName = toDiskFileName(fileName);
    const filePath = join(this.deps.reportsDir, diskName);
    mkdirSync(dirname(filePath), { recursive: true });

    try {
      if (input.format === 'pdf') {
        await renderPdfReport(model, filePath, this.deps.fontsDir ?? getFontsDirectory());
      } else {
        await renderExcelReport(model, filePath);
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      this.deps.logger.error('Report write failed', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new AppError('REPORT_WRITE_FAILED', 'REPORT_WRITE_FAILED');
    }

    emit(100, 'done');
    if (!existsSync(filePath)) {
      throw new AppError('REPORT_WRITE_FAILED', 'REPORT_WRITE_FAILED');
    }
    return { filePath, fileName };
  }

  buildModel(input: ReportGenerateInput): ReportModel {
    const locale = input.language;
    const labels = buildLabels(locale);
    const generatedAt = formatGeneratedAt(this.deps.now?.() ?? new Date(), locale);
    const dateRangeLabel = formatDateRangeLabel(input.startDate, input.endDate, locale);
    const base = {
      type: input.type,
      language: locale,
      direction: getDocumentDirection(locale),
      appName: reportT(locale, 'common', 'appName'),
      title: reportTitle(input.type, locale),
      generatedAt,
      generatedAtLabel: reportT(locale, 'reports', 'generatedAt'),
      languageLabel: reportT(locale, 'common', `language.${locale}`),
      dateRangeLabel,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      labels,
      noDataMessage: reportT(locale, 'reports', 'noData'),
      company: this.buildCompanyHeader(),
    };

    switch (input.type) {
      case 'customer':
        return this.buildCustomerReport(base, labels, locale, input.customerId as number, input.startDate, input.endDate);
      case 'all_customers':
        return this.buildAllCustomersReport(base, labels, locale);
      case 'date_range':
        return this.buildTransactionListReport(
          base,
          labels,
          locale,
          input.startDate,
          input.endDate,
          input.customerId,
          true,
        );
      case 'transactions':
        return this.buildTransactionListReport(
          base,
          labels,
          locale,
          input.startDate,
          input.endDate,
          input.customerId,
          false,
        );
      case 'currency_summary':
        return this.buildCurrencySummaryReport(base, labels, locale, input.startDate, input.endDate);
    }
  }

  private buildCustomerReport(
    base: Omit<ReportModel, 'customer' | 'customers' | 'transactions' | 'currencySummaries' | 'customerCount' | 'transactionCount' | 'empty'>,
    labels: ReportLabels,
    locale: SupportedLocale,
    customerId: number,
    startDate?: string,
    endDate?: string,
  ): ReportModel {
    const customer = this.deps.customerService.getById(customerId);
    const aggregateGroups = this.deps.transactionService.aggregateForReportScope({ customerId, startDate, endDate });
    const scopedRows = this.aggregateRowsAsAmountRows(aggregateGroups);
    const currencies = this.currenciesForScope(scopedRows);
    const summaries = toCurrencySections(
      this.deps.transactionService.summarizeAggregates(currencies, aggregateGroups),
      scopedRows,
    );
    const transactions = this.mapTransactions(
      this.deps.transactionService.listForReport({ customerId, startDate, endDate }),
      labels,
      locale,
    );
    const info = toCustomerInfo(customer, labels, aggregateGroups, locale);

    return {
      ...base,
      customer: info,
      customers: [],
      transactions,
      currencySummaries: summaries,
      customerCount: 1,
      transactionCount: transactions.length,
      empty: transactions.length === 0,
    };
  }

  private buildAllCustomersReport(
    base: Omit<ReportModel, 'customer' | 'customers' | 'transactions' | 'currencySummaries' | 'customerCount' | 'transactionCount' | 'empty'>,
    labels: ReportLabels,
    locale: SupportedLocale,
  ): ReportModel {
    const currencies = this.deps.transactionService.listActiveCurrencies();
    const globalGroups = this.deps.transactionService.aggregateGlobal();
    const distinctCustomers = this.deps.transactionService.countDistinctCustomersByCurrency();
    const summaries = toCurrencySectionsFromGlobal(
      this.deps.transactionService.summarizeAggregates(
        currencies,
        globalGroups.map((group) => ({
          customer_id: 0,
          currency_code: group.currency_code,
          type: group.type,
          tx_count: group.tx_count,
          total_amount: group.total_amount,
        })),
      ),
      distinctCustomers,
    );
    const transactionCount = globalGroups.reduce((sum, group) => sum + group.tx_count, 0);
    const totalCount = this.deps.customerService.count();
    const customers: ReportCustomerRow[] = [];
    const pageSize = 500;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    for (let page = 1; page <= totalPages; page += 1) {
      const pageResult = this.deps.customerService.listPageForReport(page, pageSize, (identities) => {
        const accounting = this.deps.transactionService.getListAccounting(identities.map((item) => item.id));
        return {
          customers: identities.map((identity) => {
            const stats = accounting.get(identity.id) ?? { balances: {}, cashInCount: 0, cashOutCount: 0 };
            return {
              ...identity,
              balances: stats.balances,
              cashInCount: stats.cashInCount,
              cashOutCount: stats.cashOutCount,
            };
          }),
          totals: [],
        };
      });

      for (const item of pageResult.customers) {
        customers.push({
          id: item.id,
          name: displayName(item.name, labels.unnamedCustomer),
          customerNumber: item.customerNumber?.trim() || reportT(locale, 'common', 'emptyValue'),
          cashInCount: item.cashInCount,
          cashOutCount: item.cashOutCount,
          createdAt: null,
          updatedAt: null,
          displayCreatedAt: null,
          displayUpdatedAt: null,
          balances: fillBalances(currencies, item.balances),
        });
      }
    }

    if (customers.length === 0) {
      throw new AppError('REPORT_NO_DATA', 'REPORT_NO_DATA');
    }

    return {
      ...base,
      customer: null,
      customers,
      transactions: [],
      currencySummaries: summaries,
      customerCount: customers.length,
      transactionCount,
      empty: false,
    };
  }

  private buildTransactionListReport(
    base: Omit<ReportModel, 'customer' | 'customers' | 'transactions' | 'currencySummaries' | 'customerCount' | 'transactionCount' | 'empty'>,
    labels: ReportLabels,
    locale: SupportedLocale,
    startDate: string | undefined,
    endDate: string | undefined,
    customerId: number | undefined,
    requireRows: boolean,
  ): ReportModel {
    if (customerId !== undefined) {
      this.deps.customerService.getById(customerId);
    }

    const records = this.deps.transactionService.listForReport({ customerId, startDate, endDate });
    const aggregateGroups = this.deps.transactionService.aggregateForReportScope({ customerId, startDate, endDate });
    const scopedRows = this.aggregateRowsAsAmountRows(aggregateGroups);
    if (requireRows && records.length === 0) {
      throw new AppError('REPORT_NO_DATA', 'REPORT_NO_DATA');
    }

    const currencies = this.currenciesForScope(scopedRows);
    const transactions = this.mapTransactions(records, labels, locale);
    const customerIds = new Set(records.map((row) => row.customer_id));
    const customer =
      customerId !== undefined
        ? toCustomerInfo(
            this.deps.customerService.getById(customerId),
            labels,
            aggregateGroups.filter((group) => group.customer_id === customerId),
            locale,
          )
        : null;

    return {
      ...base,
      customer,
      customers: [],
      transactions,
      currencySummaries: toCurrencySections(
        this.deps.transactionService.summarizeAggregates(currencies, aggregateGroups),
        scopedRows,
      ),
      customerCount: customer ? 1 : customerIds.size,
      transactionCount: transactions.length,
      empty: transactions.length === 0,
    };
  }

  private buildCurrencySummaryReport(
    base: Omit<ReportModel, 'customer' | 'customers' | 'transactions' | 'currencySummaries' | 'customerCount' | 'transactionCount' | 'empty'>,
    _labels: ReportLabels,
    _locale: SupportedLocale,
    startDate?: string,
    endDate?: string,
  ): ReportModel {
    const aggregateGroups = this.deps.transactionService.aggregateForReportScope({ startDate, endDate });
    const scopedRows = this.aggregateRowsAsAmountRows(aggregateGroups);
    const currencies = this.currenciesForScope(scopedRows);
    const summaries = toCurrencySections(
      this.deps.transactionService.summarizeAggregates(currencies, aggregateGroups),
      scopedRows,
    );
    const customerIds = new Set(aggregateGroups.map((group) => group.customer_id));
    const transactionCount = aggregateGroups.reduce((sum, group) => sum + group.tx_count, 0);

    return {
      ...base,
      customer: null,
      customers: [],
      transactions: [],
      currencySummaries: summaries,
      customerCount: customerIds.size,
      transactionCount,
      empty: false,
    };
  }

  private currenciesForScope(rows: TransactionAmountRow[]): Currency[] {
    const active = this.deps.transactionService.listActiveCurrencies();
    const all = this.deps.transactionService.listAllCurrencies();
    const needed = new Set(active.map((currency) => currency.code));
    for (const row of rows) {
      needed.add(row.currency_code);
    }
    return all.filter((currency) => needed.has(currency.code));
  }

  private aggregateRowsAsAmountRows(
    groups: ReturnType<TransactionService['aggregateForReportScope']>,
  ): TransactionAmountRow[] {
    return groups.map((group) => ({
      customer_id: group.customer_id,
      type: group.type,
      currency_code: group.currency_code,
      amount: group.total_amount,
    }));
  }

  private mapTransactions(
    records: ReturnType<TransactionService['listForReport']>,
    labels: ReportLabels,
    locale: SupportedLocale,
  ): ReportTransactionRow[] {
    return records.map((record) => ({
      id: record.id,
      customerId: record.customer_id,
      customerName: displayName(record.customer_name, labels.unnamedCustomer),
      customerNumber: record.customer_number?.trim() || reportT(locale, 'common', 'emptyValue'),
      type: record.type,
      typeLabel: transferTypeLabel(record.transfer_role, record.type, record.counterparty_name, labels),
      currencyCode: record.currency_code,
      amount: formatMoneyForLocale(record.amount, locale),
      note: record.note ?? '',
      transactionDate: record.transaction_date,
      displayDate: formatDateTimeForLocale(record.transaction_date, locale),
      displayTime: formatTimeForLocale(record.transaction_date, locale),
      transferId: record.transfer_id ?? null,
      transferRole: record.transfer_role ?? null,
      counterpartyName: record.counterparty_name ?? null,
    }));
  }

  private buildCompanyHeader(): ReportModel['company'] {
    if (!this.deps.companyService) {
      return null;
    }
    const profile = this.deps.companyService.get();
    if (!profile.configured || !profile.name) {
      return null;
    }
    return {
      name: profile.name,
      phone: profile.phone,
      email: profile.email,
      address: profile.address,
      website: profile.website,
      notes: profile.notes,
      logoPath: this.deps.companyService.getLogoPath(),
      logoMimeType: null,
    };
  }
}

function buildLabels(locale: SupportedLocale): ReportLabels {
  return {
    cashIn: reportT(locale, 'reports', 'cashIn'),
    cashOut: reportT(locale, 'reports', 'cashOut'),
    balance: reportT(locale, 'reports', 'balance'),
    customer: reportT(locale, 'reports', 'column.customer'),
    number: reportT(locale, 'reports', 'column.number'),
    type: reportT(locale, 'reports', 'column.type'),
    currency: reportT(locale, 'reports', 'column.currency'),
    amount: reportT(locale, 'reports', 'column.amount'),
    date: reportT(locale, 'reports', 'column.date'),
    time: reportT(locale, 'reports', 'column.time'),
    note: reportT(locale, 'reports', 'column.note'),
    field: reportT(locale, 'reports', 'column.field'),
    value: reportT(locale, 'reports', 'column.value'),
    language: reportT(locale, 'reports', 'language'),
    period: reportT(locale, 'reports', 'period'),
    allPeriods: reportT(locale, 'reports', 'allPeriods'),
    createdAt: reportT(locale, 'reports', 'createdAt'),
    updatedAt: reportT(locale, 'reports', 'updatedAt'),
    customerCount: reportT(locale, 'reports', 'customerCount'),
    transactionCount: reportT(locale, 'reports', 'transactionCount'),
    activityCustomerCount: reportT(locale, 'reports', 'activityCustomerCount'),
    cashInCount: reportT(locale, 'reports', 'cashInCount'),
    cashOutCount: reportT(locale, 'reports', 'cashOutCount'),
    sectionCustomer: reportT(locale, 'reports', 'section.customerInfo'),
    sectionCurrencies: reportT(locale, 'reports', 'section.currencySummary'),
    sectionTransactions: reportT(locale, 'reports', 'section.transactions'),
    sectionCustomers: reportT(locale, 'reports', 'section.customers'),
    sectionSummary: reportT(locale, 'reports', 'section.transactionSummary'),
    sectionTotals: reportT(locale, 'reports', 'section.totals'),
    unnamedCustomer: reportT(locale, 'reports', 'unnamedCustomer'),
    transferIn: reportT(locale, 'reports', 'transferIn'),
    transferOut: reportT(locale, 'reports', 'transferOut'),
    transferWith: reportT(locale, 'reports', 'transferWith'),
    companyPhone: reportT(locale, 'reports', 'companyPhone'),
    companyEmail: reportT(locale, 'reports', 'companyEmail'),
    companyAddress: reportT(locale, 'reports', 'companyAddress'),
    companyWebsite: reportT(locale, 'reports', 'companyWebsite'),
  };
}

function reportTitle(type: ReportGenerateInput['type'], locale: SupportedLocale): string {
  switch (type) {
    case 'customer':
      return reportT(locale, 'reports', 'heading.customer');
    case 'all_customers':
      return reportT(locale, 'reports', 'heading.allCustomers');
    case 'date_range':
      return reportT(locale, 'reports', 'heading.dateRange');
    case 'transactions':
      return reportT(locale, 'reports', 'heading.transactions');
    case 'currency_summary':
      return reportT(locale, 'reports', 'heading.currencySummary');
  }
}

function formatGeneratedAt(date: Date, locale: SupportedLocale): string {
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    numberingSystem: 'latn',
  }).format(date);
}

function formatDateRangeLabel(
  startDate: string | undefined,
  endDate: string | undefined,
  locale: SupportedLocale,
): string | null {
  if (!startDate && !endDate) {
    return null;
  }
  const from = startDate ? formatDateForLocale(startDate, locale) : '…';
  const to = endDate ? formatDateForLocale(endDate, locale) : '…';
  return `${reportT(locale, 'reports', 'dateRange')}: ${from} – ${to}`;
}

function displayName(name: string | null | undefined, fallback: string): string {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

function toCustomerInfo(
  customer: Customer,
  labels: ReportLabels,
  groups: Array<{ type: 'CASH_IN' | 'CASH_OUT'; tx_count: number }>,
  locale: SupportedLocale,
): ReportCustomerInfo {
  return {
    id: customer.id,
    name: displayName(customer.name, labels.unnamedCustomer),
    customerNumber: customer.customerNumber?.trim() || '',
    cashInCount: groups.filter((group) => group.type === 'CASH_IN').reduce((sum, group) => sum + group.tx_count, 0),
    cashOutCount: groups.filter((group) => group.type === 'CASH_OUT').reduce((sum, group) => sum + group.tx_count, 0),
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    displayCreatedAt: customer.createdAt ? formatDateTimeForLocale(customer.createdAt, locale) : null,
    displayUpdatedAt: customer.updatedAt ? formatDateTimeForLocale(customer.updatedAt, locale) : null,
  };
}

function toCurrencySections(summaries: CurrencySummary[], rows: TransactionAmountRow[]): ReportCurrencySection[] {
  return summaries.map((summary) => {
    const customerIds = new Set(
      rows.filter((row) => row.currency_code === summary.currencyCode).map((row) => row.customer_id),
    );
    return {
      ...summary,
      transactionCount: summary.cashInCount + summary.cashOutCount,
      customerCount: customerIds.size,
    };
  });
}

function toCurrencySectionsFromGlobal(
  summaries: CurrencySummary[],
  distinctCustomers: Array<{ currency_code: string; customer_count: number }>,
): ReportCurrencySection[] {
  const counts = new Map(distinctCustomers.map((row) => [row.currency_code, row.customer_count]));
  return summaries.map((summary) => ({
    ...summary,
    transactionCount: summary.cashInCount + summary.cashOutCount,
    customerCount: counts.get(summary.currencyCode) ?? 0,
  }));
}

function transferTypeLabel(
  role: string | null | undefined,
  type: 'CASH_IN' | 'CASH_OUT',
  counterpartyName: string | null | undefined,
  labels: ReportLabels,
): string {
  if (role === 'OUT') {
    return counterpartyName
      ? `${labels.transferOut} — ${labels.transferWith.replace('{{name}}', counterpartyName)}`
      : labels.transferOut;
  }
  if (role === 'IN') {
    return counterpartyName
      ? `${labels.transferIn} — ${labels.transferWith.replace('{{name}}', counterpartyName)}`
      : labels.transferIn;
  }
  return type === 'CASH_IN' ? labels.cashIn : labels.cashOut;
}

function fillBalances(currencies: Currency[], balances: Record<string, string>): Record<string, string> {
  const filled: Record<string, string> = {};
  for (const currency of currencies) {
    filled[currency.code] = balances[currency.code] ?? '0.0000';
  }
  return filled;
}

function modelFileName(model: ReportModel, format: ReportGenerateInput['format'], generatedAt: Date): string {
  return buildReportFileName(model.type, format, customerFileLabel(model), generatedAt);
}

function toDiskFileName(fileName: string): string {
  const asciiOnly = /[^\u0020-\u007E]/g;
  const safe = fileName
    .normalize('NFKD')
    .replace(asciiOnly, '_')
    .replace(/[<>:"/\\|?*]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe.length > 0 ? safe : `report.${fileName.endsWith('.xlsx') ? 'xlsx' : 'pdf'}`;
}

function customerFileLabel(model: ReportModel): string {
  if (model.type !== 'customer' || !model.customer) {
    return model.customer?.name ?? 'All';
  }

  const number = model.customer.customerNumber.trim();
  return number.length > 0 ? `${model.customer.name}_${number}` : model.customer.name;
}
