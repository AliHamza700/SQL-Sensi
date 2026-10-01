import { app, BrowserWindow, ipcMain, shell } from 'electron';
import * as path from 'path';
import * as url from 'url';

// ─── Constants ───────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';
const RENDERER_URL = 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;

// ─── Window Creation ─────────────────────────────────────────
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'SQL Sensi',
    backgroundColor: '#0f0f13',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,      // Security: context isolation ON
      nodeIntegration: false,       // Security: no Node in renderer
      sandbox: false,               // Required for preload IPC
      webSecurity: true,
    },
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL(RENDERER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(
      url.format({
        pathname: path.join(__dirname, '../../.next/server/app/index.html'),
        protocol: 'file:',
        slashes: true,
      })
    );
  }

  // Graceful show
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Open external links in the OS browser, not Electron
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    shell.openExternal(targetUrl);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ────────────────────────────────────────────
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ─── IPC Handlers ─────────────────────────────────────────────
// All IPC handlers will be registered here as features are built.
// Services communicate with the renderer via ipcMain.handle()

ipcMain.handle('app:get-version', () => app.getVersion());
ipcMain.handle('app:get-platform', () => process.platform);

// Future handlers will be imported from feature modules, e.g.:
// import { registerDatabaseHandlers } from './ipc/database';
// import { registerAuthHandlers } from './ipc/auth';
// registerDatabaseHandlers(ipcMain);
// registerAuthHandlers(ipcMain);
