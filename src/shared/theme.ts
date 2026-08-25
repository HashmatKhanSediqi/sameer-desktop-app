export const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export type ThemeMode = 'light' | 'dark';

export interface ThemeCardTone {
  background: string;
  accent: string;
}

export interface ThemeAppearance {
  mode: ThemeMode;
  primary: string;
  accent: string;
  cards: {
    '1': ThemeCardTone;
    '2': ThemeCardTone;
    '3': ThemeCardTone;
  };
}

export const DEFAULT_THEME: ThemeAppearance = {
  mode: 'light',
  primary: '#1f7a4d',
  accent: '#258a58',
  cards: {
    '1': { background: '#e7f3ec', accent: '#2f6f4e' },
    '2': { background: '#eaf2f8', accent: '#3b6b8c' },
    '3': { background: '#f3eee8', accent: '#8a6a4a' },
  },
};

/** Dark Mode chrome: theme green/primary becomes white/light. Semantic status colors stay separate. */
export const DARK_MODE_CHROME = {
  primary: '#f4f7f5',
  primaryHover: '#ffffff',
  primaryPressed: '#d7ddd9',
  onPrimary: '#171c1a',
  secondary: '#ffffff',
  border: '#3a4540',
} as const;

export const LIGHT_MODE_ON_PRIMARY = '#ffffff';

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

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
    mode: isThemeMode(record.mode) ? record.mode : DEFAULT_THEME.mode,
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
    mode: theme.mode,
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

export interface ThemeDocumentTarget {
  style: ThemeStyleTarget;
  setAttribute?(name: string, value: string): void;
}

export type ThemeApplyTarget = ThemeStyleTarget | ThemeDocumentTarget;

export function applyThemeToDocument(theme: ThemeAppearance, root: ThemeApplyTarget): void {
  const style = resolveStyleTarget(root);
  const dark = theme.mode === 'dark';
  const storedPrimary = theme.primary;
  const storedAccent = theme.accent;
  const chromePrimary = dark ? DARK_MODE_CHROME.primary : storedPrimary;
  const chromeAccent = dark ? DARK_MODE_CHROME.secondary : storedAccent;

  style.setProperty('--color-primary', chromePrimary);
  style.setProperty(
    '--color-primary-hover',
    dark ? DARK_MODE_CHROME.primaryHover : mixHex(storedPrimary, '#ffffff', 0.12),
  );
  style.setProperty(
    '--color-primary-pressed',
    dark ? DARK_MODE_CHROME.primaryPressed : mixHex(storedPrimary, '#000000', 0.16),
  );
  style.setProperty('--color-on-primary', dark ? DARK_MODE_CHROME.onPrimary : LIGHT_MODE_ON_PRIMARY);
  style.setProperty('--color-primary-shadow', hexToRgba(chromePrimary, dark ? 0.22 : 0.28));
  style.setProperty('--color-focus-ring', hexToRgba(chromePrimary, dark ? 0.5 : 0.35));
  style.setProperty('--color-secondary', chromeAccent);
  style.setProperty(
    '--color-border',
    dark ? DARK_MODE_CHROME.border : mixHex(storedPrimary, '#dce6e0', 0.72),
  );
  style.setProperty('--color-background', dark ? '#171c1a' : '#ffffff');
  style.setProperty('--color-surface', dark ? '#222926' : '#ffffff');
  style.setProperty('--color-text', dark ? '#e7eee9' : '#0f172a');
  style.setProperty('--color-text-muted', dark ? '#93a199' : '#64748b');
  style.setProperty('--color-table-stripe', dark ? '#1c2320' : '#f8fafc');
  style.setProperty('--color-hover-fill', dark ? '#2b3531' : '#f3f7f4');
  style.setProperty('--color-hover-fill-strong', dark ? '#323d38' : '#e7efe9');
  style.setProperty('--color-avatar-fill', dark ? '#3a4540' : '#e2e8f0');
  style.setProperty('--color-logo-fill', dark ? '#222926' : '#ffffff');
  style.setProperty('--color-success-bg', dark ? '#163226' : '#f0fdf4');
  style.setProperty('--color-success-border', dark ? '#275c40' : '#bbf7d0');
  style.setProperty('--color-danger-bg', dark ? '#3a1d1d' : '#fef2f2');
  style.setProperty('--color-danger-border', dark ? '#7a3535' : '#fecaca');
  style.setProperty('--color-warning-bg', dark ? '#3a2e18' : '#fff6e5');
  style.setProperty('--color-warning-text', dark ? '#f0d19a' : '#7a4a00');
  style.setProperty('--color-warning-border', dark ? '#7a5a2a' : '#f0d19a');
  style.setProperty('--color-cash-in-soft', dark ? '#173325' : '#ecfdf3');
  style.setProperty('--color-cash-out-soft', dark ? '#3a1d1d' : '#fef2f2');
  style.setProperty('--color-type-cash-in-bg', dark ? '#1c3d2a' : '#dcfce7');
  style.setProperty('--color-type-cash-out-bg', dark ? '#4a2222' : '#fee2e2');
  style.setProperty('--color-balance-positive', dark ? '#6ee7a0' : '#15803d');
  style.setProperty('--color-balance-negative', dark ? '#fca5a5' : '#b91c1c');
  style.setProperty('--color-balance-positive-bg', dark ? '#163226' : '#ecfdf3');
  style.setProperty('--color-balance-negative-bg', dark ? '#3a1d1d' : '#fef2f2');
  style.setProperty('--color-balance-positive-border', dark ? '#275c40' : '#bbf7d0');
  style.setProperty('--color-balance-negative-border', dark ? '#7a3535' : '#fecaca');
  style.setProperty('--color-modal-backdrop', dark ? 'rgba(8, 12, 10, 0.72)' : 'rgba(15, 23, 42, 0.4)');
  style.setProperty(
    '--shadow-soft',
    dark
      ? '0 8px 20px rgba(0, 0, 0, 0.32), 0 2px 6px rgba(0, 0, 0, 0.22)'
      : '0 8px 20px rgba(15, 23, 42, 0.08), 0 2px 6px rgba(15, 23, 42, 0.04)',
  );
  style.setProperty(
    '--shadow-raised',
    dark
      ? '0 12px 28px rgba(0, 0, 0, 0.4), 0 4px 10px rgba(0, 0, 0, 0.24)'
      : '0 12px 28px rgba(15, 23, 42, 0.12), 0 4px 10px rgba(15, 23, 42, 0.06)',
  );
  style.setProperty(
    '--shadow-login',
    dark
      ? '0 1px 0 rgba(255, 255, 255, 0.06) inset, 0 22px 48px rgba(0, 0, 0, 0.42), 0 8px 16px rgba(0, 0, 0, 0.24)'
      : '0 1px 0 rgba(255, 255, 255, 0.75) inset, 0 22px 48px rgba(15, 23, 42, 0.12), 0 8px 16px rgba(15, 23, 42, 0.06)',
  );
  style.setProperty('color-scheme', theme.mode);

  if ('setAttribute' in root && typeof root.setAttribute === 'function') {
    root.setAttribute('data-theme', theme.mode);
  }

  style.setProperty('--summary-tone-fallback-bg', dark ? '#1c2420' : '#eef2f0');
  style.setProperty(
    '--summary-tone-fallback-accent',
    dark ? DARK_MODE_CHROME.primary : '#4b6356',
  );
  style.setProperty('--summary-tone-fallback-border', dark ? '#2a332f' : '#d5ddd8');
  style.setProperty(
    '--summary-tone-fallback-shadow',
    hexToRgba(chromePrimary, dark ? 0.18 : 0.08),
  );

  for (const slot of ['1', '2', '3'] as const) {
    const tone = theme.cards[slot];
    style.setProperty(
      `--summary-tone-${slot}-bg`,
      dark ? mixHex(tone.background, '#1c2420', 0.68) : tone.background,
    );
    style.setProperty(
      `--summary-tone-${slot}-accent`,
      dark ? mixHex(tone.accent, DARK_MODE_CHROME.primary, 0.7) : tone.accent,
    );
    style.setProperty(
      `--summary-tone-${slot}-border`,
      dark ? mixHex(DARK_MODE_CHROME.primary, '#2a332f', 0.42) : mixHex(tone.accent, '#ffffff', 0.55),
    );
    style.setProperty(
      `--summary-tone-${slot}-shadow`,
      hexToRgba(dark ? DARK_MODE_CHROME.primary : tone.accent, dark ? 0.16 : 0.14),
    );
  }
}

function resolveStyleTarget(root: ThemeApplyTarget): ThemeStyleTarget {
  if ('style' in root) {
    return root.style;
  }
  return root;
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
