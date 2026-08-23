import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadAppConfig } from '../../src/main/config/appConfig';
import { DatabaseConnection } from '../../src/main/database/connection';
import { SQLITE_MAGIC } from '../../src/main/services/backup/sqliteIntegrity';
import { AppError } from '../../src/main/utils/errors';
import { Logger } from '../../src/main/utils/logger';

describe('database integrity hardening', () => {
  let tempRoot = '';

  afterEach(() => {
    if (tempRoot) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = '';
    }
  });

  it('rejects corrupted database files on connect', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ca-db-bad-'));
    const databasePath = join(tempRoot, 'data', 'accounting.db');
    const logger = new Logger(join(tempRoot, 'logs'), loadAppConfig());
    const connection = new DatabaseConnection(databasePath, logger);
    const db = connection.connect();
    db.exec('CREATE TABLE integrity_probe (id INTEGER PRIMARY KEY)');
    connection.close();

    const validDatabase = readFileSync(databasePath);
    const corrupt = Buffer.from(validDatabase);
    corrupt.fill(0xff, 4096, 4196);
    writeFileSync(databasePath, corrupt);

    const reconnect = new DatabaseConnection(databasePath, logger);

    try {
      reconnect.connect();
      expect.unreachable('connect should fail for corrupted database');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('DATABASE_CORRUPTED');
    } finally {
      if (reconnect.isConnected()) {
        reconnect.close();
      }
    }
  });

  it('accepts a valid sqlite database header', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'ca-db-good-'));
    const databasePath = join(tempRoot, 'data', 'accounting.db');
    const logger = new Logger(join(tempRoot, 'logs'), loadAppConfig());
    const connection = new DatabaseConnection(databasePath, logger);
    connection.connect();
    expect(readFileSync(databasePath).subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)).toBe(true);
    expect(existsSync(databasePath)).toBe(true);
    connection.close();
  });
});
