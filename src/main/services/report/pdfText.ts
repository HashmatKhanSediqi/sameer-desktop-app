import { containsArabicScript, visualScriptRuns, wrapLogicalLines, type ScriptRun } from './rtlText';
import { installFontkitNullAnchorGuard } from './fontkitCompat';

/**
 * PDFKit layouts the whole run only when `features` is truthy.
 * Missing features → split on spaces and concatenate LTR (broken Dari/Pashto).
 * An empty array is truthy, so fontkit still applies default GSUB joining
 * (init/medi/fina/rlig) and reverses RTL glyphs once. Do not pass
 * presentation forms into this path.
 */
const WHOLE_RUN_FEATURES: PDFKit.Mixins.OpenTypeFeatures[] = [];

function textOptions(): PDFKit.Mixins.TextOptions {
  return {
    lineBreak: false,
    features: WHOLE_RUN_FEATURES,
  };
}

export interface PdfTextStyle {
  arabicFont: string;
  latinFont: string;
  size: number;
  color: string;
}

function fontForRun(run: ScriptRun, style: PdfTextStyle): string {
  return run.kind === 'arabic' || containsArabicScript(run.text) ? style.arabicFont : style.latinFont;
}

function prepareFont(doc: PDFKit.PDFDocument, font: string, size: number): void {
  doc.font(font).fontSize(size);
  installFontkitNullAnchorGuard(doc);
}

function runWidth(doc: PDFKit.PDFDocument, run: ScriptRun, style: PdfTextStyle): number {
  if (run.text.length === 0) {
    return 0;
  }
  prepareFont(doc, fontForRun(run, style), style.size);
  const width = doc.widthOfString(run.text, textOptions());
  const measured = Number.isFinite(width) && width > 0 ? width : 0;
  if (run.kind === 'arabic' || containsArabicScript(run.text)) {
    const floor = [...run.text].length * style.size * 0.5;
    return Math.max(measured, floor);
  }
  return measured;
}

export function measurePdfLine(
  doc: PDFKit.PDFDocument,
  text: string,
  style: PdfTextStyle,
  direction: 'rtl' | 'ltr',
): number {
  if (text.length === 0) {
    return 0;
  }
  return visualScriptRuns(text, direction).reduce((width, run) => width + runWidth(doc, run, style), 0);
}

export function wrapPdfCell(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  style: PdfTextStyle,
  direction: 'rtl' | 'ltr',
): string[] {
  const maxWidth = Math.max(8, Number.isFinite(width) ? width : 8);
  return wrapLogicalLines(text, (line) => measurePdfLine(doc, line, style, direction), maxWidth);
}

export function drawPdfLine(
  doc: PDFKit.PDFDocument,
  text: string,
  x: number,
  y: number,
  width: number,
  align: 'left' | 'right' | 'center',
  style: PdfTextStyle,
  direction: 'rtl' | 'ltr',
): void {
  const savedX = doc.x;
  const savedY = doc.y;
  if (text.length === 0 || !Number.isFinite(x) || !Number.isFinite(y)) {
    return;
  }

  const runs = visualScriptRuns(text, direction);
  const widths = runs.map((run) => runWidth(doc, run, style));
  const total = widths.reduce((sum, value) => sum + value, 0);
  const boxWidth = Number.isFinite(width) ? width : total;
  let cursor =
    align === 'right' ? x + Math.max(0, boxWidth - total) : align === 'center' ? x + Math.max(0, (boxWidth - total) / 2) : x;

  runs.forEach((run, index) => {
    if (!Number.isFinite(cursor) || run.text.length === 0) {
      return;
    }
    prepareFont(doc, fontForRun(run, style), style.size);
    doc.fillColor(style.color);
    doc.text(run.text, cursor, y, textOptions());
    cursor += widths[index] ?? 0;
    doc.x = savedX;
    doc.y = savedY;
  });

  doc.x = savedX;
  doc.y = savedY;
}

export function cellLineHeight(doc: PDFKit.PDFDocument, size: number): number {
  doc.fontSize(size);
  const height = doc.currentLineHeight(true);
  return Number.isFinite(height) && height > 0 ? height : size * 1.35;
}
