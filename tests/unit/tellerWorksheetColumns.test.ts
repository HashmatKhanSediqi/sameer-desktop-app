import { describe, expect, it } from 'vitest';
import {
  buildTellerWorksheetColumns,
  defaultTellerWorksheetWidths,
} from '../../src/shared/teller/worksheetColumns';

describe('Teller worksheet column geometry', () => {
  it.each([
    ['AFN', ['1000', '500', '100', '50', '20', '10', '5', '2', '1']],
    ['USD', ['100', '50', '20', '10', '5', '1']],
    ['EUR', ['100', '50', '20', '10', '5', '2', '1', '0.50', '0.20', '0.10', '0.05', '0.02', '0.01']],
    ['CUSTOM', ['250', '25', '0.25']],
  ])('builds one ordered column model for %s', (_currency, denominations) => {
    const columns = buildTellerWorksheetColumns(denominations);
    expect(columns.map((column) => column.id)).toEqual([
      'no',
      'name',
      'amount',
      ...denominations.map((value) => `d:${value}`),
      'check',
      'total',
      'tally',
    ]);
    expect(columns.filter((column) => column.denominationValue !== undefined)).toHaveLength(denominations.length);
    expect(Object.keys(defaultTellerWorksheetWidths(denominations))).toEqual(columns.map((column) => column.id));
  });
});
