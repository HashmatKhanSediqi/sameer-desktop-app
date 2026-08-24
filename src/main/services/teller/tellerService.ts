import type Database from 'better-sqlite3';
import {
  addTellerAmounts,
  amountsEqual,
  calculateDenominationTotal,
  formatTellerAmount,
  parseTellerDecimal,
  remainingAmount,
  remainingPieces,
  subtractTellerAmounts,
} from '@shared/teller/denominationMath';
import { resolvePagination } from '@shared/pagination';
import type {
  CreateTellerTransactionInput,
  OpenTellerSessionInput,
  TellerCurrencyDashboard,
  TellerDashboard,
  TellerDenomination,
  TellerLongBook,
  TellerLongBookRow,
  TellerReconciliation,
  TellerSession,
  TellerTally,
  TellerTallyRow,
  TellerTransaction,
  TellerTransactionListQuery,
  TellerTransactionListResult,
  TellerTransactionTypeCode,
} from '@shared/types/teller';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import {
  formatTransactionNumber,
  TellerRepository,
  type TellerTransactionRecord,
} from '../../database/repositories/tellerRepository';
import { ZERO_BALANCE } from '../transaction/money';
import {
  parseOptionalNote,
  parseOptionalSessionId,
  parseOptionalTellerAmount,
  parseQuantityList,
  parseTellerTypeCode,
  parseTransactionDate,
} from './tellerValidation';

const DEFAULT_PAGE_SIZE = 50;
const DASHBOARD_CURRENCIES = ['AFN', 'USD'] as const;

export class TellerService {
  private readonly repo: TellerRepository;

  constructor(
    db: Database.Database,
    private readonly logger: Logger,
  ) {
    this.repo = new TellerRepository(db);
    this.write = db.transaction((fn: () => void) => {
      fn();
    });
  }

  private readonly write: (fn: () => void) => void;

  private companyId(): number {
    return this.repo.resolveCompanyId();
  }

  listDenominations(currencyCode?: string): TellerDenomination[] {
    if (currencyCode !== undefined) {
      const code = currencyCode.trim().toUpperCase();
      if (!this.repo.currencyActive(code)) {
        throw new AppError('INVALID_CURRENCY', 'INVALID_CURRENCY');
      }
      return this.repo.listDenominations(code);
    }
    return this.repo.listDenominations();
  }

  getCurrentSession(): TellerSession | null {
    return this.repo.getOpenSession(this.companyId()) ?? null;
  }

  openSession(userId: number, input: OpenTellerSessionInput): TellerSession {
    const companyId = this.companyId();
    if (this.repo.getOpenSession(companyId)) {
      throw new AppError('TELLER_SESSION_ALREADY_OPEN', 'TELLER_SESSION_ALREADY_OPEN');
    }

    const note = parseOptionalNote(input.note);
    const requested = input.openingQuantities ? parseQuantityList(input.openingQuantities) : [];
    const allDenoms = this.repo.listDenominations();
    const denomById = new Map(allDenoms.map((item) => [item.id, item]));
    const positions = this.repo.listPositions(companyId);
    const positionByDenom = new Map(positions.map((row) => [row.denomination_id, row.quantity]));
    const hasCash = positions.some((row) => row.quantity > 0);

    const openingQty = new Map<number, number>();
    if (hasCash) {
      for (const denom of allDenoms) {
        openingQty.set(denom.id, positionByDenom.get(denom.id) ?? 0);
      }
      if (requested.length > 0) {
        for (const line of requested) {
          const denom = denomById.get(line.denominationId);
          if (!denom) {
            throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
          }
          const current = positionByDenom.get(line.denominationId) ?? 0;
          if (current !== line.quantity) {
            throw new AppError('TELLER_OPENING_MISMATCH', 'TELLER_OPENING_MISMATCH');
          }
        }
      }
    } else {
      for (const line of requested) {
        const denom = denomById.get(line.denominationId);
        if (!denom || !denom.isActive) {
          throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
        }
        openingQty.set(line.denominationId, line.quantity);
      }
      for (const denom of allDenoms) {
        if (!openingQty.has(denom.id)) {
          openingQty.set(denom.id, 0);
        }
      }
    }

    const openedAt = parseTransactionDate(undefined);
    let sessionId = 0;

    this.write(() => {
      sessionId = this.repo.insertSession({
        companyId,
        tellerUserId: userId,
        openedAt,
        note,
        createdBy: userId,
      });

      const openingByCurrency = new Map<string, Array<{ denom: TellerDenomination; quantity: number }>>();
      for (const denom of allDenoms) {
        const quantity = openingQty.get(denom.id) ?? 0;
        const calc = calculateDenominationTotal([
          { denominationId: denom.id, unitValue: denom.value, quantity },
        ]);
        if (!calc.ok) {
          throw new AppError('TELLER_DENOMINATION_INVALID', calc.error);
        }
        const lineTotal = calc.lines[0]?.lineTotal ?? ZERO_BALANCE;
        this.repo.insertOpeningLine({
          sessionId,
          companyId,
          denominationId: denom.id,
          quantity,
          unitValue: formatTellerAmount(parseTellerDecimal(denom.value)),
          lineTotal,
        });
        if (!hasCash) {
          this.repo.setPosition(companyId, denom.id, quantity);
        }
        const bucket = openingByCurrency.get(denom.currencyCode) ?? [];
        bucket.push({ denom, quantity });
        openingByCurrency.set(denom.currencyCode, bucket);
      }

      for (const [currencyCode, lines] of openingByCurrency) {
        const calc = calculateDenominationTotal(
          lines.map((line) => ({
            denominationId: line.denom.id,
            unitValue: line.denom.value,
            quantity: line.quantity,
          })),
        );
        if (!calc.ok) {
          throw new AppError('TELLER_DENOMINATION_INVALID', calc.error);
        }
        const txId = this.repo.insertTransaction({
          companyId,
          sessionId,
          tellerUserId: userId,
          transactionNumber: formatTransactionNumber(this.repo.nextTransactionSequence(companyId)),
          typeCode: 'OPENING_BALANCE',
          currencyCode,
          customerId: null,
          amount: calc.total,
          denominationTotal: calc.total,
          runningBalance: calc.total,
          note,
          transactionDate: openedAt,
          createdBy: userId,
        });
        for (const line of calc.lines) {
          this.repo.insertDenominationLine({
            companyId,
            transactionId: txId,
            denominationId: line.denominationId,
            quantity: line.quantity,
            unitValue: line.unitValue,
            lineTotal: line.lineTotal,
          });
        }
        this.repo.upsertSessionTotals({
          sessionId,
          companyId,
          currencyCode,
          cashInAmount: ZERO_BALANCE,
          cashOutAmount: ZERO_BALANCE,
          cashInCount: 0,
          cashOutCount: 0,
        });
      }
    });

    const session = this.repo.getSession(companyId, sessionId);
    if (!session) {
      throw new AppError('INTERNAL_ERROR', 'INTERNAL_ERROR');
    }
    this.logger.info('Teller session opened', { sessionId, companyId, userId });
    return session;
  }

  closeSession(userId: number, sessionId: number): TellerSession {
    const companyId = this.companyId();
    const session = this.repo.getSession(companyId, sessionId);
    if (!session) {
      throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
    }
    if (session.status !== 'OPEN') {
      throw new AppError('TELLER_SESSION_CLOSED', 'TELLER_SESSION_CLOSED');
    }

    const closedAt = parseTransactionDate(undefined);
    const closed = this.repo.closeSession(companyId, sessionId, closedAt, userId);
    if (!closed) {
      throw new AppError('TELLER_SESSION_CLOSED', 'TELLER_SESSION_CLOSED');
    }
    const updated = this.repo.getSession(companyId, sessionId);
    if (!updated) {
      throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
    }
    this.logger.info('Teller session closed', { sessionId, companyId, userId });
    return updated;
  }

  createTransaction(userId: number, input: CreateTellerTransactionInput): TellerTransaction {
    const companyId = this.companyId();
    const session = this.repo.getOpenSession(companyId);
    if (!session) {
      throw new AppError('TELLER_SESSION_REQUIRED', 'TELLER_SESSION_REQUIRED');
    }

    const typeCode = parseTellerTypeCode(input.typeCode);
    if (typeCode === 'OPENING_BALANCE') {
      throw new AppError('INVALID_TRANSACTION_TYPE', 'INVALID_TRANSACTION_TYPE');
    }
    const type = this.repo.getType(typeCode);
    if (!type) {
      throw new AppError('INVALID_TRANSACTION_TYPE', 'INVALID_TRANSACTION_TYPE');
    }

    const currencyCode = input.currencyCode.trim().toUpperCase();
    if (!this.repo.currencyActive(currencyCode)) {
      throw new AppError('INVALID_CURRENCY', 'INVALID_CURRENCY');
    }

    let customerId: number | null = null;
    if (type.partyKind === 'CUSTOMER') {
      if (input.customerId === undefined || input.customerId === null) {
        throw new AppError('VALIDATION_ERROR', 'CUSTOMER_REQUIRED');
      }
      customerId = input.customerId;
      if (!this.repo.customerExists(customerId)) {
        throw new AppError('CUSTOMER_NOT_FOUND', 'CUSTOMER_NOT_FOUND');
      }
    } else if (input.customerId !== undefined && input.customerId !== null) {
      throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
    }

    const quantities = parseQuantityList(input.quantities);
    const denoms = this.repo.listDenominations(currencyCode);
    const denomById = new Map(denoms.map((item) => [item.id, item]));
    const calcInput = quantities.map((line) => {
      const denom = denomById.get(line.denominationId);
      if (!denom) {
        throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
      }
      return { denominationId: line.denominationId, unitValue: denom.value, quantity: line.quantity };
    });
    const calc = calculateDenominationTotal(calcInput);
    if (!calc.ok) {
      throw new AppError('TELLER_DENOMINATION_INVALID', calc.error);
    }
    if (parseTellerDecimal(calc.total).lte(0)) {
      throw new AppError('VALIDATION_ERROR', 'AMOUNT_INVALID');
    }

    const declared = parseOptionalTellerAmount(input.amount);
    if (declared !== undefined && !amountsEqual(declared, calc.total)) {
      throw new AppError('TELLER_AMOUNT_MISMATCH', 'TELLER_AMOUNT_MISMATCH');
    }

    const note = parseOptionalNote(input.note);
    const transactionDate = parseTransactionDate(input.transactionDate);
    const opening = this.openingAmount(companyId, session.id, currencyCode);
    const previous = this.repo.getLastRunningBalance(companyId, session.id, currencyCode) ?? opening;
    const runningBalance =
      type.direction === 'IN'
        ? addTellerAmounts(previous, calc.total)
        : subtractTellerAmounts(previous, calc.total);

    let createdId = 0;
    this.write(() => {
      if (type.direction === 'OUT') {
        for (const line of calc.lines) {
          const available = this.repo.getPosition(companyId, line.denominationId);
          if (line.quantity > available) {
            throw new AppError('TELLER_INSUFFICIENT_CASH', 'TELLER_INSUFFICIENT_CASH');
          }
        }
      }

      createdId = this.repo.insertTransaction({
        companyId,
        sessionId: session.id,
        tellerUserId: userId,
        transactionNumber: formatTransactionNumber(this.repo.nextTransactionSequence(companyId)),
        typeCode,
        currencyCode,
        customerId,
        amount: calc.total,
        denominationTotal: calc.total,
        runningBalance,
        note,
        transactionDate,
        createdBy: userId,
      });

      for (const line of calc.lines) {
        this.repo.insertDenominationLine({
          companyId,
          transactionId: createdId,
          denominationId: line.denominationId,
          quantity: line.quantity,
          unitValue: line.unitValue,
          lineTotal: line.lineTotal,
        });
        const current = this.repo.getPosition(companyId, line.denominationId);
        const next = type.direction === 'IN' ? current + line.quantity : current - line.quantity;
        if (next < 0) {
          throw new AppError('TELLER_INSUFFICIENT_CASH', 'TELLER_INSUFFICIENT_CASH');
        }
        this.repo.setPosition(companyId, line.denominationId, next);
      }

      const totals = this.repo.getSessionTotals(companyId, session.id);
      const currentTotal = totals.find((row) => row.currency_code === currencyCode);
      const cashIn = currentTotal?.cash_in_amount ?? ZERO_BALANCE;
      const cashOut = currentTotal?.cash_out_amount ?? ZERO_BALANCE;
      this.repo.upsertSessionTotals({
        sessionId: session.id,
        companyId,
        currencyCode,
        cashInAmount: type.direction === 'IN' ? addTellerAmounts(cashIn, calc.total) : cashIn,
        cashOutAmount: type.direction === 'OUT' ? addTellerAmounts(cashOut, calc.total) : cashOut,
        cashInCount: (currentTotal?.cash_in_count ?? 0) + (type.direction === 'IN' ? 1 : 0),
        cashOutCount: (currentTotal?.cash_out_count ?? 0) + (type.direction === 'OUT' ? 1 : 0),
      });
    });

    this.logger.info('Teller transaction created', {
      transactionId: createdId,
      typeCode,
      currencyCode,
      companyId,
    });
    return this.getTransaction(createdId);
  }

  getTransaction(id: number): TellerTransaction {
    const companyId = this.companyId();
    const record = this.repo.getTransaction(companyId, id);
    if (!record) {
      throw new AppError('TELLER_TRANSACTION_NOT_FOUND', 'TELLER_TRANSACTION_NOT_FOUND');
    }
    return this.toTransaction(companyId, record);
  }

  listTransactions(query: TellerTransactionListQuery): TellerTransactionListResult {
    const companyId = this.companyId();
    const filters = {
      companyId,
      sessionId: parseOptionalSessionId(query.sessionId),
      currencyCode: query.currencyCode?.trim().toUpperCase(),
      typeCode: query.typeCode,
      direction: query.direction,
      customerId: query.customerId,
      transactionNumber: query.transactionNumber?.trim() || undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
      tellerUserId: query.tellerUserId,
    };

    if (filters.dateFrom && filters.dateTo) {
      const from = new Date(filters.dateFrom);
      const to = new Date(filters.dateTo);
      if (
        !Number.isNaN(from.getTime()) &&
        !Number.isNaN(to.getTime()) &&
        from.getTime() > to.getTime()
      ) {
        throw new AppError('INVALID_DATE_RANGE', 'INVALID_DATE_RANGE');
      }
    }

    const totalCount = this.repo.countTransactions(filters);
    const { page, pageSize, totalPages } = resolvePagination(
      query.page,
      query.pageSize,
      totalCount,
      DEFAULT_PAGE_SIZE,
    );
    const offset = (page - 1) * pageSize;
    const records = this.repo.listTransactions(filters, pageSize, offset);

    return {
      transactions: records.map((row) => ({
        id: row.id,
        transactionNumber: row.transaction_number,
        typeCode: row.type_code,
        direction: row.direction,
        partyKind: row.party_kind,
        currencyCode: row.currency_code,
        customerId: row.customer_id,
        customerName: row.customer_name,
        amount: row.amount,
        runningBalance: row.running_balance,
        note: row.note,
        transactionDate: row.transaction_date,
        tellerUserId: row.teller_user_id,
      })),
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  getDashboard(): TellerDashboard {
    const companyId = this.companyId();
    const session = this.repo.getOpenSession(companyId) ?? null;
    const currencies = DASHBOARD_CURRENCIES.map((code) => this.buildCurrencyDashboard(companyId, session, code));
    return { session, currencies };
  }

  getTally(sessionId: number | undefined, currencyCode: string): TellerTally {
    const companyId = this.companyId();
    const code = currencyCode.trim().toUpperCase();
    const session = this.requireReadableSession(companyId, sessionId);
    const denoms = this.repo.listDenominations(code);
    const opening = this.repo.listOpeningLines(companyId, session.id);
    const movements = this.repo.listSessionInOutDenoms(companyId, session.id);
    const receivedExtra = new Map<number, number>();
    const paid = new Map<number, number>();
    for (const row of movements) {
      if (row.direction === 'IN') {
        receivedExtra.set(row.denomination_id, (receivedExtra.get(row.denomination_id) ?? 0) + row.quantity);
      } else {
        paid.set(row.denomination_id, (paid.get(row.denomination_id) ?? 0) + row.quantity);
      }
    }

    const rows: TellerTallyRow[] = denoms.map((denom) => {
      const openingPieces = opening.find((line) => line.denomination_id === denom.id)?.quantity ?? 0;
      const receivedPieces = openingPieces + (receivedExtra.get(denom.id) ?? 0);
      const paidPieces = paid.get(denom.id) ?? 0;
      const remaining = remainingPieces(receivedPieces, paidPieces);
      return {
        denominationId: denom.id,
        currencyCode: denom.currencyCode,
        value: denom.value,
        receivedPieces,
        paidPieces,
        remainingPieces: remaining,
        remainingAmount: remainingAmount(remaining, denom.value),
      };
    });

    const totalCash = rows.reduce((sum, row) => addTellerAmounts(sum, row.remainingAmount), ZERO_BALANCE);
    return { sessionId: session.id, currencyCode: code, rows, totalCash };
  }

  getLongBook(sessionId: number | undefined, currencyCode: string, page?: number, pageSize?: number): TellerLongBook {
    const companyId = this.companyId();
    const code = currencyCode.trim().toUpperCase();
    const session = this.requireReadableSession(companyId, sessionId);
    const openingBalance = this.openingAmount(companyId, session.id, code);
    const movements = this.repo.listLongBookMovements(companyId, session.id, code);

    const openingRow: TellerLongBookRow = {
      id: null,
      kind: 'OPENING',
      transactionNumber: null,
      typeCode: 'OPENING_BALANCE',
      transactionDate: session.openedAt,
      customerName: null,
      received: ZERO_BALANCE,
      paid: ZERO_BALANCE,
      runningBalance: openingBalance,
      note: session.note,
    };

    const movementRows: TellerLongBookRow[] = movements.map((row) => ({
      id: row.id,
      kind: row.direction === 'IN' ? 'RECEIVED' : 'PAID',
      transactionNumber: row.transaction_number,
      typeCode: row.type_code,
      transactionDate: row.transaction_date,
      customerName: row.customer_name,
      received: row.direction === 'IN' ? row.amount : ZERO_BALANCE,
      paid: row.direction === 'OUT' ? row.amount : ZERO_BALANCE,
      runningBalance: row.running_balance,
      note: row.note,
    }));

    const allRows = [openingRow, ...movementRows];
    const totalReceived = movements
      .filter((row) => row.direction === 'IN')
      .reduce((sum, row) => addTellerAmounts(sum, row.amount), ZERO_BALANCE);
    const totalPaid = movements
      .filter((row) => row.direction === 'OUT')
      .reduce((sum, row) => addTellerAmounts(sum, row.amount), ZERO_BALANCE);
    const closingBalance = subtractTellerAmounts(addTellerAmounts(openingBalance, totalReceived), totalPaid);

    const totalCount = allRows.length;
    const pagination = resolvePagination(page, pageSize, totalCount, DEFAULT_PAGE_SIZE);
    const start = (pagination.page - 1) * pagination.pageSize;
    const rows = allRows.slice(start, start + pagination.pageSize);

    return {
      sessionId: session.id,
      currencyCode: code,
      openingBalance,
      totalReceived,
      totalPaid,
      closingBalance,
      rows,
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,
    };
  }

  getReconciliation(sessionId?: number): TellerReconciliation {
    const companyId = this.companyId();
    const session = sessionId
      ? this.requireReadableSession(companyId, sessionId)
      : this.repo.getOpenSession(companyId) ?? null;

    const rows = DASHBOARD_CURRENCIES.map((code) => {
      const dash = this.buildCurrencyDashboard(companyId, session, code);
      return {
        currencyCode: code,
        expectedCash: dash.expectedCash,
        physicalTally: dash.physicalTally,
        difference: dash.difference,
      };
    });

    return { sessionId: session?.id ?? null, rows };
  }

  private requireReadableSession(companyId: number, sessionId: number | undefined): TellerSession {
    if (sessionId === undefined) {
      const open = this.repo.getOpenSession(companyId);
      if (!open) {
        throw new AppError('TELLER_SESSION_REQUIRED', 'TELLER_SESSION_REQUIRED');
      }
      return open;
    }
    const session = this.repo.getSession(companyId, sessionId);
    if (!session) {
      throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
    }
    return session;
  }

  private openingAmount(companyId: number, sessionId: number, currencyCode: string): string {
    const lines = this.repo
      .listOpeningLines(companyId, sessionId)
      .filter((line) => line.currency_code === currencyCode);
    return lines.reduce((sum, line) => addTellerAmounts(sum, line.line_total), ZERO_BALANCE);
  }

  private physicalAmount(companyId: number, currencyCode: string): string {
    const positions = this.repo.listPositions(companyId).filter((row) => row.currency_code === currencyCode);
    return positions.reduce(
      (sum, row) => addTellerAmounts(sum, remainingAmount(row.quantity, row.value)),
      ZERO_BALANCE,
    );
  }

  private buildCurrencyDashboard(
    companyId: number,
    session: TellerSession | null,
    currencyCode: string,
  ): TellerCurrencyDashboard {
    const physicalTally = this.physicalAmount(companyId, currencyCode);
    if (!session) {
      return {
        currencyCode,
        openingBalance: ZERO_BALANCE,
        cashIn: ZERO_BALANCE,
        cashOut: ZERO_BALANCE,
        currentBalance: physicalTally,
        transactionCount: 0,
        physicalTally,
        expectedCash: physicalTally,
        difference: ZERO_BALANCE,
      };
    }

    const openingBalance = this.openingAmount(companyId, session.id, currencyCode);
    const totals = this.repo
      .getSessionTotals(companyId, session.id)
      .find((row) => row.currency_code === currencyCode);
    const cashIn = totals?.cash_in_amount ?? ZERO_BALANCE;
    const cashOut = totals?.cash_out_amount ?? ZERO_BALANCE;
    const expectedCash = subtractTellerAmounts(addTellerAmounts(openingBalance, cashIn), cashOut);
    const difference = subtractTellerAmounts(physicalTally, expectedCash);

    return {
      currencyCode,
      openingBalance,
      cashIn,
      cashOut,
      currentBalance: expectedCash,
      transactionCount: (totals?.cash_in_count ?? 0) + (totals?.cash_out_count ?? 0),
      physicalTally,
      expectedCash,
      difference,
    };
  }

  private toTransaction(companyId: number, record: TellerTransactionRecord): TellerTransaction {
    const denoms = this.repo.listTransactionDenoms(companyId, record.id);
    return {
      id: record.id,
      companyId: record.company_id,
      sessionId: record.session_id,
      tellerUserId: record.teller_user_id,
      transactionNumber: record.transaction_number,
      typeCode: record.type_code,
      direction: record.direction,
      partyKind: record.party_kind,
      currencyCode: record.currency_code,
      customerId: record.customer_id,
      customerName: record.customer_name,
      customerNumber: record.customer_number,
      amount: record.amount,
      denominationTotal: record.denomination_total,
      runningBalance: record.running_balance,
      validationStatus: 'OK',
      note: record.note,
      transactionDate: record.transaction_date,
      createdAt: record.created_at,
      createdBy: record.created_by,
      updatedAt: record.updated_at,
      updatedBy: record.updated_by,
      denominations: denoms.map((line) => ({
        denominationId: line.denomination_id,
        currencyCode: line.currency_code,
        value: line.value,
        quantity: line.quantity,
        unitValue: line.unit_value,
        lineTotal: line.line_total,
      })),
    };
  }
}

export function isCashMovementType(typeCode: TellerTransactionTypeCode): boolean {
  return typeCode !== 'OPENING_BALANCE';
}
