import { mkdirSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultAutoCloseBackupFileName } from '../../src/shared/types/backup';
import { resolveUniqueAutoBackupPath } from '../../src/main/services/backup/uniqueBackupPath';
import { automaticBackupFolderDialogCopy } from '../../src/main/services/backup/automaticBackupDialog';

describe('unique automatic backup paths', () => {
  it('uses a timestamped FMT-AutoBackup filename', () => {
    const name = defaultAutoCloseBackupFileName(new Date('2026-09-01T13:30:45'));
    expect(name).toMatch(/^FMT-AutoBackup-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.cab$/);
  });

  it('never returns a path that already exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'fmt-auto-backup-'));
    mkdirSync(dir, { recursive: true });
    const now = new Date('2026-09-01T13:30:45');
    const first = resolveUniqueAutoBackupPath(dir, now);
    writeFileSync(first, 'existing');
    const second = resolveUniqueAutoBackupPath(dir, now);
    expect(second).not.toBe(first);
    expect(second.endsWith('.cab')).toBe(true);
  });
});

describe('automatic backup folder dialog copy', () => {
  it('returns localized folder-dialog titles', () => {
    expect(automaticBackupFolderDialogCopy('en').title).toBe('Where should automatic backups be saved?');
    expect(automaticBackupFolderDialogCopy('fa-AF').title.length).toBeGreaterThan(0);
    expect(automaticBackupFolderDialogCopy('ps').title.length).toBeGreaterThan(0);
  });
});
