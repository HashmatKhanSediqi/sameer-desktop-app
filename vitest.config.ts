import { defineConfig } from 'vitest/config';
import { pathAliases } from './scripts/path-aliases';

export default defineConfig({
  resolve: {
    alias: pathAliases,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
  },
});
