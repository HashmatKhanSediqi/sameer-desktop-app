export interface Currency {
  code: string;
  nameKey: string;
  displayName: string;
  symbol: string;
  isActive: boolean;
  sortOrder: number;
  hasTransactions: boolean;
}

export interface CreateCurrencyInput {
  code: string;
  name?: string;
  symbol?: string;
  sortOrder?: number;
}

export interface CreateDenominationInput {
  currencyCode: string;
  value: string;
}

export interface CurrencyDenomination {
  id: number;
  currencyCode: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
  inUse: boolean;
}
