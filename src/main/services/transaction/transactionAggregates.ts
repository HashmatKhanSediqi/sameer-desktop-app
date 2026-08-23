import Decimal from 'decimal.js';
import type { Currency } from '@shared/types/currency';
import type { CurrencySummary, GlobalCurrencyTotal, TransactionType } from '@shared/types/transaction';
import type {
  GlobalTransactionAggregateRow,
  TransactionAggregateRow,
} from '../../database/repositories/transactionRepository';
import { formatBalance } from './money';

export interface CustomerAccountingStats {
  balances: Record<string, string>;
  cashInCount: number;
  cashOutCount: number;
}

export function buildAccountingMapFromAggregates(
  currencies: Currency[],
  groups: TransactionAggregateRow[],
  customerIds: number[],
): Map<number, CustomerAccountingStats> {
  const byCustomer = new Map<number, TransactionAggregateRow[]>();
  for (const group of groups) {
    const list = byCustomer.get(group.customer_id) ?? [];
    list.push(group);
    byCustomer.set(group.customer_id, list);
  }

  const result = new Map<number, CustomerAccountingStats>();
  for (const customerId of customerIds) {
    result.set(customerId, buildCustomerStats(currencies, byCustomer.get(customerId) ?? []));
  }
  return result;
}

export function buildCustomerStats(
  currencies: Currency[],
  groups: TransactionAggregateRow[],
): CustomerAccountingStats {
  const summaries = buildCurrencySummariesFromAggregates(currencies, groups);
  const balances: Record<string, string> = {};
  let cashInCount = 0;
  let cashOutCount = 0;

  for (const summary of summaries) {
    balances[summary.currencyCode] = summary.balance;
    cashInCount += summary.cashInCount;
    cashOutCount += summary.cashOutCount;
  }

  return { balances, cashInCount, cashOutCount };
}

export function buildGlobalTotalsFromAggregates(
  currencies: Currency[],
  groups: GlobalTransactionAggregateRow[],
): GlobalCurrencyTotal[] {
  const pseudoRows: TransactionAggregateRow[] = groups.map((group) => ({
    customer_id: 0,
    currency_code: group.currency_code,
    type: group.type,
    tx_count: group.tx_count,
    total_amount: group.total_amount,
  }));
  return buildCurrencySummariesFromAggregates(currencies, pseudoRows).map((summary) => ({
    currencyCode: summary.currencyCode,
    nameKey: summary.nameKey,
    symbol: summary.symbol,
    balance: summary.balance,
  }));
}

export function buildCurrencySummariesFromAggregates(
  currencies: Currency[],
  groups: TransactionAggregateRow[],
): CurrencySummary[] {
  const totalsByCurrency = new Map<
    string,
    { cashIn: Decimal; cashOut: Decimal; cashInCount: number; cashOutCount: number }
  >();

  for (const group of groups) {
    const current = totalsByCurrency.get(group.currency_code) ?? {
      cashIn: new Decimal(0),
      cashOut: new Decimal(0),
      cashInCount: 0,
      cashOutCount: 0,
    };
    const amount = new Decimal(group.total_amount);
    if (group.type === 'CASH_IN') {
      current.cashIn = current.cashIn.plus(amount);
      current.cashInCount += group.tx_count;
    } else {
      current.cashOut = current.cashOut.plus(amount);
      current.cashOutCount += group.tx_count;
    }
    totalsByCurrency.set(group.currency_code, current);
  }

  return currencies.map((currency) => {
    const totals = totalsByCurrency.get(currency.code);
    if (!totals) {
      return {
        currencyCode: currency.code,
        nameKey: currency.nameKey,
        symbol: currency.symbol,
        cashInTotal: formatBalance(new Decimal(0)),
        cashOutTotal: formatBalance(new Decimal(0)),
        balance: formatBalance(new Decimal(0)),
        cashInCount: 0,
        cashOutCount: 0,
      };
    }

    return {
      currencyCode: currency.code,
      nameKey: currency.nameKey,
      symbol: currency.symbol,
      cashInTotal: formatBalance(totals.cashIn),
      cashOutTotal: formatBalance(totals.cashOut),
      balance: formatBalance(totals.cashIn.minus(totals.cashOut)),
      cashInCount: totals.cashInCount,
      cashOutCount: totals.cashOutCount,
    };
  });
}

export function aggregateRowsToAmountRows(groups: TransactionAggregateRow[]): Array<{
  customer_id: number;
  type: TransactionType;
  currency_code: string;
  amount: string;
}> {
  return groups.map((group) => ({
    customer_id: group.customer_id,
    type: group.type,
    currency_code: group.currency_code,
    amount: group.total_amount,
  }));
}
