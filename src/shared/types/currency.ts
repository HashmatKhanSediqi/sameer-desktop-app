export interface Currency {
  code: string;
  nameKey: string;
  symbol: string;
  isActive: boolean;
  sortOrder: number;
  hasTransactions: boolean;
}

export interface CreateCurrencyInput {
  code: string;
  symbol?: string;
  sortOrder?: number;
}
