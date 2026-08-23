/**
 * fontkit 2.0.4 GPOSProcessor.getAnchor() does `anchor.xCoordinate` with no
 * null check. OpenType MarkToBase / MarkToLigature / MarkToMark explicitly
 * allow a NULL offset ("this base has no anchor for that mark class").
 *
 * Noto Naskh Arabic uses those sparse arrays. Applying GPOS `mark` / `mkmk`
 * — or any other feature that shares those lookups — throws
 * "Cannot read properties of null (reading 'xCoordinate')" during
 * PDFKit widthOfString()/text(). ReportsService maps that to REPORT_WRITE_FAILED.
 *
 * Patch applyAnchor on PDFKit's own fontkit GPOSProcessor (accessed through
 * the embedded font, not a second fontkit copy) so a missing anchor means
 * "do not attach", which is what HarfBuzz does. Joining GSUB stays on.
 */

interface FontkitAnchor {
  xCoordinate: number;
  yCoordinate: number;
}

interface FontkitMarkRecord {
  markAnchor: FontkitAnchor;
}

interface FontkitGposProcessor {
  applyAnchor: (this: unknown, markRecord: unknown, baseAnchor: unknown, baseGlyphIndex: number) => void;
  __nullAnchorPatched?: boolean;
}

interface FontkitFont {
  hasGlyphForCodePoint?: (codePoint: number) => boolean;
  _layoutEngine?: {
    engine?: {
      GPOSProcessor?: FontkitGposProcessor;
    };
  };
}

interface PdfKitEmbeddedFont {
  encode: (text: string, features?: PDFKit.Mixins.OpenTypeFeatures[]) => [string[], unknown[]];
  unicode: number[][];
  font?: FontkitFont;
}

interface PdfKitWithFont {
  _font?: PdfKitEmbeddedFont;
}

/**
 * PDFKit records the first code point for each subset glyph ID in ToUnicode.
 * Alef (U+0627) often claims the same glyph ID before Alef Madda (U+0622),
 * so composed letters disappear from text extraction. Register the logical code
 * points explicitly after layout so both remain extractable.
 */
export function registerExtractableGlyph(
  doc: PDFKit.PDFDocument,
  text: string,
  features: PDFKit.Mixins.OpenTypeFeatures[] = [],
  logicalCharacter: string = text,
): void {
  if (text.length === 0) {
    return;
  }
  const font = getEmbeddedFont(doc);
  if (!font) {
    return;
  }
  const codePoint = logicalCharacter.codePointAt(0);
  if (codePoint === undefined) {
    return;
  }
  const [hexCodes] = font.encode(text, features);
  for (const hex of hexCodes) {
    const gid = Number.parseInt(hex, 16);
    if (!Number.isFinite(gid)) {
      continue;
    }
    mergeExtractableCodePoint(font, gid, codePoint);
  }
}

export function registerExtractableText(
  doc: PDFKit.PDFDocument,
  text: string,
  features: PDFKit.Mixins.OpenTypeFeatures[] = [],
): void {
  for (const character of text) {
    registerExtractableGlyph(doc, character, features);
  }
}

function mergeExtractableCodePoint(font: PdfKitEmbeddedFont, gid: number, codePoint: number): void {
  const existing = font.unicode[gid];
  if (existing == null) {
    font.unicode[gid] = [codePoint];
    return;
  }
  if (!existing.includes(codePoint)) {
    font.unicode[gid] = [...existing, codePoint];
  }
}

function getEmbeddedFont(doc: PDFKit.PDFDocument): PdfKitEmbeddedFont | undefined {
  return (doc as PdfKitWithFont)._font;
}

export function installFontkitNullAnchorGuard(doc: PDFKit.PDFDocument): void {
  const processor = getGposProcessor(doc);
  if (!processor) {
    return;
  }

  const proto = Object.getPrototypeOf(processor) as FontkitGposProcessor | null;
  if (!proto || proto.__nullAnchorPatched) {
    return;
  }

  const originalApplyAnchor = proto.applyAnchor;
  proto.applyAnchor = function applyAnchorSafe(markRecord, baseAnchor, baseGlyphIndex) {
    if (!isAnchor(baseAnchor) || !isMarkRecord(markRecord)) {
      return;
    }
    return originalApplyAnchor.call(this, markRecord, baseAnchor, baseGlyphIndex);
  };
  proto.__nullAnchorPatched = true;
}

function getGposProcessor(doc: PDFKit.PDFDocument): FontkitGposProcessor | undefined {
  const font = (doc as PdfKitWithFont)._font?.font;
  return font?._layoutEngine?.engine?.GPOSProcessor;
}

function isAnchor(value: unknown): value is FontkitAnchor {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const anchor = value as { xCoordinate?: unknown; yCoordinate?: unknown };
  return typeof anchor.xCoordinate === 'number' && typeof anchor.yCoordinate === 'number';
}

function isMarkRecord(value: unknown): value is FontkitMarkRecord {
  return typeof value === 'object' && value !== null && isAnchor((value as { markAnchor?: unknown }).markAnchor);
}
