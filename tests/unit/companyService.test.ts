import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CompanyLogoService } from '../../src/main/services/company/companyLogoService';
import { CompanyService } from '../../src/main/services/company/companyService';
import { applyProjectMigrations, createTestDatabase } from '../helpers/testDatabase';
import { sampleJpeg, toDataUrl } from '../helpers/sampleImages';

function createCompanyService() {
  const testDb = createTestDatabase();
  applyProjectMigrations(testDb.db, testDb.logger);
  const imagesDir = join(testDb.dbPath, '..', 'images', 'company');
  mkdirSync(imagesDir, { recursive: true });
  const service = new CompanyService(testDb.db, new CompanyLogoService(imagesDir, testDb.logger), testDb.logger);
  return { testDb, service };
}

describe('CompanyService', () => {
  it('starts unconfigured, then saves, loads, updates, and persists after reopen', () => {
    const { testDb, service } = createCompanyService();
    try {
      expect(service.get().configured).toBe(false);

      const saved = service.update({
        name: 'Kabul Trading',
        phone: '0700000000',
        email: 'office@example.com',
        address: 'Kabul',
        website: 'https://example.com',
        notes: 'Wholesale',
      });
      expect(saved.configured).toBe(true);
      expect(saved.name).toBe('Kabul Trading');
      expect(service.get().email).toBe('office@example.com');

      const updated = service.update({
        name: 'Kabul Trading Co',
        phone: '0700000001',
      });
      expect(updated.name).toBe('Kabul Trading Co');
      expect(updated.phone).toBe('0700000001');
      expect(updated.email).toBeNull();
    } finally {
      testDb.cleanup();
    }
  });

  it('stores a validated logo on disk and can remove it', () => {
    const { testDb, service } = createCompanyService();
    try {
      service.update({
        name: 'Logo Co',
        logoBase64: toDataUrl(sampleJpeg(), 'image/jpeg'),
      });
      expect(service.get().hasLogo).toBe(true);
      expect(service.getLogo()?.mimeType).toBe('image/jpeg');
      expect(service.getLogoPath()).toMatch(/logo\.jpg$/);

      service.update({ name: 'Logo Co', removeLogo: true });
      expect(service.get().hasLogo).toBe(false);
      expect(service.getLogo()).toBeNull();
    } finally {
      testDb.cleanup();
    }
  });

  it('rejects an empty name and an unsafe logo payload', () => {
    const { testDb, service } = createCompanyService();
    try {
      expect(() => service.update({ name: '   ' })).toThrowError(/COMPANY_NAME_REQUIRED/);
      expect(() =>
        service.update({
          name: 'Bad Logo',
          logoBase64: 'data:text/plain;base64,not-an-image',
        }),
      ).toThrowError(/INVALID_PHOTO/);
      expect(service.get().configured).toBe(false);
    } finally {
      testDb.cleanup();
    }
  });
});
