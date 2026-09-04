import { describe, expect, it } from 'vitest';
import enTeller from '../../src/renderer/i18n/locales/en/teller.json';
import {
  isPrimaryTellerCurrency,
  tellerDayAction,
  TELLER_RESET_REQUIRES_CONFIRMATION,
} from '../../src/shared/teller/sessionState';

describe('teller session UI state', () => {
  it('uses one START/END action for the global Teller lifecycle', () => {
    expect(tellerDayAction(0)).toBe('START');
    expect(tellerDayAction(1)).toBe('END');
    expect(tellerDayAction(3)).toBe('END');
  });

  it('renders the global Teller lifecycle control only for the first active currency', () => {
    const activeCurrencies = ['AFN', 'USD', 'EUR', 'GBP'];
    expect(isPrimaryTellerCurrency('AFN', activeCurrencies)).toBe(true);
    expect(isPrimaryTellerCurrency('USD', activeCurrencies)).toBe(false);
    expect(isPrimaryTellerCurrency('EUR', activeCurrencies)).toBe(false);
    expect(isPrimaryTellerCurrency('GBP', activeCurrencies)).toBe(false);
    expect(isPrimaryTellerCurrency(null, activeCurrencies)).toBe(false);
    expect(isPrimaryTellerCurrency('AFN', [])).toBe(false);
  });

  it('requires confirmation copy before resetting cash to zero', () => {
    expect(TELLER_RESET_REQUIRES_CONFIRMATION).toBe(true);
    expect(enTeller.session.confirmResetTitle.length).toBeGreaterThan(0);
    expect(enTeller.session.confirmResetWarn.toLowerCase()).toContain('zero');
    expect(enTeller.session.resetCash).toBe('RESET CASH TO ZERO');
  });
});
