import { describe, expect, it, vi } from 'vitest';
import { TellerSaveQueue } from '../../src/shared/teller/saveQueue';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
describe('Teller persistence ordering', () => {
  it('serializes and coalesces rapid edits without acknowledging a newer draft from an older success', async () => {
    const queue = new TellerSaveQueue(); const first = deferred(); const latest = deferred();
    const states: string[] = []; queue.subscribe(snapshot => states.push(snapshot.state));
    const skipped = vi.fn(); const saveLatest = vi.fn(() => latest.promise);
    queue.enqueue('row', () => first.promise);
    queue.enqueue('row', skipped);
    queue.enqueue('row', saveLatest);
    expect(queue.snapshot().state).toBe('saving');
    first.resolve(); await tick();
    expect(skipped).not.toHaveBeenCalled(); expect(saveLatest).toHaveBeenCalledTimes(1);
    expect(states.slice(1)).not.toContain('saved');
    latest.reject(new Error('DATABASE_ERROR')); await tick();
    expect(queue.snapshot()).toEqual({ state: 'failed', error: 'DATABASE_ERROR' });
  });
  it.each(['SESSION_EXPIRED', 'TELLER_SESSION_CLOSED', 'VALIDATION_ERROR', 'DATABASE_ERROR', 'IPC disconnected'])('retains %s failures and retries the attempted input', async message => {
    const queue = new TellerSaveQueue(); const attempts: string[] = []; let fail = true;
    queue.enqueue('metadata', async () => { attempts.push('100.0001'); if (fail) throw new Error(message); });
    await tick(); expect(queue.snapshot().state).toBe('failed');
    queue.enqueue('other-row', async () => {}); await tick();
    expect(queue.snapshot().state).toBe('failed');
    fail = false; queue.retry(); await tick();
    expect(attempts).toEqual(['100.0001', '100.0001']); expect(queue.snapshot().state).toBe('saved');
  });
  it('ignores a stale rejection when a corrected draft is already queued', async () => {
    const queue = new TellerSaveQueue(); const old = deferred();
    queue.enqueue('row', () => old.promise); queue.enqueue('row', async () => {});
    old.reject(new Error('old error')); await tick(); expect(queue.snapshot()).toEqual({ state: 'saved', error: null });
  });
});
