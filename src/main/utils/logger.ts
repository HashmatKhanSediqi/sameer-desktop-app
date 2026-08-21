import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppConfig } from '../config/appConfig';

type LogLevel = AppConfig['logLevel'];

const LEVEL_ORDER: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

export class Logger {
  private logFilePath: string;
  private minLevel: LogLevel;
  private maxSizeBytes: number;
  private maxFiles: number;

  constructor(logsDir: string, config: Pick<AppConfig, 'logLevel' | 'logMaxSizeBytes' | 'logMaxFiles'>) {
    mkdirSync(logsDir, { recursive: true });
    this.logFilePath = join(logsDir, 'app.log');
    this.minLevel = config.logLevel;
    this.maxSizeBytes = config.logMaxSizeBytes;
    this.maxFiles = config.logMaxFiles;
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.write('DEBUG', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.write('INFO', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.write('WARN', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write('ERROR', message, context);
  }

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) {
      return;
    }

    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(context ? { context } : {}),
    };

    const line = JSON.stringify(entry);

    if (process.env.NODE_ENV === 'development') {
      const consoleFn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log;
      consoleFn(`[${level}] ${message}`, context ?? '');
    }

    this.rotateIfNeeded();
    appendFileSync(this.logFilePath, `${line}\n`, 'utf8');
  }

  private rotateIfNeeded(): void {
    if (!existsSync(this.logFilePath)) {
      return;
    }

    const size = statSync(this.logFilePath).size;
    if (size < this.maxSizeBytes) {
      return;
    }

    const logsDir = dirname(this.logFilePath);

    for (let i = this.maxFiles - 1; i >= 1; i -= 1) {
      const from = join(logsDir, `app.log.${i}`);
      const to = join(logsDir, `app.log.${i + 1}`);
      if (existsSync(from)) {
        renameSync(from, to);
      }
    }

    renameSync(this.logFilePath, join(logsDir, 'app.log.1'));
  }
}
