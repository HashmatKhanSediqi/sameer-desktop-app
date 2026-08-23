import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Logger } from '../utils/logger';
import { AppError } from '../utils/errors';
import { verifyConnectedDatabaseIntegrity } from '../services/backup/sqliteIntegrity';

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

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
      this.db.pragma('synchronous = NORMAL');

      if (!verifyConnectedDatabaseIntegrity(this.db)) {
        this.db.close();
        this.db = null;
        throw new AppError('DATABASE_CORRUPTED', 'DATABASE_CORRUPTED');
      }

      this.logger.info('Database opened', { path: this.databasePath });
      return this.db;
    } catch (error) {
      if (this.db) {
        try {
          this.db.close();
        } catch {
          // Ignore close failures while recovering from a failed connect.
        }
        this.db = null;
      }
      if (error instanceof AppError) {
        throw error;
      }
      const details = formatUnknownError(error);
      this.logger.error('Failed to open database', {
        path: this.databasePath,
        error: details,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new AppError('DATABASE_ERROR', `Failed to open SQLite database: ${details}`);
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
        error: formatUnknownError(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    } finally {
      this.db = null;
    }
  }
}
