import Database from 'better-sqlite3';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { AppPaths } from '@shared/types/ipc';
import {
  BACKUP_COMPANY_IMAGES_PREFIX,
  BACKUP_DATABASE_ENTRY,
  BACKUP_FILE_EXTENSION,
  BACKUP_FORMAT_VERSION,
  BACKUP_IMAGES_PREFIX,
  BACKUP_MANIFEST_NAME,
  BACKUP_SIGNATURE_NAME,
  MAX_BACKUP_ARCHIVE_BYTES,
  MAX_BACKUP_ENTRIES,
  MAX_BACKUP_UNCOMPRESSED_BYTES,
  SAFETY_BACKUP_FILE_PREFIX,
  SAFETY_BACKUP_RETENTION,
  PRE_UPDATE_BACKUP_FILE_PREFIX,
  PRE_UPDATE_BACKUP_RETENTION,
  defaultSafetyBackupFileName,
  defaultPreUpdateBackupFileName,
  type BackupCreateData,
  type BackupManifest,
  type BackupManifestFile,
  type BackupProgress,
  type BackupValidateData,
  type RestoreExecuteData,
} from '@shared/types/backup';
import { APP_VERSION } from '@shared/constants/version';
import { SETTINGS_AUTOMATIC_BACKUP_PATH_KEY } from '@shared/types/settings';
import {
  getAppliedSchemaVersion,
  getAvailableSchemaVersion,
  runMigrations,
} from '../../database/migrationRunner';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import { assertAllowedBackupEntry, isBackupFilePath } from './backupPaths';
import { resolveUniqueAutoBackupPath } from './uniqueBackupPath';
import { mergeBackupAccountingData } from './backupMerge';
import { buildBackupSignature, parseBackupManifest, summarizeManifest } from './backupManifest';
import { hasSqliteMagic, verifySqliteIntegrity } from './sqliteIntegrity';
import { createZipBuffer, extractZipRecord, listZipIndex, sha256, type ZipEntry } from './zipArchive';

export interface BackupServiceDeps {
  getDatabase(): Database.Database;
  checkpoint(): void;
  closeDatabase(): void;
  reopenDatabase(): Database.Database;
  rebindServices(): void;
  invalidateSessions(): void;
  paths: AppPaths;
  appVersion?: string;
  logger: Logger;
  migrationsDir: string;
}

interface ExtractedBackup {
  stagingDir: string;
  manifest: BackupManifest;
  warnings: string[];
  databasePath: string;
}

export class BackupService {
  constructor(private readonly deps: BackupServiceDeps) {}

  private lastValidatedPath: string | undefined;

  hasExistingData(): boolean {
    return hasExistingAccountingData(this.deps.getDatabase());
  }

  async createAutoCloseBackup(): Promise<{
    created: boolean;
    filePath?: string;
    skippedReason?: 'not_configured' | 'no_data';
  }> {
    const configuredDirectory = readSetting(this.deps.getDatabase(), SETTINGS_AUTOMATIC_BACKUP_PATH_KEY)?.trim();
    if (!configuredDirectory) {
      this.deps.logger.debug('Skipping auto-close backup: location not configured');
      return { created: false, skippedReason: 'not_configured' };
    }

    if (!this.hasExistingData()) {
      this.deps.logger.debug('Skipping auto-close backup: no accounting data');
      return { created: false, skippedReason: 'no_data' };
    }

    if (existsSync(configuredDirectory) && !statSync(configuredDirectory).isDirectory()) {
      this.deps.logger.error('Auto-close backup failed: configured path is not a directory', {
        path: configuredDirectory,
      });
      return { created: false };
    }

    mkdirSync(configuredDirectory, { recursive: true });

    let destination: string;
    try {
      destination = resolveUniqueAutoBackupPath(configuredDirectory);
    } catch (error) {
      this.deps.logger.error('Auto-close backup failed: could not allocate a unique filename', {
        path: configuredDirectory,
        error: error instanceof Error ? error.message : String(error),
      });
      return { created: false };
    }

    try {
      await this.create(destination);
      const validated = await this.validate(destination);
      if (!validated.valid) {
        unlinkIfExists(destination);
        throw new Error('Auto-close backup failed validation');
      }
      this.deps.logger.info('Auto-close backup created', { path: destination });
      return { created: true, filePath: destination };
    } catch (error) {
      unlinkIfExists(destination);
      this.deps.logger.error('Auto-close backup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return { created: false };
    }
  }

  /**
   * Validated safety backup required before applying an application update.
   * Uses the existing .cab format under backups/pre-update/.
   */
  async createPreUpdateBackup(): Promise<{ created: true; filePath: string } | { created: false; error: string }> {
    const preUpdateDir = join(this.deps.paths.backups, 'pre-update');
    mkdirSync(preUpdateDir, { recursive: true });

    let fileName = defaultPreUpdateBackupFileName();
    let destination = join(preUpdateDir, fileName);
    let attempt = 0;
    while (existsSync(destination)) {
      attempt += 1;
      fileName = defaultPreUpdateBackupFileName(new Date(Date.now() + attempt * 1000));
      destination = join(preUpdateDir, fileName);
    }

    try {
      await this.create(destination);
      const validated = await this.validate(destination);
      if (!validated.valid) {
        unlinkIfExists(destination);
        this.deps.logger.error('Pre-update backup failed validation', {
          path: destination,
          errors: validated.errors,
        });
        return { created: false, error: 'Pre-update backup failed validation' };
      }
      this.pruneBackupFiles(preUpdateDir, PRE_UPDATE_BACKUP_FILE_PREFIX, PRE_UPDATE_BACKUP_RETENTION);
      this.deps.logger.info('Pre-update backup created', { path: destination });
      return { created: true, filePath: destination };
    } catch (error) {
      unlinkIfExists(destination);
      const message = error instanceof Error ? error.message : String(error);
      this.deps.logger.error('Pre-update backup failed', { error: message });
      return { created: false, error: message };
    }
  }

  async create(destinationPath: string, onProgress?: (progress: BackupProgress) => void): Promise<BackupCreateData> {
    const destination = this.normalizeDestination(destinationPath);
    mkdirSync(dirname(destination), { recursive: true });
    onProgress?.({ stage: 'checkpoint', percent: 10 });
    this.deps.checkpoint();

    const stagingDir = mkdtempSync(join(tmpdir(), 'ca-backup-'));
    const tempArchive = join(stagingDir, `archive.${BACKUP_FILE_EXTENSION}`);
    try {
      onProgress?.({ stage: 'copy', percent: 30 });
      const stagedFiles = this.stageCurrentData(stagingDir);
      const manifest = this.buildManifest(stagedFiles);
      const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
      const signature = buildBackupSignature(manifestBytes, manifest.files);
      writeFileSync(join(stagingDir, BACKUP_MANIFEST_NAME), manifestBytes);
      writeFileSync(join(stagingDir, BACKUP_SIGNATURE_NAME), `${signature}\n`, 'utf8');

      onProgress?.({ stage: 'compress', percent: 75 });
      const zipEntries = [
        { name: BACKUP_MANIFEST_NAME, data: manifestBytes },
        { name: BACKUP_SIGNATURE_NAME, data: Buffer.from(`${signature}\n`, 'utf8') },
        ...stagedFiles.map((file) => ({ name: file.path, data: readFileSync(file.absolutePath) })),
      ];
      const archive = createZipBuffer(zipEntries);
      if (archive.byteLength > MAX_BACKUP_ARCHIVE_BYTES) {
        throw new AppError('BACKUP_WRITE_FAILED', 'writeFailed');
      }
      writeFileSync(tempArchive, archive);
      try {
        renameSync(tempArchive, destination);
      } catch {
        copyFileSync(tempArchive, destination);
        unlinkIfExists(tempArchive);
      }

      this.recordLastBackupAt(new Date().toISOString());
      onProgress?.({ stage: 'done', percent: 100 });
      this.deps.logger.info('Backup created', { path: destination, customers: manifest.statistics.customer_count });

      return {
        success: true,
        filePath: destination,
        fileName: basename(destination),
        fileSizeBytes: statSync(destination).size,
        manifest: summarizeManifest(manifest),
      };
    } catch (error) {
      this.deps.logger.error('Backup creation failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('BACKUP_WRITE_FAILED', 'writeFailed');
    } finally {
      rmSync(stagingDir, { recursive: true, force: true });
    }
  }

  async validate(filePath: string): Promise<BackupValidateData> {
    const hasExistingData = this.safeHasExistingData();
    this.lastValidatedPath = undefined;
    try {
      const extracted = this.extractAndValidate(filePath);
      this.lastValidatedPath = filePath.trim();
      rmSync(extracted.stagingDir, { recursive: true, force: true });
      return {
        valid: true,
        fileName: basename(filePath),
        filePath: filePath.trim(),
        manifest: summarizeManifest(extracted.manifest),
        errors: [],
        warnings: extracted.warnings,
        hasExistingData,
      };
    } catch (error) {
      return {
        valid: false,
        fileName: basename(filePath),
        errors: [errorCodeFromUnknown(error)],
        warnings: [],
        hasExistingData,
      };
    }
  }

  async restore(
    filePath: string,
    confirmed: boolean,
    onProgress?: (progress: BackupProgress) => void,
  ): Promise<RestoreExecuteData> {
    if (confirmed !== true) {
      throw new AppError('RESTORE_CONFIRM_REQUIRED', 'confirmRequired');
    }

    const restorePath = (filePath.trim() || this.lastValidatedPath || '').trim();
    if (!restorePath) {
      throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
    }

    onProgress?.({ stage: 'validate', percent: 10 });
    const extracted = this.extractAndValidate(restorePath);
    let safetyBackupPath: string | undefined;

    try {
      if (this.hasExistingData()) {
        onProgress?.({ stage: 'safety', percent: 25 });
        safetyBackupPath = await this.createSafetyBackup();
      }

      onProgress?.({ stage: 'import', percent: 55 });
      this.importExtractedBackup(extracted);
      onProgress?.({ stage: 'done', percent: 100 });
      this.deps.logger.info('Backup imported', {
        path: restorePath,
        safetyBackupPath,
      });
      return {
        success: true,
        safetyBackupPath,
        sessionInvalidated: false,
      };
    } catch (error) {
      this.deps.logger.error('Backup import failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('RESTORE_FAILED', 'restoreFailed');
    } finally {
      rmSync(extracted.stagingDir, { recursive: true, force: true });
    }
  }

  private importExtractedBackup(extracted: ExtractedBackup): void {
    const backupCopy = join(extracted.stagingDir, 'incoming-migrated.db');
    copyFileSync(extracted.databasePath, backupCopy);

    const backupDb = new Database(backupCopy);
    try {
      backupDb.pragma('journal_mode = DELETE');
      backupDb.pragma('foreign_keys = ON');
      if (!verifySqliteIntegrity(backupCopy)) {
        throw new AppError('BACKUP_CORRUPTED', 'integrityFailed');
      }
      runMigrations(backupDb, this.deps.migrationsDir, this.deps.logger);
      mergeBackupAccountingData({
        liveDb: this.deps.getDatabase(),
        backupDb,
        backupImagesDir: join(extracted.stagingDir, 'images', 'customers'),
        liveImagesDir: this.deps.paths.images,
        logger: this.deps.logger,
      });
    } finally {
      backupDb.close();
    }
  }

  private extractAndValidate(filePath: string): ExtractedBackup {
    const archivePath = filePath.trim();
    if (archivePath.length === 0 || archivePath.includes('\u0000')) {
      throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
    }
    if (!isBackupFilePath(archivePath) || !existsSync(archivePath) || !statSync(archivePath).isFile()) {
      throw new AppError('INVALID_BACKUP', 'invalidFile');
    }
    if (statSync(archivePath).size > MAX_BACKUP_ARCHIVE_BYTES) {
      throw new AppError('INVALID_BACKUP', 'zipBomb');
    }

    const archiveBuffer = readFileSync(archivePath);
    let index;
    try {
      index = listZipIndex(archiveBuffer);
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('INVALID_BACKUP', 'invalidFile');
    }

    if (index.length === 0 || index.length > MAX_BACKUP_ENTRIES) {
      throw new AppError('INVALID_BACKUP', 'invalidFile');
    }

    let uncompressedTotal = 0;
    const seenNames = new Set<string>();
    for (const record of index) {
      const name = assertAllowedBackupEntry(record.name);
      if (seenNames.has(name)) {
        throw new AppError('INVALID_BACKUP', 'invalidFile');
      }
      seenNames.add(name);
      uncompressedTotal += record.uncompressedSize;
      if (uncompressedTotal > MAX_BACKUP_UNCOMPRESSED_BYTES || record.uncompressedSize > MAX_BACKUP_UNCOMPRESSED_BYTES) {
        throw new AppError('INVALID_BACKUP', 'zipBomb');
      }
    }

    const byName = new Map<string, ZipEntry>();
    for (const record of index) {
      const entry = extractZipRecord(archiveBuffer, record);
      const name = assertAllowedBackupEntry(entry.name);
      byName.set(name, { ...entry, name });
    }

    const manifestEntry = byName.get(BACKUP_MANIFEST_NAME);
    const signatureEntry = byName.get(BACKUP_SIGNATURE_NAME);
    const databaseEntry = byName.get(BACKUP_DATABASE_ENTRY);
    if (!manifestEntry || !signatureEntry || !databaseEntry) {
      throw new AppError('INVALID_BACKUP', 'missingFiles');
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(manifestEntry.data.toString('utf8'));
    } catch {
      throw new AppError('INVALID_BACKUP', 'invalidManifest');
    }
    const manifest = parseBackupManifest(parsedJson);
    this.assertSchemaCompatible(manifest.schema_version);

    const expectedFiles = new Set(manifest.files.map((file) => file.path));
    if (!expectedFiles.has(BACKUP_DATABASE_ENTRY)) {
      throw new AppError('INVALID_BACKUP', 'missingFiles');
    }

    for (const file of manifest.files) {
      assertAllowedBackupEntry(file.path);
      const entry = byName.get(file.path);
      if (!entry) {
        throw new AppError('INVALID_BACKUP', 'missingFiles');
      }
      if (sha256(entry.data) !== file.sha256 || entry.data.byteLength !== file.size_bytes) {
        throw new AppError('BACKUP_CORRUPTED', 'corrupted');
      }
    }

    for (const name of byName.keys()) {
      if (name === BACKUP_MANIFEST_NAME || name === BACKUP_SIGNATURE_NAME) {
        continue;
      }
      if (!expectedFiles.has(name)) {
        throw new AppError('INVALID_BACKUP', 'invalidFile');
      }
    }

    const expectedSignature = buildBackupSignature(manifestEntry.data, manifest.files);
    if (signatureEntry.data.toString('utf8').trim().toLowerCase() !== expectedSignature) {
      throw new AppError('BACKUP_CORRUPTED', 'corrupted');
    }
    if (!hasSqliteMagic(databaseEntry.data)) {
      throw new AppError('INVALID_BACKUP', 'invalidFile');
    }

    const stagingDir = mkdtempSync(join(tmpdir(), 'ca-restore-'));
    try {
      for (const [name, entry] of byName) {
        const destination = join(stagingDir, ...name.split('/'));
        mkdirSync(dirname(destination), { recursive: true });
        writeFileSync(destination, entry.data);
      }

      const databasePath = join(stagingDir, ...BACKUP_DATABASE_ENTRY.split('/'));
      if (!verifySqliteIntegrity(databasePath)) {
        throw new AppError('BACKUP_CORRUPTED', 'integrityFailed');
      }

      const warnings = this.collectWarnings(manifest, databasePath);
      return { stagingDir, manifest, warnings, databasePath };
    } catch (error) {
      rmSync(stagingDir, { recursive: true, force: true });
      throw error;
    }
  }

  private stageCurrentData(stagingDir: string): Array<BackupManifestFile & { absolutePath: string }> {
    const databaseDir = join(stagingDir, 'database');
    const imagesDir = join(stagingDir, 'images', 'customers');
    mkdirSync(databaseDir, { recursive: true });
    mkdirSync(imagesDir, { recursive: true });

    const stagedDatabase = join(databaseDir, 'accounting.db');
    copyFileSync(this.deps.paths.database, stagedDatabase);

    const files: Array<BackupManifestFile & { absolutePath: string }> = [
      {
        path: BACKUP_DATABASE_ENTRY,
        sha256: sha256(readFileSync(stagedDatabase)),
        size_bytes: statSync(stagedDatabase).size,
        absolutePath: stagedDatabase,
      },
    ];

    this.stageImageDirectory(this.deps.paths.images, imagesDir, BACKUP_IMAGES_PREFIX, files);

    const companyImagesDir = join(stagingDir, 'images', 'company');
    mkdirSync(companyImagesDir, { recursive: true });
    this.stageImageDirectory(this.deps.paths.companyImages, companyImagesDir, BACKUP_COMPANY_IMAGES_PREFIX, files);

    return files;
  }

  private stageImageDirectory(
    sourceDir: string,
    destinationDir: string,
    prefix: string,
    files: Array<BackupManifestFile & { absolutePath: string }>,
  ): void {
    if (!existsSync(sourceDir)) {
      return;
    }
    for (const filename of readdirSync(sourceDir)) {
      const source = join(sourceDir, filename);
      if (!statSync(source).isFile()) {
        continue;
      }
      try {
        assertAllowedBackupEntry(`${prefix}${filename}`);
      } catch {
        continue;
      }
      const destination = join(destinationDir, filename);
      copyFileSync(source, destination);
      files.push({
        path: `${prefix}${filename}`,
        sha256: sha256(readFileSync(destination)),
        size_bytes: statSync(destination).size,
        absolutePath: destination,
      });
    }
  }

  private buildManifest(files: BackupManifestFile[]): BackupManifest {
    const db = this.deps.getDatabase();
    const customerCount = countRows(db, 'customers');
    const transactionCount = countRows(db, 'transactions');
    const currencyCodes = listActiveCurrencyCodes(db);
    const language = readSetting(db, 'language') ?? 'en';

    return {
      format_version: BACKUP_FORMAT_VERSION,
      app_version: this.deps.appVersion ?? APP_VERSION,
      schema_version: getAppliedSchemaVersion(db),
      created_at: new Date().toISOString(),
      created_by: 'FMT',
      platform: process.platform,
      statistics: {
        customer_count: customerCount,
        transaction_count: transactionCount,
        currency_codes: currencyCodes,
      },
      files: files.map(({ path, sha256: hash, size_bytes }) => ({
        path,
        sha256: hash,
        size_bytes,
      })),
      settings_snapshot: {
        language,
      },
    };
  }

  private collectWarnings(manifest: BackupManifest, databasePath: string): string[] {
    const warnings: string[] = [];
    const appVersion = this.deps.appVersion ?? APP_VERSION;
    if (manifest.app_version !== appVersion) {
      warnings.push('appVersionWarning');
    }

    const inspect = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      const customerCount = countRowsIfPresent(inspect, 'customers');
      const transactionCount = countRowsIfPresent(inspect, 'transactions');
      if (
        customerCount !== null &&
        transactionCount !== null &&
        (customerCount !== manifest.statistics.customer_count ||
          transactionCount !== manifest.statistics.transaction_count)
      ) {
        warnings.push('statisticsWarning');
      }
    } finally {
      inspect.close();
    }

    return warnings;
  }

  private assertSchemaCompatible(schemaVersion: number): void {
    const available = getAvailableSchemaVersion(this.deps.migrationsDir);
    if (schemaVersion > available) {
      throw new AppError('BACKUP_VERSION_MISMATCH', 'versionMismatch');
    }
  }

  private async createSafetyBackup(): Promise<string> {
    const autoDir = join(this.deps.paths.backups, 'auto');
    mkdirSync(autoDir, { recursive: true });
    let fileName = defaultSafetyBackupFileName();
    let destination = join(autoDir, fileName);
    let attempt = 0;
    while (existsSync(destination)) {
      attempt += 1;
      fileName = defaultSafetyBackupFileName(new Date(Date.now() + attempt * 1000));
      destination = join(autoDir, fileName);
    }
    await this.create(destination);
    const previousValidatedPath = this.lastValidatedPath;
    const validated = await this.validate(destination);
    this.lastValidatedPath = previousValidatedPath;
    if (!validated.valid) {
      unlinkIfExists(destination);
      throw new AppError('BACKUP_WRITE_FAILED', 'writeFailed');
    }
    this.pruneBackupFiles(autoDir, SAFETY_BACKUP_FILE_PREFIX, SAFETY_BACKUP_RETENTION);
    return destination;
  }

  private normalizeDestination(destinationPath: string): string {
    const trimmed = destinationPath.trim();
    if (trimmed.length === 0 || trimmed.includes('\u0000')) {
      throw new AppError('INVALID_REQUEST', 'INVALID_REQUEST');
    }
    if (trimmed.toLowerCase().endsWith(`.${BACKUP_FILE_EXTENSION}`)) {
      return trimmed;
    }
    return `${trimmed}.${BACKUP_FILE_EXTENSION}`;
  }

  private pruneBackupFiles(dir: string, prefix: string, retention: number): void {
    const files = readdirSync(dir)
      .filter(
        (name) => name.startsWith(prefix) && name.toLowerCase().endsWith(`.${BACKUP_FILE_EXTENSION}`),
      )
      .map((name) => {
        const path = join(dir, name);
        return { path, mtimeMs: statSync(path).mtimeMs };
      })
      .sort((left, right) => right.mtimeMs - left.mtimeMs);

    for (const file of files.slice(retention)) {
      try {
        unlinkSync(file.path);
        this.deps.logger.debug('Pruned old backup file', { path: file.path, prefix });
      } catch (error) {
        this.deps.logger.warn('Failed to prune backup file', {
          path: file.path,
          prefix,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private recordLastBackupAt(iso: string): void {
    this.deps
      .getDatabase()
      .prepare(
        `INSERT INTO app_metadata (key, value) VALUES ('last_backup_at', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(iso);
  }

  private safeHasExistingData(): boolean {
    try {
      return this.hasExistingData();
    } catch {
      return false;
    }
  }
}

export function hasExistingAccountingData(db: Database.Database): boolean {
  return (countRowsIfPresent(db, 'customers') ?? 0) > 0 || (countRowsIfPresent(db, 'transactions') ?? 0) > 0;
}

function countRowsIfPresent(db: Database.Database, table: 'customers' | 'transactions'): number | null {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { name: string } | undefined;
  if (!exists) {
    return null;
  }
  return countRows(db, table);
}

function countRows(db: Database.Database, table: 'customers' | 'transactions'): number {
  const sql =
    table === 'customers'
      ? 'SELECT COUNT(*) AS count FROM customers'
      : 'SELECT COUNT(*) AS count FROM transactions';
  const row = db.prepare(sql).get() as { count: number };
  return row.count;
}

function listActiveCurrencyCodes(db: Database.Database): string[] {
  const rows = db
    .prepare('SELECT code FROM currencies WHERE is_active = 1 ORDER BY sort_order ASC, code ASC')
    .all() as Array<{ code: string }>;
  return rows.map((row) => row.code);
}

function readSetting(db: Database.Database, key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value;
}

function errorCodeFromUnknown(error: unknown): string {
  if (error instanceof AppError) {
    return error.message;
  }
  return 'invalidFile';
}

function unlinkIfExists(filePath: string): void {
  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
}
