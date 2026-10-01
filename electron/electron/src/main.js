"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const url = __importStar(require("url"));
const ipc_channels_1 = require("../../src/config/ipc-channels");
// ─── Constants ───────────────────────────────────────────────
const isDev = process.env.NODE_ENV === 'development';
const RENDERER_URL = 'http://localhost:3000';
let mainWindow = null;
// ─── Window Creation ─────────────────────────────────────────
function createMainWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 700,
        show: false,
        title: 'SQL Sensi',
        backgroundColor: '#0d0d12',
        webPreferences: {
            // ── Security settings ─────────────────────────────────
            preload: path.join(__dirname, 'preload.js'), // compiled preload
            contextIsolation: true, // renderer cannot access Node APIs
            nodeIntegration: false, // never allow raw Node in renderer
            sandbox: false, // needed for contextBridge
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
    }
    else {
        mainWindow.loadURL(url.format({
            pathname: path.join(__dirname, '../out/index.html'),
            protocol: 'file:',
            slashes: true,
        }));
    }
    // ── Show gracefully — no white flash ─────────────────────
    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
        mainWindow?.focus();
    });
    // ── Security: open external links in OS browser ──────────
    mainWindow.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
        if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
            electron_1.shell.openExternal(targetUrl);
        }
        return { action: 'deny' };
    });
    // ── Block navigation away from the app ───────────────────
    mainWindow.webContents.on('will-navigate', (event, navUrl) => {
        if (isDev && navUrl.startsWith(RENDERER_URL))
            return;
        event.preventDefault();
        console.warn('[Electron] Blocked navigation to:', navUrl);
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
// ─── App Lifecycle ────────────────────────────────────────────
electron_1.app.whenReady().then(() => {
    electron_1.app.on('web-contents-created', (_, contents) => {
        contents.on('will-navigate', (event, navUrl) => {
            if (isDev && navUrl.startsWith(RENDERER_URL))
                return;
            if (navUrl.startsWith('file://'))
                return;
            event.preventDefault();
        });
    });
    createMainWindow();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0)
            createMainWindow();
    });
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// ─── IPC Handlers ─────────────────────────────────────────────
// All channel names come from IPC_CHANNELS — never use raw strings.
// App info
electron_1.ipcMain.handle(ipc_channels_1.IPC_CHANNELS.APP_GET_VERSION, () => electron_1.app.getVersion());
electron_1.ipcMain.handle(ipc_channels_1.IPC_CHANNELS.APP_GET_PLATFORM, () => process.platform);
// File dialog (used by DB upload in Phase 3)
electron_1.ipcMain.handle('dialog:open-file', async (_, filters) => {
    if (!mainWindow)
        return null;
    const result = await electron_1.dialog.showOpenDialog(mainWindow, {
        title: 'Select SQLite Database',
        filters: filters ?? [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3'] }],
        properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0)
        return null;
    return result.filePaths[0];
});
// Future: import and register feature IPC modules here
// import { registerDatabaseHandlers } from './ipc/database';
// registerDatabaseHandlers(ipcMain);
//# sourceMappingURL=main.js.map