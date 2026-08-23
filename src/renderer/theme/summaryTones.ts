/**
 * Maps currencies to summary-card tone slots.
 * Visual only: Settings can later override the `--summary-tone-N-*` CSS variables.
 */
export const SUMMARY_TONE_COUNT = 3;

const CURRENCY_TONE: Record<string, number> = {
  AFN: 1,
  USD: 2,
  EUR: 3,
};

export function getSummaryTone(currencyCode: string, index: number): number {
  return CURRENCY_TONE[currencyCode] ?? (index % SUMMARY_TONE_COUNT) + 1;
}
