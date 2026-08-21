import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type AppGetPathsResult, type AppGetStatusResult } from '@shared/types/ipc';

const ALLOWED_INVOKE_CHANNELS = new Set<string>(Object.values(IPC_CHANNELS));

function invoke<T>(channel: string, payload?: unknown): Promise<T> {
  if (!ALLOWED_INVOKE_CHANNELS.has(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
  }
  return ipcRenderer.invoke(channel, payload) as Promise<T>;
}

const api = {
  app: {
    getPaths: (): Promise<AppGetPathsResult> => invoke(IPC_CHANNELS.APP_GET_PATHS),
    getStatus: (): Promise<AppGetStatusResult> => invoke(IPC_CHANNELS.APP_GET_STATUS),
  },
};

contextBridge.exposeInMainWorld('api', api);

export type PreloadApi = typeof api;
