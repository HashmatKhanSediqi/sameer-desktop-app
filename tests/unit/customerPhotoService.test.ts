import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CustomerPhotoService, detectImageType } from '../../src/main/services/customer/customerPhotoService';
import { MAX_PHOTO_BYTES } from '../../src/main/services/customer/customerValidation';
import { AppError } from '../../src/main/utils/errors';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import { sampleJpeg, samplePng, sampleWebp, toBase64 } from '../helpers/sampleImages';

describe('CustomerPhotoService', () => {
  it('detects jpeg, png, and webp from magic bytes rather than extension', () => {
    expect(detectImageType(sampleJpeg())).toBe('jpeg');
    expect(detectImageType(samplePng())).toBe('png');
    expect(detectImageType(sampleWebp())).toBe('webp');
    expect(detectImageType(Buffer.from('MZ executable'))).toBeNull();
  });

  it('rejects path traversal filenames and oversized payloads', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const service = new CustomerPhotoService(harness.imagesDir, harness.testDb.logger);

      expect(() => service.decodeAndValidate(toBase64(sampleJpeg(MAX_PHOTO_BYTES + 8)))).toThrowError(
        AppError,
      );
      expect(() => service.read('customers/../secret.png')).toThrowError(AppError);
      expect(() => service.read('C:/Windows/notepad.exe')).toThrowError(AppError);

      const saved = service.save(42, service.decodeAndValidate(toBase64(sampleJpeg())));
      expect(saved).toBe('customers/42.jpg');
      expect(existsSync(join(harness.imagesDir, '42.jpg'))).toBe(true);
    } finally {
      harness.cleanup();
    }
  });
});
