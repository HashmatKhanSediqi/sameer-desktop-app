import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import { MAX_PHOTO_BYTES } from './customerValidation';

export type PhotoImageType = 'jpeg' | 'png' | 'webp';

export interface DecodedPhoto {
  type: PhotoImageType;
  buffer: Buffer;
}

const PHOTO_FILENAME_PATTERN = /^customers\/(\d+)\.(jpg|jpeg|png|webp)$/;

export class CustomerPhotoService {
  constructor(
    private readonly imagesDirectory: string,
    private readonly logger: Logger,
  ) {}

  decodeAndValidate(photoBase64: string): DecodedPhoto {
    const buffer = decodeBase64Photo(photoBase64);

    if (buffer.byteLength === 0) {
      throw new AppError('INVALID_PHOTO', 'INVALID_PHOTO');
    }

    if (buffer.byteLength > MAX_PHOTO_BYTES) {
      throw new AppError('INVALID_PHOTO', 'PHOTO_TOO_LARGE');
    }

    const type = detectImageType(buffer);
    if (!type) {
      throw new AppError('INVALID_PHOTO', 'INVALID_PHOTO');
    }

    return { type, buffer };
  }

  save(customerId: number, photo: DecodedPhoto): string {
    mkdirSync(this.imagesDirectory, { recursive: true });

    const extension = extensionForType(photo.type);
    const absolutePath = this.resolveCustomerPhotoPath(customerId, extension);
    writeFileSync(absolutePath, photo.buffer);
    return `customers/${customerId}.${extension}`;
  }

  read(photoFilename: string): { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; buffer: Buffer } {
    const absolutePath = this.resolveStoredPhotoPath(photoFilename);
    if (!existsSync(absolutePath)) {
      this.logger.warn('Customer photo file missing', { photoFilename });
      throw new AppError('INVALID_PHOTO', 'PHOTO_NOT_FOUND');
    }

    const buffer = readFileSync(absolutePath);
    const type = detectImageType(buffer);
    if (!type) {
      throw new AppError('INVALID_PHOTO', 'INVALID_PHOTO');
    }

    return {
      mimeType: mimeTypeForImage(type),
      buffer,
    };
  }

  deleteByFilename(photoFilename: string | null): void {
    if (!photoFilename) {
      return;
    }

    try {
      const absolutePath = this.resolveStoredPhotoPath(photoFilename);
      if (existsSync(absolutePath)) {
        unlinkSync(absolutePath);
      }
    } catch (error) {
      this.logger.error('Failed to delete customer photo', {
        photoFilename,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private resolveCustomerPhotoPath(customerId: number, extension: string): string {
    return this.ensurePathInsideImagesDir(join(this.imagesDirectory, `${customerId}.${extension}`));
  }

  private resolveStoredPhotoPath(photoFilename: string): string {
    const match = PHOTO_FILENAME_PATTERN.exec(photoFilename);
    if (!match?.[1] || !match[2]) {
      throw new AppError('INTERNAL_ERROR', 'Invalid stored photo reference');
    }

    return this.ensurePathInsideImagesDir(join(this.imagesDirectory, `${match[1]}.${match[2]}`));
  }

  private ensurePathInsideImagesDir(candidate: string): string {
    const root = resolve(this.imagesDirectory);
    const resolved = resolve(candidate);
    const relativePath = relative(root, resolved);

    if (relativePath.startsWith('..') || isAbsolute(relativePath) || relativePath.includes(`..${sep}`)) {
      throw new AppError('INTERNAL_ERROR', 'Invalid photo path');
    }

    return resolved;
  }
}

export function detectImageType(buffer: Buffer): PhotoImageType | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }

  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'png';
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }

  return null;
}

function extensionForType(type: PhotoImageType): 'jpg' | 'png' | 'webp' {
  if (type === 'jpeg') {
    return 'jpg';
  }
  return type;
}

function mimeTypeForImage(type: PhotoImageType): 'image/jpeg' | 'image/png' | 'image/webp' {
  if (type === 'jpeg') {
    return 'image/jpeg';
  }
  if (type === 'png') {
    return 'image/png';
  }
  return 'image/webp';
}

function decodeBase64Photo(photoBase64: string): Buffer {
  const trimmed = photoBase64.trim();
  if (trimmed.length === 0) {
    throw new AppError('INVALID_PHOTO', 'INVALID_PHOTO');
  }

  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(trimmed);
  const payload = dataUrlMatch?.[1] ?? trimmed;

  if (!/^[A-Za-z0-9+/=\s]+$/.test(payload)) {
    throw new AppError('INVALID_PHOTO', 'INVALID_PHOTO');
  }

  return Buffer.from(payload, 'base64');
}
