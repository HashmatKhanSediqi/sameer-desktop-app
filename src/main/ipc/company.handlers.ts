import type { IpcMain } from 'electron';
import type { ApplicationContext } from '../services/applicationContext';
import { AppError, wrapIpcHandler } from '../utils/errors';
import { IPC_CHANNELS } from '@shared/types/ipc';
import type { CompanyUpdateInput } from '@shared/types/company';

function parseSessionRequest(input: unknown): { sessionId: string; record: Record<string, unknown> } {
  if (!input || typeof input !== 'object') {
    throw new AppError('INVALID_REQUEST', 'Invalid request');
  }

  const record = input as Record<string, unknown>;
  if (typeof record.sessionId !== 'string' || record.sessionId.trim().length === 0) {
    throw new AppError('NOT_AUTHENTICATED', 'Authentication required');
  }

  return { sessionId: record.sessionId, record };
}

function optionalString(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
  }
  return value;
}

export function registerCompanyHandlers(ipcMain: IpcMain, ctx: ApplicationContext): void {
  ipcMain.handle(IPC_CHANNELS.COMPANY_GET, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.companyService.get();
    }),
  );

  ipcMain.handle(IPC_CHANNELS.COMPANY_GET_LOGO, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      return ctx.companyService.getLogo();
    }),
  );

  ipcMain.handle(IPC_CHANNELS.COMPANY_UPDATE, (_event, input: unknown) =>
    wrapIpcHandler(() => {
      const { sessionId, record } = parseSessionRequest(input);
      ctx.authService.requireSession(sessionId);
      if (typeof record.name !== 'string') {
        throw new AppError('COMPANY_NAME_REQUIRED', 'COMPANY_NAME_REQUIRED');
      }
      const patch: CompanyUpdateInput = { name: record.name };
      if ('phone' in record) {
        patch.phone = optionalString(record.phone);
      }
      if ('email' in record) {
        patch.email = optionalString(record.email);
      }
      if ('address' in record) {
        patch.address = optionalString(record.address);
      }
      if ('website' in record) {
        patch.website = optionalString(record.website);
      }
      if ('notes' in record) {
        patch.notes = optionalString(record.notes);
      }
      if ('logoBase64' in record) {
        patch.logoBase64 = optionalString(record.logoBase64);
      }
      if (record.removeLogo !== undefined) {
        if (typeof record.removeLogo !== 'boolean') {
          throw new AppError('VALIDATION_ERROR', 'INVALID_REQUEST');
        }
        patch.removeLogo = record.removeLogo;
      }
      return ctx.companyService.update(patch);
    }),
  );
}
