import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';
import { isHexColor, parseThemeAppearance } from '@shared/theme';
import { isSupportedLocale, type SupportedLocale } from '@shared/types/locale';
import type { SettingsUpdateInput } from '@shared/types/settings';

function parseSettingsUpdate(input: unknown): SettingsUpdateInput & { sessionId?: string } {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'Invalid settings request');
  }

  const record = input as Record<string, unknown>;
  const patch: SettingsUpdateInput & { sessionId?: string } = {};

  if (typeof record.sessionId === 'string' && record.sessionId.trim().length > 0) {
    patch.sessionId = record.sessionId;
  }

  if (record.language !== undefined) {
    if (typeof record.language !== 'string' || !isSupportedLocale(record.language)) {
      throw new AppError('VALIDATION_ERROR', 'INVALID_LANGUAGE');
    }
    patch.language = record.language as SupportedLocale;
  }

  if (record.paginationEnabled !== undefined) {
    if (typeof record.paginationEnabled !== 'boolean') {
      throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
    }
    patch.paginationEnabled = record.paginationEnabled;
  }

  if (record.paginationPageSize !== undefined) {
    if (typeof record.paginationPageSize !== 'number') {
      throw new AppError('VALIDATION_ERROR', 'INVALID_PAGE_SIZE');
    }
    patch.paginationPageSize = record.paginationPageSize;
  }

  if (record.exchangeEnabled !== undefined) {
    if (typeof record.exchangeEnabled !== 'boolean') {
      throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
    }
    patch.exchangeEnabled = record.exchangeEnabled;
  }

  if (record.resetAppearance === true) {
    patch.resetAppearance = true;
  }

  if (record.theme !== undefined) {
    if (!record.theme || typeof record.theme !== 'object' || Array.isArray(record.theme)) {
      throw new AppError('INVALID_COLOR', 'INVALID_COLOR');
    }
    const theme = record.theme as Record<string, unknown>;
    if (!isHexColor(theme.primary) || !isHexColor(theme.accent)) {
      throw new AppError('INVALID_COLOR', 'INVALID_COLOR');
    }
    patch.theme = parseThemeAppearance(theme);
  }

  return patch;
}

export function registerSettingsHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  // Language is a pre-login UI preference (localization.md §3).
  ipcMain.handle(IPC_CHANNELS.SETTINGS_GET, () =>
    wrapIpcHandler(() => ctx.settingsService.get()),
  );

  ipcMain.handle(IPC_CHANNELS.SETTINGS_UPDATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const patch = parseSettingsUpdate(input);
      const requiresSession =
        patch.paginationEnabled !== undefined ||
        patch.paginationPageSize !== undefined ||
        patch.exchangeEnabled !== undefined ||
        patch.theme !== undefined ||
        patch.resetAppearance === true;

      if (requiresSession) {
        if (!patch.sessionId) {
          throw new AppError('NOT_AUTHENTICATED', 'Authentication required');
        }
        ctx.authService.requireSession(patch.sessionId);
      }

      return ctx.settingsService.update({
        language: patch.language,
        paginationEnabled: patch.paginationEnabled,
        paginationPageSize: patch.paginationPageSize,
        exchangeEnabled: patch.exchangeEnabled,
        theme: patch.theme,
        resetAppearance: patch.resetAppearance,
      });
    }),
  );
}
