import { app, BrowserWindow, ipcMain, shell, dialog, protocol, net } from 'electron';
import * as path from 'path';
import * as url from 'url';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

// Load .env BEFORE any service module is imported (AppConfig reads process.env
// at import time). In the packaged app, .env is copied into resources/ via
// electron-builder's extraResources; in dev, dotenv's default (cwd/.env) is used.
dotenv.config(
  app.isPackaged ? { path: path.join(process.resourcesPath, '.env') } : undefined
);
import { IPC_CHANNELS } from '../../src/config/ipc-channels';
import { registerAuthHandlers } from './ipc/auth.ipc';
import { registerDatabaseHandlers } from './ipc/database.ipc';
import { registerSchemaHandlers } from './ipc/schema.ipc';
import { registerAIHandlers } from './ipc/ai.ipc';
import { registerHistoryHandlers } from './ipc/history.ipc';
import { registerExportHandlers } from './ipc/export.ipc';
import { registerConnectionHandlers } from './ipc/connections.ipc';
import { registerPolicyHandlers } from './ipc/policy.ipc';
import { registerAuditHandlers } from './ipc/audit.ipc';
import { shutdownConnections } from './connections';

// ─── Constants ───────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';
const RENDERER_URL = 'http://localhost:3000';
const APP_SCHEME = 'app';
const APP_ORIGIN = `${APP_SCHEME}://local`;

let mainWindow: BrowserWindow | null = null;

// Register the custom scheme as privileged BEFORE app is ready so fetch/RSC
// payloads behave like a normal web origin (not like file://).
if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
      },
    },
  ]);
}

function registerAppProtocol(): void {
  const outDir = path.join(app.getAppPath(), 'out');
  protocol.handle(APP_SCHEME, async (request) => {
    const requestUrl = new URL(request.url);
    let relativePath = decodeURIComponent(requestUrl.pathname);
    if (relativePath.startsWith('/')) relativePath = relativePath.slice(1);
    if (!relativePath || relativePath.endsWith('/')) relativePath += 'index.html';

    let absolutePath = path.join(outDir, relativePath);
    // Keep requests inside the out/ directory.
    if (!absolutePath.startsWith(outDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    // Clean routes without extension: try .html, then folder/index.html.
    if (!path.extname(absolutePath) && !fs.existsSync(absolutePath)) {
      if (fs.existsSync(absolutePath + '.html')) {
        absolutePath += '.html';
      } else if (fs.existsSync(path.join(absolutePath, 'index.html'))) {
        absolutePath = path.join(absolutePath, 'index.html');
      }
    }

    return net.fetch(url.pathToFileURL(absolutePath).toString());
  });
}

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
    mainWindow.loadURL(`${APP_ORIGIN}/`).catch((err) => {
      console.error('[Electron] Failed to load packaged renderer:', err?.message ?? err);
    });
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
    if (!isDev && navUrl.startsWith(APP_ORIGIN)) return;
    event.preventDefault();
    console.warn('[Electron] Blocked navigation to:', navUrl);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App Lifecycle ────────────────────────────────────────────
app.whenReady().then(() => {
  if (!isDev) registerAppProtocol();

  app.on('web-contents-created', (_, contents) => {
    contents.on('will-navigate', (event, navUrl) => {
      if (isDev && navUrl.startsWith(RENDERER_URL)) return;
      if (!isDev && navUrl.startsWith(APP_ORIGIN)) return;
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

// Close the active database connection on shutdown
app.on('will-quit', () => {
  void shutdownConnections();
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
registerDatabaseHandlers();
registerConnectionHandlers();
registerSchemaHandlers();
registerPolicyHandlers();
registerAuditHandlers();
registerAIHandlers();
registerHistoryHandlers();
registerExportHandlers();
