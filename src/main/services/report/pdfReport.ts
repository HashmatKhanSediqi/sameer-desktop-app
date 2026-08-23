import { createWriteStream, existsSync, mkdirSync, statSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import PDFDocument from 'pdfkit';
import { AppError } from '../../utils/errors';
import { formatDateForLocale, formatMoneyForLocale } from '@shared/localeFormat';
import type { ReportModel, ReportTransactionRow } from '@shared/types/report';
import { resolveReportFontFiles } from '../../config/fontsPath';
import { installFontkitNullAnchorGuard, registerExtractableGlyph, registerExtractableText } from './fontkitCompat';
import { containsArabicScript, shapeRtlText } from './rtlText';
import { normalizeLocale } from '@shared/types/locale';
import { cellLineHeight, drawPdfLine, wrapPdfCell, type PdfTextStyle } from './pdfText';

const CASH_IN = '#16A34A';
const CASH_OUT = '#DC2626';
const HEADER = '#0F172A';
const MUTED = '#64748B';
const BORDER = '#94A3B8';
const HEADER_FILL = '#F1F5F9';
const ZEBRA = '#F8FAFC';
const SECTION_FILL = '#E2E8F0';
const MARGIN = 40;
const FONT_SIZE = 9;
const HEADING_SIZE = 11;
const CELL_PAD = 5;
const LINE_WIDTH = 0.6;

interface PdfColumn {
  key: string;
  header: string;
  width: number;
  align: 'left' | 'right';
  ltr?: boolean;
}

export interface PdfReportOutline {
  title: string;
  appName: string;
  language: string;
  period: string;
  generatedAt: string;
  customerFields: Array<{ field: string; value: string }>;
  currencies: Array<{
    currencyCode: string;
    cashInTotal: string;
    cashOutTotal: string;
    balance: string;
    transactionCount: number;
  }>;
  transactionColumns: string[];
  transactions: Array<{
    date: string;
    time: string;
    type: string;
    currencyCode: string;
    amount: string;
    note: string;
  }>;
  totals: Array<{ field: string; value: string }>;
}

export function describePdfReport(model: ReportModel): PdfReportOutline {
  return {
    title: model.title,
    appName: model.appName,
    language: model.languageLabel,
    period: model.dateRangeLabel ?? model.labels.allPeriods,
    generatedAt: model.generatedAt,
    customerFields: model.customer
      ? [
          { field: model.labels.customer, value: model.customer.name },
          { field: model.labels.number, value: model.customer.customerNumber },
          ...(model.customer.displayCreatedAt
            ? [{ field: model.labels.createdAt, value: model.customer.displayCreatedAt }]
            : []),
          ...(model.customer.displayUpdatedAt
            ? [{ field: model.labels.updatedAt, value: model.customer.displayUpdatedAt }]
            : []),
        ]
      : [],
    currencies: model.currencySummaries.map((summary) => ({
      currencyCode: summary.currencyCode,
      cashInTotal: summary.cashInTotal,
      cashOutTotal: summary.cashOutTotal,
      balance: summary.balance,
      transactionCount: summary.transactionCount,
    })),
    transactionColumns: [
      model.labels.date,
      model.labels.time,
      model.labels.type,
      model.labels.currency,
      model.labels.amount,
      model.labels.note,
    ],
    transactions: model.transactions.map((row) => ({
      date: formatDateForLocale(row.transactionDate, model.language),
      time: row.displayTime,
      type: row.typeLabel,
      currencyCode: row.currencyCode,
      amount: row.amount,
      note: row.note,
    })),
    totals: [
      ...model.currencySummaries.map((summary) => ({
        field: summary.currencyCode,
        value: summary.balance,
      })),
      { field: model.labels.transactionCount, value: String(model.transactionCount) },
    ],
  };
}

export async function renderPdfReport(model: ReportModel, filePath: string, fontsDir: string | null): Promise<void> {
  const rtl = model.direction === 'rtl';
  const needsArabic = rtl || reportHasArabic(model);
  const fonts = resolveReportFontFiles(fontsDir);

  if (needsArabic && !fonts.arabic) {
    throw new AppError('FONT_MISSING', 'FONT_MISSING');
  }

  const landscape = model.type === 'all_customers' || model.type === 'transactions' || model.type === 'date_range';
  mkdirSync(dirname(filePath), { recursive: true });

  const doc = new PDFDocument({
    size: 'A4',
    layout: landscape ? 'landscape' : 'portrait',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    compress: false,
    info: {
      Title: model.title,
      Author: model.appName,
    },
  });

  const latinFont = fonts.latin ? 'ReportLatin' : 'Helvetica';
  const arabicFont = fonts.arabic ? 'ReportArabic' : latinFont;
  if (fonts.latin) {
    doc.registerFont('ReportLatin', fonts.latin);
    doc.font('ReportLatin');
    installFontkitNullAnchorGuard(doc);
  }
  if (fonts.arabic) {
    doc.registerFont('ReportArabic', fonts.arabic);
    doc.font('ReportArabic');
    installFontkitNullAnchorGuard(doc);
    embedExtractableArabic(doc, arabicFont, model);
  }

  const stream = createWriteStream(filePath);
  const output = attachPdfOutput(doc, stream);
  doc.pipe(stream);

  const contentWidth = doc.page.width - MARGIN * 2;
  let tableHeaders: PdfColumn[] | null = null;
  let pageIndex = 1;
  let breakingPage = false;

  const styleFor = (text: string, size: number, color: string): PdfTextStyle => ({
    arabicFont: containsArabicScript(text) || rtl ? arabicFont : latinFont,
    latinFont,
    size,
    color,
  });

  const cellDirection = (column: PdfColumn): 'rtl' | 'ltr' => {
    if (column.ltr) {
      return 'ltr';
    }
    return rtl ? 'rtl' : 'ltr';
  };

  const cellAlign = (column: PdfColumn): 'left' | 'right' => {
    if (column.align === 'right') {
      return 'right';
    }
    return rtl ? 'right' : 'left';
  };

  const pageBottom = (): number => doc.page.height - MARGIN - 16;

  const drawFooter = (): void => {
    const y = doc.page.height - MARGIN + 8;
    const generatedStyle = styleFor(model.generatedAt, 8, MUTED);
    drawPdfLine(
      doc,
      model.generatedAt,
      MARGIN,
      y,
      contentWidth / 2,
      rtl ? 'right' : 'left',
      generatedStyle,
      rtl ? 'rtl' : 'ltr',
    );
    drawPdfLine(doc, String(pageIndex), MARGIN + contentWidth / 2, y, contentWidth / 2, rtl ? 'left' : 'right', {
      arabicFont: latinFont,
      latinFont,
      size: 8,
      color: MUTED,
    }, 'ltr');
  };

  const remainingSpace = (): number => pageBottom() - doc.y;

  const startNewPage = (): void => {
    if (breakingPage) {
      return;
    }
    breakingPage = true;
    const continuingHeaders = tableHeaders;
    tableHeaders = null;
    try {
      drawFooter();
      doc.addPage();
      pageIndex += 1;
      drawTitleTable(true);
      tableHeaders = continuingHeaders;
      if (tableHeaders) {
        paintHeaderRow(tableHeaders);
      }
    } finally {
      breakingPage = false;
    }
  };

  const ensureSpace = (needed: number): void => {
    if (breakingPage || needed <= remainingSpace()) {
      return;
    }
    startNewPage();
  };

  const drawCellText = (
    value: string,
    x: number,
    y: number,
    column: PdfColumn,
    size: number,
    color: string,
    lines: string[],
    lineHeight: number,
    clipHeight: number,
  ): void => {
    const style = styleFor(value, size, color);
    const direction = containsArabicScript(value) ? (rtl ? 'rtl' : 'ltr') : cellDirection(column);
    const align = cellAlign(column);
    if (!Number.isFinite(x) || !Number.isFinite(y) || column.width <= 0 || clipHeight <= 0) {
      return;
    }
    const safeHeight = Math.max(1, Math.min(clipHeight, Math.max(1, pageBottom() - y)));
    doc.save();
    doc.rect(x, y, column.width, safeHeight).clip();
    lines.forEach((line, index) => {
      drawPdfLine(
        doc,
        line,
        x + CELL_PAD,
        y + CELL_PAD + index * lineHeight,
        column.width - CELL_PAD * 2,
        align,
        style,
        direction,
      );
    });
    doc.restore();
  };

  const wrapCell = (value: string, column: PdfColumn, size: number): string[] => {
    const style = styleFor(value, size, HEADER);
    const direction = containsArabicScript(value) ? (rtl ? 'rtl' : 'ltr') : cellDirection(column);
    return wrapPdfCell(doc, value, column.width - CELL_PAD * 2, style, direction);
  };

  const lineHeightFor = (size: number): number => {
    doc.font(rtl ? arabicFont : latinFont).fontSize(size);
    return cellLineHeight(doc, size);
  };

  const measureWrapped = (columns: PdfColumn[], row: Record<string, string>, size: number): { height: number; lines: Record<string, string[]>; lineHeight: number } => {
    const lineHeight = lineHeightFor(size);
    const lines: Record<string, string[]> = {};
    let maxLines = 1;
    for (const column of columns) {
      const value = row[column.key] ?? '';
      const wrapped = wrapCell(value, column, size);
      lines[column.key] = wrapped;
      maxLines = Math.max(maxLines, wrapped.length);
    }
    return {
      height: Math.max(18, maxLines * lineHeight + CELL_PAD * 2),
      lines,
      lineHeight,
    };
  };

  const strokeRowBorders = (y: number, height: number, columns: PdfColumn[]): void => {
    if (!Number.isFinite(y) || !Number.isFinite(height) || height <= 0) {
      return;
    }
    doc.save();
    doc.lineWidth(LINE_WIDTH).strokeColor(BORDER);
    doc.rect(MARGIN, y, contentWidth, height).stroke();
    let x = MARGIN;
    for (let index = 0; index < columns.length - 1; index += 1) {
      x += columns[index]?.width ?? 0;
      doc.moveTo(x, y).lineTo(x, y + height).stroke();
    }
    doc.restore();
  };

  const fillRow = (y: number, height: number, fill?: string): void => {
    if (!fill) {
      return;
    }
    doc.save();
    doc.rect(MARGIN, y, contentWidth, height).fill(fill);
    doc.restore();
  };

  const drawTitleTable = (compact: boolean): void => {
    const rows: Array<[string, string]> = compact
      ? [
          [model.appName, model.title],
          ...(model.customer ? [[model.labels.customer, model.customer.name] as [string, string]] : []),
        ]
      : [
          [model.appName, model.title],
          [model.generatedAtLabel, model.generatedAt],
          [model.labels.language, model.languageLabel],
          [model.labels.period, model.dateRangeLabel ?? model.labels.allPeriods],
        ];

    const labelWidth = Math.round(contentWidth * 0.32);
    const columns = directedColumns(
      [
        { key: 'field', header: model.labels.field, width: labelWidth, align: rtl ? 'right' : 'left' },
        { key: 'value', header: model.labels.value, width: contentWidth - labelWidth, align: rtl ? 'right' : 'left' },
      ],
      rtl,
      contentWidth,
    );

    if (!compact) {
      drawSectionBar(model.appName);
    }
    drawTable(
      columns,
      rows.map(([field, value]) => ({ field, value })),
    );
    doc.y += compact ? 6 : 10;
  };

  const drawSectionBar = (title: string): void => {
    ensureSpace(24);
    const y = doc.y;
    doc.rect(MARGIN, y, contentWidth, 20).fill(SECTION_FILL);
    drawPdfLine(
      doc,
      title,
      MARGIN + 6,
      y + 4,
      contentWidth - 12,
      rtl ? 'right' : 'left',
      styleFor(title, HEADING_SIZE, HEADER),
      rtl ? 'rtl' : 'ltr',
    );
    doc.rect(MARGIN, y, contentWidth, 20).lineWidth(LINE_WIDTH).stroke(BORDER);
    doc.y = y + 22;
  };

  const drawHeaderRow = (columns: PdfColumn[]): void => {
    const headerRow: Record<string, string> = {};
    for (const column of columns) {
      headerRow[column.key] = column.header;
    }
    const measured = measureWrapped(columns, headerRow, 8);
    if (!breakingPage && measured.height > remainingSpace()) {
      startNewPage();
      return;
    }
    paintHeaderRow(columns, measured);
  };

  const paintHeaderRow = (
    columns: PdfColumn[],
    measured?: { height: number; lines: Record<string, string[]>; lineHeight: number },
  ): void => {
    const headerRow: Record<string, string> = {};
    for (const column of columns) {
      headerRow[column.key] = column.header;
    }
    const layout = measured ?? measureWrapped(columns, headerRow, 8);
    const y = doc.y;
    fillRow(y, layout.height, HEADER_FILL);
    let x = MARGIN;
    for (const column of columns) {
      drawCellText(column.header, x, y, column, 8, MUTED, layout.lines[column.key] ?? [column.header], layout.lineHeight, layout.height);
      x += column.width;
    }
    strokeRowBorders(y, layout.height, columns);
    doc.y = y + layout.height;
  };

  const drawRowSlice = (
    columns: PdfColumn[],
    row: Record<string, string>,
    slice: Record<string, string[]>,
    zebra: boolean,
    colorFor?: (key: string, row: Record<string, string>) => string | undefined,
  ): void => {
    const lineHeight = lineHeightFor(FONT_SIZE);
    let maxLines = 1;
    for (const column of columns) {
      maxLines = Math.max(maxLines, slice[column.key]?.length ?? 1);
    }
    const height = Math.max(18, maxLines * lineHeight + CELL_PAD * 2);
    const y = doc.y;
    fillRow(y, height, zebra ? ZEBRA : undefined);
    let x = MARGIN;
    for (const column of columns) {
      const value = row[column.key] ?? '';
      drawCellText(
        value,
        x,
        y,
        column,
        FONT_SIZE,
        colorFor?.(column.key, row) ?? HEADER,
        slice[column.key] ?? [''],
        lineHeight,
        height,
      );
      x += column.width;
    }
    strokeRowBorders(y, height, columns);
    doc.y = y + height;
  };

  const drawDataRow = (
    columns: PdfColumn[],
    row: Record<string, string>,
    zebra: boolean,
    colorFor?: (key: string, row: Record<string, string>) => string | undefined,
  ): void => {
    const measured = measureWrapped(columns, row, FONT_SIZE);
    const lineHeight = measured.lineHeight > 0 && Number.isFinite(measured.lineHeight) ? measured.lineHeight : FONT_SIZE * 1.35;
    const minRow = Math.max(18, lineHeight + CELL_PAD * 2);

    if (measured.height <= remainingSpace()) {
      drawRowSlice(columns, row, measured.lines, zebra, colorFor);
      return;
    }

    if (measured.height <= pageBottom() - (MARGIN + 70)) {
      startNewPage();
      if (measured.height <= remainingSpace()) {
        drawRowSlice(columns, row, measured.lines, zebra, colorFor);
        return;
      }
    }

    const remaining: Record<string, string[]> = {};
    for (const column of columns) {
      remaining[column.key] = (measured.lines[column.key] ?? ['']).slice();
    }

    let firstChunk = true;
    while (columns.some((column) => (remaining[column.key]?.length ?? 0) > 0)) {
      if (!firstChunk || remainingSpace() < minRow) {
        startNewPage();
      }
      firstChunk = false;
      const usable = Math.max(lineHeight, remainingSpace() - CELL_PAD * 2);
      const chunkCapacity = Math.max(1, Math.floor(usable / lineHeight));
      const slice: Record<string, string[]> = {};
      for (const column of columns) {
        const leftover = remaining[column.key] ?? [];
        const taken = leftover.slice(0, chunkCapacity);
        slice[column.key] = taken.length > 0 ? taken : leftover.length > 0 ? leftover.slice(0, 1) : [''];
        remaining[column.key] = leftover.slice(slice[column.key]?.length ?? 0);
      }
      drawRowSlice(columns, row, slice, zebra, colorFor);
    }
  };

  const drawTable = (
    columns: PdfColumn[],
    rows: Array<Record<string, string>>,
    colorFor?: (key: string, row: Record<string, string>) => string | undefined,
  ): void => {
    ensureSpace(28);
    tableHeaders = columns;
    drawHeaderRow(columns);
    rows.forEach((row, index) => {
      drawDataRow(columns, row, index % 2 === 1, colorFor);
    });
    tableHeaders = null;
    doc.y += 8;
  };

  const drawCompanyHeader = (): void => {
    const company = model.company;
    if (!company) {
      return;
    }

    const lines = [
      company.name,
      company.phone ? `${model.labels.companyPhone}: ${company.phone}` : '',
      company.email ? `${model.labels.companyEmail}: ${company.email}` : '',
      company.address ? `${model.labels.companyAddress}: ${company.address}` : '',
      company.website ? `${model.labels.companyWebsite}: ${company.website}` : '',
    ].filter((line) => line.length > 0);

    const logoSize = company.logoPath && existsSync(company.logoPath) ? 52 : 0;
    const textX = MARGIN + (logoSize > 0 ? logoSize + 12 : 0);
    const textWidth = contentWidth - (logoSize > 0 ? logoSize + 12 : 0);
    const lineHeight = 13;
    const blockHeight = Math.max(logoSize, lines.length * lineHeight + 4);

    ensureSpace(blockHeight + 10);
    const y = doc.y;
    if (logoSize > 0 && company.logoPath) {
      try {
        doc.image(company.logoPath, rtl ? MARGIN + contentWidth - logoSize : MARGIN, y, {
          fit: [logoSize, logoSize],
        });
      } catch {
        // Keep the report if the logo file cannot be painted.
      }
    }

    lines.forEach((line, index) => {
      drawPdfLine(
        doc,
        line,
        rtl ? MARGIN : textX,
        y + index * lineHeight,
        textWidth,
        rtl ? 'right' : 'left',
        styleFor(line, index === 0 ? 12 : 8, index === 0 ? HEADER : MUTED),
        rtl ? 'rtl' : 'ltr',
      );
    });
    doc.y = y + blockHeight + 10;
  };

  try {
    drawCompanyHeader();
    drawTitleTable(false);

    if (model.customer) {
      drawSectionBar(model.labels.sectionCustomer);
      const infoRows = [
        { field: model.labels.customer, value: model.customer.name },
        {
          field: model.labels.number,
          value: model.customer.customerNumber || model.labels.unnamedCustomer,
        },
        ...(model.customer.displayCreatedAt
          ? [{ field: model.labels.createdAt, value: model.customer.displayCreatedAt }]
          : []),
        ...(model.customer.displayUpdatedAt
          ? [{ field: model.labels.updatedAt, value: model.customer.displayUpdatedAt }]
          : []),
      ];
      const labelWidth = Math.round(contentWidth * 0.34);
      drawTable(
        directedColumns(
          [
            { key: 'field', header: model.labels.field, width: labelWidth, align: rtl ? 'right' : 'left' },
            { key: 'value', header: model.labels.value, width: contentWidth - labelWidth, align: rtl ? 'right' : 'left' },
          ],
          rtl,
          contentWidth,
        ),
        infoRows,
      );
    }

    if (model.currencySummaries.length > 0) {
      drawSectionBar(model.labels.sectionCurrencies);
      const codeWidth = Math.round(contentWidth * 0.14);
      const moneyWidth = Math.round(contentWidth * 0.22);
      const currencyColumns = directedColumns(
        [
          { key: 'code', header: model.labels.currency, width: codeWidth, align: 'left', ltr: true },
          { key: 'cashIn', header: model.labels.cashIn, width: moneyWidth, align: 'right', ltr: true },
          { key: 'cashOut', header: model.labels.cashOut, width: moneyWidth, align: 'right', ltr: true },
          { key: 'balance', header: model.labels.balance, width: moneyWidth, align: 'right', ltr: true },
          {
            key: 'tx',
            header: model.labels.transactionCount,
            width: contentWidth - codeWidth - moneyWidth * 3,
            align: 'right',
            ltr: true,
          },
        ],
        rtl,
        contentWidth,
      );
      const currencyRows = model.currencySummaries.map((summary) => ({
        code: summary.currencyCode,
        cashIn: formatMoneyForLocale(summary.cashInTotal, model.language),
        cashOut: formatMoneyForLocale(summary.cashOutTotal, model.language),
        balance: formatMoneyForLocale(summary.balance, model.language),
        tx: String(summary.transactionCount),
      }));
      drawTable(currencyColumns, currencyRows, (key) => {
        if (key === 'cashIn') return CASH_IN;
        if (key === 'cashOut') return CASH_OUT;
        return undefined;
      });
    }

    if (model.customer || model.transactions.length > 0) {
      drawSectionBar(model.labels.sectionSummary);
      const summaryRows = [
        { field: model.labels.cashInCount, value: String(model.customer?.cashInCount ?? countByType(model, 'CASH_IN')) },
        { field: model.labels.cashOutCount, value: String(model.customer?.cashOutCount ?? countByType(model, 'CASH_OUT')) },
        { field: model.labels.transactionCount, value: String(model.transactionCount) },
        { field: model.labels.customerCount, value: String(model.customerCount) },
      ];
      const labelWidth = Math.round(contentWidth * 0.5);
      drawTable(
        directedColumns(
          [
            { key: 'field', header: model.labels.field, width: labelWidth, align: rtl ? 'right' : 'left' },
            { key: 'value', header: model.labels.value, width: contentWidth - labelWidth, align: 'right', ltr: true },
          ],
          rtl,
          contentWidth,
        ),
        summaryRows,
      );
    }

    if (model.customers.length > 0) {
      drawSectionBar(model.labels.sectionCustomers);
      const currencyCodes = model.currencySummaries.map((item) => item.currencyCode);
      const nameWidth = 120;
      const numberWidth = 80;
      const countWidth = 50;
      const remaining = contentWidth - nameWidth - numberWidth - countWidth * 2;
      const balanceWidth = currencyCodes.length > 0 ? Math.floor(remaining / currencyCodes.length) : remaining;
      const customerColumns = directedColumns(
        [
          { key: 'name', header: model.labels.customer, width: nameWidth, align: 'left' },
          { key: 'number', header: model.labels.number, width: numberWidth, align: 'left', ltr: true },
          ...currencyCodes.map((code) => ({
            key: `bal_${code}`,
            header: code,
            width: balanceWidth,
            align: 'right' as const,
            ltr: true,
          })),
          { key: 'cashInCount', header: model.labels.cashIn, width: countWidth, align: 'right' as const, ltr: true },
          { key: 'cashOutCount', header: model.labels.cashOut, width: countWidth, align: 'right' as const, ltr: true },
        ],
        rtl,
        contentWidth,
      );
      const customerRows = model.customers.map((customer) => {
        const row: Record<string, string> = {
          name: customer.name,
          number: customer.customerNumber,
          cashInCount: String(customer.cashInCount),
          cashOutCount: String(customer.cashOutCount),
        };
        for (const code of currencyCodes) {
          row[`bal_${code}`] = formatMoneyForLocale(customer.balances[code] ?? '0.0000', model.language);
        }
        return row;
      });
      drawTable(customerColumns, customerRows);
    }

    if (model.transactions.length > 0) {
      drawSectionBar(model.labels.sectionTransactions);
      const txColumns = directedColumns(transactionColumns(model, contentWidth), rtl, contentWidth);
      const txRows = model.transactions.map((row) => transactionCells(row, model));
      drawTable(txColumns, txRows, (key, row) => {
        if (key === 'type' || key === 'amount') {
          return row.typeKey === 'CASH_OUT' ? CASH_OUT : CASH_IN;
        }
        return undefined;
      });
    }

    if (model.empty) {
      drawSectionBar(model.labels.sectionTransactions);
      drawTable(
        [{ key: 'message', header: model.labels.note, width: contentWidth, align: rtl ? 'right' : 'left' }],
        [{ message: model.noDataMessage }],
      );
    }

    drawSectionBar(model.labels.sectionTotals);
    const totalRows = model.currencySummaries.map((summary) => ({
      field: `${summary.currencyCode} — ${model.labels.balance}`,
      value: formatMoneyForLocale(summary.balance, model.language),
    }));
    totalRows.push(
      { field: model.labels.transactionCount, value: String(model.transactionCount) },
      { field: model.labels.customerCount, value: String(model.customerCount) },
    );
    const totalsLabelWidth = Math.round(contentWidth * 0.55);
    drawTable(
      directedColumns(
        [
          { key: 'field', header: model.labels.field, width: totalsLabelWidth, align: rtl ? 'right' : 'left' },
          { key: 'value', header: model.labels.value, width: contentWidth - totalsLabelWidth, align: 'right', ltr: true },
        ],
        rtl,
        contentWidth,
      ),
      totalRows,
    );

    drawFooter();
    doc.end();
    await output.done;
  } catch (error) {
    output.abort();
    throw error;
  }

  if (!existsSync(filePath) || statSync(filePath).size < 8) {
    throw new Error(`PDF file was not written: ${filePath}`);
  }
}

function embedExtractableArabic(doc: PDFKit.PDFDocument, font: string, model: ReportModel): void {
  const isolatedChars = new Set<string>();
  const wordProbes = new Set<string>();

  const add = (value: string | null | undefined): void => {
    if (!value) {
      return;
    }
    for (const token of value.split(/\s+/)) {
      if (containsArabicScript(token)) {
        wordProbes.add(token);
      }
    }
    for (const character of value) {
      if (containsArabicScript(character)) {
        isolatedChars.add(character);
      }
    }
  };

  add(model.title);
  add(model.appName);
  add(model.customer?.name);
  add(model.noDataMessage);
  for (const row of model.customers) {
    add(row.name);
  }
  for (const row of model.transactions) {
    add(row.note);
    add(row.typeLabel);
    add(row.customerName);
    add(row.counterpartyName);
  }
  for (const value of Object.values(model.labels)) {
    if (typeof value === 'string') {
      add(value);
    }
  }
  if (model.company) {
    add(model.company.name);
    add(model.company.address);
    add(model.company.notes);
  }

  if (isolatedChars.size === 0 && wordProbes.size === 0) {
    return;
  }

  const locale = normalizeLocale(model.language);
  const logicalPayload = [
    [...isolatedChars].join('\u200c'),
    ...wordProbes,
  ]
    .filter((part) => part.length > 0)
    .join('\n');

  const savedX = doc.x;
  const savedY = doc.y;
  doc.save();
  doc.font(font).fontSize(1);
  installFontkitNullAnchorGuard(doc);
  doc.fillColor('#FFFFFF');
  if (logicalPayload.length > 0) {
    doc.text(logicalPayload, MARGIN, -40, { lineBreak: false, features: [] });
  }
  for (const character of 'پچژگک') {
    const shaped = shapeRtlText(character, locale);
    registerExtractableGlyph(doc, shaped.length > 0 ? shaped : character, [], character);
  }
  registerExtractableText(doc, 'آأإ');
  doc.restore();
  doc.x = savedX;
  doc.y = savedY;
}

function directedColumns(columns: PdfColumn[], rtl: boolean, totalWidth: number): PdfColumn[] {
  const finalized = finalizeColumns(columns, totalWidth);
  return rtl ? [...finalized].reverse() : finalized;
}

function finalizeColumns(columns: PdfColumn[], totalWidth: number): PdfColumn[] {
  if (columns.length === 0) {
    return columns;
  }
  const head = columns.slice(0, -1);
  const used = head.reduce((sum, column) => sum + column.width, 0);
  const last = columns[columns.length - 1];
  if (!last) {
    return columns;
  }
  return [...head, { ...last, width: Math.max(24, totalWidth - used) }];
}

function countByType(model: ReportModel, type: 'CASH_IN' | 'CASH_OUT'): number {
  return model.transactions.filter((row) => row.type === type).length;
}

function reportHasArabic(model: ReportModel): boolean {
  if (containsArabicScript(model.title) || containsArabicScript(model.appName) || containsArabicScript(model.languageLabel)) {
    return true;
  }
  if (model.customer && containsArabicScript(model.customer.name)) {
    return true;
  }
  return (
    model.customers.some((row) => containsArabicScript(row.name) || containsArabicScript(row.customerNumber)) ||
    model.transactions.some(
      (row) => containsArabicScript(row.note) || containsArabicScript(row.customerName) || containsArabicScript(row.typeLabel),
    )
  );
}

function transactionColumns(model: ReportModel, contentWidth: number): PdfColumn[] {
  const includeCustomer = model.type !== 'customer';
  const dateWidth = 78;
  const timeWidth = 54;
  const typeWidth = 78;
  const currencyWidth = 46;
  const amountWidth = 78;
  const customerWidth = includeCustomer ? 90 : 0;
  const numberWidth = includeCustomer ? 70 : 0;
  const used = dateWidth + timeWidth + typeWidth + currencyWidth + amountWidth + customerWidth + numberWidth;
  const noteWidth = Math.max(96, contentWidth - used);

  return [
    ...(includeCustomer
      ? [
          { key: 'customer', header: model.labels.customer, width: customerWidth, align: 'left' as const },
          { key: 'number', header: model.labels.number, width: numberWidth, align: 'left' as const, ltr: true },
        ]
      : []),
    { key: 'date', header: model.labels.date, width: dateWidth, align: 'left', ltr: true },
    { key: 'time', header: model.labels.time, width: timeWidth, align: 'left', ltr: true },
    { key: 'type', header: model.labels.type, width: typeWidth, align: 'left' },
    { key: 'currency', header: model.labels.currency, width: currencyWidth, align: 'left', ltr: true },
    { key: 'amount', header: model.labels.amount, width: amountWidth, align: 'right', ltr: true },
    { key: 'note', header: model.labels.note, width: noteWidth, align: 'left' },
  ];
}

function transactionCells(row: ReportTransactionRow, model: ReportModel): Record<string, string> {
  return {
    customer: row.customerName,
    number: row.customerNumber,
    date: formatDateForLocale(row.transactionDate, model.language),
    time: row.displayTime,
    type: row.typeLabel,
    currency: row.currencyCode,
    amount: row.amount,
    note: row.note,
    typeKey: row.type,
  };
}

function attachPdfOutput(doc: PDFKit.PDFDocument, stream: WriteStream): { done: Promise<void>; abort: () => void } {
  let settled = false;
  let resolveDone: () => void = () => undefined;
  let rejectDone: (error: Error) => void = () => undefined;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const finish = (error?: Error): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (error) {
      rejectDone(error);
      return;
    }
    resolveDone();
  };

  stream.on('finish', () => finish());
  stream.on('error', (error: Error) => finish(error));
  doc.on('error', (error: Error) => finish(error));
  void done.catch(() => undefined);

  return {
    done,
    abort: () => {
      if (!stream.destroyed) {
        stream.destroy();
      }
      finish();
    },
  };
}
