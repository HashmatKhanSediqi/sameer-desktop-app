import { describe, expect, it } from 'vitest';
import {
  applyThemeToDocument,
  DARK_MODE_CHROME,
  DEFAULT_THEME,
  LIGHT_MODE_ON_PRIMARY,
  parseThemeAppearance,
  type ThemeStyleTarget,
} from '../../src/shared/theme';

function collectProperties(): {
  properties: Map<string, string>;
  style: ThemeStyleTarget;
} {
  const properties = new Map<string, string>();
  const style: ThemeStyleTarget = {
    setProperty(name, value) {
      properties.set(name, value);
    },
  };
  return { properties, style };
}

describe('theme appearance', () => {
  it('defaults missing or invalid mode to light', () => {
    expect(parseThemeAppearance({}).mode).toBe('light');
    expect(parseThemeAppearance({ mode: 'midnight' }).mode).toBe('light');
    expect(parseThemeAppearance({ mode: 'dark' }).mode).toBe('dark');
  });

  it('applies custom primary and accent colors in light mode', () => {
    const { properties, style } = collectProperties();

    applyThemeToDocument(
      { ...DEFAULT_THEME, mode: 'light', primary: '#123456', accent: '#654321' },
      style,
    );

    expect(properties.get('--color-primary')).toBe('#123456');
    expect(properties.get('--color-secondary')).toBe('#654321');
    expect(properties.get('--color-on-primary')).toBe(LIGHT_MODE_ON_PRIMARY);
    expect(properties.get('--color-background')).toBe('#ffffff');
    expect(properties.get('color-scheme')).toBe('light');
  });

  it('maps theme chrome to white/light in dark mode without dropping stored custom colors on restore', () => {
    const properties = new Map<string, string>();
    const attributes = new Map<string, string>();
    const style: ThemeStyleTarget = {
      setProperty(name, value) {
        properties.set(name, value);
      },
    };
    const root = {
      style,
      setAttribute(name: string, value: string) {
        attributes.set(name, value);
      },
    };

    applyThemeToDocument(
      { ...DEFAULT_THEME, mode: 'dark', primary: '#123456', accent: '#654321' },
      root,
    );

    expect(attributes.get('data-theme')).toBe('dark');
    expect(properties.get('--color-primary')).toBe(DARK_MODE_CHROME.primary);
    expect(properties.get('--color-primary-hover')).toBe(DARK_MODE_CHROME.primaryHover);
    expect(properties.get('--color-on-primary')).toBe(DARK_MODE_CHROME.onPrimary);
    expect(properties.get('--color-secondary')).toBe(DARK_MODE_CHROME.secondary);
    expect(properties.get('--color-background')).toBe('#171c1a');
    expect(properties.get('--color-surface')).toBe('#222926');
    expect(properties.get('--color-text')).toBe('#e7eee9');
    expect(properties.get('color-scheme')).toBe('dark');
    expect(properties.get('--color-balance-positive')).toBe('#6ee7a0');
    expect(properties.get('--color-balance-negative')).toBe('#fca5a5');
  });

  it('restores custom light chrome when switching back from dark', () => {
    const { properties, style } = collectProperties();

    applyThemeToDocument(
      { ...DEFAULT_THEME, mode: 'dark', primary: '#123456', accent: '#654321' },
      style,
    );
    applyThemeToDocument(
      { ...DEFAULT_THEME, mode: 'light', primary: '#123456', accent: '#654321' },
      style,
    );

    expect(properties.get('--color-primary')).toBe('#123456');
    expect(properties.get('--color-secondary')).toBe('#654321');
    expect(properties.get('--color-on-primary')).toBe(LIGHT_MODE_ON_PRIMARY);
    expect(properties.get('--color-background')).toBe('#ffffff');
    expect(properties.get('--color-text')).toBe('#0f172a');
    expect(properties.get('color-scheme')).toBe('light');
  });
});
