import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import { detectImageType, type PhotoImageType } from '../customer/customerPhotoService';
import { MAX_PHOTO_BYTES } from '../customer/customerValidation';

const LOGO_FILENAME_PATTERN = /^logo\.(jpg|jpeg|png|webp)$/;

export class CompanyLogoService {
  constructor(
    private readonly imagesDirectory: string,
    private readonly logger: Logger,
  ) {}

  decodeAndValidate(logoBase64: string): { type: PhotoImageType; buffer: Buffer } {
    const buffer = decodeBase64(logoBase64);
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_PHOTO_BYTES) {
      throw new AppError('INVALID_PHOTO', buffer.byteLength > MAX_PHOTO_BYTES ? 'PHOTO_TOO_LARGE' : 'INVALID_PHOTO');
    }
    const type = detectImageType(buffer);
    if (!type) {
      throw new AppError('INVALID_PHOTO', 'INVALID_PHOTO');
    }
    return { type, buffer };
  }

  save(photo: { type: PhotoImageType; buffer: Buffer }): string {
    mkdirSync(this.imagesDirectory, { recursive: true });
    this.deleteExisting();
    const extension = photo.type === 'jpeg' ? 'jpg' : photo.type;
    const filename = `logo.${extension}`;
    writeFileSync(this.ensureInside(join(this.imagesDirectory, filename)), photo.buffer);
    return filename;
  }

  read(filename: string): { mimeType: 'image/jpeg' | 'image/png' | 'image/webp'; buffer: Buffer } {
    const absolutePath = this.resolveStored(filename);
    if (!existsSync(absolutePath)) {
      throw new AppError('INVALID_PHOTO', 'PHOTO_NOT_FOUND');
    }
    const buffer = readFileSync(absolutePath);
    const type = detectImageType(buffer);
    if (!type) {
      throw new AppError('INVALID_PHOTO', 'INVALID_PHOTO');
    }
    return {
      mimeType: type === 'jpeg' ? 'image/jpeg' : type === 'png' ? 'image/png' : 'image/webp',
      buffer,
    };
  }

  absolutePath(filename: string | null): string | null {
    if (!filename) {
      return null;
    }
    const absolutePath = this.resolveStored(filename);
    return existsSync(absolutePath) ? absolutePath : null;
  }

  deleteExisting(): void {
    if (!existsSync(this.imagesDirectory)) {
      return;
    }
    for (const name of ['logo.jpg', 'logo.jpeg', 'logo.png', 'logo.webp']) {
      const candidate = join(this.imagesDirectory, name);
      if (existsSync(candidate)) {
        try {
          unlinkSync(candidate);
        } catch (error) {
          this.logger.error('Failed to delete company logo', {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  private resolveStored(filename: string): string {
    if (!LOGO_FILENAME_PATTERN.test(filename)) {
      throw new AppError('INTERNAL_ERROR', 'Invalid stored logo reference');
    }
    return this.ensureInside(join(this.imagesDirectory, filename));
  }

  private ensureInside(candidate: string): string {
    const root = resolve(this.imagesDirectory);
    const resolved = resolve(candidate);
    const relativePath = relative(root, resolved);
    if (relativePath.startsWith('..') || isAbsolute(relativePath) || relativePath.includes(`..${sep}`)) {
      throw new AppError('INTERNAL_ERROR', 'Invalid logo path');
    }
    return resolved;
  }
}

function decodeBase64(value: string): Buffer {
  const trimmed = value.trim();
  const dataUrlMatch = /^data:[^;]+;base64,(.+)$/i.exec(trimmed);
  const payload = dataUrlMatch?.[1] ?? trimmed;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(payload)) {
    throw new AppError('INVALID_PHOTO', 'INVALID_PHOTO');
  }
  return Buffer.from(payload, 'base64');
}
