export type ExchangeRole = 'SOLD' | 'BOUGHT';
export type ExchangeCalculationDriver = 'FROM' | 'TO';

export interface CreateCustomerExchangeInput {
  customerId: number;
  fromCurrency: string;
  fromAmount: string;
  toCurrency: string;
  toAmount: string;
  rate: string;
  commissionCurrency?: string | null;
  commissionAmount?: string | null;
  note?: string | null;
  transactionDate?: string;
  requestId: string;
}

export interface CustomerExchangeResult {
  exchangeId: string;
  soldTransactionId: number;
  boughtTransactionId: number;
  duplicate: boolean;
}
