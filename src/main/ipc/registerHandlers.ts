import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { registerAppHandlers } from './app.handlers';
import { registerAuthHandlers } from './auth.handlers';
import { registerCustomerHandlers } from './customers.handlers';
import { registerSettingsHandlers } from './settings.handlers';
import { registerTransactionHandlers } from './transactions.handlers';
import { registerReportHandlers } from './reports.handlers';
import { registerImportHandlers } from './import.handlers';
import { registerBackupHandlers } from './backup.handlers';
import { registerCompanyHandlers } from './company.handlers';
import { registerUpdateHandlers } from './update.handlers';

export function registerIpcHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  registerAuthHandlers(ipcMain, ctx);
  registerAppHandlers(ipcMain, ctx);
  registerCustomerHandlers(ipcMain, ctx);
  registerTransactionHandlers(ipcMain, ctx);
  registerSettingsHandlers(ipcMain, ctx);
  registerReportHandlers(ipcMain, ctx);
  registerImportHandlers(ipcMain, ctx);
  registerBackupHandlers(ipcMain, ctx);
  registerCompanyHandlers(ipcMain, ctx);
  registerUpdateHandlers(ipcMain, ctx);
}
