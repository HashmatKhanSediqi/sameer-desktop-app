import { describe, expect, it } from 'vitest';
import { nextWorksheetFocus } from '../../src/shared/teller/worksheetNav';

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
});
