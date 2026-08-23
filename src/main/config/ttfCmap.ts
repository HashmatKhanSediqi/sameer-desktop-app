import { readFileSync } from 'node:fs';

/**
 * Read a TrueType/OpenType cmap well enough to answer "does this font encode
 * this Unicode scalar?" Used to reject Fontsource-style subsets that omit Pashto ې.
 */
export function ttfHasCodePoint(filePath: string, codePoint: number): boolean {
  return bufferHasCodePoint(readFileSync(filePath), codePoint);
}

export function bufferHasCodePoint(buffer: Buffer, codePoint: number): boolean {
  if (buffer.length < 12 || codePoint < 0 || codePoint > 0x10ffff) {
    return false;
  }

  const sfnt = buffer.toString('ascii', 0, 4);
  if (sfnt !== 'OTTO' && sfnt !== 'true' && sfnt !== '\u0000\u0001\u0000\u0000') {
    if (buffer.readUInt32BE(0) !== 0x00010000) {
      return false;
    }
  }

  const numTables = buffer.readUInt16BE(4);
  let cmapOffset = -1;
  let cmapLength = 0;
  let cursor = 12;
  for (let index = 0; index < numTables; index += 1) {
    if (cursor + 16 > buffer.length) {
      return false;
    }
    const tag = buffer.toString('ascii', cursor, cursor + 4);
    const offset = buffer.readUInt32BE(cursor + 8);
    const length = buffer.readUInt32BE(cursor + 12);
    if (tag === 'cmap') {
      cmapOffset = offset;
      cmapLength = length;
      break;
    }
    cursor += 16;
  }

  if (cmapOffset < 0 || cmapOffset + Math.min(4, cmapLength) > buffer.length) {
    return false;
  }

  return cmapContains(buffer, cmapOffset, cmapLength, codePoint);
}

function cmapContains(buffer: Buffer, cmapOffset: number, cmapLength: number, codePoint: number): boolean {
  const limit = Math.min(buffer.length, cmapOffset + cmapLength);
  if (cmapOffset + 4 > limit) {
    return false;
  }

  const numTables = buffer.readUInt16BE(cmapOffset + 2);
  for (let index = 0; index < numTables; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    if (record + 8 > limit) {
      break;
    }
    const subOffset = cmapOffset + buffer.readUInt32BE(record + 4);
    if (subOffset + 2 > limit) {
      continue;
    }
    const format = buffer.readUInt16BE(subOffset);
    if (format === 4 && format4Has(buffer, subOffset, limit, codePoint)) {
      return true;
    }
    if ((format === 12 || format === 13) && format12Has(buffer, subOffset, limit, codePoint, format)) {
      return true;
    }
  }
  return false;
}

function format4Has(buffer: Buffer, offset: number, limit: number, codePoint: number): boolean {
  if (codePoint > 0xffff || offset + 14 > limit) {
    return false;
  }
  const length = buffer.readUInt16BE(offset + 2);
  const end = Math.min(limit, offset + length);
  const segCount = buffer.readUInt16BE(offset + 6) / 2;
  if (!Number.isInteger(segCount) || segCount <= 0) {
    return false;
  }
  const endCodes = offset + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  if (idRangeOffsets + segCount * 2 > end) {
    return false;
  }

  for (let segment = 0; segment < segCount; segment += 1) {
    const start = buffer.readUInt16BE(startCodes + segment * 2);
    const last = buffer.readUInt16BE(endCodes + segment * 2);
    if (codePoint < start || codePoint > last) {
      continue;
    }
    const rangeOffset = buffer.readUInt16BE(idRangeOffsets + segment * 2);
    if (rangeOffset === 0) {
      const delta = buffer.readInt16BE(idDeltas + segment * 2);
      return ((codePoint + delta) & 0xffff) !== 0;
    }
    const glyphOffset = idRangeOffsets + segment * 2 + rangeOffset + (codePoint - start) * 2;
    if (glyphOffset + 2 > end) {
      return false;
    }
    const glyphId = buffer.readUInt16BE(glyphOffset);
    if (glyphId === 0) {
      return false;
    }
    return ((glyphId + buffer.readInt16BE(idDeltas + segment * 2)) & 0xffff) !== 0;
  }
  return false;
}

function format12Has(
  buffer: Buffer,
  offset: number,
  limit: number,
  codePoint: number,
  format: number,
): boolean {
  if (offset + 16 > limit) {
    return false;
  }
  const length = buffer.readUInt32BE(offset + 4);
  const end = Math.min(limit, offset + length);
  const groups = buffer.readUInt32BE(offset + 12);
  let cursor = offset + 16;
  for (let index = 0; index < groups; index += 1) {
    if (cursor + 12 > end) {
      return false;
    }
    const start = buffer.readUInt32BE(cursor);
    const last = buffer.readUInt32BE(cursor + 4);
    const startGlyph = buffer.readUInt32BE(cursor + 8);
    if (codePoint >= start && codePoint <= last) {
      if (format === 13) {
        return startGlyph !== 0;
      }
      return startGlyph + (codePoint - start) !== 0;
    }
    cursor += 12;
  }
  return false;
}
