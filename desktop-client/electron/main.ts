import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAppConfig } from './config';
import { registerDBHandlers, initDB, closeDB } from './ipc/db';
import { registerLLMHandlers } from './ipc/llm';
import { registerRemoteHandlers } from './ipc/remote';
import { registerConfigHandlers } from './ipc/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1120,
    minHeight: 720,
    title: 'Claw Trader',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0A0A0A' : '#FFFFFF',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    // Auto-open DevTools only when CLAW_DEVTOOLS=1.  Default-off in
    // dev keeps the terminal quiet — Chromium's DevTools spams
    // unrelated `Autofill.enable` / `Unknown VE context` errors on
    // every open, which masks our own logs.  Open manually with
    // ⌥⌘I (mac) / Ctrl+Shift+I (Linux/Windows) when needed.
    if (process.env.CLAW_DEVTOOLS === '1') {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  const userData = app.getPath('userData');
  const appConfig = loadAppConfig(userData);
  // eslint-disable-next-line no-console
  console.log(
    `[config] remoteBaseURL=${appConfig.remoteBaseURL} (source=${appConfig.source}, path=${appConfig.configPath})`,
  );

  initDB(path.join(userData, 'claw-data.sqlite'));
  registerDBHandlers(ipcMain);
  registerLLMHandlers(ipcMain);
  registerRemoteHandlers(ipcMain, appConfig.remoteBaseURL);
  registerConfigHandlers(ipcMain, appConfig);

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDB();
    app.quit();
  }
});

app.on('before-quit', () => {
  closeDB();
});
