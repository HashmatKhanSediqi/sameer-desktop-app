import { describe, expect, it } from 'vitest';
import {
  containsArabicScript,
  containsPresentationForms,
  isolateLtr,
  naiveReverse,
  segmentScriptRuns,
  shapeRtlText,
  toVisualPdfText,
  wrapLogicalLines,
} from '../../src/main/services/report/rtlText';
import { buildReportFileName, parseReportGenerateInput, sanitizeFilePart } from '../../src/main/services/report/reportValidation';
import { AppError } from '../../src/main/utils/errors';

describe('RTL report text', () => {
  it('detects Arabic-script text and reshapes Dari letters into presentation forms', () => {
    expect(containsArabicScript('Ahmad')).toBe(false);
    expect(containsArabicScript('سلام')).toBe(true);
    const shaped = shapeRtlText('ففف', 'fa-AF');
    expect(shaped).not.toBe('ففف');
    expect(containsPresentationForms(shaped)).toBe(true);
    expect(shaped.length).toBeGreaterThan(0);
  });

  it('shapes Dari and Pashto without reversing the whole logical string', () => {
    const dari = shapeRtlText('دریافت وجه', 'fa-AF');
    const pashto = shapeRtlText('نغدې دننه', 'ps');
    expect(containsPresentationForms(dari)).toBe(true);
    expect(pashto.length).toBeGreaterThan(0);
    expect(toVisualPdfText('سلام', 'fa-AF', 'rtl')).not.toBe('مالس');
  });

  it('keeps Latin numbers, currency codes, and mixed RTL text readable', () => {
    const visual = toVisualPdfText(`${isolateLtr('AFN')} ${isolateLtr('12')} سلام`, 'fa-AF', 'rtl');
    expect(visual).toContain('12');
    expect(visual).toContain('AFN');
    expect(visual).not.toContain('21');
    expect(visual).not.toContain('NFA');
  });

  it('mirrors punctuation from the bidi algorithm instead of a raw string reverse', () => {
    const visual = toVisualPdfText('(سلام)', 'fa-AF', 'rtl');
    expect(visual.includes(')') || visual.includes('(')).toBe(true);
    expect(containsPresentationForms(visual)).toBe(true);
    expect(visual).not.toBe(')مالس(');
  });

  it('keeps Dari words joined and does not reverse the whole logical string', () => {
    const samples = ['احمد خان', 'مبلغ پرداخت شد', 'این یک یادداشت آزمایشی است'];
    for (const sample of samples) {
      const shaped = shapeRtlText(sample, 'fa-AF');
      const visual = toVisualPdfText(sample, 'fa-AF', 'rtl');
      expect(containsPresentationForms(shaped)).toBe(true);
      expect(visual).not.toBe(naiveReverse(sample));
      expect(visual).not.toBe(sample);
      expect(shaped).not.toBe(naiveReverse(sample));
    }
  });

  it('preserves mixed Dari, Latin, numbers, dates, times, and currency codes', () => {
    const nameMixed = toVisualPdfText('احمد Khan AFN 1500', 'fa-AF', 'rtl');
    expect(nameMixed).toContain('Khan');
    expect(nameMixed).toContain('AFN');
    expect(nameMixed).toContain('1500');
    expect(nameMixed).not.toContain('nahK');
    expect(nameMixed).not.toContain('NFA');
    expect(nameMixed).not.toContain('0051');
    expect(nameMixed).not.toBe(naiveReverse('احمد Khan AFN 1500'));

    const numberMixed = toVisualPdfText('شماره مشتری C-1001', 'fa-AF', 'rtl');
    expect(numberMixed).toContain('C-1001');
    expect(numberMixed).not.toBe(naiveReverse('شماره مشتری C-1001'));

    const dateMixed = toVisualPdfText('تاریخ 2026-08-22 ساعت 14:30', 'fa-AF', 'rtl');
    expect(dateMixed).toContain('2026-08-22');
    expect(dateMixed).toContain('14:30');
    expect(dateMixed).not.toBe(naiveReverse('تاریخ 2026-08-22 ساعت 14:30'));
    expect(segmentScriptRuns('احمد Khan AFN 1500').some((run) => run.kind === 'ltr')).toBe(true);
  });

  it('shapes representative Pashto translations without corrupting Latin digits', () => {
    const sample = 'نغدې دننه 20 USD';
    const visual = toVisualPdfText(sample, 'ps', 'rtl');
    expect(visual).toContain('20');
    expect(visual).toContain('USD');
    expect(visual).not.toContain('02');
    expect(visual).not.toContain('DSU');
    expect(visual).not.toBe(naiveReverse(sample));
    expect(shapeRtlText('نغدې دننه', 'ps').length).toBeGreaterThan(0);
  });

  it('wraps long logical text without reversing the whole paragraph first', () => {
    const note = 'این یک یادداشت آزمایشی است که باید در چند سطر بماند';
    const lines = wrapLogicalLines(note, (line) => line.length * 8, 80);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toContain('یادداشت');
    expect(lines[0]).not.toBe(naiveReverse(note));
    expect(lines[0]?.startsWith('این') || lines[0]?.startsWith('ي')).toBe(true);
  });
});

describe('report validation and filenames', () => {
  it('requires a customer for individual reports and dates for date-range reports', () => {
    expect(() =>
      parseReportGenerateInput({ type: 'customer', format: 'pdf', language: 'en' }),
    ).toThrow(AppError);
    expect(() =>
      parseReportGenerateInput({ type: 'date_range', format: 'xlsx', language: 'en' }),
    ).toThrow(AppError);
    const parsed = parseReportGenerateInput({
      type: 'currency_summary',
      format: 'pdf',
      language: 'ps',
    });
    expect(parsed.type).toBe('currency_summary');
    expect(parsed.language).toBe('ps');
  });

  it('sanitizes customer names for filesystem-safe filenames', () => {
    expect(sanitizeFilePart('Ahmad/Khan:*?')).toBe('AhmadKhan');
    expect(sanitizeFilePart('   ')).toBe('All');
    const name = buildReportFileName('customer', 'pdf', 'فاطمه', new Date('2026-08-22T00:00:00'));
    expect(name.startsWith('CustomerAccounting_Customer_')).toBe(true);
    expect(name.endsWith('.pdf')).toBe(true);
  });
});
