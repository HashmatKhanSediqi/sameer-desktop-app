import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class DatabaseConnection {
  private db: Database.Database | null = null;
  private readonly databasePath: string;
  private readonly logger: Logger;

  constructor(databasePath: string, logger: Logger) {
    this.databasePath = databasePath;
    this.logger = logger;
  }

  connect(): Database.Database {
    if (this.db) {
      return this.db;
    }

    try {
      mkdirSync(dirname(this.databasePath), { recursive: true });

      this.db = new Database(this.databasePath);
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('busy_timeout = 5000');

      this.logger.info('Database opened', { path: this.databasePath });
      return this.db;
    } catch (error) {
      this.logger.error('Failed to open database', {
        path: this.databasePath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AppError('DATABASE_ERROR', 'Failed to open SQLite database');
    }
  }

  getConnection(): Database.Database {
    if (!this.db) {
      throw new AppError('DATABASE_ERROR', 'Database is not connected');
    }
    return this.db;
  }

  isConnected(): boolean {
    return this.db !== null;
  }

  getPath(): string {
    return this.databasePath;
  }

  databaseFileExists(): boolean {
    return existsSync(this.databasePath);
  }

  checkpoint(): void {
    if (!this.db) {
      return;
    }
    this.db.pragma('wal_checkpoint(FULL)');
    this.logger.debug('WAL checkpoint completed');
  }

  close(): void {
    if (!this.db) {
      return;
    }

    try {
      this.checkpoint();
      this.db.close();
      this.logger.info('Database closed', { path: this.databasePath });
    } catch (error) {
      this.logger.error('Error closing database', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.db = null;
    }
  }
}
