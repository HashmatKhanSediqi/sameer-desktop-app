import { describe, expect, it } from 'vitest';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { getAppliedMigrationVersions } from '../../src/main/database/migrationRunner';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('migrations', () => {
  it('preserves populated Accounting and active Teller rows while migration 012 separates foreign keys', () => {
    const h = createTestDatabase();
    try {
      for (const file of readdirSync('migrations').filter(file => /^0(0\d|1[01])_/.test(file)).sort()) {
        h.db.exec(readFileSync(join('migrations', file), 'utf8'));
        h.db.prepare('INSERT INTO schema_migrations(version,name) VALUES (?,?)').run(Number(file.slice(0,3)), file);
      }
      h.db.exec(`INSERT INTO admin_users(username,password_hash) VALUES ('test','hash');
        INSERT INTO customers(name) VALUES ('Preserved');
        INSERT INTO transactions(customer_id,type,currency_code,amount,transaction_date) VALUES (1,'CASH_IN','AFN','123.0001','2026-09-05');
        INSERT INTO teller_sessions(teller_user_id,currency_code,session_date,status,created_by,opening_amount,opp_amount) VALUES (1,'AFN','2026-09-05','OPEN',1,'500.0001','6.0002');
        INSERT INTO teller_session_ht_denominations(session_id,denomination_id,quantity) SELECT 1,id,2 FROM denominations WHERE currency_code='AFN' AND value='1000';
        INSERT INTO teller_transactions(company_id,session_id,direction,worksheet_row,reference_label,declared_amount,created_by) VALUES (1,1,'DEPOSIT',8,'Preserved draft','123.0001',1);
        INSERT INTO teller_transaction_denominations(transaction_id,denomination_id,quantity) SELECT 1,id,3 FROM denominations WHERE currency_code='AFN' AND value='1000';`);
      const tables = ['customers','transactions','currencies','denominations','teller_sessions','teller_transactions','teller_session_ht_denominations','teller_transaction_denominations'];
      const before = tables.map(table => h.db.prepare(`SELECT * FROM ${table}`).all());
      applyProjectMigrations(h.db, h.logger);
      expect(tables.map(table => h.db.prepare(`SELECT * FROM ${table}`).all())).toEqual(before);
      expect(h.db.prepare('SELECT * FROM teller_currencies').all()).toEqual(before[2]);
      expect(h.db.pragma('foreign_key_check')).toEqual([]);
      const foreignKeys = h.db.pragma('foreign_key_list(teller_sessions)') as Array<{ table: string }>;
      expect(foreignKeys.some(key => key.table === 'teller_currencies')).toBe(true);
      expect(foreignKeys.some(key => key.table === 'currencies')).toBe(false);
    } finally { h.cleanup(); }
  });
  it('applies 001_initial migration and records schema version', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);

      const applied = getAppliedMigrationVersions(testDb.db);
      expect(applied.has(1)).toBe(true);

      const adminTable = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'admin_users'")
        .get();
      expect(adminTable).toBeTruthy();
    } finally {
      testDb.cleanup();
    }
  });

  it('re-running migrations is safe', () => {
    const testDb = createTestDatabase();

    try {
      applyProjectMigrations(testDb.db, testDb.logger);
      const afterFirst = getAppliedMigrationVersions(testDb.db);

      applyProjectMigrations(testDb.db, testDb.logger);
      const afterSecond = getAppliedMigrationVersions(testDb.db);

      expect(afterFirst.has(1)).toBe(true);
      expect(afterSecond.size).toBe(afterFirst.size);

      expect(afterSecond.has(7)).toBe(true);
      expect(afterSecond.has(8)).toBe(true);
      expect(afterSecond.has(11)).toBe(true);
      const teller = testDb.db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'teller_transactions'")
        .get();
      expect(teller).toBeTruthy();

      const displayName = testDb.db.prepare("PRAGMA table_info(currencies)").all() as Array<{ name: string }>;
      expect(displayName.some((column) => column.name === 'display_name')).toBe(true);

      const eurDenoms = testDb.db
        .prepare("SELECT COUNT(*) AS count FROM denominations WHERE currency_code = 'EUR'")
        .get() as { count: number };
      expect(eurDenoms.count).toBe(13);

      const tellerColumns = testDb.db.prepare('PRAGMA table_info(teller_transactions)').all() as Array<{ name: string }>;
      expect(tellerColumns.some((column) => column.name === 'worksheet_row')).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });
});
