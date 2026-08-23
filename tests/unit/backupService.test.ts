import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BACKUP_DATABASE_ENTRY, BACKUP_FORMAT_VERSION, BACKUP_MANIFEST_NAME } from '../../src/shared/types/backup';
import { IPC_CHANNELS } from '../../src/shared/types/ipc';
import {
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_ADMIN_USERNAME,
} from '../../src/main/services/auth/adminSeedService';
import { assertAllowedBackupEntry } from '../../src/main/services/backup/backupPaths';
import { BackupService } from '../../src/main/services/backup/backupService';
import { buildBackupSignature } from '../../src/main/services/backup/backupManifest';
import { createZipBuffer } from '../../src/main/services/backup/zipArchive';
import { AppError } from '../../src/main/utils/errors';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import { sampleJpeg, toBase64 } from '../helpers/sampleImages';

describe('backup paths', () => {
  it('rejects path traversal and absolute archive names', () => {
    expect(() => assertAllowedBackupEntry('../evil.txt')).toThrow(AppError);
    expect(() => assertAllowedBackupEntry('images/customers/../../evil.txt')).toThrow(AppError);
    expect(() => assertAllowedBackupEntry('C:/windows/evil.txt')).toThrow(AppError);
    expect(() => assertAllowedBackupEntry('images/customers/1.exe')).toThrow(AppError);
    expect(assertAllowedBackupEntry('images/customers/12.jpg')).toBe('images/customers/12.jpg');
    expect(assertAllowedBackupEntry('images/company/logo.png')).toBe('images/company/logo.png');
    expect(() => assertAllowedBackupEntry('images/company/notes.txt')).toThrow(AppError);
    expect(assertAllowedBackupEntry(BACKUP_DATABASE_ENTRY)).toBe(BACKUP_DATABASE_ENTRY);
  });
});

describe('backup service', () => {
  it('creates a valid .cab with database, manifest, checksums, and photos', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const created = harness.customerService.create({
        name: 'Backup User',
        customerNumber: 'B-001',
        photoBase64: toBase64(sampleJpeg()),
      });
      harness.transactionService.create({
        customerId: created.id,
        type: 'CASH_IN',
        currencyCode: 'AFN',
        amount: '25.5',
        transactionDate: '2026-01-15',
        note: 'پشتیبان',
      });

      const filePath = join(harness.ctx.paths.backups, 'CustomerAccounting_Backup_test.cab');
      const result = await harness.backupService.create(filePath);
      expect(result.success).toBe(true);
      expect(existsSync(filePath)).toBe(true);
      expect(result.manifest.customerCount).toBe(1);
      expect(result.manifest.transactionCount).toBe(1);
      expect(result.fileName.endsWith('.cab')).toBe(true);

      const validated = await harness.backupService.validate(filePath);
      expect(validated.valid).toBe(true);
      expect(validated.errors).toHaveLength(0);
      expect(validated.manifest?.customerCount).toBe(1);
      expect(validated.hasExistingData).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('restores customers, transactions, photos, and admin login', async () => {
    const source = await createCustomerTestHarness();
    const target = await createCustomerTestHarness();
    try {
      const created = source.customerService.create({
        name: 'Restored User',
        customerNumber: 'R-100',
        photoBase64: toBase64(sampleJpeg(128)),
      });
      source.transactionService.create({
        customerId: created.id,
        type: 'CASH_OUT',
        currencyCode: 'USD',
        amount: '9.25',
        transactionDate: '2026-02-01',
        note: 'note',
      });
      const backupPath = join(source.ctx.paths.backups, 'portable.cab');
      await source.backupService.create(backupPath);

      target.customerService.create({ name: 'Will Be Replaced', customerNumber: 'OLD' });
      const restored = await target.backupService.restore(backupPath, true);
      expect(restored.success).toBe(true);
      expect(restored.safetyBackupPath).toBeTruthy();
      expect(existsSync(restored.safetyBackupPath ?? '')).toBe(true);

      const customers = target.customerService.list();
      expect(customers).toHaveLength(1);
      expect(customers[0]?.customerNumber).toBe('R-100');
      const detail = target.customerService.getById(customers[0]!.id);
      expect(detail.hasPhoto).toBe(true);
      expect(existsSync(join(target.imagesDir, `${customers[0]!.id}.jpg`))).toBe(true);

      const login = await target.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      expect(login.username).toBe(DEFAULT_ADMIN_USERNAME);
    } finally {
      source.cleanup();
      target.cleanup();
    }
  });

  it('does not restore without confirmation and leaves data unchanged', async () => {
    const harness = await createCustomerTestHarness();
    try {
      harness.customerService.create({ name: 'Keep Me', customerNumber: 'K-1' });
      const backupPath = join(harness.ctx.paths.backups, 'confirm.cab');
      await harness.backupService.create(backupPath);
      await expect(harness.backupService.restore(backupPath, false)).rejects.toMatchObject({
        code: 'RESTORE_CONFIRM_REQUIRED',
      });
      expect(harness.customerService.list()).toHaveLength(1);
    } finally {
      harness.cleanup();
    }
  });

  it('rejects corrupted, malformed, missing-file, invalid-manifest, and incompatible backups', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const validPath = join(harness.ctx.paths.backups, 'valid.cab');
      await harness.backupService.create(validPath);

      const corruptedPath = join(harness.ctx.paths.backups, 'corrupted.cab');
      const bytes = Buffer.from(readFileSync(validPath));
      bytes[bytes.length - 8] = (bytes[bytes.length - 8] ?? 0) ^ 0xff;
      writeFileSync(corruptedPath, bytes);
      const corrupted = await harness.backupService.validate(corruptedPath);
      expect(corrupted.valid).toBe(false);
      expect(corrupted.errors.length).toBeGreaterThan(0);

      const malformedPath = join(harness.ctx.paths.backups, 'malformed.cab');
      writeFileSync(malformedPath, Buffer.from('not a zip archive'));
      const malformed = await harness.backupService.validate(malformedPath);
      expect(malformed.valid).toBe(false);
      expect(malformed.errors).toContain('invalidFile');

      const missingPath = join(harness.ctx.paths.backups, 'missing.cab');
      writeFileSync(
        missingPath,
        createZipBuffer([{ name: BACKUP_MANIFEST_NAME, data: Buffer.from('{"format_version":"1.0"}') }]),
      );
      const missing = await harness.backupService.validate(missingPath);
      expect(missing.valid).toBe(false);

      const invalidManifestPath = join(harness.ctx.paths.backups, 'bad-manifest.cab');
      writeFileSync(
        invalidManifestPath,
        createZipBuffer([
          { name: BACKUP_MANIFEST_NAME, data: Buffer.from('not-json') },
          { name: 'signature.sha256', data: Buffer.from('abc') },
          { name: BACKUP_DATABASE_ENTRY, data: Buffer.from('SQLite format 3\0') },
        ]),
      );
      const invalidManifest = await harness.backupService.validate(invalidManifestPath);
      expect(invalidManifest.valid).toBe(false);
      expect(invalidManifest.errors.some((code) => code === 'invalidManifest' || code === 'invalidFile')).toBe(true);

      const newSchemaPath = join(harness.ctx.paths.backups, 'future.cab');
      const dbBytes = readFileSync(harness.testDb.dbPath);
      const futureManifest = {
        format_version: BACKUP_FORMAT_VERSION,
        app_version: '9.9.9',
        schema_version: 99,
        created_at: new Date().toISOString(),
        created_by: 'Customer Accounting',
        platform: 'win32',
        statistics: { customer_count: 0, transaction_count: 0, currency_codes: ['AFN'] },
        files: [
          {
            path: BACKUP_DATABASE_ENTRY,
            sha256: createHash('sha256').update(dbBytes).digest('hex'),
            size_bytes: dbBytes.byteLength,
          },
        ],
        settings_snapshot: { language: 'en' },
      };
      const manifestBytes = Buffer.from(`${JSON.stringify(futureManifest, null, 2)}\n`);
      const signature = buildBackupSignature(manifestBytes, futureManifest.files);
      writeFileSync(
        newSchemaPath,
        createZipBuffer([
          { name: BACKUP_MANIFEST_NAME, data: manifestBytes },
          { name: 'signature.sha256', data: Buffer.from(`${signature}\n`) },
          { name: BACKUP_DATABASE_ENTRY, data: dbBytes },
        ]),
      );
      const incompatible = await harness.backupService.validate(newSchemaPath);
      expect(incompatible.valid).toBe(false);
      expect(incompatible.errors).toContain('versionMismatch');
    } finally {
      harness.cleanup();
    }
  });

  it('rejects path traversal archive entries', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const traversalPath = join(harness.ctx.paths.backups, 'traversal.cab');
      writeFileSync(
        traversalPath,
        createZipBuffer([
          { name: '../evil.txt', data: Buffer.from('nope') },
          { name: BACKUP_MANIFEST_NAME, data: Buffer.from('{}') },
        ]),
      );
      const result = await harness.backupService.validate(traversalPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('pathTraversal');
    } finally {
      harness.cleanup();
    }
  });

  it('rolls back live data when reopen fails after swap', async () => {
    const harness = await createCustomerTestHarness();
    try {
      harness.customerService.create({ name: 'Original', customerNumber: 'ORIG' });
      const backupPath = join(harness.ctx.paths.backups, 'rollback-source.cab');
      await harness.backupService.create(backupPath);

      harness.customerService.create({ name: 'Second', customerNumber: 'SEC' });
      let reopenCount = 0;
      const originalReopen = () => {
        const Database = require('better-sqlite3') as typeof import('better-sqlite3');
        const db = new Database(harness.testDb.dbPath);
        db.pragma('journal_mode = WAL');
        db.pragma('foreign_keys = ON');
        harness.testDb.db = db;
        return db;
      };
      const failing = new BackupService({
        getDatabase: () => harness.testDb.db,
        checkpoint: () => {
          harness.testDb.db.pragma('wal_checkpoint(FULL)');
        },
        closeDatabase: () => {
          try {
            harness.testDb.db.close();
          } catch {
            // already closed
          }
        },
        reopenDatabase: () => {
          reopenCount += 1;
          if (reopenCount === 1) {
            throw new Error('simulated reopen failure');
          }
          return originalReopen();
        },
        rebindServices: () => undefined,
        invalidateSessions: () => undefined,
        paths: harness.ctx.paths,
        appVersion: harness.ctx.config.version,
        logger: harness.testDb.logger,
        migrationsDir: join(process.cwd(), 'migrations'),
      });

      await expect(failing.restore(backupPath, true)).rejects.toBeTruthy();
      const numbers = harness.testDb.db
        .prepare('SELECT customer_number AS customerNumber FROM customers ORDER BY id')
        .all() as Array<{ customerNumber: string | null }>;
      expect(numbers.map((row) => row.customerNumber)).toContain('ORIG');
      expect(numbers.map((row) => row.customerNumber)).toContain('SEC');
    } finally {
      harness.cleanup();
    }
  });
});

describe('backup IPC handlers', () => {
  it('requires a session for backup:create but not for validate or restore', async () => {
    const harness = await createCustomerTestHarness();
    const { registerBackupHandlers } = await import('../../src/main/ipc/backup.handlers');
    const handlers = new Map<string, (event: unknown, input: unknown) => Promise<unknown>>();
    const ipc = {
      handle(channel: string, listener: (event: unknown, input: unknown) => Promise<unknown>) {
        handlers.set(channel, listener);
      },
    };
    registerBackupHandlers(ipc as never, harness.ctx);
    const invoke = (channel: string, input: unknown) => {
      const handler = handlers.get(channel);
      if (!handler) {
        throw new Error(`missing ${channel}`);
      }
      return handler({ sender: { send: () => undefined } }, input);
    };

    try {
      const denied = (await invoke(IPC_CHANNELS.BACKUP_CREATE, {})) as { ok: false; errorCode: string };
      expect(denied.ok).toBe(false);
      expect(denied.errorCode).toBe('NOT_AUTHENTICATED');

      const backupPath = join(harness.ctx.paths.backups, 'ipc.cab');
      await harness.backupService.create(backupPath);
      const validated = (await invoke(IPC_CHANNELS.BACKUP_VALIDATE, { filePath: backupPath })) as {
        ok: true;
        data: { valid: boolean };
      };
      expect(validated.ok).toBe(true);
      expect(validated.data.valid).toBe(true);

      const unconfirmed = (await invoke(IPC_CHANNELS.RESTORE_EXECUTE, { filePath: backupPath })) as {
        ok: false;
        errorCode: string;
      };
      expect(unconfirmed.ok).toBe(false);
      expect(unconfirmed.errorCode).toBe('RESTORE_CONFIRM_REQUIRED');

      const login = await harness.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      const created = (await invoke(IPC_CHANNELS.BACKUP_CREATE, {
        sessionId: login.sessionId,
        destinationPath: join(harness.ctx.paths.backups, 'ipc-created.cab'),
      })) as { ok: true; data: { success: boolean } };
      expect(created.ok).toBe(true);
      expect(created.data.success).toBe(true);

      const restored = (await invoke(IPC_CHANNELS.RESTORE_EXECUTE, {
        filePath: backupPath,
        confirmed: true,
      })) as { ok: true; data: { success: boolean; sessionInvalidated: boolean } };
      expect(restored.ok).toBe(true);
      expect(restored.data.success).toBe(true);
      expect(restored.data.sessionInvalidated).toBe(true);
      expect(harness.authService.checkSession(login.sessionId).valid).toBe(false);
    } finally {
      harness.cleanup();
    }
  });
});
