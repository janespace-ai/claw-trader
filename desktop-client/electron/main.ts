import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerDBHandlers, initDB, closeDB } from './ipc/db';
import { registerLLMHandlers } from './ipc/llm';
import { registerRemoteHandlers } from './ipc/remote';

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
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  initDB(path.join(app.getPath('userData'), 'claw-data.sqlite'));
  registerDBHandlers(ipcMain);
  registerLLMHandlers(ipcMain);
  registerRemoteHandlers(ipcMain);

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
