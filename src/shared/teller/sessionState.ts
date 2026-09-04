export type TellerDayAction = 'START' | 'END';

export function tellerDayAction(openSessionCount: number): TellerDayAction {
  return openSessionCount > 0 ? 'END' : 'START';
}

export function isPrimaryTellerCurrency(
  selectedCurrencyCode: string | null,
  activeCurrencyCodes: readonly string[],
): boolean {
  return selectedCurrencyCode !== null && selectedCurrencyCode === activeCurrencyCodes[0];
}

export const TELLER_RESET_REQUIRES_CONFIRMATION = true;
