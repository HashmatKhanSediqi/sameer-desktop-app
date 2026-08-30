import { describe, expect, it } from 'vitest';
import { parseOptionalTellerAmount, parseTrustedTellerAmount } from '../../src/main/services/teller/tellerValidation';
import { AppError } from '../../src/main/utils/errors';
import { amountsEqual } from '../../src/shared/teller/denominationMath';

describe('teller amount validation', () => {
  it('accepts system-generated previous closing amounts as OP without user-field validation', () => {
    expect(amountsEqual(parseTrustedTellerAmount('25000.0000'), '25000')).toBe(true);
    expect(amountsEqual(parseTrustedTellerAmount('13500'), '13500')).toBe(true);
    expect(amountsEqual(parseTrustedTellerAmount(undefined), '0')).toBe(true);
  });

  it('still rejects invalid normal transaction amounts', () => {
    expect(() => parseOptionalTellerAmount('abc')).toThrow(AppError);
    try {
      parseOptionalTellerAmount('abc');
    } catch (error) {
      expect((error as AppError).code).toBe('VALIDATION_ERROR');
    }
  });
});
