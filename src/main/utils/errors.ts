import type { IpcErrorCode } from '@shared/types/ipc';

export class AppError extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function toIpcError(error: unknown): { errorCode: IpcErrorCode; message: string } {
  if (error instanceof AppError) {
    return { errorCode: error.code, message: error.message };
  }

  if (error instanceof Error) {
    return { errorCode: 'INTERNAL_ERROR', message: error.message };
  }

  return { errorCode: 'INTERNAL_ERROR', message: 'An unexpected error occurred' };
}

export function wrapIpcHandler<T>(
  handler: () => T | Promise<T>,
): Promise<{ ok: true; data: T } | { ok: false; errorCode: IpcErrorCode; message?: string }> {
  return Promise.resolve()
    .then(handler)
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => {
      const mapped = toIpcError(error);
      return { ok: false as const, errorCode: mapped.errorCode, message: mapped.message };
    });
}
