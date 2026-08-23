import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fontsDir = join(root, 'assets', 'fonts');

const FILES = [
  {
    name: 'Inter-Regular.woff2',
    url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-400-normal.woff2',
  },
  {
    name: 'Vazirmatn-Regular.woff2',
    url: 'https://cdn.jsdelivr.net/fontsource/fonts/vazirmatn@5.2.5/arabic-400-normal.woff2',
  },
  {
    name: 'NotoNaskhArabic-Regular.woff2',
    url: 'https://cdn.jsdelivr.net/fontsource/fonts/noto-naskh-arabic@5.2.5/arabic-400-normal.woff2',
  },
  {
    name: 'Inter-Regular.ttf',
    url: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@5.2.5/latin-400-normal.ttf',
  },
  {
    name: 'Vazirmatn-Regular.ttf',
    url: 'https://cdn.jsdelivr.net/fontsource/fonts/vazirmatn@5.2.5/arabic-400-normal.ttf',
  },
  {
    name: 'NotoNaskhArabic-Regular.ttf',
    url: 'https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io@main/fonts/NotoNaskhArabic/full/ttf/NotoNaskhArabic-Regular.ttf',
  },
];

async function fetchFonts() {
  mkdirSync(fontsDir, { recursive: true });

  for (const file of FILES) {
    const response = await fetch(file.url);
    if (!response.ok) {
      throw new Error(`Failed to download ${file.name}: HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    if (file.name === 'NotoNaskhArabic-Regular.ttf') {
      if (buffer.length < 250_000) {
        throw new Error(`${file.name} is too small (${buffer.length} bytes); expected the full Noto Naskh Arabic TTF`);
      }
      if (!ttfHasCodePoint(buffer, 0x06d0)) {
        throw new Error(`${file.name} is missing U+06D0 (Pashto ې); refused to store a subset`);
      }
    }
    writeFileSync(join(fontsDir, file.name), buffer);
    console.log(`Wrote ${file.name} (${buffer.length} bytes)`);
  }
}

void fetchFonts().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function ttfHasCodePoint(buffer, codePoint) {
  if (buffer.length < 12) {
    return false;
  }
  const numTables = buffer.readUInt16BE(4);
  let cmapOffset = -1;
  let cmapLength = 0;
  for (let index = 0, cursor = 12; index < numTables; index += 1, cursor += 16) {
    if (cursor + 16 > buffer.length) {
      return false;
    }
    if (buffer.toString('ascii', cursor, cursor + 4) === 'cmap') {
      cmapOffset = buffer.readUInt32BE(cursor + 8);
      cmapLength = buffer.readUInt32BE(cursor + 12);
      break;
    }
  }
  if (cmapOffset < 0 || cmapOffset + 4 > buffer.length) {
    return false;
  }
  const limit = Math.min(buffer.length, cmapOffset + cmapLength);
  const numEncodings = buffer.readUInt16BE(cmapOffset + 2);
  for (let index = 0; index < numEncodings; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    if (record + 8 > limit) {
      break;
    }
    const subOffset = cmapOffset + buffer.readUInt32BE(record + 4);
    if (subOffset + 2 > limit) {
      continue;
    }
    const format = buffer.readUInt16BE(subOffset);
    if (format === 12 && format12Has(buffer, subOffset, limit, codePoint)) {
      return true;
    }
    if (format === 4 && format4Has(buffer, subOffset, limit, codePoint)) {
      return true;
    }
  }
  return false;
}

function format4Has(buffer, offset, limit, codePoint) {
  if (codePoint > 0xffff || offset + 14 > limit) {
    return false;
  }
  const end = Math.min(limit, offset + buffer.readUInt16BE(offset + 2));
  const segCount = buffer.readUInt16BE(offset + 6) / 2;
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
      return ((codePoint + buffer.readInt16BE(idDeltas + segment * 2)) & 0xffff) !== 0;
    }
    const glyphOffset = idRangeOffsets + segment * 2 + rangeOffset + (codePoint - start) * 2;
    if (glyphOffset + 2 > end) {
      return false;
    }
    const glyphId = buffer.readUInt16BE(glyphOffset);
    return glyphId !== 0 && ((glyphId + buffer.readInt16BE(idDeltas + segment * 2)) & 0xffff) !== 0;
  }
  return false;
}

function format12Has(buffer, offset, limit, codePoint) {
  if (offset + 16 > limit) {
    return false;
  }
  const end = Math.min(limit, offset + buffer.readUInt32BE(offset + 4));
  const groups = buffer.readUInt32BE(offset + 12);
  let cursor = offset + 16;
  for (let index = 0; index < groups; index += 1, cursor += 12) {
    if (cursor + 12 > end) {
      return false;
    }
    const start = buffer.readUInt32BE(cursor);
    const last = buffer.readUInt32BE(cursor + 4);
    const startGlyph = buffer.readUInt32BE(cursor + 8);
    if (codePoint >= start && codePoint <= last) {
      return startGlyph + (codePoint - start) !== 0;
    }
  }
  return false;
}
