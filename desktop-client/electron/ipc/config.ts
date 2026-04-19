import type { IpcMain } from 'electron';
import type { AppConfig } from '../config';

/** Expose the resolved AppConfig to the renderer so the settings store
 *  can seed its initial `remoteBaseURL` with the same value the main
 *  process's IPC remote client is already using. Renderer calls this
 *  once at startup inside useSettingsStore.load(). */
export function registerConfigHandlers(ipcMain: IpcMain, cfg: AppConfig): void {
  ipcMain.handle('config:get', () => cfg);
}
