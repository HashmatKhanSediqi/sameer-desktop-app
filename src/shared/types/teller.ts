export type TellerDirection = 'IN' | 'OUT' | 'OPENING';
export type TellerPartyKind = 'CUSTOMER' | 'HEAD_TELLER' | 'INTERNAL' | 'OPENING' | 'ADJUSTMENT';
export type TellerSessionStatus = 'OPEN' | 'CLOSED';

export type TellerTransactionTypeCode =
  | 'CUSTOMER_CASH_IN'
  | 'CUSTOMER_CASH_OUT'
  | 'HEAD_TELLER_IN'
  | 'HEAD_TELLER_OUT'
  | 'INTERNAL_TRANSFER_IN'
  | 'INTERNAL_TRANSFER_OUT'
  | 'OPENING_BALANCE'
  | 'ADJUSTMENT_IN'
  | 'ADJUSTMENT_OUT';

export interface TellerTransactionType {
  code: TellerTransactionTypeCode;
  nameKey: string;
  direction: TellerDirection;
  partyKind: TellerPartyKind;
  sortOrder: number;
}

export interface TellerDenomination {
  id: number;
  currencyCode: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TellerDenominationQuantityInput {
  denominationId: number;
  quantity: number;
}

export interface TellerTransactionDenomination {
  denominationId: number;
  currencyCode: string;
  value: string;
  quantity: number;
  unitValue: string;
  lineTotal: string;
}

export interface TellerSession {
  id: number;
  companyId: number;
  tellerUserId: number;
  openedAt: string;
  closedAt: string | null;
  status: TellerSessionStatus;
  note: string | null;
  createdAt: string;
  createdBy: number;
  updatedAt: string;
  updatedBy: number | null;
}

export interface TellerTransaction {
  id: number;
  companyId: number;
  sessionId: number;
  tellerUserId: number;
  transactionNumber: string;
  typeCode: TellerTransactionTypeCode;
  direction: TellerDirection;
  partyKind: TellerPartyKind;
  currencyCode: string;
  customerId: number | null;
  customerName: string | null;
  customerNumber: string | null;
  amount: string;
  denominationTotal: string;
  runningBalance: string;
  validationStatus: 'OK';
  note: string | null;
  transactionDate: string;
  createdAt: string;
  createdBy: number;
  updatedAt: string;
  updatedBy: number | null;
  denominations: TellerTransactionDenomination[];
}

export interface TellerTransactionListItem {
  id: number;
  transactionNumber: string;
  typeCode: TellerTransactionTypeCode;
  direction: TellerDirection;
  partyKind: TellerPartyKind;
  currencyCode: string;
  customerId: number | null;
  customerName: string | null;
  amount: string;
  runningBalance: string;
  note: string | null;
  transactionDate: string;
  tellerUserId: number;
}

export interface OpenTellerSessionInput {
  note?: string | null;
  openingQuantities?: TellerDenominationQuantityInput[];
}

export interface CreateTellerTransactionInput {
  typeCode: TellerTransactionTypeCode;
  currencyCode: string;
  customerId?: number | null;
  amount?: string;
  quantities: TellerDenominationQuantityInput[];
  note?: string | null;
  transactionDate?: string;
}

export interface TellerTransactionListQuery {
  page?: number;
  pageSize?: number;
  sessionId?: number;
  currencyCode?: string;
  typeCode?: TellerTransactionTypeCode;
  direction?: 'IN' | 'OUT';
  customerId?: number;
  transactionNumber?: string;
  dateFrom?: string;
  dateTo?: string;
  tellerUserId?: number;
}

export interface TellerTransactionListResult {
  transactions: TellerTransactionListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TellerTallyRow {
  denominationId: number;
  currencyCode: string;
  value: string;
  receivedPieces: number;
  paidPieces: number;
  remainingPieces: number;
  remainingAmount: string;
}

export interface TellerTally {
  sessionId: number;
  currencyCode: string;
  rows: TellerTallyRow[];
  totalCash: string;
}

export interface TellerLongBookRow {
  id: number | null;
  kind: 'OPENING' | 'RECEIVED' | 'PAID';
  transactionNumber: string | null;
  typeCode: TellerTransactionTypeCode | null;
  transactionDate: string;
  customerName: string | null;
  received: string;
  paid: string;
  runningBalance: string;
  note: string | null;
}

export interface TellerLongBook {
  sessionId: number;
  currencyCode: string;
  openingBalance: string;
  totalReceived: string;
  totalPaid: string;
  closingBalance: string;
  rows: TellerLongBookRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TellerCurrencyDashboard {
  currencyCode: string;
  openingBalance: string;
  cashIn: string;
  cashOut: string;
  currentBalance: string;
  transactionCount: number;
  physicalTally: string;
  expectedCash: string;
  difference: string;
}

export interface TellerDashboard {
  session: TellerSession | null;
  currencies: TellerCurrencyDashboard[];
}

export interface TellerReconciliationRow {
  currencyCode: string;
  expectedCash: string;
  physicalTally: string;
  difference: string;
}

export interface TellerReconciliation {
  sessionId: number | null;
  rows: TellerReconciliationRow[];
}
