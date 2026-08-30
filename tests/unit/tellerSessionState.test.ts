import { describe, expect, it } from 'vitest';
import enTeller from '../../src/renderer/i18n/locales/en/teller.json';
import { tellerDayAction, TELLER_RESET_REQUIRES_CONFIRMATION } from '../../src/shared/teller/sessionState';

describe('teller session UI state', () => {
  it('maps each currency OPEN/CLOSED/idle state to START or END independently', () => {
    expect(tellerDayAction('CLOSED')).toBe('START');
    expect(tellerDayAction(null)).toBe('START');
    expect(tellerDayAction(undefined)).toBe('START');
    expect(tellerDayAction('OPEN')).toBe('END');
    expect(tellerDayAction('CLOSED')).not.toBe(tellerDayAction('OPEN'));
  });

  it('requires confirmation copy before resetting cash to zero', () => {
    expect(TELLER_RESET_REQUIRES_CONFIRMATION).toBe(true);
    expect(enTeller.session.confirmResetTitle.length).toBeGreaterThan(0);
    expect(enTeller.session.confirmResetWarn.toLowerCase()).toContain('zero');
    expect(enTeller.session.resetCash).toBe('RESET CASH TO ZERO');
  });
});
