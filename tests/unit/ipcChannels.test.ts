import { describe, expect, it } from 'vitest';
import { ALLOWED_IPC_CHANNELS, IPC_CHANNELS } from '../../src/shared/types/ipc';

describe('IPC channel registry', () => {
  it('includes transactions:update for edit flow', () => {
    expect(IPC_CHANNELS.TRANSACTIONS_UPDATE).toBe('transactions:update');
    expect(ALLOWED_IPC_CHANNELS).toContain('transactions:update');
  });

  it('registers all foundation app channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('app:getPaths');
    expect(ALLOWED_IPC_CHANNELS).toContain('app:getStatus');
  });

  it('registers authentication IPC channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('auth:login');
    expect(ALLOWED_IPC_CHANNELS).toContain('auth:logout');
    expect(ALLOWED_IPC_CHANNELS).toContain('auth:checkSession');
  });

  it('registers customer management IPC channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('customers:list');
    expect(ALLOWED_IPC_CHANNELS).toContain('customers:get');
    expect(ALLOWED_IPC_CHANNELS).toContain('customers:create');
    expect(ALLOWED_IPC_CHANNELS).toContain('customers:update');
    expect(ALLOWED_IPC_CHANNELS).toContain('customers:delete');
    expect(ALLOWED_IPC_CHANNELS).toContain('customers:search');
    expect(ALLOWED_IPC_CHANNELS).toContain('customers:getPhoto');
  });

  it('does not expose generic SQL or filesystem channels', () => {
    for (const channel of ALLOWED_IPC_CHANNELS) {
      expect(channel.includes('sql')).toBe(false);
      expect(channel.startsWith('fs:')).toBe(false);
    }
  });

  it('registers transaction and currency IPC channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('transactions:list');
    expect(ALLOWED_IPC_CHANNELS).toContain('transactions:create');
    expect(ALLOWED_IPC_CHANNELS).toContain('transactions:update');
    expect(ALLOWED_IPC_CHANNELS).toContain('transactions:delete');
    expect(ALLOWED_IPC_CHANNELS).toContain('transactions:summary');
    expect(ALLOWED_IPC_CHANNELS).toContain('currencies:list');
  });

  it('registers settings IPC channels used for language persistence', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('settings:get');
    expect(ALLOWED_IPC_CHANNELS).toContain('settings:update');
  });

  it('registers currency create, deactivate, reactivate, and delete IPC channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('currencies:create');
    expect(ALLOWED_IPC_CHANNELS).toContain('currencies:deactivate');
    expect(ALLOWED_IPC_CHANNELS).toContain('currencies:reactivate');
    expect(ALLOWED_IPC_CHANNELS).toContain('currencies:delete');
  });

  it('registers reports:generate for PDF and Excel export', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('reports:generate');
    expect(IPC_CHANNELS.REPORTS_GENERATE).toBe('reports:generate');
  });

  it('registers import parse, commit, and template download channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('import:parse');
    expect(ALLOWED_IPC_CHANNELS).toContain('import:commit');
    expect(ALLOWED_IPC_CHANNELS).toContain('import:downloadTemplate');
    expect(IPC_CHANNELS.IMPORT_PARSE).toBe('import:parse');
    expect(IPC_CHANNELS.IMPORT_COMMIT).toBe('import:commit');
  });

  it('registers backup create, validate, and restore channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('backup:create');
    expect(ALLOWED_IPC_CHANNELS).toContain('backup:validate');
    expect(ALLOWED_IPC_CHANNELS).toContain('restore:execute');
    expect(IPC_CHANNELS.BACKUP_CREATE).toBe('backup:create');
    expect(IPC_CHANNELS.BACKUP_VALIDATE).toBe('backup:validate');
    expect(IPC_CHANNELS.RESTORE_EXECUTE).toBe('restore:execute');
  });

  it('registers Phase 3 auth, company, and transfer channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('auth:changePassword');
    expect(ALLOWED_IPC_CHANNELS).toContain('auth:setRecovery');
    expect(ALLOWED_IPC_CHANNELS).toContain('auth:recoveryStatus');
    expect(ALLOWED_IPC_CHANNELS).toContain('auth:recoveryPrompt');
    expect(ALLOWED_IPC_CHANNELS).toContain('auth:recoverPassword');
    expect(ALLOWED_IPC_CHANNELS).toContain('company:get');
    expect(ALLOWED_IPC_CHANNELS).toContain('company:update');
    expect(ALLOWED_IPC_CHANNELS).toContain('company:getLogo');
    expect(ALLOWED_IPC_CHANNELS).toContain('transfers:create');
  });

  it('registers update status, check, download, and install channels', () => {
    expect(ALLOWED_IPC_CHANNELS).toContain('update:getStatus');
    expect(ALLOWED_IPC_CHANNELS).toContain('update:check');
    expect(ALLOWED_IPC_CHANNELS).toContain('update:download');
    expect(ALLOWED_IPC_CHANNELS).toContain('update:install');
    expect(IPC_CHANNELS.UPDATE_GET_STATUS).toBe('update:getStatus');
    expect(IPC_CHANNELS.UPDATE_INSTALL).toBe('update:install');
  });

  it('has unique channel names', () => {
    const unique = new Set(ALLOWED_IPC_CHANNELS);
    expect(unique.size).toBe(ALLOWED_IPC_CHANNELS.length);
  });
});
