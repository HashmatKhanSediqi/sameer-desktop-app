import type Database from 'better-sqlite3';
import Decimal from 'decimal.js';
import { CurrencyRepository } from '../../database/repositories/currencyRepository';
import { AppError } from '../../utils/errors';
import type {
  CreateCurrencyInput,
  CreateDenominationInput,
  Currency,
  CurrencyDenomination,
} from '@shared/types/currency';
import { TELLER_AMOUNT_SCALE } from '@shared/teller/denominationMath';

const CURRENCY_CODE_PATTERN = /^[A-Z]{3,5}$/;
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const NAME_MAX = 80;

export class CurrencyService {
  private readonly repository: CurrencyRepository;
  private readonly write: (fn: () => void) => void;

  constructor(db: Database.Database) {
    this.repository = new CurrencyRepository(db);
    this.write = db.transaction((fn: () => void) => {
      fn();
    });
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
    const displayName = this.parseName(input.name) || code;
    const existing = this.repository.getByCode(code);

    if (existing?.isActive) {
      throw new AppError('VALIDATION_ERROR', 'CURRENCY_EXISTS');
    }

    if (existing && !existing.isActive) {
      this.repository.reactivate(code, symbol === '' ? existing.symbol : symbol, displayName);
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
      displayName,
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

  reactivate(code: string): Currency {
    const normalized = this.parseCode(code);
    const existing = this.repository.getByCode(normalized);
    if (!existing) {
      throw new AppError('INVALID_CURRENCY', 'CURRENCY_NOT_FOUND');
    }
    if (existing.isActive) {
      return existing;
    }

    this.repository.reactivate(normalized, existing.symbol);
    const restored = this.repository.getByCode(normalized);
    if (!restored) {
      throw new AppError('INVALID_CURRENCY', 'CURRENCY_NOT_FOUND');
    }
    return restored;
  }

  remove(code: string): { code: string; deleted: true } {
    const normalized = this.parseCode(code);
    const existing = this.repository.getByCode(normalized);
    if (!existing) {
      throw new AppError('INVALID_CURRENCY', 'CURRENCY_NOT_FOUND');
    }
    if (this.repository.hasTransactions(normalized)) {
      throw new AppError('CURRENCY_IN_USE', 'CURRENCY_IN_USE');
    }
    if (existing.isActive && this.repository.countActive() <= 1) {
      throw new AppError('VALIDATION_ERROR', 'LAST_ACTIVE_CURRENCY');
    }

    this.write(() => {
      this.repository.deleteByCode(normalized);
    });
    return { code: normalized, deleted: true };
  }

  hasTransactions(code: string): boolean {
    return this.repository.hasTransactions(this.parseCode(code));
  }

  listDenominations(currencyCode: string, includeInactive = false): CurrencyDenomination[] {
    const code = this.parseCode(currencyCode);
    if (!this.repository.getByCode(code)) {
      throw new AppError('INVALID_CURRENCY', 'CURRENCY_NOT_FOUND');
    }
    return this.repository.listDenominations(code, includeInactive);
  }

  createDenomination(input: CreateDenominationInput): CurrencyDenomination {
    const code = this.parseCode(input.currencyCode);
    const currency = this.repository.getByCode(code);
    if (!currency) {
      throw new AppError('INVALID_CURRENCY', 'CURRENCY_NOT_FOUND');
    }
    const value = this.parseDenominationValue(input.value);
    const existing = this.repository
      .listDenominations(code, true)
      .find((item) => this.valuesEqual(item.value, value));
    if (existing?.isActive) {
      throw new AppError('DENOMINATION_EXISTS', 'DENOMINATION_EXISTS');
    }
    if (existing && !existing.isActive) {
      this.repository.reactivateDenomination(existing.id);
      const restored = this.repository.getDenomination(existing.id);
      if (!restored) {
        throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
      }
      return restored;
    }

    const id = this.repository.createDenomination({
      currencyCode: code,
      value,
      sortOrder: this.repository.nextDenominationSortOrder(code),
    });
    const created = this.repository.getDenomination(id);
    if (!created) {
      throw new AppError('INTERNAL_ERROR', 'INTERNAL_ERROR');
    }
    return created;
  }

  deactivateDenomination(id: number): CurrencyDenomination {
    const existing = this.requireDenomination(id);
    if (!existing.isActive) {
      return existing;
    }
    this.repository.deactivateDenomination(id);
    return this.requireDenomination(id);
  }

  reactivateDenomination(id: number): CurrencyDenomination {
    const existing = this.requireDenomination(id);
    if (existing.isActive) {
      return existing;
    }
    this.repository.reactivateDenomination(id);
    return this.requireDenomination(id);
  }

  removeDenomination(id: number): { id: number; deleted: true } {
    const existing = this.requireDenomination(id);
    if (this.repository.denominationInUse(existing.id)) {
      throw new AppError('DENOMINATION_IN_USE', 'DENOMINATION_IN_USE');
    }
    this.write(() => {
      this.repository.deleteDenomination(id);
    });
    return { id, deleted: true };
  }

  private requireDenomination(id: number): CurrencyDenomination {
    if (!Number.isInteger(id) || id <= 0) {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
    }
    const existing = this.repository.getDenomination(id);
    if (!existing) {
      throw new AppError('TELLER_DENOMINATION_INVALID', 'TELLER_DENOMINATION_INVALID');
    }
    return existing;
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

  private parseName(value: unknown): string {
    if (value === undefined || value === null) {
      return '';
    }
    if (typeof value !== 'string') {
      throw new AppError('CURRENCY_NAME_INVALID', 'CURRENCY_NAME_INVALID');
    }
    const name = value.trim();
    if (name.length > NAME_MAX || CONTROL_CHARS.test(name)) {
      throw new AppError('CURRENCY_NAME_INVALID', 'CURRENCY_NAME_INVALID');
    }
    return name;
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

  private parseDenominationValue(value: unknown): string {
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new AppError('DENOMINATION_VALUE_INVALID', 'DENOMINATION_VALUE_INVALID');
    }
    const raw = String(value).trim();
    try {
      const parsed = new Decimal(raw);
      if (!parsed.isFinite() || parsed.lte(0) || parsed.decimalPlaces() > TELLER_AMOUNT_SCALE) {
        throw new AppError('DENOMINATION_VALUE_INVALID', 'DENOMINATION_VALUE_INVALID');
      }
      return parsed.decimalPlaces() === 0 ? parsed.toFixed(0) : parsed.toFixed(parsed.decimalPlaces());
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('DENOMINATION_VALUE_INVALID', 'DENOMINATION_VALUE_INVALID');
    }
  }

  private valuesEqual(left: string, right: string): boolean {
    try {
      return new Decimal(left).eq(new Decimal(right));
    } catch {
      return false;
    }
  }
}
