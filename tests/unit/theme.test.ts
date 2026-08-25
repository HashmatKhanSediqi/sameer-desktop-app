import { describe, expect, it } from 'vitest';
import {
  applyThemeToDocument,
  DEFAULT_THEME,
  parseThemeAppearance,
  type ThemeStyleTarget,
} from '../../src/shared/theme';

describe('theme appearance', () => {
  it('defaults missing or invalid mode to light', () => {
    expect(parseThemeAppearance({}).mode).toBe('light');
    expect(parseThemeAppearance({ mode: 'midnight' }).mode).toBe('light');
    expect(parseThemeAppearance({ mode: 'dark' }).mode).toBe('dark');
  });

  it('applies dark surface tokens and data-theme without dropping custom colors', () => {
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
    expect(properties.get('--color-primary')).toBe('#123456');
    expect(properties.get('--color-secondary')).toBe('#654321');
    expect(properties.get('--color-background')).toBe('#171c1a');
    expect(properties.get('--color-surface')).toBe('#222926');
    expect(properties.get('--color-text')).toBe('#e7eee9');
    expect(properties.get('color-scheme')).toBe('dark');
  });

  it('restores light surface tokens when switching back from dark', () => {
    const properties = new Map<string, string>();
    const style: ThemeStyleTarget = {
      setProperty(name, value) {
        properties.set(name, value);
      },
    };

    applyThemeToDocument({ ...DEFAULT_THEME, mode: 'dark' }, style);
    applyThemeToDocument(DEFAULT_THEME, style);

    expect(properties.get('--color-background')).toBe('#ffffff');
    expect(properties.get('--color-text')).toBe('#0f172a');
    expect(properties.get('color-scheme')).toBe('light');
  });
});
