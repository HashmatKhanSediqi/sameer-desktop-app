const LATIN_DIGIT = /[0-9]/;
const MAX_DECIMAL_PLACES = 4;

/**
 * Keep only English/Latin digits (0-9) and a single decimal point.
 * Eastern Arabic, Persian/Dari, and other numerals or letters are dropped.
 */
export function sanitizeAmountInput(value: string): string {
  let result = '';
  let seenDecimal = false;

  for (const char of value) {
    if (LATIN_DIGIT.test(char)) {
      if (seenDecimal) {
        const decimals = result.split('.')[1] ?? '';
        if (decimals.length >= MAX_DECIMAL_PLACES) {
          continue;
        }
      }
      result += char;
      continue;
    }

    if (char === '.' && !seenDecimal) {
      seenDecimal = true;
      result += char;
    }
  }

  return result;
}

export function isLatinAmountInsert(data: string): boolean {
  if (data.length === 0) {
    return true;
  }
  return sanitizeAmountInput(data).length > 0;
}
