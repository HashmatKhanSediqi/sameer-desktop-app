import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { createCustomerTestHarness } from '../tests/helpers/customerHarness';
import { inspectPdf } from '../tests/helpers/pdfInspect';

function dumpStructure(label: string, filePath: string): Record<string, unknown> {
  const bytes = readFileSync(filePath);
  const latin1 = bytes.toString('latin1');
  const inflated = inflateAll(bytes);
  const pdf = inspectPdf(filePath);

  const fontDicts = [...inflated.matchAll(/\/Font\s*<<([\s\S]{0,400}?)>>/g)].map((item) =>
    (item[0] ?? '').replace(/\s+/g, ' ').slice(0, 300),
  );
  const type0 = [...inflated.matchAll(/(\d+)\s+0\s+obj([\s\S]*?)endobj/g)]
    .filter((item) => /\/Type\s*\/Font/.test(item[2] ?? '') || /\/ToUnicode/.test(item[2] ?? ''))
    .map((item) => ({
      id: item[1],
      snippet: (item[2] ?? '').replace(/\s+/g, ' ').slice(0, 280),
    }));
  const cmaps = [...inflated.matchAll(/(\d+)\s+0\s+obj[\s\S]{0,200}begincmap([\s\S]{0,500})endcmap/g)].map((item) => ({
    nearby: item[0]?.slice(0, 120),
    sample: (item[2] ?? '').replace(/\s+/g, ' ').slice(0, 400),
  }));
  const tf = [...inflated.matchAll(/\/([A-Za-z0-9._+-]+)\s+[\d.]+\s+Tf/g)].slice(0, 20).map((item) => item[0]);
  const tj = [...inflated.matchAll(/\[([\s\S]{0,120}?)\]\s*TJ/g)].slice(0, 12).map((item) => (item[0] ?? '').replace(/\s+/g, ' '));
  const btCount = (inflated.match(/\bBT\b/g) ?? []).length;
  const etCount = (inflated.match(/\bET\b/g) ?? []).length;

  return {
    label,
    filePath,
    size: bytes.length,
    isPdf: pdf.isPdf,
    pages: pdf.pageCount,
    embedsLatin: pdf.embedsLatinFont,
    embedsArabic: pdf.embedsArabicFont,
    extracted: pdf.extractedText.slice(0, 1200),
    extractedLen: pdf.extractedText.length,
    cmapChars: pdf.cmapChars.slice(0, 200),
    hasOpening: pdf.extractedText.includes('Opening') || latin1.includes('Opening'),
    hasAFN: pdf.extractedText.includes('AFN') || latin1.includes('AFN'),
    hasTransaction: pdf.extractedText.includes('Transaction'),
    hasFatemeh: [...'فاطمه'].every((ch) => pdf.extractedText.includes(ch) || pdf.cmapChars.includes(ch)),
    identityH: (latin1.match(/Identity-H/g) ?? []).length,
    begincmap: (inflated.match(/begincmap/g) ?? []).length,
    btCount,
    etCount,
    tf,
    tj,
    fontDicts,
    type0,
    cmapCount: cmaps.length,
    cmapSamples: cmaps.slice(0, 2),
    latin1HasOpening: latin1.includes('Opening'),
    baseFonts: [...latin1.matchAll(/\/BaseFont\s*\/([^\s\/]+)/g)].map((item) => item[1]),
  };
}

function inflateAll(bytes: Buffer): string {
  const latin1 = bytes.toString('latin1');
  let output = '';
  let last = 0;
  const marker = /stream\r?\n/g;
  let match = marker.exec(latin1);
  while (match) {
    output += latin1.slice(last, match.index);
    const start = match.index + match[0].length;
    const dict = latin1.slice(Math.max(0, match.index - 800), match.index);
    const lengthMatch = dict.match(/\/Length\s+(\d+)\s*(?:\/|>>)/);
    const declaredLength = lengthMatch ? Number.parseInt(lengthMatch[1] ?? '', 10) : Number.NaN;
    const flate = /\/Filter\s*\/FlateDecode/.test(dict);
    let data: Buffer;
    let nextSearch = start;
    if (Number.isFinite(declaredLength) && declaredLength >= 0 && start + declaredLength <= bytes.length) {
      data = bytes.subarray(start, start + declaredLength);
      nextSearch = start + declaredLength;
      const after = latin1.slice(nextSearch, nextSearch + 24);
      const endAt = after.search(/endstream/);
      last = endAt >= 0 ? nextSearch + endAt : nextSearch;
    } else {
      const end = latin1.indexOf('endstream', start);
      if (end < 0) {
        break;
      }
      data = bytes.subarray(start, end);
      last = end;
    }
    const tag = data.length >= 4 ? data.toString('ascii', 0, 4) : '';
    const isFont = tag === 'OTTO' || tag === 'true' || (data.length >= 4 && data.readUInt32BE(0) === 0x00010000);
    if (!isFont) {
      if (flate) {
        try {
          const inflated = inflateSync(data);
          const inflatedTag = inflated.length >= 4 ? inflated.toString('ascii', 0, 4) : '';
          const inflatedFont =
            inflatedTag === 'OTTO' || inflatedTag === 'true' || (inflated.length >= 4 && inflated.readUInt32BE(0) === 0x00010000);
          if (!inflatedFont) {
            output += inflated.toString('latin1');
          }
        } catch {
          output += data.toString('latin1');
        }
      } else {
        output += data.toString('latin1');
      }
    }
    marker.lastIndex = Math.max(last, nextSearch);
    match = marker.exec(latin1);
  }
  output += latin1.slice(last);
  return output;
}

async function main(): Promise<void> {
  const outDir = join(process.cwd(), 'tmp-pdf-diagnose');
  mkdirSync(outDir, { recursive: true });
  const harness = await createCustomerTestHarness();
  try {
    const englishCustomer = harness.customerService.create({ name: 'Ahmad', customerNumber: 'C-1' });
    harness.transactionService.create({
      customerId: englishCustomer.id,
      type: 'CASH_IN',
      amount: '1000',
      currencyCode: 'AFN',
      transactionDate: '2026-01-10T09:15',
      note: 'Opening',
    });
    const english = await harness.reportsService.generate({
      type: 'customer',
      format: 'pdf',
      language: 'en',
      customerId: englishCustomer.id,
    });
    writeFileSync(join(outDir, 'english.pdf'), readFileSync(english.filePath));
    const englishDump = dumpStructure('english', join(outDir, 'english.pdf'));

    const dariCustomer = harness.customerService.create({ name: 'فاطمه', customerNumber: 'C-2' });
    harness.transactionService.create({
      customerId: dariCustomer.id,
      type: 'CASH_IN',
      amount: '80',
      currencyCode: 'EUR',
      note: 'سلام AFN 12',
    });
    const dari = await harness.reportsService.generate({
      type: 'customer',
      format: 'pdf',
      language: 'fa-AF',
      customerId: dariCustomer.id,
    });
    writeFileSync(join(outDir, 'dari.pdf'), readFileSync(dari.filePath));
    const dariDump = dumpStructure('dari', join(outDir, 'dari.pdf'));

    const report = { english: englishDump, dari: dariDump };
    writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    harness.cleanup();
  }
}

void main();
