import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { IPC_CHANNELS } from '@shared/types/ipc';
import { getMigrationsDirectory } from './config/migrationsPath';
import { BackupService } from './services/backup/backupService';
import { RecoveryService, RECOVERY_PENDING_FILE } from './services/backup/recoveryService';
import { registerRecoveryHandlers } from './ipc/recovery.handlers';
import { initializeOrRecover } from './services/startupRecovery';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { UPDATE_AUTO_CHECK_STARTUP_DELAY_MS } from '@shared/constants/updateConfig';
import { loadAppConfig } from './config/appConfig';
import { resolveAppIconPath } from './config/appIconPath';
import { resolveAppPaths } from './config/paths';
import { registerIpcHandlers } from './ipc/registerHandlers';
import {
  createApplicationContext,
  shutdownApplicationContext,
  type ApplicationContext,
} from './services/applicationContext';
import { promptAutomaticBackupLocationIfNeeded } from './services/backup/showAutomaticBackupFolderDialog';
import { QuitBackupCoordinator } from './services/backup/quitBackupCoordinator';
import { Logger } from './utils/logger';

let mainWindow: BrowserWindow | null = null;
let appContext: ApplicationContext | null = null;
let quitBackupCoordinator: QuitBackupCoordinator | null = null;

const AUTO_CLOSE_BACKUP_TIMEOUT_MS = 120_000;

const APP_USER_DATA_NAME = 'CustomerAccounting';
const isDev = !app.isPackaged;

function configureAppIdentity(): void {
  app.setName(APP_USER_DATA_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.customeraccounting.app');
  }

  // Must run before app.whenReady() so userData is not %APPDATA%\FMT.
  const preferred = join(app.getPath('appData'), APP_USER_DATA_NAME);
  const legacyFmt = join(app.getPath('appData'), 'FMT');
  if (existsSync(preferred) || !existsSync(legacyFmt)) {
    app.setPath('userData', preferred);
  } else {
    // Keep 1.0.0 data that landed in the productName folder.
    app.setPath('userData', legacyFmt);
  }
}

configureAppIdentity();

async function createMainWindow(ctx: ApplicationContext): Promise<BrowserWindow> {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: resolveAppIconPath(),
    title: ctx.config.appName,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.on('ready-to-show', () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    await window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return window;
}

function scheduleAutomaticUpdateCheck(ctx: ApplicationContext): void {
  if (!ctx.packaged) {
    return;
  }

  setTimeout(() => {
    void ctx.updateService.maybeAutoCheck().catch((error: unknown) => {
      ctx.logger.warn('Automatic update check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, UPDATE_AUTO_CHECK_STARTUP_DELAY_MS);
}

async function bootstrap(): Promise<void> {
  const config = loadAppConfig();
  const paths = resolveAppPaths();
  const logger = new Logger(paths.logs, config);

  logger.info('Application starting', { version: config.version, isDev: config.isDev });

  appContext = await initializeOrRecover(
    () => {
      if (existsSync(join(paths.userData, RECOVERY_PENDING_FILE))) {
        return Promise.reject(new Error('An earlier recovery was interrupted. Preserved data is in the backups folder. Select a backup to complete recovery.'));
      }
      return createApplicationContext(config, logger, { packaged: app.isPackaged });
    },
    async (error) => {
      logger.error('Normal database startup failed; entering recovery mode', {
        error: error instanceof Error ? error.message : String(error),
      });
      await createRecoveryWindow(error instanceof Error ? error.message : 'Database initialization failed');
    },
  );
  if (!appContext) return;
  quitBackupCoordinator = new QuitBackupCoordinator(AUTO_CLOSE_BACKUP_TIMEOUT_MS, logger);
  registerIpcHandlers(ipcMain, appContext);

  mainWindow = await createMainWindow(appContext);
  await promptAutomaticBackupLocationIfNeeded(appContext.settingsService, mainWindow);
  scheduleAutomaticUpdateCheck(appContext);

  logger.info('Application ready', {
    userData: appContext.paths.userData,
    database: appContext.paths.database,
  });
}

async function createRecoveryWindow(reason: string): Promise<void> {
  const config = loadAppConfig();
  const paths = resolveAppPaths();
  const logger = new Logger(paths.logs, config);
  const unavailable = (): never => { throw new Error('Normal database unavailable in Recovery Mode'); };
  const backups = new BackupService({
    paths, logger, appVersion: config.version, migrationsDir: getMigrationsDirectory(),
    getDatabase: unavailable, checkpoint: unavailable, closeDatabase: unavailable,
    reopenDatabase: unavailable, rebindServices: unavailable, invalidateSessions: unavailable,
  });
  const recovery = new RecoveryService({ paths, backups,
    initialize: (paths) => createApplicationContext(config, logger, { paths, packaged: app.isPackaged }),
  });
  const window = new BrowserWindow({
    width: 1024, height: 760, minWidth: 760, minHeight: 600, show: false,
    autoHideMenuBar: true, title: 'FMT — Recovery Mode',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), additionalArguments: ['--fmt-recovery'],
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  mainWindow = window;
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  const handlers = registerRecoveryHandlers(ipcMain, {
    reason, backups, recovery,
    allowed: (event) => event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame,
    chooseFile: async () => {
      const choice = await dialog.showOpenDialog(window, { properties: ['openFile'],
        filters: [{ name: 'FMT Customer Accounting backup', extensions: ['cab'] }] });
      return choice.canceled ? undefined : choice.filePaths[0];
    },
    login: async (context) => {
      registerIpcHandlers(ipcMain, context);
      try {
        const normalWindow = await createMainWindow(context);
        appContext = context;
        quitBackupCoordinator = new QuitBackupCoordinator(AUTO_CLOSE_BACKUP_TIMEOUT_MS, logger);
        mainWindow = normalWindow;
        handlers.dispose();
        // Transfer ownership before destroying the recovery window.
        window.removeAllListeners('closed');
        window.destroy();
        scheduleAutomaticUpdateCheck(context);
      } catch (error) {
        for (const channel of Object.values(IPC_CHANNELS)) ipcMain.removeHandler(channel);
        throw error;
      }
    },
  });
  window.on('close', (event) => { if (handlers.isBusy()) event.preventDefault(); });
  window.once('closed', () => { handlers.dispose(); handlers.close(); });
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    await window.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    await window.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    void bootstrap().catch((error: unknown) => {
      console.error('Failed to start application', error);
      app.quit();
    });
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && appContext) {
      void createMainWindow(appContext).then((window) => {
        mainWindow = window;
      });
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('before-quit', (event) => {
    if (quitBackupCoordinator?.isFinished()) {
      return;
    }

    if (quitBackupCoordinator?.shouldBlockQuit()) {
      event.preventDefault();
      return;
    }

    if (!appContext || !quitBackupCoordinator) {
      return;
    }

    // Allow electron-updater quitAndInstall to proceed without auto-close backup delay.
    if (appContext.updateService.isInstallPending()) {
      if (!quitBackupCoordinator.tryBegin()) {
        event.preventDefault();
        return;
      }
      const ctx = appContext;
      shutdownApplicationContext(ctx);
      appContext = null;
      quitBackupCoordinator.markFinished();
      return;
    }

    if (!quitBackupCoordinator.tryBegin()) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    const ctx = appContext;
    const coordinator = quitBackupCoordinator;

    void (async () => {
      await coordinator.runBackupAttempt(() => ctx.backupService.createAutoCloseBackup());
      shutdownApplicationContext(ctx);
      appContext = null;
      coordinator.markFinished();
      app.quit();
    })();
  });
}
