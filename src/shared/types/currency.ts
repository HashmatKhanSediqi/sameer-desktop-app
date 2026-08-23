export interface Currency {
  code: string;
  nameKey: string;
  symbol: string;
  isActive: boolean;
  sortOrder: number;
}

export interface CreateCurrencyInput {
  code: string;
  symbol?: string;
  sortOrder?: number;
}
