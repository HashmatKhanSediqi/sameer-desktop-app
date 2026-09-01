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

      const filePath = join(harness.ctx.paths.backups, 'FMT_Backup_test.cab');
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

  it('skips auto-close backup when no location is configured', async () => {
    const harness = await createCustomerTestHarness();
    try {
      harness.customerService.create({
        name: 'Close Backup User',
        customerNumber: 'CB-0',
      });
      const result = await harness.backupService.createAutoCloseBackup();
      expect(result.created).toBe(false);
      expect(result.skippedReason).toBe('not_configured');
      expect(result.filePath).toBeUndefined();
    } finally {
      harness.cleanup();
    }
  });

  it('skips auto-close backup when database has no accounting data', async () => {
    const harness = await createCustomerTestHarness();
    try {
      harness.ctx.settingsService.setAutomaticBackupPath(join(harness.ctx.paths.backups, 'auto-close'));
      const result = await harness.backupService.createAutoCloseBackup();
      expect(result.created).toBe(false);
      expect(result.skippedReason).toBe('no_data');
      expect(result.filePath).toBeUndefined();
    } finally {
      harness.cleanup();
    }
  });

  it('creates validated auto-close backups in the configured directory without overwriting or pruning', async () => {
    const harness = await createCustomerTestHarness();
    try {
      const created = harness.customerService.create({
        name: 'Close Backup User',
        customerNumber: 'CB-1',
      });
      harness.transactionService.create({
        customerId: created.id,
        type: 'CASH_IN',
        currencyCode: 'AFN',
        amount: '10',
        transactionDate: '2026-03-01',
      });

      const autoDir = join(harness.ctx.paths.backups, 'user-auto');
      harness.ctx.settingsService.setAutomaticBackupPath(autoDir);

      const createdPaths = new Set<string>();
      for (let index = 0; index < 3; index += 1) {
        const result = await harness.backupService.createAutoCloseBackup();
        expect(result.created).toBe(true);
        expect(result.filePath?.startsWith(autoDir)).toBe(true);
        expect(result.filePath?.includes('FMT-AutoBackup-')).toBe(true);
        expect(existsSync(result.filePath ?? '')).toBe(true);
        createdPaths.add(result.filePath ?? '');
      }

      expect(createdPaths.size).toBe(3);

      const { readdirSync } = await import('node:fs');
      const autoFiles = readdirSync(autoDir).filter((name) => name.startsWith('FMT-AutoBackup-'));
      expect(autoFiles).toHaveLength(3);

      const firstPath = [...createdPaths][0];
      const validated = await harness.backupService.validate(firstPath ?? '');
      expect(validated.valid).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('does not overwrite an existing automatic backup file', async () => {
    const harness = await createCustomerTestHarness();
    try {
      harness.customerService.create({
        name: 'Close Backup User',
        customerNumber: 'CB-2',
      });
      const autoDir = join(harness.ctx.paths.backups, 'user-auto-unique');
      harness.ctx.settingsService.setAutomaticBackupPath(autoDir);

      const { mkdirSync, writeFileSync, readFileSync } = await import('node:fs');
      mkdirSync(autoDir, { recursive: true });
      const { defaultAutoCloseBackupFileName } = await import('../../src/shared/types/backup');
      const occupyingName = defaultAutoCloseBackupFileName();
      const occupyingPath = join(autoDir, occupyingName);
      writeFileSync(occupyingPath, 'keep-me');

      const result = await harness.backupService.createAutoCloseBackup();
      expect(result.created).toBe(true);
      expect(result.filePath).not.toBe(occupyingPath);
      expect(readFileSync(occupyingPath, 'utf8')).toBe('keep-me');
      expect(existsSync(result.filePath ?? '')).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('restores an automatic .cab using the existing restore mechanism', async () => {
    const source = await createCustomerTestHarness();
    const target = await createCustomerTestHarness();
    try {
      source.customerService.create({
        name: 'Auto Backup User',
        customerNumber: 'AUTO-1',
      });
      const autoDir = join(source.ctx.paths.backups, 'user-auto-restore');
      source.ctx.settingsService.setAutomaticBackupPath(autoDir);
      const created = await source.backupService.createAutoCloseBackup();
      expect(created.created).toBe(true);
      expect(created.filePath).toBeTruthy();

      const restored = await target.backupService.restore(created.filePath ?? '', true);
      expect(restored.success).toBe(true);
      const imported = target.customerService.list().find((row) => row.customerNumber === 'AUTO-1');
      expect(imported).toBeTruthy();
    } finally {
      source.cleanup();
      target.cleanup();
    }
  });

  it('creates validated pre-update backups under backups/pre-update', async () => {
    const harness = await createCustomerTestHarness();
    try {
      harness.customerService.create({
        name: 'Pre Update User',
        customerNumber: 'PU-1',
      });

      const preUpdateDir = join(harness.ctx.paths.backups, 'pre-update');
      const result = await harness.backupService.createPreUpdateBackup();
      expect(result.created).toBe(true);
      if (!result.created) {
        return;
      }
      expect(result.filePath.startsWith(preUpdateDir)).toBe(true);
      expect(result.filePath.includes('FMT_PreUpdate_')).toBe(true);
      expect(existsSync(result.filePath)).toBe(true);

      const validated = await harness.backupService.validate(result.filePath);
      expect(validated.valid).toBe(true);
    } finally {
      harness.cleanup();
    }
  });

  it('merges backup customers, transactions, and photos into existing data', async () => {
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

      const existing = target.customerService.create({ name: 'Will Be Kept', customerNumber: 'OLD' });
      const restored = await target.backupService.restore(backupPath, true);
      expect(restored.success).toBe(true);
      expect(restored.safetyBackupPath).toBeTruthy();
      expect(existsSync(restored.safetyBackupPath ?? '')).toBe(true);
      expect(restored.sessionInvalidated).toBe(false);

      const customers = target.customerService.list();
      expect(customers).toHaveLength(2);
      expect(customers.some((row) => row.id === existing.id && row.customerNumber === 'OLD')).toBe(true);
      const imported = customers.find((row) => row.customerNumber === 'R-100');
      expect(imported).toBeTruthy();
      expect(imported?.id).not.toBe(created.id);
      const detail = target.customerService.getById(imported!.id);
      expect(detail.hasPhoto).toBe(true);
      expect(existsSync(join(target.imagesDir, `${imported!.id}.jpg`))).toBe(true);

      const login = await target.authService.login(DEFAULT_ADMIN_USERNAME, DEFAULT_ADMIN_PASSWORD);
      expect(login.username).toBe(DEFAULT_ADMIN_USERNAME);
      expect(target.authService.checkSession(login.sessionId).valid).toBe(true);
    } finally {
      source.cleanup();
      target.cleanup();
    }
  });

  it('rejects restore when no backup file has been selected', async () => {
    const harness = await createCustomerTestHarness();
    try {
      await expect(harness.backupService.restore('', true)).rejects.toMatchObject({
        code: 'INVALID_REQUEST',
      });
    } finally {
      harness.cleanup();
    }
  });

  it('uses the last validated backup path when restore is called without a filePath', async () => {
    const harness = await createCustomerTestHarness();
    try {
      harness.customerService.create({ name: 'Keep Me', customerNumber: 'KEEP' });
      const backupPath = join(harness.ctx.paths.backups, 'validated.cab');
      await harness.backupService.create(backupPath);
      const validated = await harness.backupService.validate(backupPath);
      expect(validated.valid).toBe(true);
      expect(validated.filePath).toBe(backupPath);

      const restored = await harness.backupService.restore('', true);
      expect(restored.success).toBe(true);
      expect(harness.customerService.list().length).toBeGreaterThanOrEqual(2);
    } finally {
      harness.cleanup();
    }
  });

  it('retains only the latest safety backups in backups/auto', async () => {
    const harness = await createCustomerTestHarness();
    try {
      harness.customerService.create({ name: 'Safety Retention', customerNumber: 'SR-1' });
      const backupPaths: string[] = [];
      for (let index = 0; index < 7; index += 1) {
        const path = join(harness.ctx.paths.backups, `retention-${index}.cab`);
        await harness.backupService.create(path);
        backupPaths.push(path);
      }

      for (const path of backupPaths) {
        await harness.backupService.restore(path, true);
      }

      const { readdirSync } = await import('node:fs');
      const autoDir = join(harness.ctx.paths.backups, 'auto');
      const safetyFiles = readdirSync(autoDir).filter((name) => name.startsWith('FMT_SafetyBackup_'));
      expect(safetyFiles.length).toBeLessThanOrEqual(5);
    } finally {
      harness.cleanup();
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
        created_by: 'FMT',
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

  it('rolls back the import transaction when a later insert fails', async () => {
    const source = await createCustomerTestHarness();
    const target = await createCustomerTestHarness();
    try {
      source.customerService.create({ name: 'BackupOnly', customerNumber: 'B-ONLY' });
      source.customerService.create({ name: 'BackupTwo', customerNumber: 'B-TWO' });
      const backupPath = join(source.ctx.paths.backups, 'rollback-source.cab');
      await source.backupService.create(backupPath);

      const original = target.customerService.create({ name: 'Original', customerNumber: 'ORIG' });
      target.testDb.db.exec(`
        CREATE TRIGGER fail_import BEFORE INSERT ON customers
        WHEN new.customer_number = 'B-TWO'
        BEGIN
          SELECT RAISE(ABORT, 'forced import failure');
        END;
      `);

      await expect(target.backupService.restore(backupPath, true)).rejects.toBeTruthy();
      const numbers = target.testDb.db
        .prepare('SELECT customer_number AS customerNumber FROM customers ORDER BY id')
        .all() as Array<{ customerNumber: string | null }>;
      expect(numbers.map((row) => row.customerNumber)).toEqual(['ORIG']);
      expect(target.customerService.getById(original.id).customerNumber).toBe('ORIG');
    } finally {
      source.cleanup();
      target.cleanup();
    }
  });

  it('imports backup data into an empty database', async () => {
    const source = await createCustomerTestHarness();
    const target = await createCustomerTestHarness();
    try {
      const first = source.customerService.create({ name: 'Customer A', customerNumber: 'A' });
      const second = source.customerService.create({ name: 'Customer B', customerNumber: 'B' });
      source.transactionService.create({
        customerId: first.id,
        type: 'CASH_IN',
        currencyCode: 'AFN',
        amount: '10',
        transactionDate: '2026-05-01',
      });
      source.transactionService.create({
        customerId: second.id,
        type: 'CASH_OUT',
        currencyCode: 'USD',
        amount: '3',
        transactionDate: '2026-05-02',
      });
      const backupPath = join(source.ctx.paths.backups, 'empty-target.cab');
      await source.backupService.create(backupPath);

      await target.backupService.restore(backupPath, true);
      const imported = target.customerService.list();
      expect(imported).toHaveLength(2);
      expect(imported.map((row) => row.customerNumber).sort()).toEqual(['A', 'B']);
      const importedA = imported.find((row) => row.customerNumber === 'A')!;
      expect(target.transactionService.list({ customerId: importedA.id, page: 1, pageSize: 10 }).totalCount).toBe(1);
    } finally {
      source.cleanup();
      target.cleanup();
    }
  });

  it('keeps existing and backup customers when names and ids collide', async () => {
    const source = await createCustomerTestHarness();
    const target = await createCustomerTestHarness();
    try {
      const backupAhmad = source.customerService.create({ name: 'Ahmad', customerNumber: 'BACKUP-AHMAD' });
      source.transactionService.create({
        customerId: backupAhmad.id,
        type: 'CASH_IN',
        currencyCode: 'AFN',
        amount: '77',
        transactionDate: '2026-05-10',
      });
      source.transactionService.create({
        customerId: backupAhmad.id,
        type: 'CASH_OUT',
        currencyCode: 'AFN',
        amount: '7',
        transactionDate: '2026-05-11',
      });
      const backupPath = join(source.ctx.paths.backups, 'id-collision.cab');
      await source.backupService.create(backupPath);

      const liveAhmad = target.customerService.create({ name: 'Ahmad', customerNumber: 'LIVE-AHMAD' });
      expect(liveAhmad.id).toBe(backupAhmad.id);
      target.transactionService.create({
        customerId: liveAhmad.id,
        type: 'CASH_IN',
        currencyCode: 'USD',
        amount: '5',
        transactionDate: '2026-05-12',
      });
      const liveTxBefore = target.transactionService.list({ customerId: liveAhmad.id, page: 1, pageSize: 20 });

      await target.backupService.restore(backupPath, true);

      const liveAfter = target.customerService.getById(liveAhmad.id);
      expect(liveAfter.customerNumber).toBe('LIVE-AHMAD');
      const liveTxAfter = target.transactionService.list({ customerId: liveAhmad.id, page: 1, pageSize: 20 });
      expect(liveTxAfter.totalCount).toBe(liveTxBefore.totalCount);
      expect(liveTxAfter.transactions.map((row) => row.id)).toEqual(liveTxBefore.transactions.map((row) => row.id));

      const customers = target.customerService.list();
      expect(customers.filter((row) => row.name === 'Ahmad')).toHaveLength(2);
      const imported = customers.find((row) => row.customerNumber === 'BACKUP-AHMAD')!;
      expect(imported.id).not.toBe(liveAhmad.id);

      const importedTx = target.transactionService.list({ customerId: imported.id, page: 1, pageSize: 20 });
      expect(importedTx.totalCount).toBe(2);
      expect(importedTx.transactions.every((row) => row.customerId === imported.id)).toBe(true);
      const summary = target.transactionService.getCustomerSummary(imported.id);
      expect(summary.currencies.find((row) => row.currencyCode === 'AFN')?.balance).toBe('70.0000');
    } finally {
      source.cleanup();
      target.cleanup();
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
      expect(restored.data.sessionInvalidated).toBe(false);
      expect(harness.authService.checkSession(login.sessionId).valid).toBe(true);

      const restoredAgain = (await invoke(IPC_CHANNELS.RESTORE_EXECUTE, {
        confirmed: true,
      })) as { ok: true; data: { success: boolean } };
      expect(restoredAgain.ok).toBe(true);
      expect(restoredAgain.data.success).toBe(true);

      const automaticConfig = (await invoke(IPC_CHANNELS.BACKUP_GET_AUTOMATIC_CONFIG, {})) as {
        ok: true;
        data: { configured: boolean; path: string | null; prompted: boolean };
      };
      expect(automaticConfig.ok).toBe(true);
      expect(automaticConfig.data.configured).toBe(false);
      expect(automaticConfig.data.path).toBeNull();

      harness.ctx.settingsService.setAutomaticBackupPath(join(harness.ctx.paths.backups, 'from-settings'));
      const updatedConfig = (await invoke(IPC_CHANNELS.BACKUP_GET_AUTOMATIC_CONFIG, {})) as {
        ok: true;
        data: { configured: boolean; path: string | null };
      };
      expect(updatedConfig.data.configured).toBe(true);
      expect(updatedConfig.data.path).toBe(join(harness.ctx.paths.backups, 'from-settings'));
    } finally {
      harness.cleanup();
    }
  });
});
