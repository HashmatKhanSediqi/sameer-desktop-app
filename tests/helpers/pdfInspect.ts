import { inflateSync } from 'node:zlib';
import { readFileSync } from 'node:fs';

export interface PdfInspection {
  isPdf: boolean;
  pageCount: number;
  embedsArabicFont: boolean;
  embedsLatinFont: boolean;
  latin1: string;
  hex: string;
  extractedText: string;
  cmapChars: string;
  verticalRuleCount: number;
}

interface PdfObject {
  id: number;
  dict: string;
  streamText: string | null;
}

export function inspectPdf(filePath: string): PdfInspection {
  const bytes = readFileSync(filePath);
  const latin1 = bytes.toString('latin1');
  const objects = parsePdfObjects(bytes);
  const cmapsByObject = parseToUnicodeMaps(objects);
  const fontsById = mapFontsToCmaps(objects, cmapsByObject);
  const extractedText = extractPdfText(objects, fontsById);
  const pageCount = [...objects.values()].filter((object) => /\/Type\s*\/Page(?![sA-Za-z])/.test(object.dict)).length;
  return {
    isPdf: latin1.startsWith('%PDF-'),
    pageCount: Math.max(pageCount, (latin1.match(/\/Type\s*\/Page(?![sA-Za-z])/g) ?? []).length),
    embedsArabicFont: /ReportArabic|NotoNaskhArabic|NaskhArabic/i.test(latin1),
    embedsLatinFont: /ReportLatin|Inter-Regular/i.test(latin1),
    latin1,
    hex: bytes.toString('hex').toUpperCase(),
    extractedText,
    cmapChars: normalizeExtractedText([...cmapsByObject.values()].flatMap((cmap) => [...cmap.values()]).join('')),
    verticalRuleCount: countVerticalRules(objects),
  };
}

export function pdfContainsLatin(inspection: PdfInspection, value: string): boolean {
  return inspection.extractedText.includes(value) || inspection.latin1.includes(value);
}

export function pdfContainsCodepoints(inspection: PdfInspection, value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  if ([...value].every((character) => inspection.extractedText.includes(character))) {
    return true;
  }
  return [...value].every((character) => {
    const code = character.codePointAt(0);
    if (code === undefined) {
      return false;
    }
    return inspection.hex.includes(code.toString(16).toUpperCase().padStart(4, '0'));
  });
}

export function pdfContainsChars(inspection: PdfInspection, value: string): boolean {
  return [...value].every(
    (character) =>
      character === ' ' || inspection.extractedText.includes(character) || inspection.cmapChars.includes(character),
  );
}

function parsePdfObjects(bytes: Buffer): Map<number, PdfObject> {
  const latin1 = bytes.toString('latin1');
  const objects = new Map<number, PdfObject>();
  let pos = 0;
  while (pos < latin1.length) {
    const header = latin1.slice(pos).match(/(\d+)\s+0\s+obj\b/);
    if (!header || header.index === undefined) {
      break;
    }
    const id = Number.parseInt(header[1] ?? '', 10);
    const afterHeader = pos + header.index + header[0].length;
    const after = latin1.slice(afterHeader);
    const streamToken = after.match(/stream\r?\n/);
    const endobjAt = after.search(/\bendobj\b/);

    if (streamToken && streamToken.index !== undefined && (endobjAt < 0 || streamToken.index < endobjAt)) {
      const dict = after.slice(0, streamToken.index);
      const streamStart = afterHeader + streamToken.index + streamToken[0].length;
      const declared = dict.match(/\/Length\s+(\d+)/);
      const length = declared ? Number.parseInt(declared[1] ?? '', 10) : Number.NaN;
      let streamEnd = streamStart;
      if (Number.isFinite(length) && length >= 0 && streamStart + length <= bytes.length) {
        streamEnd = streamStart + length;
      } else {
        const end = latin1.indexOf('endstream', streamStart);
        streamEnd = end < 0 ? latin1.length : end;
      }
      const data = bytes.subarray(streamStart, Math.min(streamEnd, bytes.length));
      objects.set(id, { id, dict, streamText: decodeStream(dict, data) });
      const endobj = latin1.indexOf('endobj', streamEnd);
      pos = endobj >= 0 ? endobj + 6 : streamEnd;
      continue;
    }

    objects.set(id, {
      id,
      dict: endobjAt >= 0 ? after.slice(0, endobjAt) : after,
      streamText: null,
    });
    pos = endobjAt >= 0 ? afterHeader + endobjAt + 6 : latin1.length;
  }
  return objects;
}

function decodeStream(dict: string, data: Buffer): string | null {
  if (isFontOrImagePayload(data)) {
    return null;
  }
  const flate = /\/Filter\s*\/FlateDecode/.test(dict);
  let payload = data;
  if (flate) {
    try {
      payload = inflateSync(data);
    } catch {
      payload = data;
    }
  }
  if (isFontOrImagePayload(payload)) {
    return null;
  }
  const text = payload.toString('latin1');
  if (
    text.includes('begincmap') ||
    /\bBT\b/.test(text) ||
    /\bET\b/.test(text) ||
    /\bTj\b/.test(text) ||
    /\bTJ\b/.test(text) ||
    /\bTf\b/.test(text) ||
    /\bTm\b/.test(text)
  ) {
    return text;
  }
  return null;
}

function isFontOrImagePayload(data: Buffer): boolean {
  if (data.length < 4) {
    return false;
  }
  const tag = data.toString('ascii', 0, 4);
  if (tag === 'OTTO' || tag === 'true' || tag === 'wOFF' || tag === 'wOF2') {
    return true;
  }
  if (data.readUInt32BE(0) === 0x00010000) {
    return true;
  }
  if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) {
    return true;
  }
  return data[0] === 0xff && data[1] === 0xd8;
}

function parseToUnicodeMaps(objects: Map<number, PdfObject>): Map<number, Map<number, string>> {
  const maps = new Map<number, Map<number, string>>();
  for (const object of objects.values()) {
    const source = object.streamText ?? '';
    if (!source.includes('begincmap')) {
      continue;
    }
    const cmap = new Map<number, string>();
    parseBfChar(source, cmap);
    parseBfRange(source, cmap);
    if (cmap.size > 0) {
      maps.set(object.id, cmap);
    }
  }
  return maps;
}

function mapFontsToCmaps(
  objects: Map<number, PdfObject>,
  cmapsByObject: Map<number, Map<number, string>>,
): Map<string, Map<number, string>> {
  const fontsById = new Map<string, Map<number, string>>();
  const fontToUnicode = new Map<number, number>();

  for (const object of objects.values()) {
    if (!/\/Type\s*\/Font/.test(object.dict) && !/\/ToUnicode/.test(object.dict)) {
      continue;
    }
    const toUnicode = object.dict.match(/\/ToUnicode\s+(\d+)\s+0\s+R/)?.[1];
    if (toUnicode) {
      fontToUnicode.set(object.id, Number.parseInt(toUnicode, 10));
    }
  }

  const assign = (source: string): void => {
    const entries = source.matchAll(/\/([A-Za-z0-9._+-]+)\s+(\d+)\s+0\s+R/g);
    for (const entry of entries) {
      const fontId = entry[1];
      const objectId = Number.parseInt(entry[2] ?? '', 10);
      if (!fontId || !Number.isFinite(objectId) || fontId === 'Type' || fontId === 'ToUnicode') {
        continue;
      }
      const toUnicode = fontToUnicode.get(objectId);
      if (toUnicode === undefined) {
        continue;
      }
      const cmap = cmapsByObject.get(toUnicode);
      if (cmap) {
        fontsById.set(fontId, cmap);
      }
    }
  };

  for (const object of objects.values()) {
    const inline = object.dict.matchAll(/\/Font\s*<<([\s\S]*?)>>/g);
    for (const resource of inline) {
      assign(resource[1] ?? '');
    }
    const indirect = object.dict.match(/\/Font\s+(\d+)\s+0\s+R/);
    if (indirect) {
      const referenced = objects.get(Number.parseInt(indirect[1] ?? '', 10));
      if (referenced && !/\/Type\s*\/Font/.test(referenced.dict)) {
        assign(referenced.dict);
      }
    }
    for (const entry of object.dict.matchAll(/\/(F\d+)\s+(\d+)\s+0\s+R/g)) {
      const fontId = entry[1];
      const objectId = Number.parseInt(entry[2] ?? '', 10);
      const toUnicode = fontToUnicode.get(objectId);
      if (!fontId || toUnicode === undefined) {
        continue;
      }
      const cmap = cmapsByObject.get(toUnicode);
      if (cmap) {
        fontsById.set(fontId, cmap);
      }
    }
  }

  return fontsById;
}

function extractPdfText(objects: Map<number, PdfObject>, fontsById: Map<string, Map<number, string>>): string {
  const chunks: string[] = [];
  for (const object of objects.values()) {
    const source = object.streamText;
    if (!source || source.includes('begincmap')) {
      continue;
    }
    if (!/\bBT\b/.test(source) && !/\bTf\b/.test(source) && !/\bTJ\b/.test(source) && !/\bTj\b/.test(source)) {
      continue;
    }
    extractOperators(source, fontsById, chunks);
  }
  return normalizeExtractedText(chunks.join(''));
}

function extractOperators(
  source: string,
  fontsById: Map<string, Map<number, string>>,
  chunks: string[],
): void {
  let current = emptyCmap();
  const tokens = source.matchAll(
    /\/([A-Za-z0-9._+-]+)\s+[\d.]+\s+Tf|\[((?:[^\[\]]*<[0-9A-Fa-f\s]+>[^\[\]]*)+)\]\s*TJ|<([0-9A-Fa-f\s]+)>\s*Tj|\(((?:\\.|[^\\)])*)\)\s*Tj/g,
  );

  for (const token of tokens) {
    if (token[1]) {
      current = fontsById.get(token[1]) ?? emptyCmap();
      continue;
    }
    if (token[2] !== undefined) {
      extractHexStrings(token[2], current, chunks);
      continue;
    }
    if (token[3] !== undefined) {
      pushDecodedHex(chunks, token[3], current);
      continue;
    }
    if (token[4] !== undefined) {
      chunks.push(unescapePdfLiteral(token[4]));
    }
  }
}

function extractHexStrings(source: string, current: Map<number, string>, chunks: string[]): void {
  const hexParts = source.matchAll(/<([0-9A-Fa-f]+)>/g);
  for (const part of hexParts) {
    pushDecodedHex(chunks, part[1] ?? '', current);
  }
}

function unescapePdfLiteral(raw: string): string {
  return raw
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '')
    .replace(/\\f/g, '')
    .replace(/\\([0-7]{1,3})/g, (_match, octal: string) => String.fromCharCode(Number.parseInt(octal, 8)))
    .replace(/\\(.)/g, '$1');
}

function emptyCmap(): Map<number, string> {
  return new Map();
}

function pushDecodedHex(chunks: string[], hexSource: string, current: Map<number, string>): void {
  const hex = hexSource.replace(/\s+/g, '');
  if (hex.length === 0) {
    return;
  }
  const decoded = decodeHexWithCmap(hex, current);
  if (decoded.length > 0) {
    chunks.push(decoded);
  }
}

function parseBfChar(block: string, cmap: Map<number, string>): void {
  const sections = block.matchAll(/(\d+)\s+beginbfchar([\s\S]*?)endbfchar/g);
  for (const section of sections) {
    const pairs = section[2]?.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f\s]+)>/g);
    if (!pairs) {
      continue;
    }
    for (const pair of pairs) {
      const source = pair[1];
      const dest = pair[2];
      if (!source || !dest) {
        continue;
      }
      cmap.set(Number.parseInt(source, 16), utf16HexToString(dest));
    }
  }
}

function parseBfRange(block: string, cmap: Map<number, string>): void {
  const sections = block.matchAll(/(\d+)\s+beginbfrange([\s\S]*?)endbfrange/g);
  for (const section of sections) {
    const body = section[2] ?? '';
    const arrayRanges = body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*\[([^\]]*)\]/g);
    for (const range of arrayRanges) {
      const start = Number.parseInt(range[1] ?? '0', 16);
      const end = Number.parseInt(range[2] ?? '0', 16);
      const entries = [...(range[3] ?? '').matchAll(/<([0-9A-Fa-f\s]*)>/g)].map((item) => utf16HexToString(item[1] ?? ''));
      for (let cid = start, index = 0; cid <= end; cid += 1, index += 1) {
        const mapped = entries[index];
        if (mapped) {
          cmap.set(cid, mapped);
        }
      }
    }

    const stepRanges = body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g);
    for (const range of stepRanges) {
      const index = range.index ?? -1;
      if (isInsideBrackets(body, index)) {
        continue;
      }
      const start = Number.parseInt(range[1] ?? '0', 16);
      const end = Number.parseInt(range[2] ?? '0', 16);
      let value = Number.parseInt(range[3] ?? '0', 16);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end - start > 0xffff) {
        continue;
      }
      for (let cid = start; cid <= end; cid += 1) {
        if (value > 0 && value <= 0x10ffff) {
          cmap.set(cid, String.fromCodePoint(value));
        }
        value += 1;
      }
    }
  }
}

function isInsideBrackets(body: string, index: number): boolean {
  let depth = 0;
  for (let cursor = 0; cursor < index; cursor += 1) {
    const character = body[cursor];
    if (character === '[') {
      depth += 1;
    } else if (character === ']') {
      depth = Math.max(0, depth - 1);
    }
  }
  return depth > 0;
}

function decodeHexWithCmap(hex: string, cmap: Map<number, string>): string {
  if (cmap.size === 0) {
    return '';
  }
  const widths = hex.length % 4 === 0 ? [4, 2] : [2, 4];
  let best = '';
  let bestMapped = -1;
  for (const width of widths) {
    if (hex.length % width !== 0) {
      continue;
    }
    let output = '';
    let mapped = 0;
    for (let index = 0; index < hex.length; index += width) {
      const cid = Number.parseInt(hex.slice(index, index + width), 16);
      const value = cmap.get(cid);
      if (value) {
        output += value;
        mapped += 1;
      }
    }
    if (mapped > bestMapped) {
      best = output;
      bestMapped = mapped;
    }
  }
  return best;
}

function utf16HexToString(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  let output = '';
  for (let index = 0; index + 3 < clean.length; index += 4) {
    const code = Number.parseInt(clean.slice(index, index + 4), 16);
    if (!Number.isFinite(code) || code === 0 || code === 0xfffe || code === 0xffff) {
      continue;
    }
    if (code >= 0xd800 && code <= 0xdbff && index + 7 < clean.length) {
      const low = Number.parseInt(clean.slice(index + 4, index + 8), 16);
      if (low >= 0xdc00 && low <= 0xdfff) {
        output += String.fromCodePoint(0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00));
        index += 4;
        continue;
      }
    }
    if (code >= 0xd800 && code <= 0xdfff) {
      continue;
    }
    output += String.fromCodePoint(code);
  }
  return output;
}

function normalizeExtractedText(value: string): string {
  return value.normalize('NFKC');
}

function countVerticalRules(objects: Map<number, PdfObject>): number {
  let count = 0;
  for (const object of objects.values()) {
    if (!object.streamText || object.streamText.includes('begincmap')) {
      continue;
    }
    count += (object.streamText.match(/-?[\d.]+\s+-?[\d.]+\s+l\b/g) ?? []).length;
  }
  return count;
}
