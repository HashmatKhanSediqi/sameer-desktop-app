export type TellerDayAction = 'START' | 'END';

export function tellerDayAction(status: 'OPEN' | 'CLOSED' | null | undefined): TellerDayAction {
  return status === 'OPEN' ? 'END' : 'START';
}

export const TELLER_RESET_REQUIRES_CONFIRMATION = true;
