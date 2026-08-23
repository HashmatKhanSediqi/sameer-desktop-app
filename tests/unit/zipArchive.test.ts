import { describe, expect, it } from 'vitest';
import { createZipBuffer, listZipIndex, readZipEntries } from '../../src/main/services/backup/zipArchive';

describe('zip archive', () => {
  it('round-trips deflated entries', () => {
    const payload = Buffer.from('FMT backup', 'utf8');
    const zip = createZipBuffer([
      { name: 'manifest.json', data: Buffer.from('{"ok":true}') },
      { name: 'database/accounting.db', data: payload },
    ]);
    const index = listZipIndex(zip);
    expect(index.map((entry) => entry.name)).toEqual(['manifest.json', 'database/accounting.db']);
    const entries = readZipEntries(zip);
    expect(entries[1]?.data.equals(payload)).toBe(true);
  });
});
