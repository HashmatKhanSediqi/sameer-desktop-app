/**
 * Constrained ZIP writer/reader for `.cab` backups.
 * architecture.md names `archiver`; this module keeps extraction in-process so
 * path, size, and CRC checks happen before inflate/write.
 */
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { AppError } from '../../utils/errors';

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
const ZIP_VERSION = 20;
const COMPRESSION_DEFLATE = 8;
const UTF8_FLAG = 1 << 11;
const MAX_COMMENT_SCAN = 65_535;

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  CRC_TABLE[index] = crc >>> 0;
}

export interface ZipEntryInput {
  name: string;
  data: Buffer;
}

export interface ZipEntry {
  name: string;
  data: Buffer;
  compressedSize: number;
  uncompressedSize: number;
}

export function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (let index = 0; index < buffer.length; index += 1) {
    const byte = buffer[index];
    if (byte === undefined) {
      break;
    }
    const tableIndex = (crc ^ byte) & 0xff;
    const tableValue = CRC_TABLE[tableIndex];
    if (tableValue === undefined) {
      throw new AppError('INTERNAL_ERROR', 'CRC table lookup failed');
    }
    crc = tableValue ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function createZipBuffer(entries: ZipEntryInput[]): Buffer {
  if (entries.length === 0) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }

  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  const now = dosDateTime(new Date());

  for (const entry of entries) {
    const nameBuffer = Buffer.from(entry.name, 'utf8');
    const uncompressed = entry.data;
    const compressed = deflateRawSync(uncompressed);
    const checksum = crc32(uncompressed);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
    localHeader.writeUInt16LE(ZIP_VERSION, 4);
    localHeader.writeUInt16LE(UTF8_FLAG, 6);
    localHeader.writeUInt16LE(COMPRESSION_DEFLATE, 8);
    localHeader.writeUInt16LE(now.time, 10);
    localHeader.writeUInt16LE(now.date, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(uncompressed.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
    centralHeader.writeUInt16LE(ZIP_VERSION, 4);
    centralHeader.writeUInt16LE(ZIP_VERSION, 6);
    centralHeader.writeUInt16LE(UTF8_FLAG, 8);
    centralHeader.writeUInt16LE(COMPRESSION_DEFLATE, 10);
    centralHeader.writeUInt16LE(now.time, 12);
    centralHeader.writeUInt16LE(now.date, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(uncompressed.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);

    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(EOCD_SIGNATURE, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

export interface ZipIndexRecord {
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  crc: number;
  localOffset: number;
}

export function listZipIndex(buffer: Buffer): ZipIndexRecord[] {
  if (buffer.length < 22) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }

  const eocdOffset = findEocdOffset(buffer);
  const diskEntries = buffer.readUInt16LE(eocdOffset + 8);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralSize = buffer.readUInt32LE(eocdOffset + 12);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const commentLength = buffer.readUInt16LE(eocdOffset + 20);

  if (diskEntries !== totalEntries || commentLength !== 0) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }
  if (centralOffset === 0xffffffff || centralSize === 0xffffffff) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }
  if (centralOffset + centralSize > eocdOffset) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }
  if (totalEntries > 20_000) {
    throw new AppError('INVALID_BACKUP', 'zipBomb');
  }

  const records: ZipIndexRecord[] = [];
  let cursor = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > buffer.length) {
      throw new AppError('INVALID_BACKUP', 'invalidFile');
    }
    if (buffer.readUInt32LE(cursor) !== CENTRAL_HEADER_SIGNATURE) {
      throw new AppError('INVALID_BACKUP', 'invalidFile');
    }

    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const checksum = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLengthEntry = buffer.readUInt16LE(cursor + 32);
    const localOffset = buffer.readUInt32LE(cursor + 42);

    if ((flags & 0x0008) !== 0 || method !== COMPRESSION_DEFLATE) {
      throw new AppError('INVALID_BACKUP', 'invalidFile');
    }
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
      throw new AppError('INVALID_BACKUP', 'invalidFile');
    }

    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) {
      throw new AppError('INVALID_BACKUP', 'invalidFile');
    }
    records.push({
      name: buffer.subarray(nameStart, nameEnd).toString('utf8'),
      compressedSize,
      uncompressedSize,
      crc: checksum,
      localOffset,
    });
    cursor = nameEnd + extraLength + commentLengthEntry;
  }

  return records;
}

export function extractZipRecord(buffer: Buffer, record: ZipIndexRecord): ZipEntry {
  const data = inflateStoredEntry(
    buffer,
    record.localOffset,
    record.name,
    record.compressedSize,
    record.uncompressedSize,
    record.crc,
  );
  return {
    name: record.name,
    data,
    compressedSize: record.compressedSize,
    uncompressedSize: record.uncompressedSize,
  };
}

export function readZipEntries(buffer: Buffer): ZipEntry[] {
  return listZipIndex(buffer).map((record) => extractZipRecord(buffer, record));
}

export function sha256(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function inflateStoredEntry(
  buffer: Buffer,
  localOffset: number,
  expectedName: string,
  compressedSize: number,
  uncompressedSize: number,
  expectedCrc: number,
): Buffer {
  if (localOffset + 30 > buffer.length) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }
  if (buffer.readUInt32LE(localOffset) !== LOCAL_HEADER_SIGNATURE) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }

  const flags = buffer.readUInt16LE(localOffset + 6);
  const method = buffer.readUInt16LE(localOffset + 8);
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  if ((flags & 0x0008) !== 0 || method !== COMPRESSION_DEFLATE) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }

  const nameStart = localOffset + 30;
  const nameEnd = nameStart + nameLength;
  const dataStart = nameEnd + extraLength;
  const dataEnd = dataStart + compressedSize;
  if (dataEnd > buffer.length) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }

  const localName = buffer.subarray(nameStart, nameEnd).toString('utf8');
  if (localName !== expectedName) {
    throw new AppError('INVALID_BACKUP', 'invalidFile');
  }

  let inflated: Buffer;
  try {
    inflated = inflateRawSync(buffer.subarray(dataStart, dataEnd));
  } catch {
    throw new AppError('BACKUP_CORRUPTED', 'corrupted');
  }

  if (inflated.length !== uncompressedSize || crc32(inflated) !== expectedCrc) {
    throw new AppError('BACKUP_CORRUPTED', 'corrupted');
  }

  return inflated;
}

function findEocdOffset(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 22 - MAX_COMMENT_SCAN);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) {
      const commentLength = buffer.readUInt16LE(offset + 20);
      if (offset + 22 + commentLength === buffer.length) {
        return offset;
      }
    }
  }
  throw new AppError('INVALID_BACKUP', 'invalidFile');
}

function dosDateTime(date: Date): { time: number; date: number } {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: dosDate };
}
