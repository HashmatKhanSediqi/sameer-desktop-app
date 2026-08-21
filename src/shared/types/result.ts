export type Result<T> = { ok: true; data: T } | { ok: false; errorCode: string; message?: string };

export function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

export function err<T>(errorCode: string, message?: string): Result<T> {
  return { ok: false, errorCode, message };
}
