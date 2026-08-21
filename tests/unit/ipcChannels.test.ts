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

  it('has unique channel names', () => {
    const unique = new Set(ALLOWED_IPC_CHANNELS);
    expect(unique.size).toBe(ALLOWED_IPC_CHANNELS.length);
  });
});
