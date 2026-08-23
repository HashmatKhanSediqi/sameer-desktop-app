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
  font?: FontkitFont;
}

interface PdfKitWithFont {
  _font?: PdfKitEmbeddedFont;
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
