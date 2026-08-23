import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSafeXlsxFile } from '../../src/main/services/import/xlsxGuard';
import { createTestDatabase } from '../helpers/testDatabase';

describe('xlsx import file guard', () => {
  it('rejects non-xlsx extensions and empty files', () => {
    const testDb = createTestDatabase();
    try {
      const txt = join(testDb.dbPath, '..', 'notes.txt');
      writeFileSync(txt, 'hello');
      expect(assertSafeXlsxFile(txt)).toEqual({ ok: false, code: 'INVALID_FORMAT' });

      const empty = join(testDb.dbPath, '..', 'empty.xlsx');
      writeFileSync(empty, '');
      expect(assertSafeXlsxFile(empty)).toEqual({ ok: false, code: 'INVALID_FORMAT' });
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects files that are not ZIP/XLSX packages', () => {
    const testDb = createTestDatabase();
    try {
      const fake = join(testDb.dbPath, '..', 'fake.xlsx');
      writeFileSync(fake, 'this is not a workbook');
      expect(assertSafeXlsxFile(fake)).toEqual({ ok: false, code: 'INVALID_FORMAT' });
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects null bytes in the path', () => {
    expect(assertSafeXlsxFile('C:\\data\\file\u0000.xlsx')).toEqual({ ok: false, code: 'PATH_TRAVERSAL' });
  });

  it('accepts a file with ZIP magic bytes', () => {
    const testDb = createTestDatabase();
    try {
      mkdirSync(join(testDb.dbPath, '..'), { recursive: true });
      const zipLike = join(testDb.dbPath, '..', 'zip-like.xlsx');
      writeFileSync(zipLike, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]));
      const result = assertSafeXlsxFile(zipLike);
      expect(result.ok).toBe(true);
    } finally {
      testDb.cleanup();
    }
  });
});
