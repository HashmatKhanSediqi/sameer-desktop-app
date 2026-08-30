import { describe, expect, it } from 'vitest';
import {
  INITIAL_WORKSHEET_ROWS,
  nextTellerBusinessDate,
  planWorksheetSides,
  resolveWorksheetRowCount,
  suggestTellerExportFileName,
  worksheetRowNumbers,
} from '../../src/shared/teller/worksheetRows';

describe('teller worksheet rows', () => {
  it('starts at 20 synchronized rows and numbers both sides identically', () => {
    const plan = planWorksheetSides(INITIAL_WORKSHEET_ROWS, 0, 0);
    expect(plan.numbers).toEqual(worksheetRowNumbers(20));
    expect(plan.numbers[0]).toBe(1);
    expect(plan.numbers[19]).toBe(20);
    expect(plan.depositSlots).toHaveLength(20);
    expect(plan.withdrawalSlots).toHaveLength(20);
    expect(plan.depositSlots[0]).toBe('opening');
    expect(plan.withdrawalSlots[0]).toBe('empty');
  });

  it('grows both sides together when deposit or withdrawal exceeds capacity', () => {
    expect(resolveWorksheetRowCount(20, 20, 5)).toBe(21);
    expect(resolveWorksheetRowCount(20, 4, 22)).toBe(22);
    expect(resolveWorksheetRowCount(21, 20, 5)).toBe(21);

    const plan = planWorksheetSides(20, 21, 3);
    expect(plan.numbers).toHaveLength(22);
    expect(plan.numbers[21]).toBe(22);
    expect(plan.depositSlots.filter((slot) => slot === 'tx')).toHaveLength(21);
    expect(plan.withdrawalSlots).toHaveLength(22);
    expect(plan.withdrawalSlots[21]).toBe('empty');
  });

  it('keeps empty worksheet rows numbered instead of stopping at populated transactions', () => {
    const plan = planWorksheetSides(24, 2, 1);
    expect(plan.numbers).toEqual(worksheetRowNumbers(24));
    expect(plan.depositSlots[23]).toBe('empty');
    expect(plan.withdrawalSlots[23]).toBe('empty');
  });

  it('advances a local calendar business date including month and year boundaries', () => {
    expect(nextTellerBusinessDate('2026-08-29')).toBe('2026-08-30');
    expect(nextTellerBusinessDate('2026-08-31')).toBe('2026-09-01');
    expect(nextTellerBusinessDate('2026-12-31')).toBe('2027-01-01');
  });

  it('builds a deterministic safe export file name', () => {
    expect(suggestTellerExportFileName('AFN', '2026-08-29')).toBe('FMT-Teller-AFN-2026-08-29.xlsx');
    expect(suggestTellerExportFileName('usd', '2026-08-29')).toBe('FMT-Teller-USD-2026-08-29.xlsx');
    expect(suggestTellerExportFileName('GB/P', '2026-08-29')).toBe('FMT-Teller-GBP-2026-08-29.xlsx');
  });
});
