import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir =
  typeof __dirname !== 'undefined' ? __dirname : dirname(fileURLToPath(import.meta.url));

const projectRoot = resolve(currentDir, '..');

export const pathAliases = {
  '@shared': resolve(projectRoot, 'src/shared'),
  '@main': resolve(projectRoot, 'src/main'),
  '@preload': resolve(projectRoot, 'src/preload'),
  '@renderer': resolve(projectRoot, 'src/renderer'),
} as const;

export type PathAliases = typeof pathAliases;
