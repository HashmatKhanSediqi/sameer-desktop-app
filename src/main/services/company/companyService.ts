import type Database from 'better-sqlite3';
import {
  MAX_COMPANY_ADDRESS_LENGTH,
  MAX_COMPANY_EMAIL_LENGTH,
  MAX_COMPANY_NAME_LENGTH,
  MAX_COMPANY_NOTES_LENGTH,
  MAX_COMPANY_PHONE_LENGTH,
  MAX_COMPANY_WEBSITE_LENGTH,
  type CompanyLogoData,
  type CompanyProfile,
  type CompanyUpdateInput,
} from '@shared/types/company';
import { CompanyRepository } from '../../database/repositories/companyRepository';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import { CompanyLogoService } from './companyLogoService';

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class CompanyService {
  private readonly repository: CompanyRepository;

  constructor(
    db: Database.Database,
    private readonly logoService: CompanyLogoService,
    private readonly logger: Logger,
  ) {
    this.repository = new CompanyRepository(db);
  }

  get(): CompanyProfile {
    return toProfile(this.repository.get());
  }

  getLogo(): CompanyLogoData | null {
    const record = this.repository.get();
    if (!record.logo_filename) {
      return null;
    }
    try {
      const logo = this.logoService.read(record.logo_filename);
      return { mimeType: logo.mimeType, dataBase64: logo.buffer.toString('base64') };
    } catch (error) {
      if (error instanceof AppError && error.code === 'INVALID_PHOTO') {
        return null;
      }
      throw error;
    }
  }

  getLogoPath(): string | null {
    return this.logoService.absolutePath(this.repository.get().logo_filename);
  }

  update(input: CompanyUpdateInput): CompanyProfile {
    const name = requireText(input.name, MAX_COMPANY_NAME_LENGTH, 'COMPANY_NAME_REQUIRED');
    const phone = optionalText(input.phone, MAX_COMPANY_PHONE_LENGTH, 'PHONE_TOO_LONG');
    const email = optionalEmail(input.email);
    const address = optionalText(input.address, MAX_COMPANY_ADDRESS_LENGTH, 'ADDRESS_TOO_LONG');
    const website = optionalWebsite(input.website);
    const notes = optionalText(input.notes, MAX_COMPANY_NOTES_LENGTH, 'NOTES_TOO_LONG');

    const replacement = typeof input.logoBase64 === 'string' && input.logoBase64.trim().length > 0
      ? this.logoService.decodeAndValidate(input.logoBase64)
      : null;

    this.repository.update({ name, phone, email, address, website, notes });

    const existing = this.repository.get();

    if (replacement) {
      const filename = this.logoService.save(replacement);
      this.repository.updateLogoFilename(filename);
    } else if (input.removeLogo === true) {
      this.logoService.deleteExisting();
      this.repository.updateLogoFilename(null);
    } else if (existing.logo_filename && !this.logoService.absolutePath(existing.logo_filename)) {
      this.repository.updateLogoFilename(null);
    }

    this.logger.info('Company profile saved');
    return this.get();
  }
}

function toProfile(record: ReturnType<CompanyRepository['get']>): CompanyProfile {
  return {
    name: record.name,
    phone: record.phone,
    email: record.email,
    address: record.address,
    website: record.website,
    notes: record.notes,
    hasLogo: Boolean(record.logo_filename),
    configured: record.configured === 1 && Boolean(record.name?.trim()),
    updatedAt: record.updated_at,
  };
}

function requireText(value: unknown, maxLength: number, emptyCode: string): string {
  const normalized = optionalText(value, maxLength, 'NAME_TOO_LONG');
  if (!normalized) {
    throw new AppError('COMPANY_NAME_REQUIRED', emptyCode);
  }
  return normalized;
}

function optionalText(value: unknown, maxLength: number, tooLongCode: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }
  if (value.includes('\u0000')) {
    throw new AppError('VALIDATION_ERROR', 'INVALID_CHARACTERS');
  }
  const normalized = value.replace(CONTROL_CHARS, '').trim();
  if (normalized.length === 0) {
    return null;
  }
  if (normalized.length > maxLength) {
    throw new AppError('VALIDATION_ERROR', tooLongCode);
  }
  return normalized;
}

function optionalEmail(value: unknown): string | null {
  const email = optionalText(value, MAX_COMPANY_EMAIL_LENGTH, 'EMAIL_TOO_LONG');
  if (!email) {
    return null;
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new AppError('VALIDATION_ERROR', 'EMAIL_INVALID');
  }
  return email;
}

function optionalWebsite(value: unknown): string | null {
  const website = optionalText(value, MAX_COMPANY_WEBSITE_LENGTH, 'WEBSITE_TOO_LONG');
  if (!website) {
    return null;
  }
  if (!/^https?:\/\/\S+$/i.test(website) && !/^[A-Za-z0-9][A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/\S*)?$/.test(website)) {
    throw new AppError('VALIDATION_ERROR', 'WEBSITE_INVALID');
  }
  return website;
}
