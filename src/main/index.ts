import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'node:path';
import { loadAppConfig } from './config/appConfig';
import { resolveAppIconPath } from './config/appIconPath';
import { resolveAppPaths } from './config/paths';
import { registerIpcHandlers } from './ipc/registerHandlers';
import {
  createApplicationContext,
  shutdownApplicationContext,
  type ApplicationContext,
} from './services/applicationContext';
import { Logger } from './utils/logger';

let mainWindow: BrowserWindow | null = null;
let appContext: ApplicationContext | null = null;
let isQuitting = false;

const AUTO_CLOSE_BACKUP_TIMEOUT_MS = 120_000;

const APP_USER_DATA_NAME = 'CustomerAccounting';
const isDev = !app.isPackaged;

function configureAppIdentity(): void {
  app.setName(APP_USER_DATA_NAME);
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.customeraccounting.app');
  }
}

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

async function bootstrap(): Promise<void> {
  configureAppIdentity();

  const config = loadAppConfig();
  const paths = resolveAppPaths();
  const logger = new Logger(paths.logs, config);

  logger.info('Application starting', { version: config.version, isDev: config.isDev });

  appContext = await createApplicationContext(config, logger);
  registerIpcHandlers(ipcMain, appContext);

  mainWindow = await createMainWindow(appContext);

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
    if (!appContext || isQuitting) {
      return;
    }

    event.preventDefault();
    isQuitting = true;
    const ctx = appContext;

    void (async () => {
      try {
        await Promise.race([
          ctx.backupService.createAutoCloseBackup(),
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Auto-close backup timed out')), AUTO_CLOSE_BACKUP_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        ctx.logger.warn('Auto-close backup skipped or failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      shutdownApplicationContext(ctx);
      appContext = null;
      app.quit();
    })();
  });
}
