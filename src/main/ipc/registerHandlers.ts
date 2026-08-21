import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { registerAppHandlers } from './app.handlers';

export function registerIpcHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  registerAppHandlers(ipcMain, ctx);
}
