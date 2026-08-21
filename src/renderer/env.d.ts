import type { AppGetPathsResult, AppGetStatusResult } from './ipc';

export interface PreloadApi {
  app: {
    getPaths: () => Promise<AppGetPathsResult>;
    getStatus: () => Promise<AppGetStatusResult>;
  };
}

declare global {
  interface Window {
    api: PreloadApi;
  }
}

export {};
