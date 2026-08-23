import type { TransferRole } from './transfer';

export type TransactionType = 'CASH_IN' | 'CASH_OUT';

export interface Transaction {
  id: number;
  customerId: number;
  type: TransactionType;
  currencyCode: string;
  amount: string;
  note: string | null;
  transactionDate: string;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  transferId: string | null;
  transferRole: TransferRole | null;
  counterpartyCustomerId: number | null;
  counterpartyName: string | null;
}

export interface CreateTransactionInput {
  customerId: number;
  type: TransactionType;
  amount: string;
  currencyCode: string;
  transactionDate?: string;
  note?: string | null;
}

export interface UpdateTransactionInput {
  id: number;
  type: TransactionType;
  amount: string;
  currencyCode: string;
  transactionDate?: string;
  note?: string | null;
}

export interface TransactionListQuery {
  customerId: number;
  page?: number;
  pageSize?: number;
}

export interface TransactionListResult {
  transactions: Transaction[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CurrencySummary {
  currencyCode: string;
  nameKey: string;
  symbol: string;
  cashInTotal: string;
  cashOutTotal: string;
  balance: string;
  cashInCount: number;
  cashOutCount: number;
}

export interface CustomerTransactionSummary {
  customerId: number;
  currencies: CurrencySummary[];
  cashInCount: number;
  cashOutCount: number;
}

export interface GlobalCurrencyTotal {
  currencyCode: string;
  nameKey: string;
  symbol: string;
  balance: string;
}
