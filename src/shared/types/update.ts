export type UpdateUiState =
  | 'idle'
  | 'checking'
  | 'upToDate'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'unsupported';

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface UpdateStatusSnapshot {
  state: UpdateUiState;
  currentVersion: string;
  availableVersion: string | null;
  releaseNotes: string | null;
  progress: UpdateProgress | null;
  errorCode: string | null;
  errorMessage: string | null;
  safetyBackupPath: string | null;
  lastCheckedAt: string | null;
  packaged: boolean;
  provider: {
    owner: string;
    repo: string;
  };
}

export type UpdateEventPayload = UpdateStatusSnapshot;
