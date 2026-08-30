import { describe, expect, it } from 'vitest';
import { amountsEqual, calculateDenominationTotal } from '../../src/shared/teller/denominationMath';
import {
  computeCheckFlag,
  computeCountedTotal,
  computeNetPieces,
  computeClosingAmount,
  computeClosingPieceCounts,
  computeResult,
  computeSessionSummary,
  computeVariance,
  countNonBlankAmounts,
  isBlankAmount,
  sumPiecesForDenomination,
} from '../../src/shared/teller/workbookMath';

const AFN = [
  { value: '1000' },
  { value: '500' },
  { value: '100' },
  { value: '50' },
  { value: '20' },
  { value: '10' },
  { value: '5' },
  { value: '2' },
  { value: '1' },
];

describe('teller workbook math (§5 matrix)', () => {
  it('row total: 1×1000 + 1×500 = 1500', () => {
    const counted = computeCountedTotal(AFN, { '1000': 1, '500': 1 });
    expect(amountsEqual(counted, '1500')).toBe(true);
    expect(computeCheckFlag('1500', counted)).toBe('OK');
    expect(amountsEqual(computeVariance('1500', counted), '0')).toBe(true);
  });

  it('row check and tally: declared 5000, counted 1000 → NO / 4000', () => {
    const counted = computeCountedTotal(AFN, { '1000': 1 });
    expect(amountsEqual(counted, '1000')).toBe(true);
    expect(computeCheckFlag('5000', counted)).toBe('NO');
    expect(amountsEqual(computeVariance('5000', counted), '4000')).toBe(true);
  });

  it('withdrawal tally can be negative: declared 300, counted 3000 → -2700', () => {
    const counted = computeCountedTotal(AFN, { '1000': 3 });
    expect(amountsEqual(counted, '3000')).toBe(true);
    expect(computeCheckFlag('300', counted)).toBe('NO');
    expect(amountsEqual(computeVariance('300', counted), '-2700')).toBe(true);
  });

  it('zero-value row is OK with total 0', () => {
    const counted = computeCountedTotal(AFN, {});
    expect(amountsEqual(counted, '0')).toBe(true);
    expect(computeCheckFlag('0', counted)).toBe('OK');
    expect(amountsEqual(computeVariance('0', counted), '0')).toBe(true);
  });

  it('blank piece counts are treated as zero, not an error', () => {
    const counted = computeCountedTotal(AFN, { '1000': 1, '500': '', '100': null });
    expect(amountsEqual(counted, '1000')).toBe(true);
  });

  it('column SUM treats blanks as 0 and includes every row', () => {
    const rows = [{ '1000': 318 }, { '1000': 50 }, {}, { '1000': 1 }];
    expect(sumPiecesForDenomination(rows, '1000')).toBe(369);
  });

  it('COUNT excludes blank amounts and includes zero amounts', () => {
    expect(isBlankAmount(null)).toBe(true);
    expect(isBlankAmount('')).toBe(true);
    expect(isBlankAmount('0')).toBe(false);
    expect(countNonBlankAmounts([null, '', '0', '1500', undefined])).toBe(2);
  });

  it('net pieces is received minus paid and can be negative', () => {
    expect(computeNetPieces(2278, 515)).toBe(1763);
    expect(computeNetPieces(0, 3)).toBe(-3);
  });

  it('AFN RESULT = Head Teller + Cash In (ICBA) − Cash Out (ICBA)', () => {
    expect(amountsEqual(computeResult({
      currencyCode: 'AFN',
      oppAmount: '1000',
      cashInICBA: '200',
      cashOutICBA: '50',
      grandTotalAmount: '99999',
    }), '1150')).toBe(true);
  });

  it('USD RESULT = total counted cash − Opp-Amount, not OP', () => {
    expect(amountsEqual(computeResult({
      currencyCode: 'USD',
      oppAmount: '100',
      cashInICBA: '999',
      cashOutICBA: '999',
      grandTotalAmount: '250',
    }), '150')).toBe(true);
  });

  it('session summary matches mixed deposit/withdrawal workbook rows', () => {
    const summary = computeSessionSummary({
      currencyCode: 'AFN',
      denominations: AFN,
      deposits: [
        { declaredAmount: '1500', counts: { '1000': 1, '500': 1 } },
        { declaredAmount: '5000', counts: { '1000': 1 } },
        { declaredAmount: '0', counts: {} },
        { declaredAmount: null, counts: {} },
      ],
      withdrawals: [{ declaredAmount: '300', counts: { '1000': 3 } }],
      oppAmount: '100',
      cashInICBA: '20',
      cashOutICBA: '5',
    });

    expect(summary.totalReceivedByDenomination['1000']).toBe(2);
    expect(summary.totalReceivedByDenomination['500']).toBe(1);
    expect(summary.totalPaidByDenomination['1000']).toBe(3);
    expect(summary.netPiecesByDenomination['1000']).toBe(-1);
    expect(amountsEqual(summary.grandTotalReceivedAmount, '2500')).toBe(true);
    expect(amountsEqual(summary.grandTotalPaidAmount, '3000')).toBe(true);
    expect(amountsEqual(summary.grandTotalAmount, '-500')).toBe(true);
    expect(summary.depositTransactionCount).toBe(3);
    expect(summary.withdrawalTransactionCount).toBe(1);
    expect(summary.totalTransactionCount).toBe(4);
    expect(amountsEqual(summary.result, '115')).toBe(true);
  });

  it('denomination engine still calculates 1×1000+1×500 without a session rebuild', () => {
    const first = calculateDenominationTotal([
      { denominationId: 1, unitValue: '1000', quantity: 1 },
      { denominationId: 2, unitValue: '500', quantity: 1 },
    ]);
    expect(first.ok).toBe(true);
    if (first.ok) {
      expect(amountsEqual(first.total, '1500')).toBe(true);
    }
    const second = calculateDenominationTotal([
      { denominationId: 1, unitValue: '1000', quantity: 2 },
      { denominationId: 2, unitValue: '500', quantity: 1 },
    ]);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(amountsEqual(second.total, '2500')).toBe(true);
    }
  });

  it('closing cash is opening + deposits − withdrawals, with denomination carry-forward', () => {
    const usd = [{ value: '100' }, { value: '50' }, { value: '20' }];
    const amount = computeClosingAmount(
      usd,
      '1000',
      [{ declaredAmount: '2000', counts: { '100': 20 } }],
      [{ declaredAmount: '500', counts: { '100': 5 } }],
    );
    expect(amountsEqual(amount, '2500')).toBe(true);
    expect(
      computeClosingPieceCounts(usd, { '100': 10 }, [{ '100': 20 }], [{ '100': 5 }]),
    ).toEqual({ '100': 25, '50': 0, '20': 0 });
  });

  it('includes OP pieces in cash received but excludes OP from transaction counts', () => {
    const usd = [{ value: '100' }, { value: '50' }];
    const summary = computeSessionSummary({
      currencyCode: 'USD',
      denominations: usd,
      openingCounts: { '100': 10, '50': 5 },
      deposits: [{ declaredAmount: '200', counts: { '100': 2 } }],
      withdrawals: [],
      oppAmount: '50',
      cashInICBA: '0',
      cashOutICBA: '0',
    });
    expect(summary.totalReceivedByDenomination['100']).toBe(12);
    expect(summary.totalReceivedByDenomination['50']).toBe(5);
    expect(summary.depositTransactionCount).toBe(1);
    expect(summary.totalTransactionCount).toBe(1);
  });
});
