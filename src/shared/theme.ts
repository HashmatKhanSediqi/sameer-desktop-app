export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export interface ThemeCardTone {
  background: string;
  accent: string;
}

export interface ThemeAppearance {
  primary: string;
  accent: string;
  cards: {
    '1': ThemeCardTone;
    '2': ThemeCardTone;
    '3': ThemeCardTone;
  };
}

export const DEFAULT_THEME: ThemeAppearance = {
  primary: '#1f7a4d',
  accent: '#258a58',
  cards: {
    '1': { background: '#e7f3ec', accent: '#2f6f4e' },
    '2': { background: '#eaf2f8', accent: '#3b6b8c' },
    '3': { background: '#f3eee8', accent: '#8a6a4a' },
  },
};

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value);
}

export function parseHexColor(value: unknown, fallback: string): string {
  return isHexColor(value) ? value.toLowerCase() : fallback;
}

export function parseThemeAppearance(value: unknown): ThemeAppearance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return cloneTheme(DEFAULT_THEME);
  }

  const record = value as Record<string, unknown>;
  const cards = record.cards && typeof record.cards === 'object' && !Array.isArray(record.cards)
    ? (record.cards as Record<string, unknown>)
    : {};

  return {
    primary: parseHexColor(record.primary, DEFAULT_THEME.primary),
    accent: parseHexColor(record.accent, DEFAULT_THEME.accent),
    cards: {
      '1': parseCardTone(cards['1'], DEFAULT_THEME.cards['1']),
      '2': parseCardTone(cards['2'], DEFAULT_THEME.cards['2']),
      '3': parseCardTone(cards['3'], DEFAULT_THEME.cards['3']),
    },
  };
}

export function cloneTheme(theme: ThemeAppearance): ThemeAppearance {
  return {
    primary: theme.primary,
    accent: theme.accent,
    cards: {
      '1': { ...theme.cards['1'] },
      '2': { ...theme.cards['2'] },
      '3': { ...theme.cards['3'] },
    },
  };
}

export function mixHex(hex: string, toward: string, amount: number): string {
  const left = hexToRgb(hex);
  const right = hexToRgb(toward);
  if (!left || !right) {
    return hex;
  }
  const t = Math.min(1, Math.max(0, amount));
  return rgbToHex(
    Math.round(left.r + (right.r - left.r) * t),
    Math.round(left.g + (right.g - left.g) * t),
    Math.round(left.b + (right.b - left.b) * t),
  );
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) {
    return `rgba(31, 122, 77, ${alpha})`;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/** Minimal CSS custom-property target (works in Node and browser TypeScript projects). */
export interface ThemeStyleTarget {
  setProperty(name: string, value: string): void;
}

export function applyThemeToDocument(theme: ThemeAppearance, root: ThemeStyleTarget): void {
  const primary = theme.primary;
  const accent = theme.accent;
  root.setProperty('--color-primary', primary);
  root.setProperty('--color-primary-hover', mixHex(primary, '#ffffff', 0.12));
  root.setProperty('--color-primary-pressed', mixHex(primary, '#000000', 0.16));
  root.setProperty('--color-primary-shadow', hexToRgba(primary, 0.28));
  root.setProperty('--color-focus-ring', hexToRgba(primary, 0.35));
  root.setProperty('--color-secondary', accent);
  root.setProperty('--color-border', mixHex(primary, '#dce6e0', 0.72));

  for (const slot of ['1', '2', '3'] as const) {
    const tone = theme.cards[slot];
    root.setProperty(`--summary-tone-${slot}-bg`, tone.background);
    root.setProperty(`--summary-tone-${slot}-accent`, tone.accent);
    root.setProperty(`--summary-tone-${slot}-border`, mixHex(tone.accent, '#ffffff', 0.55));
    root.setProperty(`--summary-tone-${slot}-shadow`, hexToRgba(tone.accent, 0.14));
  }
}

function parseCardTone(value: unknown, fallback: ThemeCardTone): ThemeCardTone {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...fallback };
  }
  const record = value as Record<string, unknown>;
  return {
    background: parseHexColor(record.background, fallback.background),
    accent: parseHexColor(record.accent, fallback.accent),
  };
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const match = /^#([0-9A-Fa-f]{6})$/.exec(hex);
  if (!match?.[1]) {
    return null;
  }
  const value = match[1];
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function toByte(value: number): string {
  return Math.min(255, Math.max(0, value)).toString(16).padStart(2, '0');
}
