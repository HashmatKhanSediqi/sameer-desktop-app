import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ttfHasCodePoint } from './ttfCmap';

const PASHTO_YE = 0x06d0;

export function resolveFontsDirectory(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function getFontsDirectory(): string | null {
  const candidates = [join(process.cwd(), 'assets', 'fonts'), join(__dirname, '../../../assets/fonts')];

  try {
    // Lazy-load so Node tests do not require Electron.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const electron = require('electron') as {
      app?: { getAppPath: () => string; isPackaged: boolean };
    };
    if (electron.app) {
      candidates.push(join(electron.app.getAppPath(), 'assets', 'fonts'));
      if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
        candidates.push(join(process.resourcesPath, 'fonts'));
      }
    }
  } catch {
    // Tests and Node-only callers skip Electron paths.
  }

  return resolveFontsDirectory(candidates);
}

export interface ReportFontFiles {
  latin: string | null;
  arabic: string | null;
}

export function resolveReportFontFiles(fontsDir: string | null): ReportFontFiles {
  if (!fontsDir) {
    return { latin: null, arabic: null };
  }

  const latinCandidates = ['Inter-Regular.ttf', 'Inter-Regular.otf', 'NotoSans-Regular.ttf'];
  // Full Noto Naskh Arabic (not a Fontsource subset) is required for Pashto ې.
  const arabicCandidates = [
    'NotoNaskhArabic-Regular.ttf',
    'NotoNaskhArabic-Regular.otf',
    'Vazirmatn-Regular.ttf',
    'Vazirmatn-Regular.otf',
  ];

  return {
    latin: firstExisting(fontsDir, latinCandidates),
    arabic: firstExistingArabic(fontsDir, arabicCandidates),
  };
}

function firstExisting(directory: string, names: string[]): string | null {
  for (const name of names) {
    const filePath = join(directory, name);
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}

function firstExistingArabic(directory: string, names: string[]): string | null {
  let fallback: string | null = null;
  for (const name of names) {
    const filePath = join(directory, name);
    if (!existsSync(filePath)) {
      continue;
    }
    if (!fallback) {
      fallback = filePath;
    }
    try {
      if (ttfHasCodePoint(filePath, PASHTO_YE)) {
        return filePath;
      }
    } catch {
      // Keep scanning; a readable file still beats FONT_MISSING.
    }
  }
  return fallback;
}
