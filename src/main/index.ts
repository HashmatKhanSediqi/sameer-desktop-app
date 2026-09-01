import { app, BrowserWindow, ipcMain, shell } from 'electron';
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

  appContext = await createApplicationContext(config, logger, { packaged: app.isPackaged });
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
