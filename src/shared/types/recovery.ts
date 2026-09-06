export const RECOVERY_CHANNELS = {
  status: 'recovery:status', select: 'recovery:select', restore: 'recovery:restore', login: 'recovery:login',
} as const;
export type RecoveryResult<T> = { ok: true; data: T } | { ok: false; errorCode: string; message?: string };
export interface RecoverySelection { fileName: string; createdAt: string; customerCount: number; transactionCount: number }
export interface RecoveryApi {
  status(): Promise<RecoveryResult<{ reason: string }>>;
  select(): Promise<RecoveryResult<RecoverySelection | null>>;
  restore(): Promise<RecoveryResult<{ safetyPath: string | null }>>;
  login(): Promise<RecoveryResult<null>>;
}
