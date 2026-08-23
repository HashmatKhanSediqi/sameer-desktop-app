import type { SupportedLocale } from './locale';
import type { CurrencySummary, TransactionType } from './transaction';
import type { TransferRole } from './transfer';

export const REPORT_TYPES = [
  'customer',
  'all_customers',
  'date_range',
  'transactions',
  'currency_summary',
] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_FORMATS = ['pdf', 'xlsx'] as const;

export type ReportFormat = (typeof REPORT_FORMATS)[number];

export function isReportType(value: unknown): value is ReportType {
  return typeof value === 'string' && (REPORT_TYPES as readonly string[]).includes(value);
}

export function isReportFormat(value: unknown): value is ReportFormat {
  return typeof value === 'string' && (REPORT_FORMATS as readonly string[]).includes(value);
}

export interface ReportGenerateInput {
  type: ReportType;
  format: ReportFormat;
  language: SupportedLocale;
  customerId?: number;
  startDate?: string;
  endDate?: string;
}

export interface GeneratedReport {
  filePath: string;
  fileName: string;
}

export interface ReportProgress {
  percent: number;
  stage: string;
}

export interface ReportCustomerInfo {
  id: number;
  name: string;
  customerNumber: string;
  cashInCount: number;
  cashOutCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  displayCreatedAt: string | null;
  displayUpdatedAt: string | null;
}

export interface ReportCustomerRow extends ReportCustomerInfo {
  balances: Record<string, string>;
}

export interface ReportTransactionRow {
  id: number;
  customerId: number;
  customerName: string;
  customerNumber: string;
  type: TransactionType;
  typeLabel: string;
  currencyCode: string;
  amount: string;
  note: string;
  transactionDate: string;
  displayDate: string;
  displayTime: string;
  transferId: string | null;
  transferRole: TransferRole | null;
  counterpartyName: string | null;
}

export interface ReportCurrencySection extends CurrencySummary {
  transactionCount: number;
  customerCount: number;
}

export interface ReportModel {
  type: ReportType;
  language: SupportedLocale;
  direction: 'rtl' | 'ltr';
  appName: string;
  title: string;
  generatedAt: string;
  generatedAtLabel: string;
  languageLabel: string;
  dateRangeLabel: string | null;
  startDate: string | null;
  endDate: string | null;
  customer: ReportCustomerInfo | null;
  customers: ReportCustomerRow[];
  transactions: ReportTransactionRow[];
  currencySummaries: ReportCurrencySection[];
  customerCount: number;
  transactionCount: number;
  empty: boolean;
  noDataMessage: string;
  labels: ReportLabels;
  company: ReportCompanyHeader | null;
}

export interface ReportCompanyHeader {
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  logoPath: string | null;
  logoMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | null;
}

export interface ReportLabels {
  cashIn: string;
  cashOut: string;
  balance: string;
  customer: string;
  number: string;
  type: string;
  currency: string;
  amount: string;
  date: string;
  time: string;
  note: string;
  field: string;
  value: string;
  language: string;
  period: string;
  allPeriods: string;
  createdAt: string;
  updatedAt: string;
  customerCount: string;
  transactionCount: string;
  activityCustomerCount: string;
  cashInCount: string;
  cashOutCount: string;
  sectionCustomer: string;
  sectionCurrencies: string;
  sectionTransactions: string;
  sectionCustomers: string;
  sectionSummary: string;
  sectionTotals: string;
  unnamedCustomer: string;
  transferIn: string;
  transferOut: string;
  transferWith: string;
  companyPhone: string;
  companyEmail: string;
  companyAddress: string;
  companyWebsite: string;
}
