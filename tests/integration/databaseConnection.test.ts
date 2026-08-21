import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../src/main/config/appConfig';
import { DatabaseConnection } from '../../src/main/database/connection';
import { Logger } from '../../src/main/utils/logger';

describe('DatabaseConnection', () => {
  let tempRoot: string;
  let databasePath: string;

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('creates and opens SQLite database with WAL enabled', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ca-db-'));
    databasePath = join(tempRoot, 'data', 'accounting.db');
    const config = loadAppConfig();
    const logger = new Logger(join(tempRoot, 'logs'), config);
    const connection = new DatabaseConnection(databasePath, logger);

    const db = connection.connect();

    expect(existsSync(databasePath)).toBe(true);
    expect(connection.isConnected()).toBe(true);
    expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);

    connection.close();
    expect(connection.isConnected()).toBe(false);
  });

  it('supports reopen after close', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ca-db-'));
    databasePath = join(tempRoot, 'data', 'accounting.db');
    const config = loadAppConfig();
    const logger = new Logger(join(tempRoot, 'logs'), config);
    const connection = new DatabaseConnection(databasePath, logger);

    connection.connect();
    connection.close();
    connection.connect();

    expect(connection.isConnected()).toBe(true);
    connection.close();
  });
});
