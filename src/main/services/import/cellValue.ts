const EASTERN_ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function stringifyCell(value: unknown): string {
  const raw = unwrapExcelValue(value);
  if (raw === null || raw === undefined) {
    return '';
  }
  if (raw instanceof Date) {
    return formatDateOnly(raw);
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      return '';
    }
    return String(raw);
  }
  if (typeof raw === 'boolean') {
    return raw ? 'true' : 'false';
  }
  if (typeof raw === 'string') {
    return normalizeDigits(raw);
  }
  return '';
}

export function unwrapExcelValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== 'object') {
    return value;
  }

  if (value instanceof Date) {
    return value;
  }

  if (isExcelError(value)) {
    return null;
  }

  if (isFormulaCell(value)) {
    return unwrapExcelValue(value.result ?? null);
  }

  if (isRichText(value)) {
    return value.richText.map((part) => part.text).join('');
  }

  if (isHyperlink(value)) {
    return value.text;
  }

  if (isSharedString(value)) {
    return value.sharedString;
  }

  return null;
}

export function normalizeDigits(value: string): string {
  let result = '';
  for (const char of value) {
    const eastern = EASTERN_ARABIC_DIGITS.indexOf(char);
    if (eastern >= 0) {
      result += String(eastern);
      continue;
    }
    const persian = PERSIAN_DIGITS.indexOf(char);
    if (persian >= 0) {
      result += String(persian);
      continue;
    }
    result += char;
  }
  return result;
}

export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function excelSerialToDate(serial: number, date1904: boolean): Date {
  const epochUtc = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const utc = new Date(epochUtc + serial * 24 * 60 * 60 * 1000);
  return new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
}

function isFormulaCell(value: object): value is { formula: string; result?: unknown } {
  return 'formula' in value && typeof (value as { formula: unknown }).formula === 'string';
}

function isRichText(value: object): value is { richText: Array<{ text: string }> } {
  return (
    'richText' in value &&
    Array.isArray((value as { richText: unknown }).richText) &&
    (value as { richText: Array<{ text?: unknown }> }).richText.every(
      (part) => part && typeof part.text === 'string',
    )
  );
}

function isHyperlink(value: object): value is { text: string; hyperlink: string } {
  return 'hyperlink' in value && typeof (value as { text?: unknown }).text === 'string';
}

function isSharedString(value: object): value is { sharedString: string } {
  return 'sharedString' in value && typeof (value as { sharedString: unknown }).sharedString === 'string';
}

function isExcelError(value: object): boolean {
  return 'error' in value && typeof (value as { error?: unknown }).error === 'string';
}
