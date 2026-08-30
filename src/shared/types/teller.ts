export type TellerDirection = 'DEPOSIT' | 'WITHDRAWAL';
export type TellerSessionStatus = 'OPEN' | 'CLOSED';
export type TellerCheckFlag = 'OK' | 'NO';

export interface TellerDenomination {
  id: number;
  currencyCode: string;
  value: string;
  sortOrder: number;
  isActive: boolean;
}

export interface TellerSession {
  id: number;
  companyId: number;
  tellerUserId: number;
  tellerUsername: string | null;
  currencyCode: string;
  sessionDate: string;
  branchName: string | null;
  branchCode: string | null;
  openingAmount: string;
  openingCounts: Record<string, number>;
  oppAmount: string;
  cashInICBA: string;
  cashOutICBA: string;
  status: TellerSessionStatus;
  note: string | null;
  createdAt: string;
  closedAt: string | null;
  createdBy: number;
  updatedAt: string;
  updatedBy: number | null;
}

export interface TellerTransaction {
  id: number;
  sessionId: number;
  sequenceNo: number;
  direction: TellerDirection;
  referenceLabel: string;
  declaredAmount: string | null;
  denominationCounts: Record<string, number>;
  countedTotal: string;
  isReconciled: boolean;
  check: TellerCheckFlag;
  variance: string;
  createdAt: string;
  createdBy: number;
  updatedAt: string;
  updatedBy: number | null;
}

export interface TellerTransactionListItem {
  id: number;
  sessionId: number;
  sequenceNo: number;
  direction: TellerDirection;
  currencyCode: string;
  referenceLabel: string;
  declaredAmount: string | null;
  countedTotal: string;
  check: TellerCheckFlag;
  variance: string;
  createdAt: string;
}

export interface TellerSessionSummary {
  denominations: string[];
  totalReceivedByDenomination: Record<string, number>;
  totalPaidByDenomination: Record<string, number>;
  netPiecesByDenomination: Record<string, number>;
  totalAmountByDenomination: Record<string, string>;
  grandTotalReceivedAmount: string;
  grandTotalPaidAmount: string;
  grandTotalAmount: string;
  depositTransactionCount: number;
  withdrawalTransactionCount: number;
  totalTransactionCount: number;
  openingAmount: string;
  currentCash: string;
  currentCounts: Record<string, number>;
  oppAmount: string;
  headerTotal: string;
  cashInICBA: string;
  cashOutICBA: string;
  result: string;
}

export interface TellerOpeningRow {
  referenceLabel: 'OP';
  declaredAmount: string;
  denominationCounts: Record<string, number>;
  countedTotal: string;
  check: TellerCheckFlag;
  variance: string;
}

export interface TellerSheet {
  session: TellerSession | null;
  currencyCode: string;
  denominations: TellerDenomination[];
  opening: TellerOpeningRow | null;
  deposits: TellerTransaction[];
  withdrawals: TellerTransaction[];
  summary: TellerSessionSummary;
}

export interface TellerLongBookRow {
  id: number | null;
  kind: 'OPENING' | 'DEPOSIT' | 'WITHDRAWAL';
  sequenceNo: number | null;
  referenceLabel: string | null;
  createdAt: string;
  received: string;
  paid: string;
  runningBalance: string;
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

export interface OpenTellerSessionInput {
  currencyCode: string;
  sessionDate?: string;
  branchName?: string | null;
  branchCode?: string | null;
  openingCounts?: Record<string, number>;
  openingAmount?: string;
  oppAmount?: string;
  cashInICBA?: string;
  cashOutICBA?: string;
  note?: string | null;
}

export interface StartTellerDayOpening {
  openingAmount?: string;
  openingCounts?: Record<string, number>;
}

export interface UpdateTellerSessionInput {
  sessionId: number;
  branchName?: string | null;
  branchCode?: string | null;
  openingCounts?: Record<string, number>;
  openingAmount?: string;
  oppAmount?: string;
  cashInICBA?: string;
  cashOutICBA?: string;
  note?: string | null;
}

export interface UpsertTellerTransactionInput {
  id?: number;
  sessionId: number;
  direction: TellerDirection;
  referenceLabel?: string;
  declaredAmount?: string | null;
  denominationCounts: Record<string, number>;
}

export interface TellerTransactionListQuery {
  page?: number;
  pageSize?: number;
  sessionId?: number;
  currencyCode?: string;
  direction?: TellerDirection;
  referenceLabel?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface TellerTransactionListResult {
  transactions: TellerTransactionListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
