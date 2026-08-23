import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';

function parseLoginRequest(input: unknown): { username: string; password: string } {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'Invalid login request');
  }

  const record = input as Record<string, unknown>;
  if (typeof record.username !== 'string' || typeof record.password !== 'string') {
    throw new AppError('INVALID_REQUEST', 'Username and password must be strings');
  }

  return {
    username: record.username,
    password: record.password,
  };
}

function parseSessionRequest(input: unknown): { sessionId: string } {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'Invalid session request');
  }

  const record = input as Record<string, unknown>;
  if (typeof record.sessionId !== 'string') {
    throw new AppError('INVALID_REQUEST', 'Session ID must be a string');
  }

  return { sessionId: record.sessionId };
}

export function registerAuthHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.AUTH_LOGIN, (_event, input: unknown) =>
    wrapIpcHandler(async () => {
      const { username, password } = parseLoginRequest(input);
      return ctx.authService.login(username, password);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_LOGOUT, (_event, input: unknown) =>
    wrapIpcHandler(async () => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.logout(sessionId);
      return { success: true as const };
    }),
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_CHECK_SESSION, (_event, input: unknown) =>
    wrapIpcHandler(async () => {
      const sessionId =
        input && typeof input === 'object' && typeof (input as { sessionId?: unknown }).sessionId === 'string'
          ? (input as { sessionId: string }).sessionId
          : undefined;

      return ctx.authService.checkSession(sessionId);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_CHANGE_PASSWORD, (_event, input: unknown) =>
    wrapIpcHandler(async () => {
      const record = asRecord(input);
      return ctx.authService.changePassword(
        stringField(record, 'sessionId'),
        record.currentPassword,
        record.newPassword,
        record.confirmPassword,
      );
    }),
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_SET_RECOVERY, (_event, input: unknown) =>
    wrapIpcHandler(async () => {
      const record = asRecord(input);
      return ctx.authService.setRecovery(stringField(record, 'sessionId'), record.question, record.answer);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_RECOVERY_STATUS, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const record = asRecord(input);
      return ctx.authService.getRecoveryStatus(stringField(record, 'sessionId'));
    }),
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_RECOVERY_PROMPT, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const record = asRecord(input);
      return ctx.authService.recoveryPrompt(record.username);
    }),
  );

  ipcMain.handle(IPC_CHANNELS.AUTH_RECOVER_PASSWORD, (_event, input: unknown) =>
    wrapIpcHandler(async () => {
      const record = asRecord(input);
      return ctx.authService.recoverPassword(
        record.username,
        record.answer,
        record.newPassword,
        record.confirmPassword,
      );
    }),
  );
}

function asRecord(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'Invalid request');
  }
  return input as Record<string, unknown>;
}

function stringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError('NOT_AUTHENTICATED', 'Authentication required');
  }
  return value;
}
