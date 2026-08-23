import { afterEach, describe, expect, it, vi } from 'vitest';
import { SessionStore } from '../../src/main/services/auth/sessionStore';

describe('SessionStore', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('expires idle sessions and rejects them afterward', () => {
    vi.useFakeTimers();
    const store = new SessionStore(1_000);
    const session = store.create(1, 'admin');
    expect(store.get(session.id)?.username).toBe('admin');

    vi.advanceTimersByTime(1_001);
    expect(store.get(session.id)).toBeUndefined();
  });
});
