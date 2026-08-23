import bidiFactory from 'bidi-js';
import reshaper from 'arabic-persian-reshaper';
import type { SupportedLocale } from '@shared/types/locale';

const bidi = bidiFactory();

const ARABIC_SCRIPT = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const PRESENTATION_FORMS = /[\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_ATOM = /[A-Za-z0-9]/;
const LTR_GLUE = /[-:./\\_+#]/;
const LTR_ISLAND =
  /\d{4}-\d{2}-\d{2}|\d{1,2}:\d{2}(?::\d{2})?|\b(?:AFN|USD|EUR)\b|\b[A-Za-z][A-Za-z0-9]*-\d+\b|\b[A-Za-z]{2,}\b|\d+(?:[.,]\d+)?/g;

/**
 * Extra Pashto / Dari letters that arabic-persian-reshaper leaves untouched.
 * Isolated / initial / medial / final presentation forms.
 */
const EXTRA_LETTER_FORMS: Record<number, [number, number | null, number | null, number | null]> = {
  0x06d0: [0xfbe4, 0xfbe6, 0xfbe7, 0xfbe5],
  0x06cd: [0x06cd, null, null, 0x06cd],
};

export type ScriptKind = 'arabic' | 'ltr';

export interface ScriptRun {
  text: string;
  kind: ScriptKind;
}

export function containsArabicScript(value: string): boolean {
  return ARABIC_SCRIPT.test(value);
}

export function containsPresentationForms(value: string): boolean {
  return PRESENTATION_FORMS.test(value);
}

function classifyChar(character: string): ScriptKind | 'neutral' {
  if (ARABIC_SCRIPT.test(character) || PRESENTATION_FORMS.test(character)) {
    return 'arabic';
  }
  if (LTR_ATOM.test(character) || LTR_GLUE.test(character)) {
    return 'ltr';
  }
  return 'neutral';
}

function isStrongKind(kind: ScriptKind | 'neutral' | undefined): kind is ScriptKind {
  return kind === 'arabic' || kind === 'ltr';
}

export function segmentScriptRuns(text: string): ScriptRun[] {
  if (text.length === 0) {
    return [];
  }

  const characters = [...text];
  const raw = characters.map(classifyChar);
  const resolved: ScriptKind[] = [];
  let lastStrong: ScriptKind | null = null;

  for (let index = 0; index < raw.length; index += 1) {
    const kind = raw[index];
    if (isStrongKind(kind)) {
      lastStrong = kind;
      resolved.push(kind);
      continue;
    }

    let nextStrong: ScriptKind | null = null;
    for (let look = index + 1; look < raw.length; look += 1) {
      const candidate = raw[look];
      if (isStrongKind(candidate)) {
        nextStrong = candidate;
        break;
      }
    }
    resolved.push(lastStrong ?? nextStrong ?? 'ltr');
  }

  const runs: ScriptRun[] = [];
  let start = 0;
  for (let index = 1; index <= characters.length; index += 1) {
    if (index === characters.length || resolved[index] !== resolved[start]) {
      runs.push({
        text: characters.slice(start, index).join(''),
        kind: resolved[start] ?? 'ltr',
      });
      start = index;
    }
  }
  return runs;
}

function shapeArabicRun(text: string, locale: SupportedLocale): string {
  const shaper = locale === 'ps' ? reshaper.ArabicShaper : reshaper.PersianShaper;
  const converted = shaper.convertArabic(text);
  const base = converted.length > 0 ? converted : text;
  return applyExtraJoining(base);
}

function applyExtraJoining(text: string): string {
  const codes = [...text].map((character) => character.codePointAt(0) ?? 0);
  if (!codes.some((code) => EXTRA_LETTER_FORMS[code] !== undefined)) {
    return text;
  }

  let output = '';
  for (let index = 0; index < codes.length; index += 1) {
    const current = codes[index];
    if (current === undefined) {
      continue;
    }
    const forms = EXTRA_LETTER_FORMS[current];
    if (!forms) {
      output += String.fromCodePoint(current);
      continue;
    }

    const prev = index > 0 ? codes[index - 1] : undefined;
    const next = codes[index + 1];
    const prevJoins = prev !== undefined && canJoinForward(prev);
    const nextJoins = next !== undefined && canJoinBackward(next);
    const [isolated, initial, medial, final] = forms;
    if (prevJoins && nextJoins && medial !== null) {
      output += String.fromCodePoint(medial);
    } else if (prevJoins && final !== null) {
      output += String.fromCodePoint(final);
    } else if (nextJoins && initial !== null) {
      output += String.fromCodePoint(initial);
    } else {
      output += String.fromCodePoint(isolated);
    }
  }
  return output;
}

function canJoinForward(code: number): boolean {
  if (EXTRA_LETTER_FORMS[code]?.[1] != null || EXTRA_LETTER_FORMS[code]?.[2] != null) {
    return true;
  }
  return ARABIC_SCRIPT.test(String.fromCodePoint(code)) && !isNonJoiningArabic(code);
}

function canJoinBackward(code: number): boolean {
  if (EXTRA_LETTER_FORMS[code] !== undefined) {
    return true;
  }
  return ARABIC_SCRIPT.test(String.fromCodePoint(code));
}

function isNonJoiningArabic(code: number): boolean {
  return (
    code === 0x0621 ||
    code === 0x0622 ||
    code === 0x0623 ||
    code === 0x0625 ||
    code === 0x0627 ||
    code === 0x062f ||
    code === 0x0630 ||
    code === 0x0631 ||
    code === 0x0632 ||
    code === 0x0648 ||
    code === 0x0698
  );
}

export function shapeRtlText(text: string, locale: SupportedLocale): string {
  if (text.length === 0 || !containsArabicScript(text)) {
    return text;
  }

  return segmentScriptRuns(text)
    .map((run) => (run.kind === 'arabic' ? shapeArabicRun(run.text, locale) : run.text))
    .join('');
}

function reorderByLevels<T>(items: T[], levels: Array<number | undefined>): T[] {
  const chars = items.slice();
  const resolved = chars.map((_, index) => levels[index] ?? 0);
  const maxLevel = resolved.reduce((highest, level) => Math.max(highest, level), 0);

  for (let level = maxLevel; level >= 1; level -= 1) {
    let index = 0;
    while (index < chars.length) {
      if ((resolved[index] ?? 0) < level) {
        index += 1;
        continue;
      }
      let end = index;
      while (end + 1 < chars.length && (resolved[end + 1] ?? 0) >= level) {
        end += 1;
      }
      const slice = chars.slice(index, end + 1).reverse();
      chars.splice(index, end - index + 1, ...slice);
      const levelSlice = resolved.slice(index, end + 1).reverse();
      resolved.splice(index, end - index + 1, ...levelSlice);
      index = end + 1;
    }
  }

  return chars;
}

function toVisualCharacters(text: string, direction: 'rtl' | 'ltr'): string {
  if (text.length === 0) {
    return text;
  }

  const embeddingLevels = bidi.getEmbeddingLevels(text, direction);
  const characters = [...text];

  for (let index = 0; index < characters.length; index += 1) {
    const current = characters[index];
    const level = embeddingLevels.levels[index];
    if (!current || level === undefined || level % 2 !== 1) {
      continue;
    }
    const mirrored = bidi.getMirroredCharacter(current);
    if (mirrored) {
      characters[index] = mirrored;
    }
  }

  const flips = bidi.getReorderSegments(text, embeddingLevels);
  for (const range of flips) {
    const start = range[0];
    const end = range[1];
    if (start === undefined || end === undefined) {
      continue;
    }
    const slice = characters.slice(start, end + 1).reverse();
    characters.splice(start, end - start + 1, ...slice);
  }

  return characters.join('');
}

export function isolateLtr(value: string): string {
  if (value.length === 0) {
    return value;
  }
  return `\u2066${value}\u2069`;
}

export function isolateLtrIfRtl(value: string, rtl: boolean): string {
  return rtl ? isolateLtr(value) : value;
}

/**
 * Keep dates, times, currency codes, identifiers, Latin words, and numbers as LTR islands
 * so the bidi algorithm cannot reverse 2026-08-22 into 22-08-2026.
 */
export function protectLtrIslands(text: string): string {
  return text.replace(LTR_ISLAND, (match) => isolateLtr(match));
}

/**
 * Convert logical Unicode into a visual-order string for inspection.
 * PDF drawing does not use this string — it sends logical runs to fontkit.
 */
export function toVisualPdfText(text: string, locale: SupportedLocale, direction: 'rtl' | 'ltr'): string {
  if (text.length === 0) {
    return text;
  }

  if (direction === 'ltr' && !containsArabicScript(text)) {
    return text;
  }

  const shaped = shapeRtlText(protectLtrIslands(text), locale);
  return toVisualCharacters(shaped, direction);
}

export function visualScriptRuns(text: string, direction: 'rtl' | 'ltr'): ScriptRun[] {
  const protectedText = protectLtrIslands(text);
  const runs = segmentScriptRuns(protectedText).map((run) => ({
    text: run.text.replace(/\u2066|\u2069/g, ''),
    kind: run.kind,
  })).filter((run) => run.text.length > 0);

  if (runs.length <= 1) {
    return runs.length === 1 ? runs : segmentScriptRuns(text);
  }

  const embeddingLevels = bidi.getEmbeddingLevels(protectedText, direction);
  let offset = 0;
  const items = segmentScriptRuns(protectedText).map((run) => {
    const start = offset;
    offset += [...run.text].length;
    return {
      run: {
        text: run.text.replace(/\u2066|\u2069/g, ''),
        kind: run.kind,
      },
      level: embeddingLevels.levels[start] ?? (direction === 'rtl' ? 1 : 0),
    };
  }).filter((item) => item.run.text.length > 0);

  return reorderByLevels(
    items,
    items.map((item) => item.level),
  ).map((item) => item.run);
}

export function wrapLogicalLines(
  text: string,
  measure: (logicalLine: string) => number,
  maxWidth: number,
): string[] {
  const paragraphs = text.replace(/\r\n/g, '\n').split('\n');
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length === 0) {
      lines.push('');
      continue;
    }

    const tokens = paragraph.split(/(\s+)/);
    let current = '';
    for (const token of tokens) {
      const trial = current + token;
      if (current.length > 0 && measure(trial) > maxWidth) {
        lines.push(trimLineEnd(current));
        current = token.replace(/^\s+/, '');
        if (current.length > 0 && measure(current) > maxWidth) {
          const pieces = hardWrapToken(current, measure, maxWidth);
          lines.push(...pieces.slice(0, -1));
          current = pieces[pieces.length - 1] ?? '';
        }
      } else {
        current = trial;
      }
    }
    if (current.length > 0) {
      lines.push(trimLineEnd(current));
    }
  }

  return lines.length > 0 ? lines : [''];
}

function trimLineEnd(value: string): string {
  return value.replace(/\s+$/, '');
}

function hardWrapToken(token: string, measure: (value: string) => number, maxWidth: number): string[] {
  const characters = [...token];
  const pieces: string[] = [];
  let current = '';

  for (const character of characters) {
    const trial = current + character;
    if (current.length > 0 && measure(trial) > maxWidth) {
      pieces.push(current);
      current = character;
    } else {
      current = trial;
    }
  }
  if (current.length > 0) {
    pieces.push(current);
  }
  return pieces.length > 0 ? pieces : [token];
}

export function naiveReverse(value: string): string {
  return [...value].reverse().join('');
}
