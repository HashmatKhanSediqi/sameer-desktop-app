export type TransferRole = 'OUT' | 'IN';

export interface CreateTransferInput {
  fromCustomerId: number;
  toCustomerId: number;
  currencyCode: string;
  amount: string;
  note?: string | null;
  transactionDate?: string;
}

export interface TransferResult {
  transferId: string;
  outTransactionId: number;
  inTransactionId: number;
}

export interface TransferParty {
  id: number;
  name: string | null;
  customerNumber: string | null;
}
