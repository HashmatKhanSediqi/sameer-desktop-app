import type { BrowserWindow } from 'electron';
import type { AutomaticBackupChooseData } from '@shared/types/backup';
import type { SettingsService } from '../settings/settingsService';
import { automaticBackupFolderDialogCopy } from './automaticBackupDialog';

export async function showAutomaticBackupFolderDialog(
  settingsService: SettingsService,
  browserWindow: BrowserWindow | null,
): Promise<AutomaticBackupChooseData> {
  const electron = await import('electron');
  const copy = automaticBackupFolderDialogCopy(settingsService.get().language);
  const dialogOptions = {
    title: copy.title,
    buttonLabel: copy.buttonLabel,
    properties: ['openDirectory' as const, 'createDirectory' as const],
  };
  const result = browserWindow
    ? await electron.dialog.showOpenDialog(browserWindow, dialogOptions)
    : await electron.dialog.showOpenDialog(dialogOptions);

  if (result.canceled || !result.filePaths[0]) {
    return {
      canceled: true,
      config: settingsService.markAutomaticBackupPrompted(),
    };
  }

  return {
    canceled: false,
    config: settingsService.setAutomaticBackupPath(result.filePaths[0]),
  };
}

export async function promptAutomaticBackupLocationIfNeeded(
  settingsService: SettingsService,
  browserWindow: BrowserWindow | null,
): Promise<void> {
  if (!settingsService.shouldPromptAutomaticBackupLocation()) {
    return;
  }
  await showAutomaticBackupFolderDialog(settingsService, browserWindow);
}
