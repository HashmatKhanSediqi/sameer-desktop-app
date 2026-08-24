import {
  getUpdatePublishConfig,
  UPDATE_AUTO_CHECK_INTERVAL_MS,
} from '@shared/constants/updateConfig';
import { isNewerVersion, isSameVersion, parseSemVer } from '@shared/semver';
import type { UpdateProgress, UpdateStatusSnapshot, UpdateUiState } from '@shared/types/update';
import { AppError } from '../../utils/errors';
import type { Logger } from '../../utils/logger';
import type { BackupService } from '../backup/backupService';
import {
  createElectronUpdaterAdapter,
  type ElectronUpdaterAdapter,
  type UpdateCheckResultLike,
} from './electronUpdaterAdapter';
import { isNoUpdateAvailableError } from './updateErrors';

export interface UpdateServiceDeps {
  currentVersion: string;
  packaged: boolean;
  logger: Logger;
  backupService: BackupService;
  updater?: ElectronUpdaterAdapter | null;
  now?: () => Date;
}

function releaseNotesToString(
  notes: UpdateCheckResultLike['updateInfo']['releaseNotes'],
): string | null {
  if (notes == null) {
    return null;
  }
  if (typeof notes === 'string') {
    const trimmed = notes.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(notes)) {
    const joined = notes
      .map((entry) => entry.note?.trim() ?? '')
      .filter((value) => value.length > 0)
      .join('\n');
    return joined.length > 0 ? joined : null;
  }
  return null;
}

export class UpdateService {
  private readonly updater: ElectronUpdaterAdapter | null;
  private readonly currentVersion: string;
  private readonly packaged: boolean;
  private readonly logger: Logger;
  private backupService: BackupService;
  private readonly now: () => Date;

  private state: UpdateUiState;
  private availableVersion: string | null = null;
  private releaseNotes: string | null = null;
  private progress: UpdateProgress | null = null;
  private errorCode: string | null = null;
  private errorMessage: string | null = null;
  private safetyBackupPath: string | null = null;
  private lastCheckedAt: string | null = null;
  private lastAutoCheckAt = 0;
  private listeners = new Set<(status: UpdateStatusSnapshot) => void>();
  private installPending = false;
  private installInFlight = false;

  constructor(deps: UpdateServiceDeps) {
    this.currentVersion = deps.currentVersion;
    this.packaged = deps.packaged;
    this.logger = deps.logger;
    this.backupService = deps.backupService;
    this.now = deps.now ?? (() => new Date());
    this.updater = deps.updater === undefined ? createElectronUpdaterAdapter() : deps.updater;
    this.state = this.packaged && this.updater ? 'idle' : 'unsupported';

    if (this.updater && this.packaged) {
      this.configureUpdater(this.updater);
    }
  }

  isInstallPending(): boolean {
    return this.installPending;
  }

  setBackupService(backupService: BackupService): void {
    this.backupService = backupService;
  }

  getStatus(): UpdateStatusSnapshot {
    const publish = getUpdatePublishConfig();
    return {
      state: this.state,
      currentVersion: this.currentVersion,
      availableVersion: this.availableVersion,
      releaseNotes: this.releaseNotes,
      progress: this.progress,
      errorCode: this.errorCode,
      errorMessage: this.errorMessage,
      safetyBackupPath: this.safetyBackupPath,
      lastCheckedAt: this.lastCheckedAt,
      packaged: this.packaged,
      provider: { owner: publish.owner, repo: publish.repo },
    };
  }

  onStatus(listener: (status: UpdateStatusSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async maybeAutoCheck(): Promise<UpdateStatusSnapshot> {
    if (!this.packaged || !this.updater) {
      return this.getStatus();
    }
    const elapsed = Date.now() - this.lastAutoCheckAt;
    if (this.lastAutoCheckAt > 0 && elapsed < UPDATE_AUTO_CHECK_INTERVAL_MS) {
      return this.getStatus();
    }
    try {
      return await this.checkForUpdates();
    } catch {
      return this.getStatus();
    }
  }

  async checkForUpdates(): Promise<UpdateStatusSnapshot> {
    if (!this.packaged || !this.updater) {
      this.setState('unsupported', {
        errorCode: 'UPDATE_UNSUPPORTED',
        errorMessage: 'unsupportedEnvironment',
      });
      return this.getStatus();
    }

    this.setState('checking', { errorCode: null, errorMessage: null, progress: null });
    try {
      const result = await this.updater.checkForUpdates();
      this.lastCheckedAt = this.now().toISOString();
      this.lastAutoCheckAt = Date.now();
      if (result && result.isUpdateAvailable === false) {
        return this.markUpToDate();
      }
      return this.applyCheckResult(result);
    } catch (error) {
      this.lastCheckedAt = this.now().toISOString();
      this.lastAutoCheckAt = Date.now();
      if (isNoUpdateAvailableError(error)) {
        return this.markUpToDate();
      }
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Update check failed', { error: message });
      this.setState('error', {
        errorCode: 'UPDATE_CHECK_FAILED',
        errorMessage: 'checkFailed',
      });
      throw new AppError('UPDATE_CHECK_FAILED', 'checkFailed');
    }
  }

  async downloadUpdate(): Promise<UpdateStatusSnapshot> {
    if (!this.packaged || !this.updater) {
      throw new AppError('UPDATE_UNSUPPORTED', 'unsupportedEnvironment');
    }
    if (this.state !== 'available' && this.state !== 'error' && this.state !== 'downloading') {
      if (this.state === 'ready') {
        return this.getStatus();
      }
      throw new AppError('UPDATE_NOT_AVAILABLE', 'notAvailable');
    }
    if (!this.availableVersion) {
      throw new AppError('UPDATE_NOT_AVAILABLE', 'notAvailable');
    }

    this.setState('downloading', {
      errorCode: null,
      errorMessage: null,
      progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 },
    });

    try {
      await this.updater.downloadUpdate();
      this.setState('ready', {
        progress: null,
        errorCode: null,
        errorMessage: null,
      });
      return this.getStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Update download failed', { error: message });
      this.setState('error', {
        errorCode: 'UPDATE_DOWNLOAD_FAILED',
        errorMessage: 'downloadFailed',
        progress: null,
      });
      throw new AppError('UPDATE_DOWNLOAD_FAILED', 'downloadFailed');
    }
  }

  async installUpdate(): Promise<UpdateStatusSnapshot> {
    if (!this.packaged || !this.updater) {
      throw new AppError('UPDATE_UNSUPPORTED', 'unsupportedEnvironment');
    }
    if (this.state !== 'ready') {
      throw new AppError('UPDATE_NOT_READY', 'notReady');
    }
    if (this.installInFlight) {
      return this.getStatus();
    }

    this.installInFlight = true;
    try {
      const backup = await this.backupService.createPreUpdateBackup();
      if (!backup.created) {
        this.setState('error', {
          errorCode: 'UPDATE_BACKUP_FAILED',
          errorMessage: 'backupFailed',
          safetyBackupPath: null,
        });
        throw new AppError('UPDATE_BACKUP_FAILED', 'backupFailed');
      }

      this.safetyBackupPath = backup.filePath;
      this.installPending = true;
      this.emit();
      this.logger.info('Installing update after validated pre-update backup', {
        version: this.availableVersion,
        safetyBackupPath: backup.filePath,
      });
      this.updater.quitAndInstall(false, true);
      return this.getStatus();
    } catch (error) {
      this.installPending = false;
      throw error;
    } finally {
      this.installInFlight = false;
    }
  }

  private markUpToDate(): UpdateStatusSnapshot {
    this.setState('upToDate', {
      availableVersion: null,
      releaseNotes: null,
      errorCode: null,
      errorMessage: null,
    });
    return this.getStatus();
  }

  private applyCheckResult(result: UpdateCheckResultLike | null): UpdateStatusSnapshot {
    if (!result?.updateInfo?.version) {
      return this.markUpToDate();
    }

    const remoteVersion = result.updateInfo.version.trim();
    if (!parseSemVer(remoteVersion)) {
      this.setState('error', {
        errorCode: 'UPDATE_INVALID_VERSION',
        errorMessage: 'invalidVersion',
        availableVersion: null,
        releaseNotes: null,
      });
      return this.getStatus();
    }

    if (isSameVersion(remoteVersion, this.currentVersion) || !isNewerVersion(remoteVersion, this.currentVersion)) {
      return this.markUpToDate();
    }

    this.setState('available', {
      availableVersion: remoteVersion,
      releaseNotes: releaseNotesToString(result.updateInfo.releaseNotes),
      errorCode: null,
      errorMessage: null,
    });
    return this.getStatus();
  }

  private configureUpdater(updater: ElectronUpdaterAdapter): void {
    updater.autoDownload = false;
    updater.allowDowngrade = false;
    updater.autoInstallOnAppQuit = false;
    updater.logger = this.logger;
    // Packaged builds use resources/app-update.yml generated by electron-builder.
    // Do not call setFeedURL() — it overrides that public GitHub configuration.

    updater.removeAllListeners('checking-for-update');
    updater.removeAllListeners('update-available');
    updater.removeAllListeners('update-not-available');
    updater.removeAllListeners('download-progress');
    updater.removeAllListeners('update-downloaded');
    updater.removeAllListeners('update-cancelled');
    updater.removeAllListeners('error');

    updater.on('update-not-available', () => {
      if (this.state === 'checking' || this.state === 'idle') {
        this.markUpToDate();
      }
    });

    updater.on('update-available', (info) => {
      if (!info?.version || this.state === 'downloading' || this.state === 'ready') {
        return;
      }
      if (!parseSemVer(info.version) || !isNewerVersion(info.version, this.currentVersion)) {
        return;
      }
      this.setState('available', {
        availableVersion: info.version,
        errorCode: null,
        errorMessage: null,
      });
    });

    updater.on('download-progress', (progress) => {
      this.progress = {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total,
      };
      if (this.state === 'downloading') {
        this.emit();
      }
    });

    updater.on('update-downloaded', (info) => {
      if (info.version) {
        this.availableVersion = info.version;
      }
      this.setState('ready', { progress: null, errorCode: null, errorMessage: null });
    });

    updater.on('update-cancelled', (error) => {
      this.logger.warn('Updater cancelled', { error: error?.message ?? 'cancelled' });
      if (this.state === 'downloading') {
        this.setState('error', {
          errorCode: 'UPDATE_DOWNLOAD_FAILED',
          errorMessage: 'downloadFailed',
          progress: null,
        });
      }
    });

    updater.on('error', (error) => {
      this.logger.warn('Updater error event', { error: error.message });
      if (this.state === 'upToDate' || this.state === 'available' || this.state === 'ready') {
        return;
      }
      if (this.state === 'checking' && isNoUpdateAvailableError(error)) {
        this.markUpToDate();
        return;
      }
      if (this.state === 'checking' || this.state === 'downloading') {
        this.setState('error', {
          errorCode: this.state === 'checking' ? 'UPDATE_CHECK_FAILED' : 'UPDATE_DOWNLOAD_FAILED',
          errorMessage: this.state === 'checking' ? 'checkFailed' : 'downloadFailed',
          progress: null,
        });
      }
    });
  }

  private setState(
    state: UpdateUiState,
    patch: Partial<{
      availableVersion: string | null;
      releaseNotes: string | null;
      progress: UpdateProgress | null;
      errorCode: string | null;
      errorMessage: string | null;
      safetyBackupPath: string | null;
    }> = {},
  ): void {
    this.state = state;
    if (patch.availableVersion !== undefined) {
      this.availableVersion = patch.availableVersion;
    }
    if (patch.releaseNotes !== undefined) {
      this.releaseNotes = patch.releaseNotes;
    }
    if (patch.progress !== undefined) {
      this.progress = patch.progress;
    }
    if (patch.errorCode !== undefined) {
      this.errorCode = patch.errorCode;
    }
    if (patch.errorMessage !== undefined) {
      this.errorMessage = patch.errorMessage;
    }
    if (patch.safetyBackupPath !== undefined) {
      this.safetyBackupPath = patch.safetyBackupPath;
    }
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getStatus();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}
