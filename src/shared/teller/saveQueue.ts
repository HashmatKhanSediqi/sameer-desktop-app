export type SaveSnapshot = { state: 'saved' | 'saving' | 'failed'; error: string | null };
type Entry = { revision: number; save: () => Promise<void>; error: string | null };

/** Serializes writes and coalesces newer drafts. An old reply can never acknowledge a newer draft. */
export class TellerSaveQueue {
  private entries = new Map<string, Entry>();
  private running = false;
  private listeners = new Set<(state: SaveSnapshot) => void>();
  private revision = 0;
  snapshot(): SaveSnapshot {
    const failed = [...this.entries.values()].find(entry => entry.error);
    return failed ? { state: 'failed', error: failed.error } : {
      state: this.running || this.entries.size ? 'saving' : 'saved', error: null,
    };
  }
  subscribe(listener: (state: SaveSnapshot) => void): () => void {
    this.listeners.add(listener); listener(this.snapshot());
    return () => { this.listeners.delete(listener); };
  }
  enqueue(key: string, save: () => Promise<void>): void {
    this.entries.set(key, { revision: ++this.revision, save, error: null });
    this.emit(); void this.drain();
  }
  retry(): void {
    for (const entry of this.entries.values()) entry.error = null;
    this.emit(); void this.drain();
  }
  private emit(): void { for (const listener of this.listeners) listener(this.snapshot()); }
  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        const next = [...this.entries].find(([, entry]) => !entry.error);
        if (!next) break;
        const [key, entry] = next;
        try {
          await entry.save();
          if (this.entries.get(key) === entry) this.entries.delete(key);
        } catch (error) {
          if (this.entries.get(key) === entry) entry.error = error instanceof Error ? error.message : String(error);
        }
        this.emit();
      }
    } finally { this.running = false; this.emit(); }
  }
}
