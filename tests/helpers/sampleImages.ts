export function sampleJpeg(byteLength = 64): Buffer {
  const buffer = Buffer.alloc(byteLength, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

export function samplePng(byteLength = 64): Buffer {
  const buffer = Buffer.alloc(byteLength, 0);
  buffer[0] = 0x89;
  buffer[1] = 0x50;
  buffer[2] = 0x4e;
  buffer[3] = 0x47;
  buffer[4] = 0x0d;
  buffer[5] = 0x0a;
  buffer[6] = 0x1a;
  buffer[7] = 0x0a;
  return buffer;
}

export function sampleWebp(byteLength = 64): Buffer {
  const buffer = Buffer.alloc(byteLength, 0);
  buffer.write('RIFF', 0, 'ascii');
  buffer.write('WEBP', 8, 'ascii');
  return buffer;
}

export function toBase64(buffer: Buffer): string {
  return buffer.toString('base64');
}

export function toDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${toBase64(buffer)}`;
}
