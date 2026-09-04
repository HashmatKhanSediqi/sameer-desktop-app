import { describe, expect, it } from 'vitest';
import { nextWorksheetFocus } from '../../src/shared/teller/worksheetNav';
import { mergeActiveWorksheetRow, type WorksheetDraftRow } from '../../src/shared/teller/worksheetRows';

const denoms = ['1000', '500'];
const rows = [{ key: 'op', isOpening: true }, { key: 'draft-1' }, { key: 'draft-2' }];

describe('teller worksheet keyboard navigation', () => {
  it('moves up and down between transaction rows and skips the OP row', () => {
    expect(nextWorksheetFocus(rows, 'draft-1', 'amount', 'up', denoms)).toBeNull();
    expect(nextWorksheetFocus(rows, 'draft-1', 'amount', 'down', denoms)?.rowKey).toBe('draft-2');
    expect(nextWorksheetFocus(rows, 'draft-2', 'amount', 'down', denoms)).toEqual({
      rowKey: 'draft-2',
      col: 'amount',
      append: true,
    });
  });

  it('moves left and right between cells and wraps to the next or previous transaction row', () => {
    expect(nextWorksheetFocus(rows, 'draft-1', 'name', 'right', denoms)?.col).toBe('amount');
    expect(nextWorksheetFocus(rows, 'draft-1', 'd:500', 'right', denoms)).toEqual({
      rowKey: 'draft-2',
      col: 'name',
      append: false,
    });
    expect(nextWorksheetFocus(rows, 'draft-2', 'name', 'left', denoms)).toEqual({
      rowKey: 'draft-1',
      col: 'd:500',
      append: false,
    });
  });

  it('leaves left and right to the caret when the cursor is in the middle of a value', () => {
    expect(
      nextWorksheetFocus(rows, 'draft-1', 'name', 'right', denoms, { atStart: false, atEnd: false }),
    ).toBeNull();
    expect(
      nextWorksheetFocus(rows, 'draft-1', 'name', 'left', denoms, { atStart: false, atEnd: false }),
    ).toBeNull();
  });

  it('does not treat the OP row as an editable transaction row', () => {
    expect(nextWorksheetFocus(rows, 'draft-1', 'name', 'up', denoms)).toBeNull();
    expect(nextWorksheetFocus(rows, 'draft-1', 'name', 'left', denoms)).toBeNull();
  });

  it('preserves the independently edited row while a server refresh updates other rows', () => {
    const base = (key: string, referenceLabel: string, declaredAmount: string): WorksheetDraftRow<{
      referenceLabel: string;
      declaredAmount: string;
    }> => ({
      key,
      value: { referenceLabel, declaredAmount },
    });
    const current = [base('slot-4', 'row 5 typing', '500'), base('slot-9', 'row 10 typing', '1000')];
    const fresh = [base('slot-4', 'stale row 5', ''), base('slot-9', 'saved row 10', '1000')];
    const merged = mergeActiveWorksheetRow(fresh, current, 'slot-4');

    expect(merged[0]?.value.referenceLabel).toBe('row 5 typing');
    expect(merged[0]?.value.declaredAmount).toBe('500');
    expect(merged[1]?.value.referenceLabel).toBe('saved row 10');
  });
});
