import { existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { seedDefaultAdminIfEmpty } from '../../src/main/services/auth/adminSeedService';
import { CurrencyService } from '../../src/main/services/currency/currencyService';
import { TellerService } from '../../src/main/services/teller/tellerService';
import { parseOptionalTellerAmount, parseTrustedTellerAmount } from '../../src/main/services/teller/tellerValidation';
import { AppError } from '../../src/main/utils/errors';
import { amountsEqual } from '../../src/shared/teller/denominationMath';
import { tellerDayAction, TELLER_RESET_REQUIRES_CONFIRMATION } from '../../src/shared/teller/sessionState';
import { nextTellerBusinessDate, suggestTellerExportFileName } from '../../src/shared/teller/worksheetRows';

async function createTellerHarness() {
  const testDb = createTestDatabase();
  applyProjectMigrations(testDb.db, testDb.logger);
  await seedDefaultAdminIfEmpty(testDb.db, testDb.logger);
  const tellerService = new TellerService(testDb.db, testDb.logger);
  const admin = testDb.db.prepare('SELECT id FROM admin_users LIMIT 1').get() as { id: number };
  return { testDb, tellerService, userId: admin.id };
}

function counts(pieces: Record<string, number>): Record<string, number> {
  return pieces;
}

describe('teller service workbook model', () => {
  it('saves a mixed-denomination deposit: 1×1000 + 1×500 = 1500, Check OK', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, { currencyCode: 'AFN' });
      const created = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'TESTCUST',
        declaredAmount: '1500',
        denominationCounts: counts({ '1000': 1, '500': 1 }),
      });
      expect(created).not.toBeNull();
      expect(amountsEqual(created!.countedTotal, '1500')).toBe(true);
      expect(created!.check).toBe('OK');
      expect(amountsEqual(created!.variance, '0')).toBe(true);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('saves a mismatched deposit without blocking and includes it in totals', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, { currencyCode: 'AFN' });
      const created = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'MISMATCH',
        declaredAmount: '5000',
        denominationCounts: counts({ '1000': 1 }),
      });
      expect(created!.check).toBe('NO');
      expect(amountsEqual(created!.variance, '4000')).toBe(true);

      const sheet = harness.tellerService.getSheet('AFN');
      expect(sheet.summary.depositTransactionCount).toBe(1);
      expect(sheet.summary.totalReceivedByDenomination['1000']).toBe(1);
      expect(amountsEqual(sheet.summary.grandTotalReceivedAmount, '1000')).toBe(true);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('allows a negative tally when withdrawal pieces exceed the declared amount', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, { currencyCode: 'AFN' });
      const created = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'WITHDRAWAL',
        referenceLabel: 'OVER',
        declaredAmount: '300',
        denominationCounts: counts({ '1000': 3 }),
      });
      expect(created!.check).toBe('NO');
      expect(amountsEqual(created!.variance, '-2700')).toBe(true);

      const sheet = harness.tellerService.getSheet('AFN');
      expect(sheet.summary.netPiecesByDenomination['1000']).toBe(-3);
      expect(sheet.summary.withdrawalTransactionCount).toBe(1);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('counts a zero-amount row and treats blank piece counts as zero', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, { currencyCode: 'AFN' });
      const created = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'ZERO',
        declaredAmount: '0',
        denominationCounts: {},
      });
      expect(created!.check).toBe('OK');
      expect(amountsEqual(created!.countedTotal, '0')).toBe(true);

      const sheet = harness.tellerService.getSheet('AFN');
      expect(sheet.summary.depositTransactionCount).toBe(1);
      expect(amountsEqual(sheet.summary.grandTotalReceivedAmount, '0')).toBe(true);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('updates counted total when denomination counts change without rejecting the row', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, { currencyCode: 'AFN' });
      const first = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'EDIT',
        declaredAmount: '1500',
        denominationCounts: counts({ '1000': 1, '500': 1 }),
      });
      const second = harness.tellerService.upsertTransaction(harness.userId, {
        id: first!.id,
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'EDIT',
        declaredAmount: '1500',
        denominationCounts: counts({ '1000': 1 }),
      });
      expect(second!.check).toBe('NO');
      expect(amountsEqual(second!.countedTotal, '1000')).toBe(true);
      expect(amountsEqual(second!.variance, '500')).toBe(true);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('keeps AFN and USD session totals isolated', async () => {
    const harness = await createTellerHarness();
    try {
      const afn = harness.tellerService.openSession(harness.userId, { currencyCode: 'AFN' });
      const usd = harness.tellerService.openSession(harness.userId, { currencyCode: 'USD' });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: afn.id,
        direction: 'DEPOSIT',
        referenceLabel: 'AFN-ROW',
        declaredAmount: '1500',
        denominationCounts: counts({ '1000': 1, '500': 1 }),
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: usd.id,
        direction: 'DEPOSIT',
        referenceLabel: 'USD-ROW',
        declaredAmount: '100',
        denominationCounts: counts({ '100': 1 }),
      });

      const afnSheet = harness.tellerService.getSheet('AFN');
      const usdSheet = harness.tellerService.getSheet('USD');
      expect(amountsEqual(afnSheet.summary.grandTotalReceivedAmount, '1500')).toBe(true);
      expect(amountsEqual(usdSheet.summary.grandTotalReceivedAmount, '100')).toBe(true);
      expect(afnSheet.summary.depositTransactionCount).toBe(1);
      expect(usdSheet.summary.depositTransactionCount).toBe(1);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('computes AFN RESULT from Opp-Amount + ICBA in − ICBA out, not from OP', async () => {
    const harness = await createTellerHarness();
    try {
      harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        openingCounts: counts({ '1000': 2 }),
        openingAmount: '2000',
        oppAmount: '1000',
        cashInICBA: '200',
        cashOutICBA: '50',
      });
      const sheet = harness.tellerService.getSheet('AFN');
      expect(amountsEqual(sheet.session!.openingAmount, '2000')).toBe(true);
      expect(amountsEqual(sheet.session!.oppAmount, '1000')).toBe(true);
      expect(amountsEqual(sheet.summary.result, '1150')).toBe(true);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('computes USD RESULT as counted cash minus Opp-Amount, not OP', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        oppAmount: '100',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'EX65.70',
        declaredAmount: '250',
        denominationCounts: counts({ '100': 2, '50': 1 }),
      });
      const sheet = harness.tellerService.getSheet('USD');
      expect(amountsEqual(sheet.summary.grandTotalAmount, '250')).toBe(true);
      expect(amountsEqual(sheet.summary.result, '150')).toBe(true);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('builds a running-balance long book from OP plus log amounts', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        openingCounts: counts({ '1000': 1 }),
        openingAmount: '1000',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'IN',
        declaredAmount: '500',
        denominationCounts: counts({ '500': 1 }),
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'WITHDRAWAL',
        referenceLabel: 'OUT',
        declaredAmount: '200',
        denominationCounts: counts({ '100': 2 }),
      });
      const book = harness.tellerService.getLongBook(session.id, 'AFN');
      expect(amountsEqual(book.openingBalance, '1000')).toBe(true);
      expect(book.rows[0]?.kind).toBe('OPENING');
      expect(book.rows[0]?.referenceLabel).toBe('OP');
      expect(amountsEqual(book.rows[1]!.runningBalance, '1500')).toBe(true);
      expect(amountsEqual(book.closingBalance, '1300')).toBe(true);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('does not require or store a customer accounting foreign key', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, { currencyCode: 'AFN' });
      const created = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'MASOUD',
        declaredAmount: '20000',
        denominationCounts: counts({ '1000': 20 }),
      });
      const columns = harness.testDb.db.prepare('PRAGMA table_info(teller_transactions)').all() as Array<{
        name: string;
      }>;
      expect(columns.some((column) => column.name === 'customer_id')).toBe(false);
      expect(created!.referenceLabel).toBe('MASOUD');
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('carries day 1 closing cash into day 2 OP and starts with empty transaction rows', async () => {
    const harness = await createTellerHarness();
    try {
      const day1 = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-01',
        openingCounts: counts({ '100': 10 }),
        openingAmount: '1000',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: day1.id,
        direction: 'DEPOSIT',
        referenceLabel: 'DAY1-IN',
        declaredAmount: '2000',
        denominationCounts: counts({ '100': 20 }),
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: day1.id,
        direction: 'WITHDRAWAL',
        referenceLabel: 'DAY1-OUT',
        declaredAmount: '500',
        denominationCounts: counts({ '100': 5 }),
      });

      const day1Sheet = harness.tellerService.getSheet('USD', { sessionDate: '2026-08-01' });
      expect(amountsEqual(day1Sheet.session!.openingAmount, '1000')).toBe(true);
      expect(day1Sheet.deposits).toHaveLength(1);
      expect(day1Sheet.withdrawals).toHaveLength(1);

      const day2 = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-02',
      });
      const day2Sheet = harness.tellerService.getSheet('USD', { sessionDate: '2026-08-02' });

      expect(day2.id).not.toBe(day1.id);
      expect(amountsEqual(day2Sheet.opening!.declaredAmount, '2500')).toBe(true);
      expect(day2Sheet.opening!.referenceLabel).toBe('OP');
      expect(day2Sheet.opening!.denominationCounts['100']).toBe(25);
      expect(day2Sheet.deposits).toHaveLength(0);
      expect(day2Sheet.withdrawals).toHaveLength(0);
      expect(day2Sheet.summary.depositTransactionCount).toBe(0);
      expect(day2Sheet.summary.withdrawalTransactionCount).toBe(0);
      expect(day2Sheet.summary.totalTransactionCount).toBe(0);

      const day1History = harness.tellerService.listTransactions({ sessionId: day1.id });
      expect(day1History.totalCount).toBe(2);
      expect(day1History.transactions.map((row) => row.referenceLabel).sort()).toEqual(['DAY1-IN', 'DAY1-OUT']);

      const day2History = harness.tellerService.listTransactions({ sessionId: day2.id });
      expect(day2History.totalCount).toBe(0);
      expect(day2History.transactions.every((row) => row.referenceLabel !== 'OP')).toBe(true);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('does not copy yesterday denomination rows or invent pieces from the closing total', async () => {
    const harness = await createTellerHarness();
    try {
      harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-01',
        openingCounts: counts({ '100': 10, '50': 5, '20': 10 }),
        openingAmount: '1450',
      });
      harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-02',
      });
      const day2 = harness.tellerService.getSheet('USD', { sessionDate: '2026-08-02' });
      expect(day2.opening!.denominationCounts['100']).toBe(10);
      expect(day2.opening!.denominationCounts['50']).toBe(5);
      expect(day2.opening!.denominationCounts['20']).toBe(10);
      expect(amountsEqual(day2.opening!.declaredAmount, '1450')).toBe(true);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('keeps AFN and USD opening balances independent across a new day', async () => {
    const harness = await createTellerHarness();
    try {
      harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: '2026-08-01',
        openingCounts: counts({ '1000': 3 }),
        openingAmount: '3000',
      });
      harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-01',
        openingCounts: counts({ '100': 10 }),
        openingAmount: '1000',
      });
      harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: '2026-08-02',
      });
      harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-02',
      });

      const afn = harness.tellerService.getSheet('AFN', { sessionDate: '2026-08-02' });
      const usd = harness.tellerService.getSheet('USD', { sessionDate: '2026-08-02' });
      expect(amountsEqual(afn.opening!.declaredAmount, '3000')).toBe(true);
      expect(afn.opening!.denominationCounts['1000']).toBe(3);
      expect(amountsEqual(usd.opening!.declaredAmount, '1000')).toBe(true);
      expect(usd.opening!.denominationCounts['100']).toBe(10);
      expect(afn.deposits).toHaveLength(0);
      expect(usd.deposits).toHaveLength(0);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('does not treat OP as a normal customer transaction in today totals', async () => {
    const harness = await createTellerHarness();
    try {
      const day1 = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-01',
        openingCounts: counts({ '100': 10 }),
        openingAmount: '1000',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: day1.id,
        direction: 'DEPOSIT',
        referenceLabel: 'YESTERDAY',
        declaredAmount: '2000',
        denominationCounts: counts({ '100': 20 }),
      });
      harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-02',
      });
      const today = harness.tellerService.getSheet('USD', { sessionDate: '2026-08-02' });
      expect(today.deposits.some((row) => row.referenceLabel === 'YESTERDAY')).toBe(false);
      expect(today.summary.depositTransactionCount).toBe(0);
      expect(today.summary.totalReceivedByDenomination['100']).toBe(30);
      expect(amountsEqual(today.summary.grandTotalReceivedAmount, '3000')).toBe(true);

      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: today.session!.id,
        direction: 'DEPOSIT',
        referenceLabel: 'TODAY',
        declaredAmount: '500',
        denominationCounts: counts({ '100': 5 }),
      });
      const after = harness.tellerService.getSheet('USD', { sessionDate: '2026-08-02' });
      expect(after.summary.depositTransactionCount).toBe(1);
      expect(after.deposits).toHaveLength(1);
      expect(after.deposits[0]?.referenceLabel).toBe('TODAY');
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('creates a custom currency with its own denominations and opens that sheet', async () => {
    const harness = await createTellerHarness();
    try {
      const currencies = new CurrencyService(harness.testDb.db);
      currencies.create({ code: 'GBP', name: 'Pound' });
      for (const value of ['50', '20', '10', '5', '2', '1']) {
        currencies.createDenomination({ currencyCode: 'GBP', value });
      }

      const persisted = new CurrencyService(harness.testDb.db).listDenominations('GBP');
      expect(persisted.map((item) => item.value)).toEqual(['50', '20', '10', '5', '2', '1']);

      const sheet = harness.tellerService.getSheet('GBP', { userId: harness.userId, sessionDate: '2026-08-29' });
      expect(sheet.currencyCode).toBe('GBP');
      expect(sheet.denominations.map((item) => item.value)).toEqual(['50', '20', '10', '5', '2', '1']);
      expect(sheet.session?.status).toBe('OPEN');
      expect(sheet.deposits).toHaveLength(0);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('exports the finalized day to Excel and keeps AFN/USD close isolated', async () => {
    const harness = await createTellerHarness();
    const exportPath = path.join(tmpdir(), suggestTellerExportFileName('USD', '2026-08-29'));
    const files = [exportPath];
    try {
      const usd = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-29',
        openingCounts: counts({ '100': 10 }),
        openingAmount: '1000',
      });
      const afn = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: '2026-08-29',
        openingCounts: counts({ '1000': 2 }),
        openingAmount: '2000',
      });
      for (let index = 0; index < 35; index += 1) {
        harness.tellerService.upsertTransaction(harness.userId, {
          sessionId: usd.id,
          direction: 'DEPOSIT',
          referenceLabel: `IN-${index + 1}`,
          declaredAmount: '100',
          denominationCounts: counts({ '100': 1 }),
        });
      }
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: usd.id,
        direction: 'WITHDRAWAL',
        referenceLabel: 'OUT-1',
        declaredAmount: '200',
        denominationCounts: counts({ '100': 2 }),
      });

      const ended = await harness.tellerService.endDay(harness.userId, usd.id, exportPath, 36);
      files.push(ended.filePath);
      expect(ended.session.status).toBe('CLOSED');
      expect(ended.session.currencyCode).toBe('USD');
      expect(amountsEqual(ended.closingAmount, '4300')).toBe(true);
      expect(harness.tellerService.getCurrentSession('AFN')?.id).toBe(afn.id);
      expect(harness.tellerService.getCurrentSession('AFN')?.status).toBe('OPEN');
      expect(harness.tellerService.getCurrentSession('USD')).toBeNull();

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(ended.filePath);
      const worksheet = workbook.getWorksheet('USD');
      expect(worksheet).toBeTruthy();
      expect(worksheet!.getCell(2, 2).value).toBe('USD');
      expect(worksheet!.getCell(2, 4).value).toBe('2026-08-29');
      expect([100, 50, 20, 10, 5, 1].every((value, index) => worksheet!.getCell(4, 2 + index).value === value)).toBe(
        true,
      );
      expect(worksheet!.getCell(15, 1).value).toBe(1);
      expect(worksheet!.getCell(15, 2).value).toBe('OP');
      expect(worksheet!.getCell(15, 3).value).toBe(1000);
      expect(worksheet!.getCell(15, 4).value).toBe(10);
      expect(worksheet!.getCell(16, 2).value).toBe('IN-1');
      expect(worksheet!.getCell(50, 1).value).toBe(36);
      expect(worksheet!.getCell(50, 2).value).toBe('IN-35');
      expect(worksheet!.getCell(15, 14).value).toBe(1);
      expect(worksheet!.getCell(15, 15).value).toBe('OUT-1');

      const day2 = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-30',
      });
      const next = harness.tellerService.getSheet('USD', { sessionDate: '2026-08-30' });
      expect(day2.id).not.toBe(usd.id);
      expect(amountsEqual(next.opening!.declaredAmount, '4300')).toBe(true);
      expect(next.opening!.denominationCounts['100']).toBe(43);
      expect(next.deposits).toHaveLength(0);
      expect(next.withdrawals).toHaveLength(0);
      const history = harness.tellerService.listTransactions({ sessionId: usd.id });
      expect(history.totalCount).toBe(36);
    } finally {
      for (const file of files) {
        if (existsSync(file)) {
          unlinkSync(file);
        }
      }
      harness.testDb.cleanup();
    }
  });

  it('does not close the session when Excel export fails', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: '2026-08-29',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'KEEP',
        declaredAmount: '1000',
        denominationCounts: counts({ '1000': 1 }),
      });
      const badPath = path.join(tmpdir(), 'missing-teller-dir', 'FMT-Teller-AFN-2026-08-29.xlsx');
      await expect(harness.tellerService.endDay(harness.userId, session.id, badPath, 20)).rejects.toThrow(
        /TELLER_EXPORT_FAILED/,
      );
      expect(harness.tellerService.getCurrentSession('AFN')?.id).toBe(session.id);
      expect(harness.tellerService.getCurrentSession('AFN')?.status).toBe('OPEN');
      expect(harness.tellerService.listTransactions({ sessionId: session.id }).totalCount).toBe(1);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('does not close AFN when USD is finalized', async () => {
    const harness = await createTellerHarness();
    const exportPath = path.join(tmpdir(), suggestTellerExportFileName('AFN', '2026-08-29'));
    try {
      const afn = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: '2026-08-29',
      });
      const usd = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-29',
      });
      const ended = await harness.tellerService.endDay(harness.userId, afn.id, exportPath, 20);
      expect(ended.session.currencyCode).toBe('AFN');
      expect(ended.session.status).toBe('CLOSED');
      expect(harness.tellerService.getCurrentSession('USD')?.id).toBe(usd.id);
      expect(harness.tellerService.getCurrentSession('USD')?.status).toBe('OPEN');
    } finally {
      if (existsSync(exportPath)) {
        unlinkSync(exportPath);
      }
      harness.testDb.cleanup();
    }
  });

  it('exports a custom currency using its configured denominations', async () => {
    const harness = await createTellerHarness();
    const exportPath = path.join(tmpdir(), suggestTellerExportFileName('GBP', '2026-08-29'));
    try {
      const currencies = new CurrencyService(harness.testDb.db);
      currencies.create({ code: 'GBP', name: 'Pound' });
      for (const value of ['50', '20', '10', '5', '2', '1']) {
        currencies.createDenomination({ currencyCode: 'GBP', value });
      }
      const session = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'GBP',
        sessionDate: '2026-08-29',
        openingCounts: counts({ '50': 2 }),
        openingAmount: '100',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'POUND',
        declaredAmount: '50',
        denominationCounts: counts({ '50': 1 }),
      });
      const ended = await harness.tellerService.endDay(harness.userId, session.id, exportPath, 20);
      expect(ended.session.status).toBe('CLOSED');
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(ended.filePath);
      const worksheet = workbook.getWorksheet('GBP');
      expect([50, 20, 10, 5, 2, 1].every((value, index) => worksheet!.getCell(4, 2 + index).value === value)).toBe(true);
      expect(worksheet!.getCell(15, 2).value).toBe('OP');
      expect(worksheet!.getCell(15, 4).value).toBe(2);
      expect(worksheet!.getCell(16, 2).value).toBe('POUND');
    } finally {
      if (existsSync(exportPath)) {
        unlinkSync(exportPath);
      }
      harness.testDb.cleanup();
    }
  });

  it('opens the next business day after End Today so new transactions are not written to the closed session', async () => {
    const harness = await createTellerHarness();
    const today = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();
    const exportPath = path.join(tmpdir(), suggestTellerExportFileName('AFN', today));
    try {
      const usd = harness.tellerService.openSession(harness.userId, { currencyCode: 'USD', sessionDate: today });
      const afn = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: today,
        openingCounts: counts({ '1000': 1 }),
        openingAmount: '1000',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: afn.id,
        direction: 'DEPOSIT',
        referenceLabel: 'YESTERDAY',
        declaredAmount: '500',
        denominationCounts: counts({ '500': 1 }),
      });

      await harness.tellerService.endDay(harness.userId, afn.id, exportPath, 20);

      const closed = harness.tellerService.getSheet('AFN', { userId: harness.userId });
      expect(closed.session?.id).toBe(afn.id);
      expect(closed.session?.status).toBe('CLOSED');
      expect(closed.deposits.map((row) => row.referenceLabel)).toEqual(['YESTERDAY']);
      expect(amountsEqual(closed.summary.currentCash, '1500')).toBe(true);
      expect(amountsEqual(closed.summary.openingAmount, '1000')).toBe(true);

      const next = harness.tellerService.startDay(harness.userId, 'AFN');
      expect(next.session?.status).toBe('OPEN');
      expect(next.session?.id).not.toBe(afn.id);
      expect(next.session?.sessionDate).toBe(nextTellerBusinessDate(today));
      expect(amountsEqual(next.opening!.declaredAmount, '1500')).toBe(true);
      expect(next.opening!.denominationCounts['1000']).toBe(1);
      expect(next.opening!.denominationCounts['500']).toBe(1);
      expect(next.deposits).toHaveLength(0);
      expect(next.withdrawals).toHaveLength(0);
      expect(amountsEqual(next.summary.openingAmount, '1500')).toBe(true);
      expect(amountsEqual(next.summary.currentCash, '1500')).toBe(true);
      expect(harness.tellerService.getSheet('AFN', { userId: harness.userId }).session?.id).toBe(next.session?.id);

      const created = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: next.session!.id,
        direction: 'DEPOSIT',
        referenceLabel: 'TODAY-NEW',
        declaredAmount: '1000',
        denominationCounts: counts({ '1000': 1 }),
      });
      expect(created?.sessionId).toBe(next.session!.id);
      const history = harness.tellerService.listTransactions({ sessionId: afn.id });
      expect(history.totalCount).toBe(1);
      expect(history.transactions[0]?.referenceLabel).toBe('YESTERDAY');
      expect(harness.tellerService.getCurrentSession('USD')?.id).toBe(usd.id);
      expect(harness.tellerService.getCurrentSession('USD')?.status).toBe('OPEN');
    } finally {
      if (existsSync(exportPath)) {
        unlinkSync(exportPath);
      }
      harness.testDb.cleanup();
    }
  });

  it('keeps stored OP separate from live current cash after deposits and withdrawals', async () => {
    const harness = await createTellerHarness();
    try {
      const session = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: '2026-08-30',
        openingCounts: counts({ '1000': 10 }),
        openingAmount: '10000',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'IN',
        declaredAmount: '3000',
        denominationCounts: counts({ '1000': 3 }),
      });
      const afterIn = harness.tellerService.getSheet('AFN', { sessionDate: '2026-08-30' });
      expect(amountsEqual(afterIn.summary.openingAmount, '10000')).toBe(true);
      expect(amountsEqual(afterIn.summary.currentCash, '13000')).toBe(true);
      expect(afterIn.summary.currentCounts['1000']).toBe(13);

      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'WITHDRAWAL',
        referenceLabel: 'OUT',
        declaredAmount: '2000',
        denominationCounts: counts({ '1000': 2 }),
      });
      const afterOut = harness.tellerService.getSheet('AFN', { sessionDate: '2026-08-30' });
      expect(amountsEqual(afterOut.summary.openingAmount, '10000')).toBe(true);
      expect(amountsEqual(afterOut.opening!.declaredAmount, '10000')).toBe(true);
      expect(amountsEqual(afterOut.summary.currentCash, '11000')).toBe(true);
      expect(afterOut.summary.currentCounts['1000']).toBe(11);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('tracks START/END independently per currency without auto-opening idle currencies', async () => {
    const harness = await createTellerHarness();
    const today = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();
    const exportPath = path.join(tmpdir(), suggestTellerExportFileName('AFN', today));
    try {
      const currencies = new CurrencyService(harness.testDb.db);
      currencies.create({ code: 'GBP', name: 'Pound' });
      for (const value of ['50', '20', '10', '5', '2', '1']) {
        currencies.createDenomination({ currencyCode: 'GBP', value });
      }

      harness.tellerService.openSession(harness.userId, { currencyCode: 'USD', sessionDate: today });
      const afn = harness.tellerService.openSession(harness.userId, { currencyCode: 'AFN', sessionDate: today });
      await harness.tellerService.endDay(harness.userId, afn.id, exportPath, 20);

      const afnSheet = harness.tellerService.getSheet('AFN', { userId: harness.userId });
      const usdSheet = harness.tellerService.getSheet('USD', { userId: harness.userId });
      const gbpSheet = harness.tellerService.getSheet('GBP', { userId: harness.userId });

      expect(tellerDayAction(afnSheet.session?.status)).toBe('START');
      expect(tellerDayAction(usdSheet.session?.status)).toBe('END');
      expect(gbpSheet.session).toBeNull();
      expect(tellerDayAction(gbpSheet.session?.status)).toBe('START');

      expect(harness.tellerService.getCurrentSession('USD')?.status).toBe('OPEN');
      expect(harness.tellerService.getCurrentSession('GBP')).toBeNull();
    } finally {
      if (existsSync(exportPath)) {
        unlinkSync(exportPath);
      }
      harness.testDb.cleanup();
    }
  });

  it('starts today with previous closing cash as OP without transaction validation', async () => {
    const harness = await createTellerHarness();
    const today = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();
    const exportPath = path.join(tmpdir(), suggestTellerExportFileName('AFN', today));
    try {
      const session = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: today,
        openingCounts: counts({ '1000': 10, '500': 5, '100': 10 }),
        openingAmount: '13500.0000',
      });
      await harness.tellerService.endDay(harness.userId, session.id, exportPath, 20);

      let started: ReturnType<TellerService['startDay']> | undefined;
      expect(() => {
        started = harness.tellerService.startDay(harness.userId, 'AFN');
      }).not.toThrow();
      expect(started?.session?.status).toBe('OPEN');
      expect(amountsEqual(started!.opening!.declaredAmount, '13500')).toBe(true);
      expect(started!.opening!.denominationCounts['1000']).toBe(10);
      expect(started!.opening!.denominationCounts['500']).toBe(5);
      expect(started!.opening!.denominationCounts['100']).toBe(10);
      expect(started!.deposits).toHaveLength(0);
      expect(started!.withdrawals).toHaveLength(0);

      const created = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: started!.session!.id,
        direction: 'DEPOSIT',
        referenceLabel: 'NEXT',
        declaredAmount: '1000',
        denominationCounts: counts({ '1000': 1 }),
      });
      expect(created?.check).toBe('OK');
    } finally {
      if (existsSync(exportPath)) {
        unlinkSync(exportPath);
      }
      harness.testDb.cleanup();
    }
  });

  it('validates normal deposit and withdrawal rows but not system OP amounts', async () => {
    const harness = await createTellerHarness();
    try {
      expect(amountsEqual(parseTrustedTellerAmount('25000.0000'), '25000')).toBe(true);
      expect(() => parseOptionalTellerAmount('not-an-amount')).toThrow(AppError);
      try {
        parseOptionalTellerAmount('not-an-amount');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe('VALIDATION_ERROR');
      }

      const session = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        openingAmount: '25000.0000',
        openingCounts: counts({ '1000': 25 }),
      });
      expect(amountsEqual(session.openingAmount, '25000')).toBe(true);

      expect(() =>
        harness.tellerService.upsertTransaction(harness.userId, {
          sessionId: session.id,
          direction: 'DEPOSIT',
          referenceLabel: 'BAD',
          declaredAmount: 'abc',
          denominationCounts: counts({ '1000': 1 }),
        }),
      ).toThrow(AppError);

      expect(() =>
        harness.tellerService.upsertTransaction(harness.userId, {
          sessionId: session.id,
          direction: 'WITHDRAWAL',
          referenceLabel: 'BAD-OUT',
          declaredAmount: 'abc',
          denominationCounts: counts({ '1000': 1 }),
        }),
      ).toThrow(AppError);

      const deposit = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'DEPOSIT',
        referenceLabel: 'OK-IN',
        declaredAmount: '1000',
        denominationCounts: counts({ '1000': 1 }),
      });
      const withdrawal = harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: session.id,
        direction: 'WITHDRAWAL',
        referenceLabel: 'OK-OUT',
        declaredAmount: '500',
        denominationCounts: counts({ '500': 1 }),
      });
      expect(deposit?.check).toBe('OK');
      expect(withdrawal?.check).toBe('OK');
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('resets only the selected currency cash after confirmation policy and keeps history', async () => {
    const harness = await createTellerHarness();
    expect(TELLER_RESET_REQUIRES_CONFIRMATION).toBe(true);
    try {
      const usd = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'USD',
        sessionDate: '2026-08-29',
        openingCounts: counts({ '100': 5 }),
        openingAmount: '500',
      });
      const afn = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: '2026-08-29',
        openingCounts: counts({ '1000': 10 }),
        openingAmount: '10000',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: afn.id,
        direction: 'DEPOSIT',
        referenceLabel: 'ACTIVE',
        declaredAmount: '1000',
        denominationCounts: counts({ '1000': 1 }),
      });
      const closedAfn = harness.tellerService.closeSession(harness.userId, afn.id);
      const nextAfn = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: '2026-08-30',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: nextAfn.id,
        direction: 'DEPOSIT',
        referenceLabel: 'TODAY',
        declaredAmount: '2000',
        denominationCounts: counts({ '1000': 2 }),
      });

      const reset = harness.tellerService.resetCash(harness.userId, 'AFN');
      expect(reset.session?.id).toBe(nextAfn.id);
      expect(amountsEqual(reset.summary.currentCash, '0')).toBe(true);
      expect(amountsEqual(reset.summary.openingAmount, '0')).toBe(true);
      expect(reset.summary.currentCounts['1000']).toBe(0);
      expect(reset.opening?.denominationCounts['1000']).toBe(0);
      expect(reset.deposits).toHaveLength(0);
      expect(reset.withdrawals).toHaveLength(0);

      const history = harness.tellerService.listTransactions({ sessionId: closedAfn.id });
      expect(history.totalCount).toBe(1);
      expect(history.transactions[0]?.referenceLabel).toBe('ACTIVE');

      const usdSheet = harness.tellerService.getSheet('USD', { sessionDate: '2026-08-29' });
      expect(usdSheet.session?.id).toBe(usd.id);
      expect(amountsEqual(usdSheet.summary.currentCash, '500')).toBe(true);
      expect(usdSheet.opening?.denominationCounts['100']).toBe(5);
    } finally {
      harness.testDb.cleanup();
    }
  });

  it('applies a closed-session reset to the next startable day without rewriting history', async () => {
    const harness = await createTellerHarness();
    const today = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();
    const exportPath = path.join(tmpdir(), suggestTellerExportFileName('AFN', today));
    try {
      const afn = harness.tellerService.openSession(harness.userId, {
        currencyCode: 'AFN',
        sessionDate: today,
        openingCounts: counts({ '1000': 3 }),
        openingAmount: '3000',
      });
      harness.tellerService.upsertTransaction(harness.userId, {
        sessionId: afn.id,
        direction: 'DEPOSIT',
        referenceLabel: 'YESTERDAY',
        declaredAmount: '1000',
        denominationCounts: counts({ '1000': 1 }),
      });
      await harness.tellerService.endDay(harness.userId, afn.id, exportPath, 20);

      const reset = harness.tellerService.resetCash(harness.userId, 'AFN');
      expect(reset.session?.status).toBe('OPEN');
      expect(reset.session?.id).not.toBe(afn.id);
      expect(amountsEqual(reset.summary.openingAmount, '0')).toBe(true);
      expect(amountsEqual(reset.summary.currentCash, '0')).toBe(true);
      expect(reset.deposits).toHaveLength(0);

      const history = harness.tellerService.listTransactions({ sessionId: afn.id });
      expect(history.totalCount).toBe(1);
      expect(history.transactions[0]?.referenceLabel).toBe('YESTERDAY');
    } finally {
      if (existsSync(exportPath)) {
        unlinkSync(exportPath);
      }
      harness.testDb.cleanup();
    }
  });
});
