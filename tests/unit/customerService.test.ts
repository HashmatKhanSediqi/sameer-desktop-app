import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppError } from '../../src/main/utils/errors';
import { MAX_PHOTO_BYTES } from '../../src/main/services/customer/customerValidation';
import { createCustomerTestHarness } from '../helpers/customerHarness';
import { sampleJpeg, samplePng, toBase64, toDataUrl } from '../helpers/sampleImages';

describe('CustomerService', () => {
  it('creates an empty customer and normalizes whitespace', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const empty = harness.customerService.create({});
      expect(empty.name).toBeNull();
      expect(empty.customerNumber).toBeNull();
      expect(empty.hasPhoto).toBe(false);

      const trimmed = harness.customerService.create({
        name: '  Ahmad Khan  ',
        customerNumber: '  C-10  ',
      });
      expect(trimmed.name).toBe('Ahmad Khan');
      expect(trimmed.customerNumber).toBe('C-10');
    } finally {
      harness.cleanup();
    }
  });

  it('rejects required-format violations and oversized fields', async () => {
    const harness = await createCustomerTestHarness();

    try {
      expect(() => harness.customerService.create({ name: 'A'.repeat(201) })).toThrowError(AppError);
      expect(() => harness.customerService.create({ customerNumber: 'N'.repeat(51) })).toThrowError(
        /CUSTOMER_NUMBER_TOO_LONG/,
      );
      expect(() => harness.customerService.create({ customerNumber: 'bad;drop' })).toThrowError(
        /INVALID_CUSTOMER_NUMBER/,
      );
      expect(() => harness.customerService.getById(0)).toThrowError(/INVALID_CUSTOMER_ID/);
      expect(() => harness.customerService.getById(1.5)).toThrowError(/INVALID_CUSTOMER_ID/);
      expect(() => harness.customerService.getById(999)).toThrowError(/CUSTOMER_NOT_FOUND/);
    } finally {
      harness.cleanup();
    }
  });

  it('allows duplicate customer numbers and preserves Unicode names', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const first = harness.customerService.create({ name: 'احمد', customerNumber: 'DUP-1' });
      const second = harness.customerService.create({ name: 'محمود', customerNumber: 'DUP-1' });

      expect(first.id).not.toBe(second.id);
      expect(first.customerNumber).toBe('DUP-1');
      expect(second.customerNumber).toBe('DUP-1');
      expect(first.name).toBe('احمد');
    } finally {
      harness.cleanup();
    }
  });

  it('searches by name and customer number and treats empty search as a full list', async () => {
    const harness = await createCustomerTestHarness();

    try {
      harness.customerService.create({ name: 'Ahmad', customerNumber: 'AA-1' });
      harness.customerService.create({ name: 'Mahmood', customerNumber: 'BB-2' });

      expect(harness.customerService.search('  ')).toHaveLength(2);
      expect(harness.customerService.search('Ahmad')).toHaveLength(1);
      expect(harness.customerService.search('BB-2')).toHaveLength(1);
      expect(harness.customerService.search('%')).toHaveLength(0);
    } finally {
      harness.cleanup();
    }
  });

  it('updates editable fields and leaves missing customers unchanged', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const created = harness.customerService.create({ name: 'Old', customerNumber: 'OLD-1' });
      const updated = harness.customerService.update({
        id: created.id,
        name: 'New',
        customerNumber: 'NEW-1',
      });

      expect(updated.name).toBe('New');
      expect(updated.customerNumber).toBe('NEW-1');
      expect(updated.createdAt).toBe(created.createdAt);

      expect(() => harness.customerService.update({ id: 999, name: 'Nope' })).toThrowError(
        /CUSTOMER_NOT_FOUND/,
      );
    } finally {
      harness.cleanup();
    }
  });

  it('stores a validated profile photo and removes it on delete', async () => {
    const harness = await createCustomerTestHarness();

    try {
      const created = harness.customerService.create({
        name: 'Photo User',
        photoBase64: toDataUrl(sampleJpeg(), 'image/jpeg'),
      });

      expect(created.hasPhoto).toBe(true);
      const photo = harness.customerService.getPhoto(created.id);
      expect(photo?.mimeType).toBe('image/jpeg');
      expect(photo?.dataBase64.length).toBeGreaterThan(0);

      const storedPath = join(harness.imagesDir, `${created.id}.jpg`);
      expect(existsSync(storedPath)).toBe(true);
      expect(readFileSync(storedPath)[0]).toBe(0xff);

      harness.customerService.delete(created.id);
      expect(existsSync(storedPath)).toBe(false);
      expect(() => harness.customerService.getById(created.id)).toThrowError(/CUSTOMER_NOT_FOUND/);
    } finally {
      harness.cleanup();
    }
  });

  it('rejects invalid and oversized photos without creating a customer', async () => {
    const harness = await createCustomerTestHarness();

    try {
      expect(() =>
        harness.customerService.create({
          name: 'Bad photo',
          photoBase64: toBase64(Buffer.from('not-an-image')),
        }),
      ).toThrowError(/INVALID_PHOTO/);

      const oversized = sampleJpeg(MAX_PHOTO_BYTES + 1);
      expect(() =>
        harness.customerService.create({
          name: 'Huge photo',
          photoBase64: toBase64(oversized),
        }),
      ).toThrowError(/PHOTO_TOO_LARGE/);

      expect(harness.customerService.list()).toHaveLength(0);

      const pngCustomer = harness.customerService.create({
        name: 'PNG',
        photoBase64: toBase64(samplePng()),
      });
      expect(pngCustomer.hasPhoto).toBe(true);
    } finally {
      harness.cleanup();
    }
  });
});
