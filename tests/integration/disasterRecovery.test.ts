import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import { createApplicationContext, type ApplicationContext } from '../../src/main/services/applicationContext';
import { RecoveryService } from '../../src/main/services/backup/recoveryService';
import { resolveAppPaths } from '../../src/main/config/paths';
import { createZipBuffer, extractZipRecord, listZipIndex } from '../../src/main/services/backup/zipArchive';
import { buildBackupSignature } from '../../src/main/services/backup/backupManifest';
import { BACKUP_MANIFEST_NAME, BACKUP_SIGNATURE_NAME } from '../../src/shared/types/backup';
import { registerRecoveryHandlers } from '../../src/main/ipc/recovery.handlers';
import { RECOVERY_CHANNELS } from '../../src/shared/types/recovery';
import { sampleJpeg, toBase64 } from '../helpers/sampleImages';
import { initializeOrRecover } from '../../src/main/services/startupRecovery';

async function fixture() {
  const source = await createCustomerTestHarness();
  const root = mkdtempSync(join(tmpdir(), 'fmt-disaster-'));
  const paths = resolveAppPaths(root);
  mkdirSync(dirname(paths.database), { recursive: true });
  const damaged = Buffer.from('unreadable original customer database');
  writeFileSync(paths.database, damaged);
  const customer = source.customerService.create({ name: 'Recovered', photoBase64: toBase64(sampleJpeg()) });
  source.transactionService.create({ customerId: customer.id, type: 'CASH_IN', currencyCode: 'AFN', amount: '1000000000000.0001' });
  source.testDb.db.prepare("UPDATE company_profile SET name = 'Recovered Company', configured = 1 WHERE id = 1").run();
  source.testDb.db.prepare("UPDATE settings SET value = 'fa-AF' WHERE key = 'language'").run();
  const file = join(source.ctx.paths.backups, 'valid.cab');
  await source.backupService.create(file);
  const contexts: ApplicationContext[] = [];
  const initialize = async (target = paths) => {
    const context = await createApplicationContext(source.ctx.config, source.testDb.logger, {
      paths: target, migrationsDir: join(process.cwd(), 'migrations'), packaged: false,
    });
    contexts.push(context); return context;
  };
  const recovery = new RecoveryService({ paths, backups: source.backupService, initialize });
  return { source, paths, damaged, file, initialize, recovery,
    cleanup: () => { for (const context of contexts) context.database.close(); source.cleanup(); rmSync(root, { recursive: true, force: true }); } };
}

function alterArchive(file: string, kind: 'signature' | 'version' | 'missing'): string {
  const bytes = readFileSync(file);
  let entries = listZipIndex(bytes).map(record => extractZipRecord(bytes, record));
  if (kind === 'signature') entries.find(entry => entry.name === BACKUP_SIGNATURE_NAME)!.data = Buffer.from('0'.repeat(64));
  if (kind === 'missing') entries = entries.filter(entry => entry.name !== 'database/accounting.db');
  if (kind === 'version') {
    const manifest = entries.find(entry => entry.name === BACKUP_MANIFEST_NAME)!;
    const parsed = JSON.parse(manifest.data.toString()); parsed.schema_version = 999;
    manifest.data = Buffer.from(JSON.stringify(parsed));
    entries.find(entry => entry.name === BACKUP_SIGNATURE_NAME)!.data = Buffer.from(buildBackupSignature(manifest.data, parsed.files));
  }
  const path = join(dirname(file), `${kind}.cab`);
  writeFileSync(path, createZipBuffer(entries)); return path;
}

describe('disaster recovery', () => {
  it('opens a healthy database normally with the complete service context', async () => {
    const f = await fixture();
    try {
      const healthy = resolveAppPaths(join(dirname(f.paths.database), 'healthy'));
      const recoveryWindow = vi.fn();
      const context = (await initializeOrRecover(() => f.initialize(healthy), recoveryWindow))!;
      expect(recoveryWindow).not.toHaveBeenCalled();
      expect(context.database.isConnected()).toBe(true);
      expect(context.customerService.list()).toEqual([]);
      expect(context.authService.checkSession('old-session').valid).toBe(false);
    } finally { f.cleanup(); }
  });

  it('rejects failed startup, restores full accounting snapshot and images, then returns a fresh login context', async () => {
    const f = await fixture();
    try {
      const recoveryWindow = vi.fn();
      expect(await initializeOrRecover(() => f.initialize(), recoveryWindow)).toBeNull();
      expect(recoveryWindow).toHaveBeenCalledTimes(1);
      const login = await f.source.authService.login('admin', 'admin123');
      const restored = await f.recovery.restore(f.file);
      expect(readFileSync(join(restored.safetyPath!, 'accounting.db'))).toEqual(f.damaged);
      expect(restored.context.database.getConnection().pragma('integrity_check', { simple: true })).toBe('ok');
      expect(restored.context.database.getConnection().pragma('foreign_key_check')).toEqual([]);
      const customers = restored.context.customerService.list();
      expect(customers[0]?.name).toBe('Recovered');
      expect(readdirSync(f.paths.images)).not.toHaveLength(0);
      expect(restored.context.transactionService.getCustomerSummary(customers[0]!.id).currencies.find(row => row.currencyCode === 'AFN')?.balance).toBe('1000000000000.0001');
      expect(restored.context.database.getConnection().prepare('SELECT name FROM company_profile').get()).toEqual({ name: 'Recovered Company' });
      expect(restored.context.authService.checkSession(login.sessionId).valid).toBe(false);
      expect((await restored.context.authService.login('admin', 'admin123')).sessionId).not.toBe(login.sessionId);
    } finally { f.cleanup(); }
  });

  it.each(['corrupt', 'signature', 'version', 'missing'] as const)('rejects %s backup before any replacement and accepts the next valid attempt', async kind => {
    const f = await fixture();
    try {
      const bad = kind === 'corrupt' ? join(dirname(f.file), 'corrupt.cab') : alterArchive(f.file, kind);
      if (kind === 'corrupt') writeFileSync(bad, 'not an archive');
      await expect(f.recovery.restore(bad)).rejects.toThrow();
      expect(readFileSync(f.paths.database)).toEqual(f.damaged);
      expect(existsSync(f.paths.backups)).toBe(false);
      expect((await f.recovery.restore(f.file)).context.database.isConnected()).toBe(true);
    } finally { f.cleanup(); }
  });

  it('does not replace data when staged migrations or context initialization fail', async () => {
    const f = await fixture();
    try {
      const recovery = new RecoveryService({ paths: f.paths, backups: f.source.backupService,
        initialize: async () => { throw new Error('forced migration failure'); } });
      await expect(recovery.restore(f.file)).rejects.toThrow('forced migration failure');
      expect(readFileSync(f.paths.database)).toEqual(f.damaged);
    } finally { f.cleanup(); }
  });

  it('retains the preserved DB after post-replacement failure and supports another attempt', async () => {
    const f = await fixture();
    try {
      let fail = true;
      const recovery = new RecoveryService({ paths: f.paths, backups: f.source.backupService,
        initialize: async paths => { if (paths === f.paths && fail) throw new Error('forced post-restore failure'); return f.initialize(paths); } });
      await expect(recovery.restore(f.file)).rejects.toThrow('forced post-restore failure');
      expect(readFileSync(f.paths.database)).toEqual(f.damaged);
      const safety = readdirSync(f.paths.backups).find(name => name.startsWith('pre-recovery-'))!;
      expect(readFileSync(join(f.paths.backups, safety, 'data', 'accounting.db'))).toEqual(f.damaged);
      fail = false;
      await recovery.restore(f.file);
      expect(readFileSync(join(f.paths.backups, safety, 'data', 'accounting.db'))).toEqual(f.damaged);
      expect(readdirSync(f.paths.backups).filter(name => name.startsWith('pre-recovery-'))).toHaveLength(2);
    } finally { f.cleanup(); }
  });

  it('registers only restricted recovery actions; validation failure can retry and login requires success', async () => {
    const f = await fixture();
    try {
      const handlers = new Map<string, (event: unknown) => Promise<any>>();
      const ipc = { handle: (name: string, fn: (event: unknown) => Promise<any>) => handlers.set(name, fn), removeHandler: (name: string) => handlers.delete(name) };
      const choose = vi.fn().mockResolvedValueOnce(alterArchive(f.file, 'signature')).mockResolvedValue(f.file);
      const login = vi.fn();
      const control = registerRecoveryHandlers(ipc as never, { reason: 'Failed startup', allowed: event => event === 'trusted' as unknown,
        chooseFile: choose, backups: f.source.backupService, recovery: f.recovery, login });
      const invoke = (channel: string, sender = 'trusted') => handlers.get(channel)!(sender);
      expect([...handlers.keys()]).toEqual(Object.values(RECOVERY_CHANNELS));
      expect((await invoke(RECOVERY_CHANNELS.status, 'other-frame')).ok).toBe(false);
      expect((await invoke(RECOVERY_CHANNELS.login)).ok).toBe(false);
      expect((await invoke(RECOVERY_CHANNELS.select)).ok).toBe(false);
      expect((await invoke(RECOVERY_CHANNELS.restore)).ok).toBe(false);
      expect((await invoke(RECOVERY_CHANNELS.select)).ok).toBe(true);
      expect((await invoke(RECOVERY_CHANNELS.restore)).ok).toBe(true);
      expect(login).not.toHaveBeenCalled();
      expect((await invoke(RECOVERY_CHANNELS.login)).ok).toBe(true);
      expect(login).toHaveBeenCalledTimes(1);
      control.dispose(); expect(handlers.size).toBe(0);
    } finally { f.cleanup(); }
  });
});
