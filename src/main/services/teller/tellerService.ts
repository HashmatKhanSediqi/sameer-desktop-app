import type Database from 'better-sqlite3';
import { formatTellerAmount, parseTellerDecimal } from '@shared/teller/denominationMath';
import {
  computeCheckFlag,
  computeClosingAmount,
  computeClosingPieceCounts,
  computeCountedTotal,
  computeIsReconciled,
  computeRunningBalance,
  computeSessionSummary,
  computeVariance,
  emptyPieceCounts,
} from '@shared/teller/workbookMath';
import { resolvePagination } from '@shared/pagination';
import type {
  OpenTellerSessionInput,
  StartTellerDayOpening,
  TellerDenomination,
  TellerDirection,
  TellerLongBook,
  TellerLongBookRow,
  TellerOpeningRow,
  TellerSession,
  TellerSessionSummary,
  TellerSheet,
  TellerTransaction,
  TellerTransactionListQuery,
  TellerTransactionListResult,
  UpdateTellerSessionInput,
  UpsertTellerTransactionInput,
} from '@shared/types/teller';
import { INITIAL_WORKSHEET_ROWS, nextTellerBusinessDate } from '@shared/teller/worksheetRows';
import { AppError } from '../../utils/errors';
import { computeDayClosing, writeTellerDayWorkbook } from './tellerWorkbookExport';
import type { Logger } from '../../utils/logger';
import { TellerRepository, type TellerTransactionRecord } from '../../database/repositories/tellerRepository';
import { ZERO_BALANCE } from '../transaction/money';
import {
  parseCurrencyCode,
  parseOptionalNote,
  parseOptionalSessionId,
  parseOptionalTellerAmount,
  parseOptionalText,
  parsePieceCounts,
  parseRequiredTellerAmount,
  parseSessionDate,
  parseTellerDirection,
  parseTrustedTellerAmount,
} from './tellerValidation';

const DEFAULT_PAGE_SIZE = 50;

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

  listOpenSessions(): TellerSession[] {
    return this.repo.listOpenSessions(this.companyId()).map((session) => this.hydrateSession(session));
  }

  getCurrentSession(currencyCode: string): TellerSession | null {
    const code = parseCurrencyCode(currencyCode);
    const session = this.repo.getOpenSession(this.companyId(), code);
    return session ? this.hydrateSession(session) : null;
  }

  openSession(userId: number, input: OpenTellerSessionInput): TellerSession {
    const companyId = this.companyId();
    const currencyCode = parseCurrencyCode(input.currencyCode);
    if (!this.repo.currencyExists(currencyCode) || !this.repo.currencyActive(currencyCode)) {
      throw new AppError('INVALID_CURRENCY', 'INVALID_CURRENCY');
    }

    const sessionDate = parseSessionDate(input.sessionDate);
    const existingForDate = this.repo.getSessionByDate(companyId, currencyCode, sessionDate);
    if (existingForDate) {
      throw new AppError('TELLER_SESSION_ALREADY_OPEN', 'TELLER_SESSION_ALREADY_OPEN');
    }

    const open = this.repo.getOpenSession(companyId, currencyCode);
    if (open && open.sessionDate === sessionDate) {
      throw new AppError('TELLER_SESSION_ALREADY_OPEN', 'TELLER_SESSION_ALREADY_OPEN');
    }

    const denominations = this.requireDenominations(currencyCode);
    const previous = this.repo.getLatestSessionBefore(companyId, currencyCode, sessionDate);
    const inherited = previous ? this.closingPosition(this.hydrateSession(previous), this.requireDenominations(previous.currencyCode, previous.id)) : null;
    const explicitOpening = input.openingCounts !== undefined || input.openingAmount !== undefined;
    const openingCounts = this.normalizeCounts(
      denominations,
      parsePieceCounts(explicitOpening ? input.openingCounts : (inherited?.counts ?? {})),
    );
    const openingAmount = formatAmount(
      explicitOpening
        ? parseRequiredTellerAmount(input.openingAmount ?? computeCountedTotal(denominations, openingCounts))
        : parseTrustedTellerAmount(inherited?.amount ?? '0'),
    );

    let sessionId = 0;
    this.write(() => {
      if (open && open.sessionDate !== sessionDate) {
        const closedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
        this.repo.closeSession(companyId, open.id, closedAt, userId);
      }
      sessionId = this.repo.insertSession({
        companyId,
        tellerUserId: userId,
        currencyCode,
        sessionDate,
        branchName: parseOptionalText(input.branchName) ?? previous?.branchName ?? null,
        branchCode: parseOptionalText(input.branchCode, 40) ?? previous?.branchCode ?? null,
        openingAmount,
        oppAmount: formatAmount(parseRequiredTellerAmount(input.oppAmount)),
        cashInICBA: formatAmount(parseRequiredTellerAmount(input.cashInICBA)),
        cashOutICBA: formatAmount(parseRequiredTellerAmount(input.cashOutICBA)),
        note: parseOptionalNote(input.note),
        createdBy: userId,
      });
      this.repo.replaceOpeningCounts(sessionId, companyId, this.toDenomLines(denominations, openingCounts));
    });

    const session = this.repo.getSession(companyId, sessionId);
    if (!session) {
      throw new AppError('INTERNAL_ERROR', 'INTERNAL_ERROR');
    }
    this.logger.info('Teller session opened', { sessionId, companyId, currencyCode, userId, sessionDate });
    return this.hydrateSession(session);
  }

  updateSession(userId: number, input: UpdateTellerSessionInput): TellerSession {
    const companyId = this.companyId();
    const session = this.requireOpenSession(companyId, input.sessionId);
    const denominations = this.requireDenominations(session.currencyCode, session.id);
    const openingCounts =
      input.openingCounts === undefined
        ? session.openingCounts
        : this.normalizeCounts(denominations, parsePieceCounts(input.openingCounts));
    const openingAmount =
      input.openingAmount === undefined
        ? session.openingAmount
        : formatAmount(parseTrustedTellerAmount(input.openingAmount));

    this.write(() => {
      const updated = this.repo.updateSession({
        companyId,
        sessionId: session.id,
        branchName: input.branchName === undefined ? session.branchName : parseOptionalText(input.branchName),
        branchCode: input.branchCode === undefined ? session.branchCode : parseOptionalText(input.branchCode, 40),
        openingAmount,
        oppAmount:
          input.oppAmount === undefined ? session.oppAmount : formatAmount(parseRequiredTellerAmount(input.oppAmount)),
        cashInICBA:
          input.cashInICBA === undefined ? session.cashInICBA : formatAmount(parseRequiredTellerAmount(input.cashInICBA)),
        cashOutICBA:
          input.cashOutICBA === undefined
            ? session.cashOutICBA
            : formatAmount(parseRequiredTellerAmount(input.cashOutICBA)),
        note: input.note === undefined ? session.note : parseOptionalNote(input.note),
        updatedBy: userId,
      });
      if (!updated) {
        throw new AppError('TELLER_SESSION_CLOSED', 'TELLER_SESSION_CLOSED');
      }
      if (input.openingCounts !== undefined) {
        this.repo.replaceOpeningCounts(session.id, companyId, this.toDenomLines(denominations, openingCounts));
      }
    });

    const next = this.repo.getSession(companyId, session.id);
    if (!next) {
      throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
    }
    return this.hydrateSession(next);
  }

  async endDay(
    userId: number,
    filePath: string,
    worksheetRows?: number,
  ): Promise<{
    sessions: TellerSession[];
    filePath: string;
    closings: Array<{ currencyCode: string; closingAmount: string }>;
  }> {
    const companyId = this.companyId();
    const openSessions = this.listOpenSessions();
    if (openSessions.length === 0) {
      throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
    }
    const exportInputs = [];
    const closings: Array<{ currencyCode: string; closingAmount: string }> = [];
    for (const session of openSessions) {
      const denominations = this.requireDenominations(session.currencyCode, session.id);
      const sheet = this.buildSheet(session, denominations);
      const closing = computeDayClosing(sheet);
      const rows = Math.max(
        INITIAL_WORKSHEET_ROWS,
        worksheetRows ?? 0,
        ...sheet.deposits.map((transaction) => transaction.worksheetRow),
        ...sheet.withdrawals.map((transaction) => transaction.worksheetRow),
      );
      exportInputs.push({
        sheet,
        worksheetRows: rows,
        closingAmount: closing.amount,
        closingCounts: closing.counts,
      });
      closings.push({ currencyCode: session.currencyCode, closingAmount: closing.amount });
    }
    const writtenPath = await writeTellerDayWorkbook(filePath, exportInputs);
    const closedSessions: TellerSession[] = [];
    this.write(() => {
      const closedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      for (const session of openSessions) {
        if (!this.repo.closeSession(companyId, session.id, closedAt, userId)) {
          throw new AppError('TELLER_SESSION_CLOSED', 'TELLER_SESSION_CLOSED');
        }
      }
    });
    for (const session of openSessions) {
      const closed = this.repo.getSession(companyId, session.id);
      if (closed) {
        closedSessions.push(this.hydrateSession(closed));
      }
    }
    return { sessions: closedSessions, filePath: writtenPath, closings };
  }

  startDay(userId: number): TellerSheet[] {
    const sheets: TellerSheet[] = [];
    this.write(() => {
      for (const currencyCode of this.repo.listActiveCurrencyCodes()) {
        sheets.push(this.startCurrencyDay(userId, currencyCode));
      }
    });
    return sheets;
  }

  private startCurrencyDay(userId: number, currencyCode: string, opening?: StartTellerDayOpening): TellerSheet {
    const code = parseCurrencyCode(currencyCode);
    if (!this.repo.currencyExists(code) || !this.repo.currencyActive(code)) {
      throw new AppError('INVALID_CURRENCY', 'INVALID_CURRENCY');
    }
    const today = parseSessionDate(undefined);
    const todaySession = this.repo.getSessionByDate(this.companyId(), code, today);
    if (todaySession?.status === 'OPEN') {
      return this.buildSheet(this.hydrateSession(todaySession), this.requireDenominations(code, todaySession.id));
    }
    if (todaySession?.status === 'CLOSED') {
      const next = this.openFollowingBusinessDay(userId, code, todaySession.sessionDate, opening);
      return this.buildSheet(next, this.requireDenominations(code));
    }
    const previous = this.repo.getLatestSessionBefore(this.companyId(), code, today);
    if (previous?.status === 'CLOSED') {
      const next = this.openFollowingBusinessDay(userId, code, previous.sessionDate, opening);
      return this.buildSheet(next, this.requireDenominations(code));
    }
    if (opening) {
      const created = this.openSession(userId, { currencyCode: code, sessionDate: today, ...opening });
      return this.buildSheet(created, this.requireDenominations(code));
    }
    return this.getSheet(code, { userId, sessionDate: today });
  }

  resetCash(userId: number, currencyCode: string): TellerSheet {
    const code = parseCurrencyCode(currencyCode);
    if (!this.repo.currencyExists(code) || !this.repo.currencyActive(code)) {
      throw new AppError('INVALID_CURRENCY', 'INVALID_CURRENCY');
    }
    const companyId = this.companyId();
    const denominations = this.requireDenominations(code);
    const open = this.repo.getOpenSession(companyId, code);
    const zeroCounts = emptyPieceCounts(denominations);
    if (open) {
      this.write(() => {
        const updated = this.repo.updateSession({
          companyId,
          sessionId: open.id,
          branchName: open.branchName,
          branchCode: open.branchCode,
          openingAmount: formatAmount('0'),
          oppAmount: open.oppAmount,
          cashInICBA: open.cashInICBA,
          cashOutICBA: open.cashOutICBA,
          note: open.note,
          updatedBy: userId,
        });
        if (!updated) {
          throw new AppError('TELLER_SESSION_CLOSED', 'TELLER_SESSION_CLOSED');
        }
        this.repo.replaceOpeningCounts(open.id, companyId, this.toDenomLines(denominations, zeroCounts));
        this.repo.deleteSessionTransactions(companyId, open.id);
      });
      const session = this.repo.getSession(companyId, open.id);
      if (!session) {
        throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
      }
      this.logger.info('Teller cash reset to zero', { sessionId: open.id, companyId, currencyCode: code, userId });
      return this.buildSheet(this.hydrateSession(session), denominations);
    }
    return this.startCurrencyDay(userId, code, { openingAmount: '0', openingCounts: zeroCounts });
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

    const closedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const closed = this.repo.closeSession(companyId, sessionId, closedAt, userId);
    if (!closed) {
      throw new AppError('TELLER_SESSION_CLOSED', 'TELLER_SESSION_CLOSED');
    }
    const updated = this.repo.getSession(companyId, sessionId);
    if (!updated) {
      throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
    }
    this.logger.info('Teller session closed', { sessionId, companyId, userId });
    return this.hydrateSession(updated);
  }

  upsertTransaction(userId: number, input: UpsertTellerTransactionInput): TellerTransaction | null {
    const companyId = this.companyId();
    const session = this.requireOpenSession(companyId, input.sessionId);
    const direction = parseTellerDirection(input.direction);
    const requestedWorksheetRow =
      input.worksheetRow === undefined ? undefined : parseWorksheetRow(input.worksheetRow, direction);
    const denominations = this.requireDenominations(session.currencyCode, session.id);
    const counts = this.normalizeCounts(denominations, parsePieceCounts(input.denominationCounts));
    const referenceLabel = (input.referenceLabel ?? '').trim();
    const declaredAmount = parseOptionalTellerAmount(input.declaredAmount);
    const blankRow =
      referenceLabel.length === 0 &&
      declaredAmount === null &&
      Object.values(counts).every((quantity) => quantity === 0);

    if (blankRow) {
      if (input.id !== undefined) {
        this.deleteTransaction(input.id);
      }
      return null;
    }

    let transactionId = input.id ?? 0;
    this.write(() => {
      if (input.id === undefined) {
        const worksheetRow = requestedWorksheetRow ?? this.repo.nextWorksheetRow(session.id, direction);
        const existingAtRow = this.repo.getTransactionByWorksheetRow(
          companyId,
          session.id,
          direction,
          worksheetRow,
        );
        if (existingAtRow) {
          transactionId = existingAtRow.id;
          this.repo.updateTransaction({
            companyId,
            transactionId,
            worksheetRow,
            referenceLabel,
            declaredAmount: declaredAmount === null ? null : formatAmount(declaredAmount),
            updatedBy: userId,
          });
        } else {
          transactionId = this.repo.insertTransaction({
            companyId,
            sessionId: session.id,
            direction,
            worksheetRow,
            referenceLabel,
            declaredAmount: declaredAmount === null ? null : formatAmount(declaredAmount),
            createdBy: userId,
          });
        }
      } else {
        const existing = this.repo.getTransaction(companyId, input.id);
        if (!existing || existing.session_id !== session.id) {
          throw new AppError('TELLER_TRANSACTION_NOT_FOUND', 'TELLER_TRANSACTION_NOT_FOUND');
        }
        if (existing.direction !== direction) {
          throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
        }
        this.repo.updateTransaction({
          companyId,
          transactionId: input.id,
          worksheetRow: requestedWorksheetRow ?? existing.worksheet_row,
          referenceLabel,
          declaredAmount: declaredAmount === null ? null : formatAmount(declaredAmount),
          updatedBy: userId,
        });
        transactionId = input.id;
      }
      this.repo.replaceTransactionCounts(transactionId, companyId, this.toDenomLines(denominations, counts));
    });

    this.logger.info('Teller transaction saved', {
      transactionId,
      direction,
      currencyCode: session.currencyCode,
      companyId,
    });
    return this.getTransaction(transactionId);
  }

  deleteTransaction(id: number): { success: true } {
    const companyId = this.companyId();
    const existing = this.repo.getTransaction(companyId, id);
    if (!existing) {
      throw new AppError('TELLER_TRANSACTION_NOT_FOUND', 'TELLER_TRANSACTION_NOT_FOUND');
    }
    const session = this.repo.getSession(companyId, existing.session_id);
    if (!session || session.status !== 'OPEN') {
      throw new AppError('TELLER_SESSION_CLOSED', 'TELLER_SESSION_CLOSED');
    }
    this.repo.deleteTransaction(companyId, id);
    return { success: true };
  }

  getTransaction(id: number): TellerTransaction {
    const companyId = this.companyId();
    const record = this.repo.getTransaction(companyId, id);
    if (!record) {
      throw new AppError('TELLER_TRANSACTION_NOT_FOUND', 'TELLER_TRANSACTION_NOT_FOUND');
    }
    const session = this.repo.getSession(companyId, record.session_id);
    if (!session) {
      throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
    }
    const denominations = this.requireDenominations(session.currencyCode, session.id);
    const siblings = this.repo.listSessionTransactions(session.id, record.direction);
    const sequenceNo = siblings.findIndex((row) => row.id === record.id) + 1;
    return this.toTransaction(record, denominations, sequenceNo);
  }

  listTransactions(query: TellerTransactionListQuery): TellerTransactionListResult {
    const companyId = this.companyId();
    const filters = {
      companyId,
      sessionId: parseOptionalSessionId(query.sessionId),
      currencyCode: query.currencyCode ? parseCurrencyCode(query.currencyCode) : undefined,
      direction: query.direction,
      referenceLabel: query.referenceLabel?.trim() || undefined,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    };

    if (filters.dateFrom && filters.dateTo) {
      const from = new Date(filters.dateFrom);
      const to = new Date(filters.dateTo);
      if (!Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from.getTime() > to.getTime()) {
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
    const records = this.repo.listTransactions(filters, pageSize, (page - 1) * pageSize);
    return {
      transactions: records.map((row) => {
        const session = this.repo.getSession(companyId, row.session_id);
        const denominations = session ? this.requireDenominations(session.currencyCode, session.id) : [];
        const counts = this.repo.listTransactionCounts(row.id);
        const countedTotal = denominations.length > 0 ? computeCountedTotal(denominations, counts) : ZERO_BALANCE;
        const declared = row.declared_amount ?? countedTotal;
        return {
          id: row.id,
          sessionId: row.session_id,
          sequenceNo: 0,
          direction: row.direction,
          currencyCode: row.currency_code ?? session?.currencyCode ?? '',
          referenceLabel: row.reference_label,
          declaredAmount: row.declared_amount,
          countedTotal,
          check: row.declared_amount === null ? 'OK' : computeCheckFlag(declared, countedTotal),
          variance: row.declared_amount === null ? ZERO_BALANCE : computeVariance(declared, countedTotal),
          createdAt: row.created_at,
        };
      }),
      totalCount,
      page,
      pageSize,
      totalPages,
    };
  }

  getSheet(currencyCode: string, options?: { userId?: number; sessionDate?: string }): TellerSheet {
    const code = parseCurrencyCode(currencyCode);
    if (!this.repo.currencyExists(code)) {
      throw new AppError('INVALID_CURRENCY', 'INVALID_CURRENCY');
    }
    const explicitDate = options?.sessionDate !== undefined && options.sessionDate.trim().length > 0;
    const sessionDate = parseSessionDate(options?.sessionDate);
    if (!explicitDate && options?.userId !== undefined) {
      const open = this.repo.getOpenSession(this.companyId(), code);
      if (open) {
        const denominations = this.repo.listDenominations(code, open.id);
        return this.buildSheet(this.hydrateSession(open), denominations);
      }
    }
    let session = this.repo.getSessionByDate(this.companyId(), code, sessionDate) ?? null;
    if (!session && explicitDate && options?.userId !== undefined) {
      session = this.ensureDailySession(options.userId, code, sessionDate);
    }
    if (!session) {
      const denominations = this.repo.listDenominations(code);
      return {
        session: null,
        currencyCode: code,
        denominations,
        opening: null,
        deposits: [],
        withdrawals: [],
        summary: emptySummary(code, denominations),
      };
    }
    return this.buildSheet(this.hydrateSession(session), this.repo.listDenominations(code, session.id));
  }

  getLongBook(sessionId: number | undefined, currencyCode: string, page?: number, pageSize?: number): TellerLongBook {
    const companyId = this.companyId();
    const code = parseCurrencyCode(currencyCode);
    if (!this.repo.currencyExists(code)) {
      throw new AppError('INVALID_CURRENCY', 'INVALID_CURRENCY');
    }
    const session = this.requireReadableSession(companyId, sessionId, code);
    const denominations = this.requireDenominations(session.currencyCode, session.id);
    const hydrated = this.hydrateSession(session);
    const movements = this.repo.listSessionTransactions(session.id);
    const openingBalance = hydrated.openingAmount;
    let running = openingBalance;
    const allRows: TellerLongBookRow[] = [
      {
        id: null,
        kind: 'OPENING',
        sequenceNo: null,
        referenceLabel: 'OP',
        createdAt: session.createdAt,
        received: ZERO_BALANCE,
        paid: ZERO_BALANCE,
        runningBalance: openingBalance,
      },
    ];

    let depositNo = 0;
    let withdrawalNo = 0;
    for (const row of movements) {
      const counts = this.repo.listTransactionCounts(row.id);
      const counted = computeCountedTotal(denominations, counts);
      const amount = row.declared_amount ?? counted;
      running = computeRunningBalance(running, row.direction, amount);
      if (row.direction === 'DEPOSIT') {
        depositNo += 1;
      } else {
        withdrawalNo += 1;
      }
      allRows.push({
        id: row.id,
        kind: row.direction,
        sequenceNo: row.direction === 'DEPOSIT' ? depositNo : withdrawalNo,
        referenceLabel: row.reference_label,
        createdAt: row.created_at,
        received: row.direction === 'DEPOSIT' ? amount : ZERO_BALANCE,
        paid: row.direction === 'WITHDRAWAL' ? amount : ZERO_BALANCE,
        runningBalance: running,
      });
    }

    const summary = this.buildSummary(hydrated, denominations);
    const totalCount = allRows.length;
    const pagination = resolvePagination(page, pageSize, totalCount, DEFAULT_PAGE_SIZE);
    const start = (pagination.page - 1) * pagination.pageSize;
    return {
      sessionId: session.id,
      currencyCode: code,
      openingBalance,
      totalReceived: summary.grandTotalReceivedAmount,
      totalPaid: summary.grandTotalPaidAmount,
      closingBalance: running,
      rows: allRows.slice(start, start + pagination.pageSize),
      totalCount,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages: pagination.totalPages,
    };
  }

  private openFollowingBusinessDay(
    userId: number,
    currencyCode: string,
    fromDate: string,
    opening?: StartTellerDayOpening,
  ): TellerSession {
    let sessionDate = nextTellerBusinessDate(fromDate);
    for (let index = 0; index < 366; index += 1) {
      const existing = this.repo.getSessionByDate(this.companyId(), currencyCode, sessionDate);
      if (!existing) {
        return this.openSession(userId, { currencyCode, sessionDate, ...opening });
      }
      if (existing.status === 'OPEN') {
        return this.hydrateSession(existing);
      }
      sessionDate = nextTellerBusinessDate(sessionDate);
    }
    return this.openSession(userId, { currencyCode, sessionDate, ...opening });
  }

  private ensureDailySession(userId: number, currencyCode: string, sessionDate: string): TellerSession {
    const companyId = this.companyId();
    const existing = this.repo.getSessionByDate(companyId, currencyCode, sessionDate);
    if (existing) {
      if (existing.status !== 'OPEN') {
        this.repo.reopenSession(companyId, existing.id, userId);
        return this.hydrateSession(this.repo.getSession(companyId, existing.id) ?? existing);
      }
      return this.hydrateSession(existing);
    }
    return this.openSession(userId, { currencyCode, sessionDate });
  }

  private closingPosition(
    session: TellerSession,
    denominations: TellerDenomination[],
  ): { counts: Record<string, number>; amount: string } {
    const deposits = this.repo
      .listSessionTransactions(session.id, 'DEPOSIT')
      .map((row) => this.toTransaction(row, denominations, 0));
    const withdrawals = this.repo
      .listSessionTransactions(session.id, 'WITHDRAWAL')
      .map((row) => this.toTransaction(row, denominations, 0));
    return {
      counts: computeClosingPieceCounts(
        denominations,
        session.openingCounts,
        deposits.map((row) => row.denominationCounts),
        withdrawals.map((row) => row.denominationCounts),
      ),
      amount: computeClosingAmount(
        denominations,
        session.openingAmount,
        deposits.map((row) => ({ declaredAmount: row.declaredAmount, counts: row.denominationCounts })),
        withdrawals.map((row) => ({ declaredAmount: row.declaredAmount, counts: row.denominationCounts })),
      ),
    };
  }

  private requireDenominations(currencyCode: string, sessionId?: number): TellerDenomination[] {
    const denominations = this.repo.listDenominations(currencyCode, sessionId);
    if (denominations.length === 0) {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
    }
    return denominations;
  }

  private requireOpenSession(companyId: number, sessionId: number): TellerSession {
    const session = this.repo.getSession(companyId, sessionId);
    if (!session) {
      throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
    }
    if (session.status !== 'OPEN') {
      throw new AppError('TELLER_SESSION_CLOSED', 'TELLER_SESSION_CLOSED');
    }
    return this.hydrateSession(session);
  }

  private requireReadableSession(companyId: number, sessionId: number | undefined, currencyCode: string): TellerSession {
    if (sessionId === undefined) {
      const open = this.repo.getOpenSession(companyId, currencyCode);
      if (!open) {
        throw new AppError('TELLER_SESSION_REQUIRED', 'TELLER_SESSION_REQUIRED');
      }
      return this.hydrateSession(open);
    }
    const session = this.repo.getSession(companyId, sessionId);
    if (!session) {
      throw new AppError('TELLER_SESSION_NOT_FOUND', 'TELLER_SESSION_NOT_FOUND');
    }
    if (session.currencyCode !== currencyCode) {
      throw new AppError('INVALID_CURRENCY', 'INVALID_CURRENCY');
    }
    return this.hydrateSession(session);
  }

  private normalizeCounts(
    denominations: TellerDenomination[],
    raw: Record<string, number>,
  ): Record<string, number> {
    const byValue = new Map(denominations.map((item) => [item.value, item]));
    const counts: Record<string, number> = {};
    for (const denom of denominations) {
      counts[denom.value] = 0;
    }
    for (const [value, quantity] of Object.entries(raw)) {
      if (!byValue.has(value)) {
        throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
      }
      counts[value] = quantity;
    }
    return counts;
  }

  private toDenomLines(
    denominations: TellerDenomination[],
    counts: Record<string, number>,
  ): Array<{ denominationId: number; quantity: number }> {
    return denominations.map((denom) => ({
      denominationId: denom.id,
      quantity: counts[denom.value] ?? 0,
    }));
  }

  private hydrateSession(session: TellerSession): TellerSession {
    const denominations = this.repo.listDenominations(session.currencyCode, session.id);
    const openingCounts = this.normalizeCounts(denominations, session.openingCounts);
    return {
      ...session,
      openingCounts,
      openingAmount: session.openingAmount,
    };
  }

  private toOpeningRow(session: TellerSession, denominations: TellerDenomination[]): TellerOpeningRow {
    const denominationCounts = this.normalizeCounts(denominations, session.openingCounts);
    const countedTotal = computeCountedTotal(denominations, denominationCounts);
    const declared = session.openingAmount;
    return {
      referenceLabel: 'OP',
      declaredAmount: declared,
      denominationCounts,
      countedTotal,
      check: computeCheckFlag(declared, countedTotal),
      variance: computeVariance(declared, countedTotal),
    };
  }

  private toTransaction(
    record: TellerTransactionRecord,
    denominations: TellerDenomination[],
    sequenceNo: number,
  ): TellerTransaction {
    const denominationCounts = this.normalizeCounts(denominations, this.repo.listTransactionCounts(record.id));
    const countedTotal = computeCountedTotal(denominations, denominationCounts);
    const declared = record.declared_amount;
    const comparable = declared ?? countedTotal;
    return {
      id: record.id,
      sessionId: record.session_id,
      sequenceNo,
      worksheetRow: record.worksheet_row,
      direction: record.direction,
      referenceLabel: record.reference_label,
      declaredAmount: declared,
      denominationCounts,
      countedTotal,
      isReconciled: declared === null ? true : computeIsReconciled(comparable, countedTotal),
      check: declared === null ? 'OK' : computeCheckFlag(comparable, countedTotal),
      variance: declared === null ? ZERO_BALANCE : computeVariance(comparable, countedTotal),
      createdAt: record.created_at,
      createdBy: record.created_by,
      updatedAt: record.updated_at,
      updatedBy: record.updated_by,
    };
  }

  private buildSheet(session: TellerSession, denominations: TellerDenomination[]): TellerSheet {
    const depositRecords = this.repo.listSessionTransactions(session.id, 'DEPOSIT');
    const withdrawalRecords = this.repo.listSessionTransactions(session.id, 'WITHDRAWAL');
    const deposits = depositRecords.map((row, index) => this.toTransaction(row, denominations, index + 1));
    const withdrawals = withdrawalRecords.map((row, index) => this.toTransaction(row, denominations, index + 1));
    return {
      session,
      currencyCode: session.currencyCode,
      denominations,
      opening: this.toOpeningRow(session, denominations),
      deposits,
      withdrawals,
      summary: this.buildSummary(session, denominations, deposits, withdrawals),
    };
  }

  private buildSummary(
    session: TellerSession,
    denominations: TellerDenomination[],
    deposits?: TellerTransaction[],
    withdrawals?: TellerTransaction[],
  ): TellerSessionSummary {
    const depositRows =
      deposits ??
      this.repo.listSessionTransactions(session.id, 'DEPOSIT').map((row, index) => this.toTransaction(row, denominations, index + 1));
    const withdrawalRows =
      withdrawals ??
      this.repo.listSessionTransactions(session.id, 'WITHDRAWAL').map((row, index) => this.toTransaction(row, denominations, index + 1));
    const depositInputs = depositRows.map((row) => ({ declaredAmount: row.declaredAmount, counts: row.denominationCounts }));
    const withdrawalInputs = withdrawalRows.map((row) => ({
      declaredAmount: row.declaredAmount,
      counts: row.denominationCounts,
    }));
    const computed = computeSessionSummary({
      currencyCode: session.currencyCode,
      denominations,
      openingCounts: session.openingCounts,
      deposits: depositInputs,
      withdrawals: withdrawalInputs,
      oppAmount: session.oppAmount,
      cashInICBA: session.cashInICBA,
      cashOutICBA: session.cashOutICBA,
    });
    return {
      denominations: denominations.map((item) => item.value),
      ...computed,
      openingAmount: session.openingAmount,
      currentCash: computeClosingAmount(denominations, session.openingAmount, depositInputs, withdrawalInputs),
      currentCounts: computeClosingPieceCounts(
        denominations,
        session.openingCounts,
        depositInputs.map((row) => row.counts),
        withdrawalInputs.map((row) => row.counts),
      ),
      oppAmount: session.oppAmount,
      cashInICBA: session.cashInICBA,
      cashOutICBA: session.cashOutICBA,
    };
  }
}

function formatAmount(value: string): string {
  return formatTellerAmount(parseTellerDecimal(value));
}

function parseWorksheetRow(value: number, direction: TellerDirection): number {
  const minimum = direction === 'DEPOSIT' ? 2 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
  }
  return value;
}

function emptySummary(currencyCode: string, denominations: TellerDenomination[]): TellerSessionSummary {
  const computed = computeSessionSummary({
    currencyCode,
    denominations,
    openingCounts: emptyPieceCounts(denominations),
    deposits: [],
    withdrawals: [],
    oppAmount: ZERO_BALANCE,
    cashInICBA: ZERO_BALANCE,
    cashOutICBA: ZERO_BALANCE,
  });
  return {
    denominations: denominations.map((item) => item.value),
    ...computed,
    openingAmount: ZERO_BALANCE,
    currentCash: ZERO_BALANCE,
    currentCounts: emptyPieceCounts(denominations),
    oppAmount: ZERO_BALANCE,
    cashInICBA: ZERO_BALANCE,
    cashOutICBA: ZERO_BALANCE,
  };
}

export function isDeposit(direction: TellerDirection): boolean {
  return direction === 'DEPOSIT';
}
