import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import * as path from 'path';
import * as url from 'url';
import { IPC_CHANNELS } from '../../src/config/ipc-channels';
import { registerAuthHandlers } from './ipc/auth.ipc';

// ─── Constants ───────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';
const RENDERER_URL = 'http://localhost:3000';

let mainWindow: BrowserWindow | null = null;

// ─── Window Creation ─────────────────────────────────────────
function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    title: 'SQL Sensi',
    backgroundColor: '#0d0d12',
    webPreferences: {
      // ── Security settings ─────────────────────────────────
      preload: path.join(__dirname, 'preload.js'), // sibling in electron-out/electron/src/
      contextIsolation: true,             // renderer cannot access Node APIs
      nodeIntegration: false,             // never allow raw Node in renderer
      sandbox: false,                     // needed for contextBridge
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // ── Load the app ─────────────────────────────────────────
  if (isDev) {
    mainWindow.loadURL(RENDERER_URL).catch((err) => {
      console.error('[Electron] Failed to load renderer URL:', err.message);
    });
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(
      url.format({
        pathname: path.join(app.getAppPath(), 'out/index.html'),
        protocol: 'file:',
        slashes: true,
      })
    );
  }

  // ── Show gracefully — no white flash ─────────────────────
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });

  // ── Security: open external links in OS browser ──────────
  mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      shell.openExternal(targetUrl);
    }
    return { action: 'deny' };
  });

  // ── Block navigation away from the app ───────────────────
  mainWindow.webContents.on('will-navigate', (event, navUrl) => {
    if (isDev && navUrl.startsWith(RENDERER_URL)) return;
    event.preventDefault();
    console.warn('[Electron] Blocked navigation to:', navUrl);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ────────────────────────────────────────────
app.whenReady().then(() => {
  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event, navUrl) => {
      if (isDev && navUrl.startsWith(RENDERER_URL)) return;
      if (navUrl.startsWith('file://')) return;
      event.preventDefault();
    });
  });

  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ─── IPC Handlers ─────────────────────────────────────────────
// All channel names come from IPC_CHANNELS — never use raw strings.

// App info
ipcMain.handle(IPC_CHANNELS.APP_GET_VERSION, () => app.getVersion());
ipcMain.handle(IPC_CHANNELS.APP_GET_PLATFORM, () => process.platform);

// File dialog (used by DB upload in Phase 3)
ipcMain.handle('dialog:open-file', async (_, filters: Electron.FileFilter[]) => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select SQLite Database',
    filters: filters ?? [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
    properties: ['openFile'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Future: import and register feature IPC modules here
// import { registerDatabaseHandlers } from './ipc/database';
// registerDatabaseHandlers(ipcMain);

// ─── Feature IPC Registrations ────────────────────────────────
registerAuthHandlers();

