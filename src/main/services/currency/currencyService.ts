import type Database from 'better-sqlite3';
import { CurrencyRepository } from '../../database/repositories/currencyRepository';
import { AppError } from '../../utils/errors';
import type { CreateCurrencyInput, Currency } from '@shared/types/currency';

const CURRENCY_CODE_PATTERN = /^[A-Z]{3,5}$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

export class CurrencyService {
  private readonly repository: CurrencyRepository;

  constructor(db: Database.Database) {
    this.repository = new CurrencyRepository(db);
  }

  listActive(): Currency[] {
    return this.repository.listActive();
  }

  listAll(): Currency[] {
    return this.repository.listAll();
  }

  create(input: CreateCurrencyInput): Currency {
    const code = this.parseCode(input.code);
    const symbol = this.parseSymbol(input.symbol);
    const existing = this.repository.getByCode(code);

    if (existing?.isActive) {
      throw new AppError('VALIDATION_ERROR', 'CURRENCY_EXISTS');
    }

    if (existing && !existing.isActive) {
      this.repository.reactivate(code, symbol === '' ? existing.symbol : symbol);
      const restored = this.repository.getByCode(code);
      if (!restored) {
        throw new AppError('INVALID_CURRENCY', 'CURRENCY_NOT_FOUND');
      }
      return restored;
    }

    const sortOrder =
      typeof input.sortOrder === 'number' && Number.isInteger(input.sortOrder) && input.sortOrder >= 0
        ? input.sortOrder
        : this.repository.nextSortOrder();

    this.repository.create({
      code,
      nameKey: `currency.${code.toLowerCase()}`,
      symbol,
      sortOrder,
    });

    const created = this.repository.getByCode(code);
    if (!created) {
      throw new AppError('INTERNAL_ERROR', 'INTERNAL_ERROR');
    }
    return created;
  }

  deactivate(code: string): Currency {
    const normalized = this.parseCode(code);
    const existing = this.repository.getByCode(normalized);
    if (!existing) {
      throw new AppError('INVALID_CURRENCY', 'CURRENCY_NOT_FOUND');
    }
    if (!existing.isActive) {
      throw new AppError('VALIDATION_ERROR', 'CURRENCY_INACTIVE');
    }
    if (this.repository.countActive() <= 1) {
      throw new AppError('VALIDATION_ERROR', 'LAST_ACTIVE_CURRENCY');
    }

    this.repository.deactivate(normalized);
    const updated = this.repository.getByCode(normalized);
    if (!updated) {
      throw new AppError('INVALID_CURRENCY', 'CURRENCY_NOT_FOUND');
    }
    return updated;
  }

  hasTransactions(code: string): boolean {
    return this.repository.hasTransactions(this.parseCode(code));
  }

  private parseCode(value: unknown): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
    }
    const code = value.trim().toUpperCase();
    if (!CURRENCY_CODE_PATTERN.test(code)) {
      throw new AppError('VALIDATION_ERROR', 'CURRENCY_CODE_INVALID');
    }
    return code;
  }

  private parseSymbol(value: unknown): string {
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value !== 'string') {
      throw new AppError('VALIDATION_ERROR', 'CURRENCY_SYMBOL_INVALID');
    }
    const symbol = value.trim();
    if (symbol.length > 8 || CONTROL_CHARS.test(symbol)) {
      throw new AppError('VALIDATION_ERROR', 'CURRENCY_SYMBOL_INVALID');
    }
    return symbol;
  }
}
