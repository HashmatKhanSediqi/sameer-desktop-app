import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { runMigrations, getAppliedMigrationVersions } from '../../src/main/database/migrationRunner';
import { TellerService } from '../../src/main/services/teller/tellerService';
import { createTestDatabase } from '../helpers/testDatabase';

const migrationsDir = join(process.cwd(), 'migrations');

function migrateThrough(version: 7 | 8) {
  const h = createTestDatabase();
  for (const file of readdirSync(migrationsDir).filter(name => Number(name.slice(0, 3)) <= version).sort()) {
    h.db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
    h.db.prepare('INSERT INTO schema_migrations(version,name) VALUES (?,?)').run(Number(file.slice(0, 3)), file);
  }
  h.db.prepare("INSERT INTO admin_users(username,password_hash) VALUES ('legacy','hash')").run();
  return h;
}

function populateLegacyOpenWorksheet(h: ReturnType<typeof createTestDatabase>): void {
  h.db.prepare(`INSERT INTO teller_sessions
    (company_id,teller_user_id,opened_at,status,note,created_by,updated_by)
    VALUES (1,1,'2026-08-15 08:30:00','OPEN','Legacy active day',1,1)`).run();
  const denomination = (currency: string, value: string) => (h.db.prepare(
    'SELECT id FROM denominations WHERE currency_code=? AND value=?',
  ).get(currency, value) as { id: number }).id;
  const afn1000 = denomination('AFN', '1000');
  const afn500 = denomination('AFN', '500');
  const usd100 = denomination('USD', '100');
  const opening = h.db.prepare(`INSERT INTO teller_session_opening_denominations
    (session_id,company_id,denomination_id,quantity,unit_value,line_total) VALUES (1,1,?,?,?,?)`);
  opening.run(afn1000, 2, '1000.0000', '2000.0000');
  opening.run(afn500, 0, '500.0000', '0.0000');
  opening.run(usd100, 3, '100.0000', '300.0000');
  const tx = h.db.prepare(`INSERT INTO teller_transactions
    (company_id,session_id,teller_user_id,transaction_number,type_code,currency_code,customer_id,
     amount,denomination_total,running_balance,validation_status,note,transaction_date,created_by,updated_by)
    VALUES (1,1,1,?,?,?,?,?,?,?,'OK',?,'2026-08-15 09:00:00',1,1)`);
  const addTx = (number: string, type: string, currency: string, amount: string,
    running: string, note: string, denominationId: number, quantity: number) => {
    const result = tx.run(number, type, currency, null, amount, amount, running, note);
    h.db.prepare(`INSERT INTO teller_transaction_denominations
      (company_id,transaction_id,denomination_id,quantity,unit_value,line_total)
      VALUES (1,?,?,?,?,?)`).run(Number(result.lastInsertRowid), denominationId, quantity,
        currency === 'AFN' ? (denominationId === afn500 ? '500.0000' : '1000.0000') : '100.0000', amount);
  };
  addTx('TL-000001', 'OPENING_BALANCE', 'AFN', '2000.0000', '2000.0000', 'Opening AFN', afn1000, 2);
  addTx('TL-000002', 'OPENING_BALANCE', 'USD', '300.0000', '300.0000', 'Opening USD', usd100, 3);
  addTx('TL-000003', 'HEAD_TELLER_IN', 'AFN', '1000.0000', '3000.0000', 'AFN received', afn1000, 1);
  addTx('TL-000004', 'HEAD_TELLER_OUT', 'AFN', '500.0000', '2500.0000', 'AFN paid', afn500, 1);
  addTx('TL-000005', 'HEAD_TELLER_IN', 'USD', '200.0000', '500.0000', 'USD received', usd100, 2);
  h.db.prepare(`INSERT INTO teller_session_currency_totals
    (session_id,company_id,currency_code,cash_in_amount,cash_out_amount,cash_in_count,cash_out_count)
    VALUES (1,1,'AFN','1000.0000','500.0000',1,1),(1,1,'USD','200.0000','0.0000',1,0)`).run();
}

describe('legacy Teller migration 009 compatibility', () => {
  it.each([7, 8] as const)('upgrades an empty schema %i database and creates a validated safety copy', version => {
    const h = migrateThrough(version);
    const safety = join(dirname(h.dbPath), 'safety');
    try {
      runMigrations(h.db, migrationsDir, h.logger, { safetyDirectory: safety });
      expect(getAppliedMigrationVersions(h.db).has(12)).toBe(true);
      expect(readdirSync(safety).filter(name => name.endsWith('.db'))).toHaveLength(1);
      expect(h.db.prepare('SELECT COUNT(*) count FROM teller_sessions').get()).toEqual({ count: 0 });
    } finally { h.cleanup(); }
  });

  it.each([7, 8] as const)('preserves populated schema %i active worksheets and all accounting data', async version => {
    const h = migrateThrough(version);
    const safety = join(dirname(h.dbPath), 'safety');
    try {
      h.db.prepare("INSERT INTO customers(name) VALUES ('Permanent customer')").run();
      h.db.prepare("INSERT INTO transactions(customer_id,type,currency_code,amount,transaction_date) VALUES (1,'CASH_IN','AFN','123.0001','2026-08-15')").run();
      populateLegacyOpenWorksheet(h);
      runMigrations(h.db, migrationsDir, h.logger, { safetyDirectory: safety });

      expect(h.db.prepare('SELECT name FROM customers').get()).toEqual({ name: 'Permanent customer' });
      expect(h.db.prepare('SELECT amount FROM transactions').get()).toEqual({ amount: '123.0001' });
      const teller = new TellerService(h.db, h.logger);
      const afn = teller.getSheet('AFN', { userId: 1 });
      expect(afn.session?.sessionDate).toBe('2026-08-15');
      expect(afn.session?.status).toBe('OPEN');
      expect(afn.opening?.declaredAmount).toBe('2000.0000');
      expect(afn.opening?.denominationCounts['1000']).toBe(2);
      expect(afn.deposits[0]).toMatchObject({ referenceLabel: 'AFN received', declaredAmount: '1000.0000' });
      expect(afn.deposits[0]?.denominationCounts['1000']).toBe(1);
      expect(afn.withdrawals[0]?.denominationCounts['500']).toBe(1);
      expect(afn.summary.currentCash).toBe('2500.0000');
      const usd = teller.getSheet('USD', { userId: 1 });
      expect(usd.opening?.declaredAmount).toBe('300.0000');
      expect(usd.summary.currentCash).toBe('500.0000');
      expect(h.db.prepare('SELECT code FROM teller_currencies WHERE code IN (?,?) ORDER BY code').all('AFN', 'USD'))
        .toEqual([{ code: 'AFN' }, { code: 'USD' }]);
      const exportPath = join(dirname(h.dbPath), `legacy-${version}.xlsx`);
      const exported = await teller.endDay(1, exportPath);
      expect(existsSync(exportPath)).toBe(true);
      expect(exported.closings).toEqual([
        { currencyCode: 'AFN', closingAmount: '2500.0000' },
        { currencyCode: 'USD', closingAmount: '500.0000' },
      ]);
      expect(readdirSync(safety).filter(name => name.endsWith('.db'))).toHaveLength(1);
    } finally { h.cleanup(); }
  });

  it('stops before migration 009 when the safety-copy location cannot be created', () => {
    const h = migrateThrough(8);
    const blocked = join(dirname(h.dbPath), 'blocked');
    try {
      populateLegacyOpenWorksheet(h);
      writeFileSync(blocked, 'not a directory');
      expect(() => runMigrations(h.db, migrationsDir, h.logger, { safetyDirectory: blocked })).toThrow();
      expect(getAppliedMigrationVersions(h.db).has(9)).toBe(false);
      expect(h.db.prepare('SELECT COUNT(*) count FROM teller_transactions').get()).toEqual({ count: 5 });
    } finally { h.cleanup(); }
  });

  it('resumes safely when startup stops after 009 but before the legacy import at 010', () => {
    const h = migrateThrough(8);
    const throughNine = mkdtempSync(join(tmpdir(), 'fmt-migration-009-'));
    const safety = join(dirname(h.dbPath), 'safety');
    try {
      populateLegacyOpenWorksheet(h);
      copyFileSync(join(migrationsDir, '009_teller_workbook_model.sql'), join(throughNine, '009_teller_workbook_model.sql'));
      runMigrations(h.db, throughNine, h.logger, { safetyDirectory: safety });
      expect(getAppliedMigrationVersions(h.db).has(9)).toBe(true);
      expect(h.db.prepare("SELECT name FROM sqlite_master WHERE name='legacy_009_teller_sessions'").get()).toBeTruthy();
      expect(h.db.prepare('SELECT COUNT(*) count FROM teller_sessions').get()).toEqual({ count: 0 });

      runMigrations(h.db, migrationsDir, h.logger, { safetyDirectory: safety });
      expect(h.db.prepare("SELECT name FROM sqlite_master WHERE name='legacy_009_teller_sessions'").get()).toBeUndefined();
      const teller = new TellerService(h.db, h.logger);
      expect(teller.getSheet('AFN', { userId: 1 }).summary.currentCash).toBe('2500.0000');
      expect(readdirSync(safety).filter(name => name.endsWith('.db'))).toHaveLength(1);
    } finally {
      rmSync(throughNine, { recursive: true, force: true });
      h.cleanup();
    }
  });
});
