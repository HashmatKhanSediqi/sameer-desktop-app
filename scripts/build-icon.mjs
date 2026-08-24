import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';
import { PNG } from 'pngjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const officialSource = join(root, 'assets', 'icons', 'iconn.png');
const preservedSource = join(root, 'assets', 'icons', 'iconn-source.png');
const masterPng = join(root, 'assets', 'icons', 'icon-master.png');
const targetIco = join(root, 'assets', 'icons', 'icon.ico');
const OUTPUT_SIZE = 256;
const INNER_RATIO = 0.68;

function decodePng(filePath) {
  return PNG.sync.read(readFileSync(filePath));
}

function encodePng(png) {
  return PNG.sync.write(png);
}

function readPixel(png, x, y) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) {
    return { r: 0, g: 0, b: 0, a: 0 };
  }
  const idx = (png.width * y + x) << 2;
  return {
    r: png.data[idx] ?? 0,
    g: png.data[idx + 1] ?? 0,
    b: png.data[idx + 2] ?? 0,
    a: png.data[idx + 3] ?? 0,
  };
}

function sampleBilinear(png, x, y) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const p00 = readPixel(png, x0, y0);
  const p10 = readPixel(png, x0 + 1, y0);
  const p01 = readPixel(png, x0, y0 + 1);
  const p11 = readPixel(png, x0 + 1, y0 + 1);
  const mix = (a, b, t) => a + (b - a) * t;
  return {
    r: mix(mix(p00.r, p10.r, fx), mix(p01.r, p11.r, fx), fy),
    g: mix(mix(p00.g, p10.g, fx), mix(p01.g, p11.g, fx), fy),
    b: mix(mix(p00.b, p10.b, fx), mix(p01.b, p11.b, fx), fy),
    a: mix(mix(p00.a, p10.a, fx), mix(p01.a, p11.a, fx), fy),
  };
}

function boundingBox(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (readPixel(png, x, y).a < 12) {
        continue;
      }
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) {
    return { minX: 0, minY: 0, maxX: png.width - 1, maxY: png.height - 1 };
  }
  return { minX, minY, maxX, maxY };
}

function createCanvas(size) {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  png.data.fill(0);
  return png;
}

function blendOver(dest, x, y, color) {
  if (x < 0 || y < 0 || x >= dest.width || y >= dest.height || color.a <= 0) {
    return;
  }
  const idx = (dest.width * y + x) << 2;
  const srcA = color.a / 255;
  const dstA = (dest.data[idx + 3] ?? 0) / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    return;
  }
  dest.data[idx] = Math.round((color.r * srcA + (dest.data[idx] ?? 0) * dstA * (1 - srcA)) / outA);
  dest.data[idx + 1] = Math.round((color.g * srcA + (dest.data[idx + 1] ?? 0) * dstA * (1 - srcA)) / outA);
  dest.data[idx + 2] = Math.round((color.b * srcA + (dest.data[idx + 2] ?? 0) * dstA * (1 - srcA)) / outA);
  dest.data[idx + 3] = Math.round(outA * 255);
}

function processArtwork(source) {
  const box = boundingBox(source);
  const cropW = box.maxX - box.minX + 1;
  const cropH = box.maxY - box.minY + 1;
  const dest = createCanvas(OUTPUT_SIZE);
  const inner = Math.round(OUTPUT_SIZE * INNER_RATIO);
  const scale = Math.min(inner / cropW, inner / cropH);
  const drawW = cropW * scale;
  const drawH = cropH * scale;
  const originX = (OUTPUT_SIZE - drawW) / 2;
  const originY = (OUTPUT_SIZE - drawH) / 2 - OUTPUT_SIZE * 0.012;
  const shadowOffset = Math.max(3, Math.round(OUTPUT_SIZE * 0.028));

  for (let y = 0; y < OUTPUT_SIZE; y += 1) {
    for (let x = 0; x < OUTPUT_SIZE; x += 1) {
      const sx = (x - originX - shadowOffset) / scale + box.minX;
      const sy = (y - originY - shadowOffset) / scale + box.minY;
      const sample = sampleBilinear(source, sx, sy);
      if (sample.a < 8) {
        continue;
      }
      blendOver(dest, x, y, { r: 18, g: 32, b: 24, a: sample.a * 0.28 });
    }
  }

  for (let y = 0; y < OUTPUT_SIZE; y += 1) {
    for (let x = 0; x < OUTPUT_SIZE; x += 1) {
      const sx = (x - originX) / scale + box.minX;
      const sy = (y - originY) / scale + box.minY;
      const sample = sampleBilinear(source, sx, sy);
      if (sample.a < 8) {
        continue;
      }
      const nx = drawW <= 0 ? 0 : (x - originX) / drawW;
      const ny = drawH <= 0 ? 0 : (y - originY) / drawH;
      const highlight = Math.max(0, 0.16 * (1 - nx) * (1 - ny));
      const shade = Math.max(0, 0.1 * nx * ny);
      blendOver(dest, x, y, {
        r: Math.min(255, sample.r * (1 - shade) + 255 * highlight),
        g: Math.min(255, sample.g * (1 - shade) + 255 * highlight),
        b: Math.min(255, sample.b * (1 - shade) + 255 * highlight),
        a: sample.a,
      });
    }
  }

  return dest;
}

async function main() {
  if (!existsSync(preservedSource) && existsSync(officialSource)) {
    copyFileSync(officialSource, preservedSource);
  }

  const sourcePath = existsSync(preservedSource) ? preservedSource : officialSource;
  if (!existsSync(sourcePath)) {
    console.error(`Missing icon source: ${sourcePath}`);
    process.exit(1);
  }

  const processedBytes = encodePng(processArtwork(decodePng(sourcePath)));
  writeFileSync(masterPng, processedBytes);
  writeFileSync(officialSource, processedBytes);

  const icoBuffer = await pngToIco(masterPng);
  if (icoBuffer.length < 6 || icoBuffer[0] !== 0 || icoBuffer[1] !== 0 || icoBuffer[2] !== 1) {
    console.error('png-to-ico produced invalid ICO data');
    process.exit(1);
  }

  writeFileSync(targetIco, icoBuffer);
  console.log(`Wrote ${targetIco} (${icoBuffer.length} bytes) from padded ${OUTPUT_SIZE}x${OUTPUT_SIZE} master`);
}

await main();
